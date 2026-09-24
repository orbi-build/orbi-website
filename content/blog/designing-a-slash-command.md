---
title: How one slash command got its shape
date: 2026-09-22
summary: A close look at the name, syntax, regex anchor, and registry behind one in-ticket command, compared with Prow and bors-ng and checked against their source.
lang: en
author: Orbi
image: /img/blog-slash-command.png
mirror: designing-a-slash-command
---

When our engine finishes a milestone, it opens a ticket with the candidates for the next version and waits for a choice. That pause is intentional.

Automatic version advancement stays off. The release engine should not choose what ships next.

The problem was the answer. The ticket asked people to run
`orbi milestone set v0.5.40`, a CLI command on the host machine. Managed
tenants have neither a host shell nor that CLI. Their sandbox runs on our
hardware, so the engine was asking them for something they could not do.

Closing that gap meant building an in-ticket command: comment `/milestone v0.5.40`
and the engine does the rest. It is one small feature. It took a day of design
because almost every choice in it has been made before, by people who then had
to live with it.

## Why not a verb

The first argument was about the name. `/advance` was the obvious candidate, and
it is wrong.

In-ticket commands are named after states, not actions. Prow has `/lgtm`,
`/hold`, `/approve`. bors has `bors r+`. None of them is an imperative verb.
This is not a style preference. It comes from what the command means. A CLI
says *do this thing*, so a verb fits. An in-ticket command says *set it to this*,
so a noun fits. `/milestone v0.5.40` reads as "milestone: v0.5.40", the same
shape as `/hold`.

There is a second reason, specific to us. The CLI is already called
`orbi milestone set`. Naming the in-ticket command `/milestone` means the
documentation says the word once. `advance` would have been a third name for a
thing that already has two.

We also rejected `bump version`, because it reads like editing the version
string in `pyproject.toml`, which is what the release process does, not what
this command does. A name that makes people expect the wrong side effect is a
bad name even if it is short.

That last one is worth dwelling on, because it is the rule the other rejections
follow from. A command name is a promise about side effects. `/advance` promises
something moved forward but does not say what: the version? the delivery? the
queue? `bump version` promises a file edit that never happens. Both are short,
pronounceable, and wrong in the same way: **the reader forms an expectation the
implementation will not honour.**

`/milestone v0.5.40` makes exactly one promise: the milestone is now v0.5.40,
and the three things it does are all in service of making that true. Creating
the milestone, opening the release ticket, landing the config value: none of
them is a surprise once you have read the name.

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

We are the first kind. The engine is open source under AGPL-3.0, and self-hostable. More
pointedly, the same engine already runs under two identities in our own org. On
our bootstrap runner the comment author is a human account, and in a managed
sandbox it is `orbi-build[bot]`. We confirmed both on our own repository the
same day. Binding the syntax to a name would break self-hosted users on day one.

The tempting middle path is to accept both: match `@orbi milestone` *and*
`/milestone`, and let people use whichever they like. We rejected that too, and
the reason is not aesthetic. Two syntaxes mean two things to document, two
things to test, and two things that can drift apart when someone adds the third
command. The notification is genuinely useful, but the cost is
paid on every future command, forever, by everyone maintaining this. A
notification is not worth a permanent fork in the grammar.

## The regex is three decisions in one

Anchoring at the start of a line, with the multiline flag:

```
(?mi)^/milestone[\t ]+(\S+)[\t ]*$
```

Prow writes this in Go. bors splits the comment into lines and anchors each one
in Elixir. Two unrelated implementations made the same choice, usually a sign
the choice is load-bearing.

It buys three things at once:

- the command can appear on any line of a long comment, so you can explain
  yourself and then issue it
- it is automatically immune to GitHub's quote-reply, because `>` pushes the
  slash off the line start
- it is automatically immune to indented code blocks, for the same reason

What it does **not** buy is immunity to fenced code blocks. And that turned out
to be the most interesting thing we read all day.

<figure class="post-media">
<img src="/img/diagrams/command-pipeline.svg" alt="The in-ticket command pipeline: a comment passes through fence stripping, quote stripping, a bot-author check, a permission gate, last-occurrence-wins, and finally a receipt. The fence-stripping and permission stages are highlighted as the two places where Prow and bors respectively leak." width="880" height="120">
<figcaption>Six stages, one owner. Prow gives each plugin its own regex, so the fenced-block fix cannot reach them. It leaks at “strip fences”. bors declares permissions correctly but leaves a second door into the handler. It leaks at “permission”.</figcaption>
</figure>

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
where they put the regex. Prow gives every plugin its own pattern;
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
remember to call it, and the standard differs per plugin: `lgtm.go:291` checks
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
for months. `JOURNAL_EVENTS` at `src/orbi/journal.py:167` is an explicit dict,
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

