---
title: From 79 s to 14 s: long polling and our new-user wait
date: 2026-10-12
summary: A new Orbi Cloud user waited 79 seconds on a preparing screen. Long polling, a one-flag systemd loop and five small fixes cut it to 14 on our test server.
lang: en
author: Lawrence Liu
image: /img/blog-longpoll-card.png
mirror: long-polling-new-user-wait
---

When you connect a GitHub repository to Orbi Cloud, a page tells you your workspace is being prepared. Before this release that page could sit there for well over a minute: one production connection took 79 seconds to show a ready workspace. On our test server it now takes 11.5 to 14.6 seconds; production runs the same code, but we haven't measured it there yet. We didn't buy faster machines. The biggest change was to stop making new users queue behind a background job: the host now uses long polling to wait for new work instead of checking once a minute, and systemd runs the loop.

I'm Lawrence Liu, the creator of Orbi. Orbi takes a GitHub Issue labelled `ai-ready`, writes the change with its coding agent, Pi, reviews it in a separate session, merges it and cuts the release. Of the 32 tickets behind this change, 31 went through that loop on Orbi's own repositories, between the night of October 10 and the night of October 11. This post is the engineering record: how we measured, why the bottleneck was a queue, four designs that each got smaller, and a race condition we were warned about and shipped anyway. All times are Singapore time (UTC+8).

## The short version

1. **People were leaving while the page said "preparing".** In one case the workspace was already ready, but the page only checked every 10 seconds and hadn't shown it yet.
2. **The machine wasn't slow; the queue was.** Provisioning took 31 to 50 seconds. Before it even started, a request waited 3 to 41 seconds for the host to notice it, and once 110 seconds. A once-a-minute job refreshed every existing sandbox before it looked for new users.
3. **A faster timer wouldn't have helped.** The runs were already back to back, and each one still refreshed everything first.
4. **We ended with a long poll.** The host asks Cloud for new requests and Cloud holds that HTTP request for up to 20 seconds, checking once a second. Claims now take 1 to 2 seconds. GitHub's self-hosted runners talk to GitHub the same way.
5. **The final version is one flag on an existing script.** systemd starts it again a second after each round. Compared with the design before it, that deleted a resident daemon, its restart logic and a separate test suite.
6. **Splitting claims out created a race, and we shipped it anyway.** Review named two races. We fixed one, judged the other unnecessary, and the fifth fresh-user run on the test server hit it. Ticket to merged fix: 30 minutes.

## The people who left

We had just started recording where new users stop, and a few records were enough to know where to look. People left while the page still said "preparing". In one case the workspace was already ready; the page only checked every 10 seconds and hadn't shown it yet.

We can't tell why anyone stops. What we could change was how long the page made them wait, and what they saw while it did.

## Measure each segment before you fix anything

The first number we worked with was wrong. Claude Code, which I use to write Orbi's tickets and read its diffs, told me the workspace took "about five minutes". I said five minutes is long enough to install an operating system. Then we pulled the timestamps from the database and split the wait into segments, each owned by a different part of the system:

| Segment | Time | Who decides it |
|---|---|---|
| Request waits for the host to claim it | 3–41 s, mean about 22 s | a once-a-minute timer on the host |
| Provisioning the sandbox | 31–50 s, mean about 37 s | the provisioning script |
| The page notices it's ready | 0–10 s | the status page polled every 10 s |
| Reading the repo and writing three suggestions | 94–198 s | the engine and the model |

The first three rows are the last eight production connections before we started; the last row is five runs on our test server. The 79-second connection falls within those ranges: 32 seconds in the queue, 37 provisioning and 10 more before the page showed it. "Five minutes" was roughly the time to first value: the suggestions. It wasn't the time to a ready workspace. Those are different segments with different fixes.

We set one more rule that night: time the user spends doing something, like picking a repository, isn't waiting. We only went after the seconds where the user can do nothing at all.

## The bottleneck was a queue, not a machine

The provisioning script ran from a systemd timer set to once a minute. Its first job was to refresh credentials for every existing sandbox: GitHub installation tokens expire after an hour, so each sandbox got a fresh one on every run. Only after that did the script ask Cloud for pending requests. On the production host one run took 1:28 to 1:41, so the runs went back to back. A request that arrived just after a run began could wait out almost all of it. The worst case on record, on the old version, was a request that sat in the queue for 110 seconds.

