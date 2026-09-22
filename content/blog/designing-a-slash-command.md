---
title: Designing one slash command, and reading two that came before
date: 2026-09-22
summary: We needed a way for a tenant to answer a question our engine asks on a GitHub ticket. Building it meant reading Prow and bors-ng at source, where we found a code-block bug that still fires today and a privilege escalation created by having two ways into the same function. Here is every tradeoff, with the line numbers.
lang: en
author: Orbi
image: /img/blog-slash-command.png
mirror: designing-a-slash-command
---

Our engine opens a ticket when it finishes a milestone. The ticket says: this
version is done, here are the candidates, tell me which one is next. Then it
waits, on purpose.

The waiting is deliberate. Automatic version advancement is locked off, because
deciding what ships next is not a decision a release engine should make for you.

The problem was the answer. The ticket told you to run
`orbi milestone set v0.5.40` — a CLI command, on the host machine. Our managed
tenants have neither. Their sandbox runs on our hardware. So the engine was
asking a question that its own audience could not answer.

Closing that gap meant building an in-ticket command: comment `/milestone v0.5.40`
and the engine does the rest. It is one small feature. It took a day of design
because almost every choice in it has been made before, by people who then had
to live with it.

## Why not a verb

The first argument was about the name. `/advance` was the obvious candidate, and
it is wrong.

In-ticket commands are named after states, not actions. Prow has `/lgtm`,
`/hold`, `/approve`. bors has `bors r+`. None of them is an imperative verb.
This is not a style preference — it comes from what the command means. A CLI
says *do this thing*, so a verb fits. An in-ticket command says *set it to this*,
so a noun fits. `/milestone v0.5.40` reads as "milestone: v0.5.40", the same
shape as `/hold`.

There is a second reason, specific to us. The CLI is already called
`orbi milestone set`. Naming the in-ticket command `/milestone` means the
documentation says the word once. `advance` would have been a third name for a
thing that already has two.

We also rejected `bump version`, because it reads like editing the version
string in `pyproject.toml` — which is what the release process does, not what
this command does. A name that makes people expect the wrong side effect is a
bad name even if it is short.

## Why no @

The second argument: `/milestone` or `@orbi milestone`?

The industry splits cleanly, and the dividing line is **who controls the bot's
account name**.

Prow and bors use a bare slash. They have to: the bot account name varies per
deployment. Kubernetes runs `k8s-ci-robot`, OpenShift runs `openshift-ci-robot`.
A syntax that hardcodes `@name` cannot be forked.

Dependabot and Copilot use `@bot`. They can: there is exactly one Dependabot,
its name is globally unique, and the mention buys a notification and
autocomplete for free.

We are the first kind. The engine is open source and self-hostable. More
pointedly, the same engine already runs under two identities in our own org — on
our bootstrap runner the comment author is a human account, and in a managed
sandbox it is `orbi-build[bot]`. We confirmed both on our own repository the
same day. Binding the syntax to a name would break self-hosted users on day one.

## The regex is three decisions in one

Anchoring at the start of a line, with the multiline flag:

```
(?mi)^/milestone[\t ]+(\S+)[\t ]*$
```

Prow writes this in Go. bors splits the comment into lines and anchors each one
in Elixir. Two unrelated implementations, same choice — which is usually a sign
the choice is load-bearing.

It buys three things at once:

- the command can appear on any line of a long comment, so you can explain
  yourself and then issue it
- it is automatically immune to GitHub's quote-reply, because `>` pushes the
  slash off the line start
- it is automatically immune to indented code blocks, for the same reason

What it does **not** buy is immunity to fenced code blocks. And that turned out
to be the most interesting thing we read all day.

## The bug Prow still has

A regex does not parse Markdown. If you write a comment explaining how to use
`/hold`, and you put the example inside triple backticks, the regex sees a line
starting with `/hold` and fires.

Prow knows this. There is a function for it, `DropCodeBlock`, in
`pkg/markdown/code_block.go`, with a 2025 copyright header. So we checked how
widely it is used:

