---
title: Long polling cut our new-user wait from 80 s to 14 s
date: 2026-10-12
summary: New Orbi Cloud users stared at a preparing screen for about 80 seconds, and two of six left. Long polling and a one-flag systemd loop now get it to 14.
lang: en
author: Lawrence Liu
image: /img/blog-longpoll-card.png
---

When you connect a GitHub repository to Orbi Cloud, a page tells you your workspace is being prepared. Until this week that page sat there for about 80 seconds. Now it takes 10.6 to 14.6 seconds. We didn't buy faster machines. The main fix was to stop making new users queue behind a background job: the host now uses long polling to wait for new work instead of checking once a minute, and systemd runs the loop.

I'm Lawrence Liu, the creator of Orbi. Orbi takes a GitHub Issue labelled `ai-ready`, writes the change, reviews it in a separate session, merges it and cuts the release. All 32 tickets behind this change went through that loop on Orbi's own repositories, overnight from October 10 to 11. This post is the engineering record: the users who left, how we measured, four designs that each got smaller, and a race condition we were warned about and shipped anyway. All times are Singapore time (UTC+8).

## The short version

1. **Two of our last six new users left while the page still said "preparing".** One left at second 59. Their workspace had been ready since second 55, but the page only checked every 10 seconds.
2. **The machine wasn't slow; the queue was.** Provisioning took 31 to 50 seconds. Before that, a request waited up to 41 seconds (one user, 110) for the host to notice it, because a once-a-minute job refreshed every existing sandbox before it looked for new users.
3. **Running that job more often would have made it worse.** Every run still refreshes first, so a 10-second timer means six times the refresh load and the same wait.
4. **We ended with a long poll.** The host asks Cloud for new requests and Cloud holds the request open for up to 20 seconds, answering the moment one appears. Same pattern as a GitHub self-hosted runner.
5. **The final version is one flag on an existing script.** systemd restarts it a second after each round. Compared with the design before it, that deleted a resident daemon, its restart logic and a separate test suite.
6. **Simplifying exposed a race, and we shipped it anyway.** A reviewer flagged it, we judged the fix unnecessary, and the fifth fresh-user run on our test server hit it. Ticket to merged fix: 30 minutes.

## Start from the people who left

We started recording onboarding stages in production at 16:35 on October 9. Six external users signed up after that:

| User | Where they stopped |
|---|---|
| A | Workspace still preparing. Left at about one minute: provisioning finished at second 55, and the page still said "preparing" at second 59 |
| B | Workspace still preparing. Left within a minute; provisioning had finished at second 50 |
| C | Workspace ready. Left without writing a request |
| D | Workspace ready. Left without writing a request |
| E | Wrote a request. The delivery was an empty pull request |
| F | Wrote a request. Delivered and merged |

Six people prove nothing statistically. They do tell you where to look first: two of the six walked away from a screen where nothing visible was changing.

## Measure each segment before you fix anything

The first number we worked with was wrong. Claude Code, which I build Orbi with, told me the workspace took "about five minutes". I said five minutes is long enough to install an operating system. Then we pulled the timestamps from the database and split the wait into segments, each owned by a different part of the system:

| Segment | Time | Who decides it |
|---|---|---|
| Request waits for the host to claim it | 3–41 s, mean about 22 s | a once-a-minute timer on the host |
| Provisioning the sandbox | 31–50 s, mean about 37 s | the provisioning script |
| The page notices it's ready | 0–10 s | the status page polled every 10 s |
| Reading the repo and writing three suggestions | 94–198 s | the engine and the model |

The first three rows are the last eight external users in production; the last row is five runs on our test server. The two users who stayed on the page saw 79 and 81 seconds from connecting to a ready workspace. "Five minutes" was roughly the time to first value: the suggestions. It wasn't the time to a ready workspace. Those are different segments with different fixes.

We set one more rule that night: time the user spends doing something, like picking a repository, isn't waiting. We only went after the seconds where the user can do nothing at all.

## The bottleneck was a queue, not a machine

The provisioning script ran once a minute from a systemd timer. Its first job was to refresh credentials for every existing sandbox. GitHub installation tokens expire after an hour, so each sandbox got a fresh one on every tick. Only after that did the script ask Cloud for pending requests. On the production host one tick took 1:28 to 1:41, and the ticks ran back to back. A request that arrived just after a tick began could wait out almost all of it. The worst case we have on record is a real user at 21:44 on October 11, still on the old version: 110 seconds in the queue, then 29 seconds of provisioning.

The obvious fix was to run the timer every 10 seconds. We nearly did. Reading the script showed that each tick still refreshes first, so the refresh load would go up six times and a new user would still wait behind it.

## From short polling to long polling: four designs, each smaller

**Version 0: a 10-second timer.** Never shipped, for the reason above.