The obvious fix was a 10-second timer. We nearly did it. Reading the script showed it would change nothing: the runs already followed each other with no gap, and each one still refreshed every sandbox before it looked for new users. The order was the problem, not the interval.

## From short polling to long polling: four designs, each smaller

**Version 0: a 10-second timer.** Never shipped, for the reason above.

**Version 1: a separate claim job every 2 seconds.** The refresh stays on its one-minute run and claiming gets its own fast job. That works, but it's still polling. I asked: why isn't this message-based, so there's no waiting at all?

We listed three ways to get a request from Cloud to the host:

| Option | How | Verdict |
|---|---|---|
| A. Short polling, more often | Version 1 | Simple; up to 2 seconds of delay and a request every 2 seconds whether or not there's work |
| B. Long polling | The host sends a request; Cloud holds it until there's work or a timeout | Answers within about a second of new work, and the host still only makes outbound connections |
| C. Push | Cloud connects to the host | The host would need an inbound port, which our design rules out. Rejected |

Long polling is a common answer for workers that can only connect outward. GitHub's documentation for Enterprise Server 3.12 says the self-hosted runner [opens a long poll to GitHub for 50 seconds](https://docs.github.com/en/enterprise-server@3.12/actions/hosting-your-own-runners/managing-self-hosted-runners/communicating-with-self-hosted-runners), times out and opens a new one, and needs no inbound connection. [Amazon SQS](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-short-and-long-polling.html) lets a receive call wait up to 20 seconds. Our host is in the same position as a self-hosted runner: it can reach out, and nothing can reach in.

**Version 2: long polling plus a resident daemon.** Cloud, a Cloudflare Worker on a D1 database, got a new endpoint, `GET /api/internal/provisioning/wait`. It holds the request for up to 20 seconds and checks the database once a second, so a new request is returned at the next check. Twenty queries per call stays inside D1's free-plan limit of 50 per invocation. It returns only **new** requests. Failed requests waiting for a retry stay on the one-minute path. Otherwise a request that failed would be claimed again a second later and use up its three attempts during one short outage. An independent review caught that before any code was written.

On the host, version 2 was a new Python daemon that looped on the endpoint, claimed requests and started the provisioning script through a new entry point. The deploy script would have to enable the daemon the first time and restart it whenever the code changed, and the daemon needed its own test suite wired into CI.

**Version 3: one flag.** While Orbi was building version 2, I asked whether it could be thinner. Three facts in the existing script made that possible: it takes no global lock, so two copies can run at once; the refresh pass is one contiguous block that can be skipped as a whole; and the new endpoint returns exactly the same JSON as the old pending list. So `provisioner.sh` got a `--claim-only` flag. With it, the script skips the refresh, asks `/wait` instead of `/pending`, and runs the same claim, provision and callback code as before. Each run waits once, handles what it got and exits.

### Let systemd be the loop

This is the whole unit:

```ini
[Unit]
Description=Orbi Cloud provisioning fast claim (long-poll)
# Restarting is the whole point, so turn off the default
# start limit (5 starts in 10 s) that would stop the unit
# during a Cloud outage.
StartLimitIntervalSec=0
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
EnvironmentFile=/etc/orbi-cloud/provisioner.env
ExecStart=/opt/orbi-cloud/host-provisioner/provisioner.sh --claim-only
Restart=always
RestartSec=1

[Install]
WantedBy=multi-user.target
```

`Restart=always` restarts the script even when it exits cleanly, which is what we want after every round. Because each round starts the script from disk again, a deploy needs no restart logic: the next round runs the new code. Two conditions make that safe. Our deploy writes each new file under a temporary name and renames it into place, so a round that's already running keeps reading its old copy; bash reads scripts as it goes, and overwriting a running script in place can break it. And the unit ships disabled. We enabled it by hand once, after the Worker with `/wait` was live, because without the endpoint the loop would hit a 404 every second. The cost is a few journal lines per restart: roughly three restarts a minute when the endpoint is healthy and there's no work.