```
$ grep -rn "DropCodeBlock" --include=*.go . | grep -v _test.go
pkg/plugins/trigger/generic-comment.go:66
pkg/markdown/code_block.go:25   (the definition)
```

One call site. Out of fifty-plus plugins. Writing `/hold` inside a fenced block
on Prow fires today.

This is not a criticism of Prow's engineers; it is a structural consequence of
where they put the regex. Prow gives every plugin its own pattern —
`pkg/plugins/hold/hold.go:41` has `(?mi)^/hold(\s.*)?$` written out locally. The
convention is repo-wide but nothing enforces it, and when each command owns its
own matching, **a fix to the shared sanitiser cannot reach them**. The fix
exists. It just cannot arrive.

So our shared layer compiles the pattern itself, from a declared verb. A command
author supplies `verbs=("milestone",)` and never sees a regex. They cannot omit
the anchor, and they cannot skip the fenced-block stripping, because they were
never given the opportunity to write either one.

## The escalation bors has

The same question applies to permissions, and here the comparison inverts:
bors has the better design and the worse bug.

Prow makes permission each plugin's job. There is a shared helper,
`TrustedUser(...)` at `pkg/plugins/trigger/trigger.go:253`, but a plugin has to
remember to call it, and the standard differs per plugin — `lgtm.go:291` checks
collaborator status, while `override.go:317` accepts repo admin *or* a GitHub
team *or* top-level OWNERS. Worse, the `WhoCanUse` string shown in help
(`override.go:251`) and the code that actually authorises (`override.go:326`)
are two separate truths, kept in sync by hand.

bors declares instead. `required_permission_level_cmd/1` in
`lib/web/command.ex:356` maps each command to `:none`, `:member` or `:reviewer`.
Then `run/1` at `command.ex:337-354` takes the strictest level across every
command in one comment and checks once, before executing any of them. That is
the right shape.

But `run/2` is reachable directly, and `command.ex:513-516` reaches it:

```elixir
def run(c, :retry) do
  {commenter, cmd} = Logging.most_recent_cmd(c.patch)
  run(%{c | commenter: commenter}, cmd)
end
```

`:retry` requires only `:member` (`command.ex:376`). It replays a historical
command **under the original commenter's identity**, and it enters through
`run/2`, so the gate in `run/1` never runs. A member can replay a reviewer's
command.

The lesson is not "bors is insecure". It is that the gate was correct and the
second entrance defeated it. One execution path, or the gate is decorative.

## What we took from each

Two more findings worth copying, one in each direction.

Prow's genuinely good idea: `ValidatePluginsUnknown` at
`pkg/plugins/config.go:1381` rejects a configured-but-unregistered plugin by
looking it up in the help table. That makes "shipped without documentation" a
hard error rather than a code review note. Our registry entry carries `usage`
and `description`, and a binding test fails if a registered command is missing
from the docs.

Prow's gap: `RegisterGenericCommentHandler` at `pkg/plugins/plugins.go:176` is a
bare map assignment. Register the same name twice and the second silently
overwrites the first; two plugins both matching `^/hold` both run, in
nondeterministic goroutine order. We raise on a duplicate name and on
overlapping verbs, at import time.

## The registry already existed

The shape we landed on was not invented for this. Our journal module has had it
for months — `JOURNAL_EVENTS` at `src/orbi/journal.py:167` is an explicit dict,
written out in the module. No decorators discovering things, no entry points, no
dynamic import. Registration *is* validation: `event()` raises on an
unregistered name, so a typo fails immediately instead of writing a silently
misnamed event. And a binding test pins the registry against the EN/ZH
documentation tables and the exporter's known kinds, in all three directions.

So the command registry looks the same:

```python
@dataclass(frozen=True)
class CommandSpec:
    name: str                    # the registry key and the receipt marker
    verbs: tuple[str, ...]       # the shared layer builds the regex from these
    permission: str              # declarative; the dispatcher enforces it
    validate: Callable[[str], str | None]   # business rule; None means accepted
    apply: Callable[..., None]              # raises TicketCommandError
    usage: str
    description: str

TICKET_COMMANDS: dict[str, CommandSpec] = { ... }
```