The shared layer alone owns regex construction with the anchor,
fenced-block stripping, quoted-line stripping, skipping the runner's own
comments, permission enforcement, last-occurrence-wins, and receipts.
`milestone_command.py` shrinks to a registrant: a `validate` that checks the
version against the candidate set, and an `apply` that runs the three steps.

Adding a second command becomes "edit one dict, and the tests tell you what else
you forgot".

<figure class="post-media">
<svg viewBox="0 0 880 330" role="img" aria-label="Two registries side by side. JOURNAL_EVENTS, already in the repository, is an explicit dict where registration validates: an unregistered name raises, and a binding test pins it against the EN and ZH docs tables and the exporter. TICKET_COMMANDS copies that shape: the dispatcher enforces the declared permission, duplicate verbs raise at import, and the same binding test pins usage and description against the docs.">
<title>TICKET_COMMANDS copies a registry shape the repository already had</title>
<g font-family="Instrument Sans, sans-serif" font-size="13" fill="#10292c">
<rect x="8" y="30" width="410" height="270" rx="8" fill="#f7f8f5" stroke="#b8c5c1"></rect>
<text x="26" y="58" font-size="14" font-weight="600">JOURNAL_EVENTS</text>
<text x="26" y="78" font-size="11.5" fill="#526566">src/orbi/journal.py:167 · shipped months ago</text>
<text x="26" y="112">An explicit dict, written out in the module.</text>
<text x="26" y="134">No decorators. No entry points. No dynamic import.</text>
<text x="26" y="170" font-weight="600">Registration is validation</text>
<text x="26" y="190" font-size="12">event() raises on an unregistered name, so a typo</text>
<text x="26" y="208" font-size="12">fails immediately instead of writing a bad event.</text>
<text x="26" y="240" font-weight="600">A binding test pins it three ways</text>
<text x="26" y="260" font-size="12">EN docs table · ZH docs table · exporter kinds</text>
<rect x="462" y="30" width="410" height="270" rx="8" fill="#e8eeeb" stroke="#0a6b52" stroke-width="2"></rect>
<text x="480" y="58" font-size="14" font-weight="600">TICKET_COMMANDS</text>
<text x="480" y="78" font-size="11.5" fill="#0a6b52">the new one · same shape, nothing invented</text>
<text x="480" y="112">An explicit dict, written out in the module.</text>
<text x="480" y="134">A command author edits one entry.</text>
<text x="480" y="170" font-weight="600">Registration is validation</text>
<text x="480" y="190" font-size="12">Duplicate name or overlapping verb raises at</text>
<text x="480" y="208" font-size="12">import; the thing Prow does not check.</text>
<text x="480" y="240" font-weight="600">A binding test pins it three ways</text>
<text x="480" y="260" font-size="12">usage · description · the docs table</text>
<line x1="424" y1="165" x2="454" y2="165" stroke="#526566" stroke-dasharray="4 3"></line>
<text x="439" y="158" text-anchor="middle" font-size="11" fill="#526566">≡</text>
</g>
<g font-family="Instrument Sans, sans-serif" font-size="12.5" fill="#526566">
<text x="8" y="322">Adding a command becomes "edit one dict, and the tests tell you what else you forgot".</text>
</g>
</svg>
<figcaption>The registry was not designed for this feature. It was already in the repository, holding journal event names, with the property that mattered: registering a thing is what validates it.</figcaption>
</figure>

## One command, three idempotent steps

The original ticket said this command changes a config value. That was wrong,
and finding out why took a grep.

A complete advance needs three things to happen. We had one of them:

| Step | Engine capability before this work |
|---|---|
| Create the milestone | **None.** `create_milestone` and `milestones --method POST` had zero hits repo-wide |
| Open the release ticket | **None.** Only `arm_release_ticket`, which labels an *existing* ticket |
| Land `active_milestone` | Yes; `rewrite_active_milestone_line` |

The evidence was sitting in our own repository: v0.5.40's milestone had been
created by hand with `gh api`, and its release ticket did not exist at all.

The reason it had gone unnoticed for so long is more uncomfortable. A release
ticket template lives at `.github/release-ticket-template.md`, fully specified.
But `grep -rn "release-ticket-template" src/ prompts/ AGENTS.md` returns nothing.
No code has ever read it. Maintainers had been filling it in with a local
client-side tool, a patch installed on exactly one machine. **Managed tenants
were hitting the unpatched original.**

