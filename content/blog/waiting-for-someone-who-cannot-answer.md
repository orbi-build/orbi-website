---
title: Waiting for an answer the user can't give
date: 2026-09-22
summary: Our engine paused for a human decision, then accepted only an answer the tenant could not give. Three versions of that mistake, found in one afternoon.
lang: en
author: Orbi
image: /img/blog-waiting.png
mirror: waiting-for-someone-who-cannot-answer
---

There is a failure mode that does not look like failure. Nothing crashes. No
error is logged. The system is doing exactly what it was designed to do, which
is wait — and the person it is waiting for has no idea, and no way to respond.

We shipped three of these. We found them in one afternoon, because we finally
became our own customer.

## The waiting is correct

Our engine will not advance a version on its own. When a milestone closes, an
idle tick opens a ticket: this version is complete, here are the candidates,
which one is next. Then it stops.

That lock is deliberate and we are not removing it. Deciding what ships next is
a product decision. An engine that picks the next version number because the
previous one filled up has confused a counter with a judgement.

So the ticket is right. The pause is right. What was wrong is the sentence
inside the ticket:

> Please run `orbi milestone set <target>` to advance `active_milestone`.

That instruction assumes a CLI and a shell on the host. A managed tenant has
neither — their sandbox runs on our hardware, which is the entire point of it
being managed. The engine asked a question, on a ticket the tenant could read,
and accepted only an answer they could not produce.

Worse, managed sandboxes never rendered `auto_next_milestone = false` at all. So
they did not get the ticket either. The engine paused silently and waited for a
decision that nobody had been asked to make.

## The day we noticed

On 2026-09-22 we migrated `orbi-build/orbi` — the engine's own repository — onto
our hosted sandbox. It shipped v0.5.39 from that sandbox the same morning.

Then the milestone closed, and everything stopped. No notification. No error.
Delivery simply ceased, until a human noticed, created the v0.5.40 milestone by
hand with `gh api`, and edited the policy file directly.

We had been running this gap in production for our customers. It took putting
our own release line behind it to feel it.

## The same shape, in the UI

Later the same day, a full walkthrough of the product — register, install the
App, connect a repo, provision a sandbox, file an issue, deliver, merge, release
— surfaced the second instance.

The status page has a release form. It is a text box. You type a version number
from memory, and that string becomes the release scope.

The page never shows you which milestones exist. We checked:
`grep -rn "milestone" src/pages/status.ts src/page.ts` returns nothing. Not one
line. Meanwhile, six hundred lines away in the same file, the page does this for
issues:

> These issues have not been handed to Orbi yet: label an issue `ai-ready` and
> Orbi will start on it.

The page already scans GitHub on your behalf and lists what you can act on. It
just never extended that courtesy to milestones. So you type a version you half
remember, and if you get it wrong nothing tells you — the rejection happens
later, asynchronously, on a ticket you have to go find.

## The same shape, in the config

The third instance is the one that explains the other two.

Our engine writes the active milestone into a repository variable on every tick.
The value comes from `config.active_milestone` — which lives in the sandbox's own
`orbi.toml` file. Not GitHub. Not our control plane.

So the control plane can create a release ticket while the sandbox still
believes nothing is in flight. Two systems, two answers, no reconciliation. In
our production logs, every tick, for the repository we had just walked through:

```
INFO active_milestone_variable_absent repo=orbi-build/orbi-beta-e2e-org-09182001
```

Then we looked at how a field gets from the control plane into that file, and
found there is no general mechanism at all. There are four separate
hand-written sync functions — `sync_orbi_toml_engine_track`,
`sync_orbi_toml_providers`, `sync_orbi_toml_oauth`, plus the initial render —
each one added for a single field, each one staging a temp file and swapping it
atomically. The comments record the accretion:

```bash
# Issue #116: the connect-time base branch rides the payload and must reach
#             the rendered orbi.toml
# Issue #770: attribution_footer rides the same way
```

Adding one field means editing four files. Which is why nobody added
`active_milestone`: `grep -rn "active_milestone" src/*.ts host-provisioner/*.sh`
returns nothing. The control plane does not know the field exists.

## What the tenant can and cannot touch

One design question resolved itself once we looked at the filesystem.

We were about to specify merge semantics for "what if the tenant edited a managed
field by hand". Then we checked:

```console
$ sudo ls -la /home/<sandbox>/orbi/orbi.toml
-rw------- 1 orbi-... orbi-... 926 Sep 22 06:39 orbi.toml

$ sudo ls -la /home/<sandbox>/.ssh/
-rw------- ... id_ed25519       # outbound deploy key
-rw-r--r-- ... id_ed25519.pub
-rw------- ... known_hosts
                                # no authorized_keys
```

Mode 0600, owned by the sandbox user, and no `authorized_keys`. The tenant
cannot SSH in. There is no hand-editing to reconcile.

That makes the design simpler than we assumed. The control plane is the sole
writer, so the merge only has to preserve *other control-plane fields* — there
is no external drift to detect. And it points at a stronger invariant worth
holding: `orbi.toml` should be a pure derivative, reconstructible from control
plane state alone. Today it is not. Engine track and providers live only in the
sandbox; the control plane holds a partial truth. Those four sync functions each
maintain a fragment of the real answer.

## The pull-versus-push question answered itself too

For pushing config down to sandboxes, the obvious tradeoff is pull (the sandbox
asks on a schedule) versus push (the control plane triggers a refresh).

Push means opening an inbound channel to sandbox hosts. Pull means a delay of up
to one refresh interval. The usual move is to weigh latency against attack
surface.

Except the interval is already one minute:

```console
$ systemctl cat orbi-cloud-provisioner.timer | grep OnUnit
OnUnitActiveSec=1min
```

And the refresh endpoint's query is `WHERE r.status = 'active' AND t.status = 'active'`
— every live sandbox, every minute, not just pending ones. So a pull costs at
most sixty seconds, on an action that already waits for the engine's next claim.
There is no tradeoff to weigh. Push would open an inbound path to buy less than
a minute.

Measuring the thing before arguing about it took two commands.

## A wrong diagnosis, corrected by the database

While reading production logs we found 288 identical errors in six hours:

```
ERROR milestone_reconcile_failed repo=zzuu080603/VCPToolBox-macOS
subprocess.CalledProcessError: ... /milestones?state=all ... exit status 1
```

The obvious read was credential rot, so that is what we wrote down. Reproducing
it inside the sandbox gave `401 Bad credentials` — which seemed to confirm it,
especially since the repository is public and readable with a maintainer token.

Then we checked the database, and the diagnosis collapsed:

```
login=cdredfox    tenant=inactive  codeduck          repo=inactive
login=zzuu080603  tenant=active    VCPToolBox-macOS  repo=inactive   ← failing
login=zzuu080603  tenant=active    Tianshu-harness   repo=active     ← fine
```

Both failing sandboxes belong to **inactive** repositories. The refresh endpoint
filters on `status = 'active'`, so those tokens are never refreshed — by design,
correctly. The same tenant's active repository works perfectly. That is the
control group, sitting right there in the same query.

The real defect was never credentials. It is that we keep reconciling milestones
for repositories that were switched off, forever, once per tick. The 401 is a
symptom of a correct policy meeting a loop that should have stopped.

Read the error, then read the data. In that order — we did it backwards and
filed a ticket with the wrong root cause, which then had to be publicly
corrected.

## What connects them

Three defects, one shape: **the system knew something the user needed, and did
not say it.**

It knew which milestones existed, and made you type one from memory. It knew a
decision was pending, and told you to use a CLI you do not have. It knew the
control plane's intent, and left the sandbox holding a different answer.

None of them logs an error, because none of them is an error. Every component is
doing its job. The gap is between components, in the space where a human was
supposed to be handed something and was not.

That space is invisible from inside the code. You cannot grep for it, and your
tests will not fail on it, because nothing is broken. You find it by standing
where the user stands — which for us meant moving our own release line onto our
own product and waiting for it to stall.

It stalled in four hours.

---

*The tickets, all filed on 2026-09-22:
[orbi-cloud#878](https://github.com/orbi-build/orbi-cloud/issues/878) (no path
for a managed tenant to decide),
[orbi-cloud#869](https://github.com/orbi-build/orbi-cloud/issues/869) (list the
milestones in the UI),
[orbi-cloud#870](https://github.com/orbi-build/orbi-cloud/issues/870) (a general
config push instead of a fifth hand-written sync), and
[orbi#1283](https://github.com/orbi-build/orbi/issues/1283) (the one whose root
cause we got wrong first).*