**Version 1: a separate claim job every 2 seconds.** The refresh stays on its one-minute tick and claiming gets its own fast job. That works, but it's still polling. I asked: why isn't this message-based, so there's no delay at all?

We listed three ways to get a request from Cloud to the host:

| Option | How | Verdict |
|---|---|---|
| A. Short polling, more often | Version 1 | Simple, still has a gap |
| B. Long polling | The host sends a request; Cloud holds it until there's work or a timeout | No gap, and the host still only makes outbound connections |
| C. Push | Cloud connects to the host | The host would need an inbound port, which our design rules out. Rejected |

Long polling is how plenty of systems with outbound-only workers do this. GitHub's self-hosted runner [holds an HTTPS long poll open for 50 seconds](https://docs.github.com/en/enterprise-server@3.12/actions/hosting-your-own-runners/managing-self-hosted-runners/communicating-with-self-hosted-runners), then reconnects, and needs no inbound connection. [Amazon SQS](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-short-and-long-polling.html) lets a receive call wait up to 20 seconds. Our host is in the same position as a self-hosted runner: it can reach out, and nothing can reach in.

**Version 2: long polling plus a resident daemon.** Cloud, a Cloudflare Worker on a D1 database, got a new endpoint, `GET /api/internal/provisioning/wait`. It holds the request for up to 20 seconds and checks the database once a second. Twenty queries per call stays inside D1's free-plan limit of 50 per invocation. It returns only **new** requests. Failed requests waiting for a retry stay on the one-minute path. Otherwise a request that failed would be claimed again a second later and use up its three attempts during one short outage. An independent review caught that before any code was written.

On the host, version 2 was a new Python daemon that looped on the endpoint, claimed requests and started the provisioning script through a new entry point. The deploy script would have to enable the daemon the first time and restart it whenever the code changed, and the daemon needed its own test suite wired into CI.

**Version 3: one flag.** While Orbi was building version 2, I asked whether it could be thinner. Three facts in the existing script made that possible: it takes no global lock, so two copies can run at once; the whole refresh pass sits inside one `if`; and the new endpoint returns exactly the same JSON as the old pending list. So `provisioner.sh` got a `--claim-only` flag. With it, the script skips the refresh, asks `/wait` instead of `/pending`, and runs the same claim, provision and callback code as before. Each run waits once, handles what it got and exits. systemd is the loop:

```ini
[Unit]
Description=Orbi Cloud provisioning fast claim (long-poll)
# Restarting is the whole point, so turn off the default
# start limit (5 starts in 10 s) that would stop the unit
# during a Cloud outage.
StartLimitIntervalSec=0

[Service]
Type=simple
EnvironmentFile=/etc/orbi-cloud/provisioner.env
ExecStart=/opt/orbi-cloud/host-provisioner/provisioner.sh --claim-only
Restart=always
RestartSec=1
```

Every round starts the script from disk again, so a deploy needs no restart logic. The next round simply runs the new code.

<figure class="post-media">
<img src="/img/diagrams/longpoll-loop.svg" alt="The host runs provisioner.sh --claim-only under systemd with Restart=always and RestartSec=1. Each round sends GET /wait to Cloud, which checks the database once a second for up to 20 seconds and returns only new requests. The host claims, provisions and exits, and systemd starts the next round a second later. The once-a-minute pass still refreshes credentials and handles retries through /pending, and skips tenants that are being provisioned." width="720" height="380">
<figcaption>The fast path waits on Cloud; the one-minute pass keeps refreshes and retries.</figcaption>
</figure>

What version 3 deleted from version 2:

| Version 2 | Version 3 |
|---|---|
| A new resident Python daemon with its own loop | No new program; systemd loops |
| The daemon claims, then starts the script through a new entry point | The script's existing claim and provision code |
| The deploy script enables the daemon and restarts it when code changes | Nothing to restart: each round reads the latest script |
| A separate Python test suite, wired into CI | A few cases added to the existing provisioning tests |

We also priced a 2-second timer: no Cloud change, but about ten times the requests of long polling, and still polling.

Two details from review made it into version 3. A failed claim sleeps 10 seconds before exiting, so the loop doesn't hammer Cloud. And the fast path skips the engine cache update, which can take up to 600 seconds when a new engine version lands and would block claims while it runs.

## The race we were warned about

Once claiming is its own loop, it runs at the same time as the one-minute pass, and they share something. Each tenant has a single model API key slot: issuing a new key invalidates the old one. The claim issues a key and hands it to the provisioning script. The one-minute pass issues a fresh key to every tenant. If the pass lands between the claim and the script's first call to Cloud, the script is holding a dead key. It exits with code 42 ("the key … was superseded"), and the new user sees "workspace setup failed" on their very first try.

