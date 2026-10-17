---
title: Claude Code subagents setup and when to use them
date: 2026-10-17
summary: Claude Code subagents handle delegated tasks in separate contexts. Configure a focused reviewer, give it clear inputs, and decide when delegation helps.
lang: en
author: Lawrence Liu
image: /img/blog-cc-subagents-card.png
mirror: claude-code-subagents
---

Claude Code subagents are specialized assistants that handle delegated tasks in their own context windows and return results to the main conversation. For a first configuration, I suggest a reviewer with a narrow assignment and a report you can check against the code.

I checked Anthropic's [subagent configuration](https://code.claude.com/docs/en/sub-agents) and [usage guidance](https://code.claude.com/docs/en/best-practices#create-custom-subagents) on 2026-10-17.

## Configure Claude Code subagents for a project

Save this as `.claude/agents/change-reviewer.md` in your repository; Claude Code picks up a new agent file at the start of a session, so start a fresh session in the project after adding it. That directory scopes the agent to the project; `~/.claude/agents/` makes it available across your projects. Both locations are covered in the [directory reference](https://code.claude.com/docs/en/claude-directory#file-reference).

```markdown
---
name: change-reviewer
description: Review supplied changed files for behavioral bugs and missing tests.
tools: Read, Grep, Glob
model: sonnet
---

Review the supplied requirement, changed-file list and diff.
Read the affected code and its callers as needed.
Use the diff to distinguish the change from existing behavior.

For each finding, return:
- The file and line.
- The input or action that triggers the problem.
- The expected and actual behavior.
- A test that would expose it.

Report uncertainty when the evidence is incomplete.
If no actionable findings remain, say what you inspected.
Do not edit files. Identify tests that need running by the main session.
```

The YAML requires `name` and `description`. The Markdown body supplies the agent's system prompt. Here, `tools` limits access to file inspection and `model` requests Sonnet (a call can still override the model). Claude uses the description when deciding whether to delegate. [Anthropic documents these fields in the frontmatter reference.](https://code.claude.com/docs/en/sub-agents#frontmatter-reference)

Keep the description short and put the review procedure in the body. A description such as "help with coding" gives the main agent little reason to choose this reviewer for a particular task.

To confirm the agent loaded, start a session in the project, type `@` and pick `change-reviewer` from the list, then send a request. If it does not appear, check that the file sits in `.claude/agents/` and restart the session. When the task runs, the transcript shows a delegation entry naming the agent, which is how you verify the subagent ran rather than the main session answering in place.

## Give the reviewer a complete assignment

Ask the main session to collect the diff, then give it a request like this with the bracketed inputs filled in:

```text
Use the change-reviewer subagent to review this change.

Requirement: [paste the expected user-visible behavior]
Changed files: [paste the file paths]
Diff: [paste the patch for these files]
Constraints: [paste compatibility requirements or repository rules]

Check whether the changed behavior satisfies the requirement.
Return actionable findings using the format in your instructions.
List any tests the main session should run. Do not change files.
```

For the ordinary subagent used here, [startup context](https://code.claude.com/docs/en/sub-agents#what-loads-at-startup) excludes the main conversation's history; Claude prepares its task message. Supply the requirement, paths and diff explicitly. Claude Code also supports forks that inherit the conversation; this example uses an ordinary subagent.

Suppose a change should reject an empty form submission. Include that requirement, the handler's path and any relevant validation tests. Asking only "review the change" leaves the reviewer to infer what successful behavior should be.

This agent has no Bash tool, so ask the main session to run the proposed tests. When reading its report, check that each finding identifies a triggering input and a location in the code. A suggestion to "improve validation" is too vague to act on. A report that names an accepted empty value, the handler that accepts it and the missing assertion gives you something to verify.

## When a separate context helps

Anthropic's [investigation guidance](https://code.claude.com/docs/en/best-practices#use-subagents-for-investigation) recommends subagents for reading many files and returning a summary. The intermediate exploration stays in a separate context. Its best practices also suggest verification after implementation.

A useful repository lookup asks a concrete question, such as finding the existing function that validates a form field. Ask for the function's location, its callers and the constraints a new caller must respect. The main session can use that answer without needing every search result.

A focused review is another useful boundary. Give the reviewer a requirement and a fixed set of changed files. Pause edits to those files until the report returns, then have the main session check each finding against that version before making changes.

Keep a small edit in the main conversation when it depends on the discussion already in progress. Before delegating, try writing the assignment and the expected return. If you cannot describe either clearly, narrow the task first. Splitting an unclear request across several agents leaves several unclear assignments to reconcile.

This reviewer shares the main session's working directory; its separate context does not freeze the files. For a separate Git working directory, Claude Code supports [`isolation: worktree`](https://code.claude.com/docs/en/sub-agents#frontmatter-reference). The example above does not request it.

## Independent review in Orbi

I'm Lawrence Liu, the creator of Orbi. Orbi uses Pi as its coding agent, with a runner that assigns work and manages the resulting pull requests. Each Issue delivery run gets a git worktree and an implementation session. Review runs in a fresh Pi session that can also fix the code. The runner checks the review verdict, CI results and pull request state before merging. [The Pi architecture guide](/guides/pi-coding-agent/?ref=blog-cc-subagents) explains those gates.

The reviewer above hands its report back to the main session, and you act on it. When you want an Issue to move through implementation, review and merge on its own, you need a runner rather than a single delegated task. Orbi fills that by orchestrating Pi processes: the agent file above belongs to Claude Code, and Orbi does not run it. Orbi's review session can edit code; the reviewer above is read-only.

For unattended work, I would start by defining a checkable Issue and who evaluates its result. Orbi's [Issue-to-release guide](/guides/issue-to-release/?ref=blog-cc-subagents) follows that assignment through implementation, review and the merge gate, then describes the release workflow.

## Related

- [Compare Orbi with Claude Code](/compare/claude-code/?ref=blog-cc-subagents)
- [Run Orbi's delivery workflow with Cloud](/cloud/)