The fix is not to ship that local tool. It depends on a specific client, and
which client a tenant uses is not ours to decide. What belongs in the engine is
the capability: render the repo's own template, fill the fields, open the ticket.

So `/milestone v0.5.40` does three things, each independently idempotent: create
the milestone if absent, open the release ticket if absent, land the config
value. Run it twice and you get one milestone and one ticket.

### The branch we refused to write

Landing the config value has two destinations, because `active_milestone` can
come from two places: a repository policy file (`.github/orbi.toml`) or the
host's own config. Write to the wrong one and the value either does not take
effect or takes effect for the wrong scope.

The obvious implementation is a runtime check: *am I running in a managed
sandbox or on a self-hosted runner?* We refused to write that branch.

There is no reliable signal for it. The nearest candidate, `engine_source_track`,
can be set on a bootstrap runner too, so the check would be a heuristic
pretending to be a fact, and heuristics in a write path fail in the direction
nobody tests.

More importantly, **the question is the wrong one.** We do not need to know
where we are running. We need to know where this value came from, and that is
already known, precisely, by the code that read it: `resolve_policy` in
`src/orbi/repo_config.py:287-290` knows whether `active_milestone` came from the
repo policy or the host config, because it is the thing that looked.

So the branch keys off provenance, not environment. Policy-sourced values are
written back to `.github/orbi.toml` and pushed; host-sourced values go through
`rewrite_active_milestone_line`. Two paths, one question, and the answer is a
fact rather than an inference.

This generalises: when you find yourself about to detect your own environment,
check whether the thing you actually need was already determined by whoever
supplied the input.

Every step is deterministic. No model is invoked. The command's arguments are
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
`/model` to override for a single run. None of them has anywhere to land,
because delivery tickets are opened by humans and the engine never opens a
confirmation ticket for them.

Widening the scope to scan every `ai-*` ticket costs N extra API calls per tick,
a per-ticket cursor, and a rethink of how receipts dedupe across many tickets.
That cost is only justified by a command that needs it.

So the question is not "which option is better". It is: **which of those four
commands do we actually want, and is any of them worth a per-tick scan?** If the
answer is none for now, the narrow scope stands.

### Why "not yet" is a decision and not a dodge

We parked this in a discussion thread rather than settling it, and that choice
deserves the same scrutiny as the others.

The refactor that lifts the shared layer out (#1294) touches every piece of
machinery a wider scan would use: the parser, the permission gate, the receipt
dedupe. It would have been easy, and superficially tidy, to widen the scope
while we were in there. "We're already touching this code" is the most common
reason a scope decision gets made by accident.

But look at what the widening actually costs. Receipts currently dedupe by
scanning one ticket's comment list; across many tickets that needs a different
mechanism entirely. Every tick gains N API calls plus pagination and rate-limit
handling. The reachable surface grows from "tickets we opened" to "every
delivery ticket". Those are not incidental; they are the design of a different
feature, and they would have been designed in passing, to serve commands nobody
had specified yet.

The alternative failure is just as real: deciding now to stay narrow, and
writing that into the architecture so firmly that `/retry` becomes expensive
later. So #1294 states its own scope neutrality explicitly: it moves code and
adds nothing, and it does not read the discussion's conclusion.

**The cost of Option B is only justified by a command that needs it.** Until one
of `/approve`, `/retry`, `/cancel` or `/model` is specified, there is no
information that would make the choice better than a coin flip. Writing the
question down, with both option's costs enumerated, is what keeps it from being
answered by whoever next opens that file.

## The result

The command shipped the same day. The implementation was +2073/-81 across 18
files, and the follow-up that lifts the shared layer out of the milestone module
is specified and queued.

The part worth keeping is not the feature. It is that two mature systems, both
of which solved this before us, each left one defect visible in their source:
Prow's fix that cannot reach its callers, and bors's gate with a second door.
Both are the same class of mistake: a correct decision placed where it can be
bypassed.

We got to read both before writing ours. That is the actual luxury of building
on open source under AGPL-3.0 software, and it is worth the day it costs.

---

*The tickets: [#1290](https://github.com/orbi-build/orbi/issues/1290) (the
design), [#1293](https://github.com/orbi-build/orbi/pull/1293) (the
implementation), [#1294](https://github.com/orbi-build/orbi/issues/1294) (the
shared layer), and
[#1295](https://github.com/orbi-build/orbi/discussions/1295) (where commands
should be read from). Every Prow and bors line number above was grepped at HEAD
on 2026-09-22, not recalled.*


## Related

Read the [Cursor comparison](/compare/cursor/) and [Cloud](/cloud/).