<figure class="post-media">
<img src="/img/diagrams/longpoll-loop.svg" alt="The host runs provisioner.sh --claim-only under systemd with Restart=always and RestartSec=1. Each round sends GET /wait to Cloud, which queries D1 once a second for up to 20 seconds and returns only new requests. The host claims, provisions and exits, and systemd starts the next round a second later. The once-a-minute pass still refreshes credentials and handles retries through /pending, and skips tenants that are being provisioned." width="720" height="380">
<figcaption>The fast path waits on Cloud; the one-minute pass keeps refreshes and retries.</figcaption>
</figure>

What version 3 deleted from version 2:

| Version 2 | Version 3 |
|---|---|
| A new resident Python daemon with its own loop | No new program; systemd loops |
| The daemon claims, then starts the script through a new entry point | The script's existing claim and provision code |
| The deploy script enables the daemon and restarts it when code changes | Enabled once by hand; after that each round reads the latest deployed script |
| A separate Python test suite, wired into CI | New cases in four existing test files |

When the host is idle and the endpoint is healthy, long polling makes about a tenth of the requests of version 1's 2-second timer.

Two details from review made it into version 3. A failed claim sleeps 10 seconds before exiting, so the loop doesn't hammer Cloud. And the fast path skips the engine cache update, which can take up to 600 seconds when a new engine version lands and would block the next claim while it runs.

## The race we were warned about

Pulling claims out of the one-minute run means two things now run at the same time, and review found two places where they collide.

The first: the credential-rejected callback marked a provisioning request failed whatever state it was in, so the one-minute pass could kill a request that the fast path was halfway through. That fix went into the ticket, as a one-line SQL condition: only finished requests can be marked failed.

The second: each tenant has a single model API key slot, and issuing a new key invalidates the old one. The claim issues a key and hands it to the provisioning script. The one-minute pass issues a fresh key to every tenant. If the pass lands between the claim and the script's first call to Cloud, the script is holding a dead key. It exits with code 42 ("the key … was superseded"), and a new user's very first try ends in "workspace setup failed". The design review named this one too and proposed the fix: the refresh pass should skip tenants that are being provisioned. Claude Code judged it unnecessary, since claims would now take about a second, and left it out of the ticket. I didn't push back.

Long polling went live on the test server that evening, and the first four fresh-user runs passed. The fifth was claimed at 22:50:15 and failed four seconds later, exactly that way. The automatic retry provisioned it at 22:51:38. We opened a top-priority ticket at 22:53; Orbi merged the fix at 23:23. The refresh query now skips any tenant whose provisioning request is pending or running, and that tenant rejoins the list on the first run after its provisioning finishes.

Here's the rule I took from it. When a reviewer hands you a race, either put the fix in the ticket or write a test that proves the race can't happen. "It should be fast enough now" proves nothing.

## Where the rest of the wait went

Long polling removed the queue: every test-server run after it was claimed in one or two seconds. Other tickets in the same batch cut the work after the claim:

- copy the engine from a prepared directory on the host instead of cloning it from GitHub;
- start cloning the user's repository the moment the sandbox user exists, in parallel with the rest of the setup, and clone it as that user, because it's untrusted code;
- skip an SSH probe that always failed on new sandboxes and go straight to HTTPS;
- report the workspace ready as soon as the Orbi CLI is installed, and start reading the repository right then instead of waiting for a 30-second timer;
- update the progress on the page every 2 seconds in place, instead of reloading the page every 10.

Together these took claim-to-ready from about 25 seconds to 7 or 8 in the three runs after the race fix. Here is one of them, from the click to the suggestions:

<figure class="post-media">
<img src="/img/diagrams/longpoll-timeline.svg" alt="Before: in production the request waited a mean of 22 seconds to be claimed, provisioning took a mean of 37 seconds and the page took up to 10 more to notice; one connection took 79 seconds. After, on the test server: 4 seconds from the click to the request, 1 second to the claim, 7 seconds to a ready workspace, and the page left the preparing state at 14.4 seconds." width="720" height="330">
<figcaption>Before: production means over eight connections, counted from the request because clicks weren't recorded yet. After: one fresh-user run on the test server, counted from the click.</figcaption>
</figure>