The shared layer owns — and solely owns — regex construction with the anchor,
fenced-block stripping, quoted-line stripping, skipping the runner's own
comments, permission enforcement, last-occurrence-wins, and receipts.
`milestone_command.py` shrinks to a registrant: a `validate` that checks the
version against the candidate set, and an `apply` that runs the three steps.

Adding a second command becomes "edit one dict, and the tests tell you what else
you forgot".

## One command, three idempotent steps

The original ticket said this command changes a config value. That was wrong,
and finding out why took a grep.

A complete advance needs three things to happen. We had one of them:

| Step | Engine capability before this work |
|---|---|
| Create the milestone | **None.** `create_milestone` and `milestones --method POST` had zero hits repo-wide |
| Open the release ticket | **None.** Only `arm_release_ticket`, which labels an *existing* ticket |
| Land `active_milestone` | Yes — `rewrite_active_milestone_line` |

The evidence was sitting in our own repository: v0.5.40's milestone had been
created by hand with `gh api`, and its release ticket did not exist at all.

The reason it had gone unnoticed for so long is more uncomfortable. A release
ticket template lives at `.github/release-ticket-template.md`, fully specified.
But `grep -rn "release-ticket-template" src/ prompts/ AGENTS.md` returns nothing.
No code has ever read it. Maintainers had been filling it in with a local
client-side tool — a patch installed on exactly one machine. **Managed tenants
were hitting the unpatched original.**

The fix is not to ship that local tool. It depends on a specific client, and
which client a tenant uses is not ours to decide. What belongs in the engine is
the capability: render the repo's own template, fill the fields, open the ticket.

So `/milestone v0.5.40` does three things, each independently idempotent: create
the milestone if absent, open the release ticket if absent, land the config
value. Run it twice and you get one milestone and one ticket.

Every step is deterministic. No model is invoked — the command's arguments are
the input, string substitution is the transformation, and a file write is the
output. An LLM in that path would add nondeterminism to an operation whose
entire value is being predictable.

## What we deliberately did not decide

There is a real open question underneath all of this, and we wrote it down
rather than answering it by accident.

Commands are currently read from exactly one place: the confirmation ticket the
engine itself opened, on an idle tick, only when auto-advance is off. Three
conditions stacked. Outside that intersection, a `/command` is never seen.

That is the narrowest possible scope, and it was the right call for a first
command. But it decides which commands can *exist*. `/approve` to clear a review
gate, `/retry` to requeue a blocked delivery, `/cancel` to stop one in flight,
`/model` to override for a single run — none of them has anywhere to land,
because delivery tickets are opened by humans and the engine never opens a
confirmation ticket for them.

Widening the scope to scan every `ai-*` ticket costs N extra API calls per tick,
a per-ticket cursor, and a rethink of how receipts dedupe across many tickets.
That cost is only justified by a command that needs it.

So the question is not "which option is better". It is: **which of those four
commands do we actually want, and is any of them worth a per-tick scan?** If the
answer is none for now, the narrow scope stands. We parked it in a discussion
thread instead of letting the refactor quietly answer it.

## The result

The command shipped the same day. The implementation was +2073/-81 across 18
files, and the follow-up that lifts the shared layer out of the milestone module
is specified and queued.

The part worth keeping is not the feature. It is that two mature systems, both
of which solved this before us, each left one defect visible in their source:
Prow's fix that cannot reach its callers, and bors's gate with a second door.
Both are the same class of mistake — a correct decision placed where it can be
bypassed.

We got to read both before writing ours. That is the actual luxury of building
on open source, and it is worth the day it costs.

---

*The tickets: [#1290](https://github.com/orbi-build/orbi/issues/1290) (the
design), [#1293](https://github.com/orbi-build/orbi/pull/1293) (the
implementation), [#1294](https://github.com/orbi-build/orbi/issues/1294) (the
shared layer), and
[#1295](https://github.com/orbi-build/orbi/discussions/1295) (where commands
should be read from). Every Prow and bors line number above was grepped at HEAD
on 2026-09-22, not recalled.*