The independent design review flagged exactly this and proposed the fix: the refresh pass should skip tenants that are being provisioned. Claude Code judged it unnecessary, since claims would now take about a second, and left it out of the ticket. I didn't push back.

Long polling went live on the test server that evening, and the first four fresh-user runs passed. The fifth was claimed at 22:50:15 and failed four seconds later, exactly that way: exit code 42, and a page that read "workspace setup failed". The automatic retry provisioned it at 22:51:38. We opened a top-priority ticket at 22:53; Orbi merged the fix at 23:23. The refresh query now skips any tenant whose provisioning request is pending or running, and that tenant rejoins the list on the next tick.

Here's the rule I took from it. When a reviewer hands you a race, either put the fix in the ticket or write a test that proves the race can't happen. "It should be fast enough now" proves nothing.

## Where the rest of the 80 seconds went

Long polling removed the queue: every run after it was claimed in one or two seconds. Other tickets in the same batch cut the work after the claim:

- copy the engine from a prepared directory on the host instead of cloning it from GitHub;
- clone the user's repository at the same time as creating the sandbox user, and clone it as that user, because it's untrusted code;
- skip an SSH probe that always failed on new sandboxes and go straight to HTTPS;
- report the workspace ready as soon as the Orbi CLI is installed, and start reading the repository right then instead of waiting for a 30-second timer;
- update the progress on the page every 2 seconds in place, instead of reloading the page every 10.

Together these took claim-to-ready from about 25 seconds to 6 or 7. Here is one run, from the click to the suggestions:

<figure class="post-media">
<img src="/img/diagrams/longpoll-timeline.svg" alt="Before: in production the request waited a mean of 22 seconds to be claimed, provisioning took a mean of 37 seconds and the page took up to 10 more to notice; two users who stayed saw 79 and 81 seconds. After, on the test server: 4 seconds from the click to the request, 1 second to the claim, 7 seconds to a ready workspace, and the page left the preparing state at 14.4 seconds." width="720" height="330">
<figcaption>Before: production means for eight users, counted from the request because the click wasn't recorded yet. After: one fresh-user run on the test server, counted from the click.</figcaption>
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

The same paper has a boundary condition that matters more than the headline. When the visible effort ends in a poor result, people rate the service lowest of all. We had that bug. On a Chinese-language page the summary came out in English, because neither prompt said which language to write in. Orbi now passes the page language to the engine. A wrong answer shown prominently during a wait is worse than no answer.

## Results

Five fresh-user runs on the test server, between 23:28 on October 11 and 02:20 on October 12. Each run reset the test account to unregistered and started from "Connect repository":

| | Before | After (5 runs) |
|---|---|---|
| Click to the page leaving "preparing" | 79 s and 81 s (two production users who stayed on the page) | 10.6–14.6 s || Request waiting to be claimed | 3–41 s across eight production users; 110 s worst | 1–2 s |
| First summary of the repository | didn't exist | 23–29 s |
| Three suggestions | 3:22 (test-server baseline) | 1:50–3:14, median 2:01 |

The 3:14 run is the model writing about twice as much as usual. That segment depends on output length and wasn't part of this work. Two of the five runs went on to hand a suggestion to Orbi, and both pull requests merged about nine minutes later.

This went to production at 03:19 on October 12. No new user has connected a repository in production since then, so these are test-server numbers until one does.

## Who did the work

32 tickets, 31 of them closed by merged pull requests, adding 9,001 lines and deleting 1,635. Most tickets were opened around 01:00 and then queued behind dependencies, so the median time from ticket to merge was 498 minutes. The shortest was the race fix: 30 minutes. Claude Code wrote the tickets and read every diff before merge. Orbi implemented each one, reviewed it in a separate session, waited for CI and merged.

My part was deciding what mattered and asking two questions, "why isn't this message-based?" and "can this be thinner?". It also included missing the race.

## A checklist if your users wait

1. Split the wait into segments using your own timestamps, and write down which component owns each one.
2. Don't count time the user spends acting. Attack the time they can only watch.
3. Before you tune an interval, read what runs before the thing you care about.
4. If the worker can't accept inbound connections, long-poll. Hand out only new work on the fast path, and keep retries on the slow one.
5. Let the service manager be the loop: `Restart=always`, `RestartSec=1`, `StartLimitIntervalSec=0`. Every round picks up the latest code.
6. Treat a race a reviewer names as a requirement until a test proves otherwise.
7. Show real progress while people wait, and fix bad results before you put them on screen.

## Limits

The after numbers are five runs on our test server with one small test repository, and nobody has gone through the production flow since the release. The funnel is six users. The before numbers mix production and the test server; each table says which is which. The time to write suggestions still depends on how much the model writes.

## Related

Read how [writing a request in Orbi Cloud](/blog/write-a-request/) works, the [Claude Code comparison](/compare/claude-code/), and [Cloud](/cloud/).