| Seconds after the click | What happened |
|---|---|
| 4 | Provisioning request created |
| 5 | Host claims it |
| 6 | Sandbox user created |
| 10 | Repository cloned |
| 11 | Orbi CLI installed |
| 12 | Workspace ready; Orbi starts reading the repository |
| 14.4 | The page leaves "preparing" |
| 26 | "Orbi understood your repository": a three-sentence summary |
| 114 | Three suggestions for this repository |

The four seconds between the click and the request are the next thing to look at.

## What the page shows while you wait

Fourteen seconds is still longer than the [10 seconds](https://www.nngroup.com/articles/response-times-3-important-limits/) Nielsen Norman Group gives as the limit for keeping attention on a task. So the page shows real progress instead of a spinner: four steps (set up your own workspace, pull your code, install Orbi, start reading your repository), each ticked off with the seconds it took. The repository's languages and last commit are there from second 0, and the summary appears at about 25 seconds.

There's research behind showing the work. In Buell and Norton's [labor illusion](https://www.hbs.edu/faculty/Pages/item.aspx?num=40158) study (Management Science, 2011), people chose between two services that gave identical results. When the service that made them wait showed its work, 62% chose it over the instant one at a 30-second wait and 63% at 60 seconds. When it made them wait without showing anything, 42% chose it at 30 seconds and 23% at 60.

The same paper has a boundary condition that matters more than the headline. When visible effort ends in a poor result, people rate the service lowest of all. We had a result that looked wrong: on a Chinese-language page, the repository summary came out in English, because neither the summary prompt nor the suggestions prompt said which language to write in. The paper didn't test anything like that, and we haven't measured its effect, but the boundary condition was reason enough to fix it first. Orbi now passes the page language to the engine.

## Results

Fresh-user runs on the test server, between 23:28 on October 11 and 02:20 on October 12. Each run reset the test account to unregistered and started from "Connect repository":

| | Before | After |
|---|---|---|
| Connect (before) or click (after) to the page leaving "preparing" | 79 s (one production connection) | 11.5–14.6 s (4 runs) |
| Request waiting to be claimed | 3–41 s across eight production connections; 110 s worst | 1–2 s (5 runs) |
| First summary of the repository | didn't exist | 23–29 s (5 runs) |
| Three suggestions | 3:22 (test-server baseline) | 1:50–3:14, median 2:01 (5 runs) |

The fifth run was in a phone-sized window that went into the background, so the page didn't refresh on time; its four steps were all ticked at 10.6 seconds, and we left it out of the first row. The 3:14 run is the model writing about twice as much as usual. That segment depends on output length and wasn't part of this work. Two of the five runs went on to hand a suggestion to Orbi, and both pull requests merged about nine minutes later.

This went to production at 03:19 on October 12, and production runs the same code. The after column is still test-server numbers.

## Who did the work

32 tickets; 31 were closed by merged pull requests, adding 9,001 lines and deleting 1,635. Most were opened around 01:00 and then queued behind dependencies, so the median time from ticket to merge was 498 minutes. The shortest was the race fix: 30 minutes. Claude Code wrote the tickets and read every diff before merge. For those 31, Orbi implemented the change, reviewed it in a separate session, waited for CI and merged.

My part was deciding what mattered and asking two questions, "why isn't this message-based?" and "can this be thinner?". It also included missing the race.

## A checklist if your users wait

1. Split the wait into segments using your own timestamps, and write down which component owns each one.
2. Don't count time the user spends acting. Attack the time they can only watch.
3. Before you tune an interval, read what runs before the thing you care about.
4. If the worker can't accept inbound connections, long-poll. Hand out only new work on the fast path, and keep retries on the slow one.
5. Let the service manager be the loop: `Restart=always`, `RestartSec=1`, `StartLimitIntervalSec=0`, and deploy by renaming files into place.
6. Treat a race a reviewer names as a requirement until a test proves otherwise.
7. Show real progress while people wait, and fix results that look wrong before you put them on screen.

## Limits

The after numbers come from a handful of runs on our test server with one small test repository, and we haven't measured production since the release. The before numbers mix production and the test server; each table says which is which. The time to write suggestions still depends on how much the model writes.

## Related

Read how Orbi takes an [Issue to a release](/guides/issue-to-release/), how [writing a request in Orbi Cloud](/blog/write-a-request/) works, the [Claude Code comparison](/compare/claude-code/), and [Cloud](/cloud/).
