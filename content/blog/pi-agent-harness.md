---
title: Pi agent harness: CLI, AI SDK, Pi Durable vs kill -9
date: 2026-10-06
summary: I retested Pi's CLI, AI SDK adapter and Cloudflare PiHarness on current versions, killed each mid-task, and checked what survived and how each recovered.
lang: en
author: Larry 🍀 Orbi
image: /img/blog-pi-agent-harness-card.png
mirror: pi-agent-harness
series: pi
---

The Pi harness, also called the Pi agent harness, is the loop inside [Pi](https://pi.dev), the open-source coding agent from Earendil: it sends your prompt to a model, runs the tool calls the model asks for, records the conversation, and repeats until the model stops asking for tools. This post is for developers who run coding agents unattended: I start the same task in three Pi setups, kill each one partway through, and show what survives and who has to restart it. You also get install commands, a supervisor script for `pi --print`, and runnable AI SDK and Cloudflare examples, all retested on 6 November 2026 on Pi 1.5.0 and Pi Durable 1.5.0. On 1 October 2026 Earendil shipped Pi 1.0 and, next to it, an experimental second harness called Pi Durable, which checkpoints every step so a run can outlive the process running it.

I'm Larry 🍀 Orbi, the creator of Orbi, which runs Pi with nobody watching: it hands Pi a GitHub issue and, when things go well, gets back a reviewed, merged pull request. How Orbi starts Pi is in [the first post of this series](/blog/orbi-on-pi-coding-agent/); the runner around Pi is described in the [Pi hub](/guides/pi-coding-agent/). I first ran these tests on 6 October 2026 on Pi 1.0.0 and reran all of them on 6 November 2026 on Pi 1.5.0 and the current adapter and Durable Object packages; this version reports the November results and says where they differ.

## What is the Pi harness?

A harness is the program around the model. It builds each request, executes the tools, stores the conversation and decides when a run is over; the model itself only produces text and tool calls. Pi keeps its harness small on purpose. The system prompt is short, and the model gets four tools by default, `read`, `bash`, `edit` and `write` (Pi's [CLI docs](https://pi.dev/docs/latest/cli)). By default, the coding agent saves a session as a JSONL file with one entry per line: messages, tool results, and changes such as a model switch. Conversation entries point to their parent entry, so you can branch from any earlier point. Extensions are TypeScript modules loaded into the Pi process, skills are instructions the model loads when it needs them, and features such as sub-agents and permission prompts are left to those. The [first post](/blog/orbi-on-pi-coding-agent/#what-pi-leaves-to-you-and-where-orbi-puts-it) lists what Pi leaves out and what Orbi adds in its place.

Pi has four CLI modes: the interactive terminal, print, JSON, and RPC over stdin and stdout. Separately, an SDK embeds it in a Node program. Pi's [How Pi works](https://pi.dev/docs/latest/how-pi-works) page says, "All interfaces use the same agent and session mechanisms." I didn't test RPC. The AI SDK adapter below is built on Pi's SDK, but keeps the session in memory and hands it back in its lifecycle state.

### Pi coding harness or Pi Durable?

Since 1 October, "pi harness" can mean two things from the same team. The first is the Pi coding harness: the Pi coding agent (`@earendil-works/pi-coding-agent`, the `pi` command), which Earendil describes as a harness built for one person at a terminal. Earendil's [Pi Durable announcement](https://earendil.com/posts/pi-durable/) describes what happens when the `pi` process dies: "you look at what happened and tell it to continue." Pi Durable (`@earendil-works/pi-durable`) is a separate library for agents that keep running on their own.

In it every model call and tool call is a task that stores a checkpoint before moving on, so a new process can open the same storage and carry on. It shares Pi's model layer, `pi-ai`, but it isn't the `pi` command. It ships the same four coding tools, but they only work once you give them an execution environment, meaning somewhere to read files and run commands; Pi Durable includes one for Node. A Cloudflare Worker has no shell, and its filesystem is a virtual one whose `/tmp` lasts only for a single request, so on Cloudflare you write the tools yourself.

## How to install and run the Pi harness

Pi needs Node.js 22.19 or newer. The official installer is `curl -fsSL https://pi.dev/install.sh | sh`, or install the npm package as below. For interactive use, run `pi` in your project directory and use `/login` inside Pi to connect a subscription or API key. For unattended use, run `pi --print` with a provider key in the environment. With `DEEPSEEK_API_KEY` set, I ran:

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
pi --version          # 1.5.0 on 6 November 2026
pi --print --provider deepseek --model deepseek-flash "Reply with only the word READY." < /dev/null
```

The print command returned `READY`. I tested the npm install and the `--print` line, not the curl installer or interactive `/login`. The next sections show what happens when such a run is killed.

## Killing three unattended Pi setups mid-task

In the table, a Durable Object is a Cloudflare Worker instance with its own storage, addressed by name.

| | `pi --print` | AI SDK `HarnessAgent` | Cloudflare `PiHarness` |
|---|---|---|---|
| What runs | Pi 1.5.0 (1.0.0 in October), as a child process | Pi coding agent 1.5.0 inside your Node process, via `@ai-sdk/harness-pi` 1.0.177 (in October 1.0.141, which depended on Pi `^0.85.1`) | Pi Durable 1.5.0 in a Durable Object, via the Cloudflare Agents SDK (npm package `agents`) 0.33.0, which supports one Pi minor at a time (`~1.5.0`) |
| Status | Stable | Experimental (AI SDK docs: "Harness packages are experimental") | Pi Durable is experimental |
| Tools in my test | Pi's own `bash` and `write` | Pi's own `bash` and `write`, in a sandbox | Two tools I wrote: `sleep`, and `write_file`, which saves a row in SQLite |
| Kills and outcome | `SIGKILL` three times in November (twice in October). Relaunched with `--continue`, it finished every time. | `SIGKILL` twice: the conversation could not be resumed either time, and nothing of it was left on disk (the temp directory was empty). `SIGTERM` six times, handled with `session.stop()`: resumed and finished each time. Among the three runs whose stop-time state I kept, one had a `sleep` cut short by `stop()`, and it was recorded as a success (`(exit 0)`). | `SIGKILL` three times. After I restarted the local runtime, the object came back without any request and finished all three times. |
| Where the session lives | A JSONL file in `--session-dir`, one entry per line | In memory during a turn. `stop()`, `detach()` and `suspendTurn()` return a state containing the session entries; with the new `sessionStorage` option, the state keeps only the last entry's id and the entries go to your own append-only log. No session entries are written before one of those calls. | Tables named `pi_*` in the Durable Object's SQLite database |
| Extensions and keys | Whatever the OS user, and a trusted repository, provide, unless you pass `--no-extensions` and `--no-skills`. Keys come from that user's environment or `auth.json`. | No extension discovery, only factories you pass in code. Keys come from an `auth` record, your own credential store or the host's environment, and stay on the host. | Extensions are objects your Worker installs in a registry. The key is a Worker secret. |
| Who restarts a dead run | Your supervisor, which also has to clean up tool processes `pi` left behind: commands still running after a `SIGKILL`, and anything put in the background | Your code, from a state saved earlier by `stop()`, `detach()` or `suspendTurn()` | Per Cloudflare's docs, the heartbeat alarm fires every 30 seconds while Pi has work (`HEARTBEAT_MS = 3e4` in `agents/harness/pi`). Locally, the object was constructed 0.9, 4.9 and 23.9 seconds after I issued the restart, all within one heartbeat. |
| Who notices a hung run | Your supervisor | Your code: `stream()` takes an abort signal | Your code, through `abort()`; nothing is built in, and a tool that ignores its abort signal keeps the session busy |
| What you run yourself | A machine and a supervisor | A Node service and a sandbox | No server; deploying needs a Cloudflare account, and coding tools need an execution environment you provide |

Each test gave the model the same instructions: create `step1.txt` to `step5.txt` in order, call an 8-second sleep before each file, and reply `ALL DONE`. The prompt, as sent (the Cloudflare version says "call the sleep tool with seconds=8" instead of running `sleep 8` in bash, and drops "in the current directory"):

```text
Create files step1.txt through step5.txt in the current directory, one at a time, in order. Before creating each file, run `sleep 8` in bash as a separate tool call. Each file contains its step number. When all five exist, reply ALL DONE.
```

Uninterrupted, a run took about 50 seconds. The model was `deepseek-flash` through DeepSeek's API every time. Between 22 and 33 seconds in during the November hard-kill tests, I killed the process with `SIGKILL` (`kill -9`), which a process can't catch; the Linux out-of-memory killer sends the same signal. For the AI SDK I also tried `SIGTERM`, which a process can catch; `SIGTERM` was the only way the AI SDK run recovered. The results below are from the 6 November 2026 retest on my own machine, unless I label them as October observations.

The table also shows that this isn't a like-for-like benchmark. The three run different code, and the Cloudflare test used my own two tools because a Worker has no shell and keeps no files between requests. I compared one thing: what is left after a hard kill, and who has to act.

## Running Pi headless with `pi --print`

Headless Pi is `pi --print` (short form `-p`): it runs the prompt, prints the final answer and exits with status 0, or 1 on an error such as a model the provider rejects. Add `--mode json` to get every event as a JSON line instead, but then check the events for errors: with the same rejected model, JSON mode exited 0 and left `"stopReason":"error"` in its output. The command I used, with `--no-context-files` to skip `AGENTS.md` files and the other two flags to skip every discovered extension and skill, mine and the repository's:

```bash
pi --print --mode json \
   --no-extensions --no-skills --no-context-files \
   --provider deepseek --model deepseek-flash \
   --session-dir ./sess "<task>" < /dev/null
```

In print mode Pi can't ask whether to trust the project. With no `--approve` flag, no extension that answers the trust prompt and no saved decision for that directory, the default `defaultProjectTrust: "ask"` means it quietly skips a repository's own `.pi` settings, extensions and skills ([security docs](https://pi.dev/docs/latest/security)). Pass `--approve` or `--no-approve` to make that choice on the command line.

On Pi 1.5.0 in November, I killed it three times, each during a `sleep 8`. The last line of the session file each time was the model's `bash` call with no result after it. All three files were still valid JSONL, and the interrupted `sleep 8` was still running a moment after each kill.

`SIGKILL` doesn't stop everything, though. Pi starts each `bash` command detached, in its own process group (`detached: true` in Pi's `bash.js`). It stops tracking a command's process group once the command returns, and on `SIGTERM` or `SIGHUP` it kills the ones still running (`print-mode.js`). A `SIGKILL` gives it no chance to do even that. I asked Pi to run `sleep 97` and killed it with `timeout -s KILL 15s`: a second later `sleep 97` was still running. The same test with a plain `timeout 15s`, which sends `SIGTERM`, left nothing behind. A stuck test run left over from a `SIGKILL` keeps its port and keeps writing files while the next attempt starts. Anything a command put in the background, such as `npm run dev &`, outlives Pi however it exits, because Pi stopped tracking it when the command returned.

Something outside Pi has to see that the process is gone and start it again. Resuming took one command:

```bash
pi --print --continue --session-dir ./sess \
   --no-extensions --no-skills --no-context-files \
   --provider deepseek --model deepseek-flash \
   "You were interrupted. Continue the original task from where you left off." < /dev/null
```

`--continue` reopens the most recent session in the `--session-dir` directory that was started from the same working directory, so give each task its own session directory. On an empty directory it simply starts a new session. All three November runs finished with all five files and `ALL DONE`, in about 33, 32 and 22 seconds. Each time, the model first ran `ls` and `cat` on the step files, then continued. In October, one kill landed between tool calls after `step3.txt` was written; after that clean cut, the model carried on from step 4 without checking anything.

The interrupted `bash` call never got a result in the session file, before or after the resume. Chat APIs expect every tool call to have a result, so Pi's model layer fills the gap each time it builds a request: `pi-ai` inserts a result for the orphaned call with the text `No result provided`, marked as an error (`transform-messages.js` in `@earendil-works/pi-ai` 1.5.0). The model sees a failed call that the file never records. If you replay or audit session files, expect tool calls without results.

A supervisor can be this short. Each attempt gets a time limit; when it runs out, `timeout` sends `SIGTERM` so Pi can kill the tool commands still running, and `SIGKILL` 30 seconds later only if Pi hangs. When `pi` exits non-zero, it resumes the same session, up to three attempts in all. The script uses GNU `timeout`, so it is written for Linux; macOS doesn't ship `timeout` (Homebrew's coreutils installs it as `gtimeout`), and I didn't test it there. Save it as `pi-task.sh` and run it with bash:

```bash
#!/usr/bin/env bash
# Usage: pi-task.sh <session dir> <task prompt>
set -u
dir=$1 task=$2 prompt=$2
limit=${PI_TIME_LIMIT:-30m}
mkdir -p "$dir"
flags=(--print --no-extensions --no-skills --no-context-files
       --provider deepseek --model deepseek-flash --session-dir "$dir")
for attempt in 1 2 3; do
  # SIGTERM at the limit lets pi kill tool commands still running; SIGKILL 30 s later if it hangs
  timeout -k 30s "$limit" pi "${flags[@]}" "$prompt" < /dev/null
  code=$?
  [ "$code" -eq 0 ] && exit 0
  echo "attempt $attempt: pi exited with $code" >&2
  [ "$attempt" -eq 1 ] && flags+=(--continue)
  prompt="You were interrupted. Continue this task from where you left off: $task"
done
exit 1
```

I ran it four ways. With `PI_TIME_LIMIT=25s` on the step task, it timed out twice (exit 124) and finished on the third attempt, all in one session file, with no `sleep` left running. With a 15-second limit on the `sleep 97` task, all three attempts timed out and nothing was left running afterwards. With a model name DeepSeek rejects, it failed three times with exit 1 and exited 1. With a short prompt it answered and exited 0.

The retry prompt repeats the task, so a first attempt that dies before Pi has saved anything doesn't leave the retry with nothing to go on. The script passes neither `--approve` nor `--no-approve`, so add `--approve` if the task needs the repository's own `.pi` settings; its extensions and skills stay off either way, because of `--no-extensions` and `--no-skills`. Exit 0 only means Pi finished its run. Whether the task is done is a separate check, for example the five files existing.

If `pi` dies from `SIGKILL` anyway (the OOM killer, or the 30-second fallback), its running tool commands survive; anything a command put in the background survives however Pi exits. On Linux you can catch all of those by starting each attempt with `systemd-run --user --scope` and stopping that scope afterwards, which needs a systemd user session; or run each attempt in its own container.

Orbi, which has run 169 recorded deliveries through `pi --print` (a median of $0.082 each in tokens at DeepSeek's off-peak list prices, per the [first post](/blog/orbi-on-pi-coding-agent/)), recovers a killed delivery differently: it doesn't use `--continue`; it starts a fresh session with a short note about the unfinished work. When a session gets stuck, Orbi's watchdog also kills the tool processes that session started; it is described in the [hub](/guides/pi-coding-agent/#when-a-session-goes-silent).

### Close stdin, or headless Pi waits forever

Pi's [CLI docs](https://pi.dev/docs/latest/cli) say piped stdin is prepended to the first prompt:

```bash
echo "the secret word is BANANA" | pi --print "reply with only the secret word"
# BANANA
```

What they don't say is that Pi reads stdin until it closes (`readPipedStdin` in Pi's `main.js` waits for the stream's `end` event). If stdin is a pipe nobody closes, Pi waits, with no output and no error:

```bash
sleep 40 | timeout 20 pi --print "reply with only PONG"            # pi killed at 20 s (exit 124), nothing printed
sleep 40 | timeout 20 pi --print "reply with only PONG" < /dev/null # PONG printed
```

Both lines return only when `sleep 40` ends, because the shell waits for the whole pipeline. Run them in bash; zsh feeds both the pipe and the file to a command that has both (its MULTIOS option), so the second line hangs there too. A `< /dev/null` on a command with no pipe in front of it works in either shell.

Typing `pi --print "..."` in a terminal with no pipe is fine, because Pi skips stdin when it's a TTY. systemd gives services `/dev/null` as stdin by default (`StandardInput=null`), so a timer-driven process is safe unless it hands `pi` a pipe itself. A program that starts `pi` and lets it inherit an open pipe is not. If you spawn `pi` yourself, pass `stdin=subprocess.DEVNULL` (Python), `stdio: ['ignore', ...]` (Node) or `< /dev/null` (shell).

Orbi's runner had this gap when I first wrote this post: it started Pi with `subprocess.Popen` without setting `stdin`. It was fixed the same day ([orbi-build/orbi#1562](https://github.com/orbi-build/orbi/issues/1562)): the runner now passes `stdin=subprocess.DEVNULL`.

## Pi inside your Node app, through the AI SDK

[`@ai-sdk/harness-pi`](https://ai-sdk.dev/providers/ai-sdk-harnesses/pi) runs Pi in the host Node process and does the file and shell work in a sandbox; Vercel says Pi "uses the sandbox as a remote filesystem and shell". The sandbox can be a Vercel Sandbox or `just-bash`, an in-process bash with a virtual filesystem. I used `just-bash` on top of a real directory, so files would survive a kill. Adapter 1.0.177 depends on `@earendil-works/pi-coding-agent` `^1.0.3`; npm installed 1.5.0, so this path now runs current Pi. In October, adapter 1.0.141 installed Pi 0.85.1. I tested the adapter because it adds the sandbox split, and I didn't kill-test Pi's own SDK.

The script, without logging. It exits 0 when the turn ends without an error (whether the task is done is still your check), 1 if the stream reports an error, and 143 when `SIGTERM` stopped it and `stop()` returned a resume state, so a supervisor can tell the three apart. It keeps `state.json` and the session id fixed, so give each task its own directory, as with `pi-task.sh`. With Node 22.19 or newer (what the bundled Pi requires), save it as `run.mjs`, install the versions I used and run it with `DEEPSEEK_API_KEY` set:

```bash
npm i @ai-sdk/harness@1.0.174 @ai-sdk/harness-pi@1.0.177 @ai-sdk/sandbox-just-bash@1.0.174 just-bash@2.14.5
DEEPSEEK_API_KEY=... node run.mjs   # run it again after a SIGTERM to resume
```

Keep `just-bash` pinned to 2.x: an unpinned `npm i just-bash` installs 3.6.0 next to the 2.14.5 the sandbox package depends on.

The script ran unchanged on adapter 1.0.177:

```js
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createPi } from '@ai-sdk/harness-pi';
import { createJustBashNetworkSandboxSessionFromNativeSandbox } from '@ai-sdk/sandbox-just-bash';
import { Sandbox, ReadWriteFs } from 'just-bash';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const loadSavedState = () => existsSync('state.json') ? JSON.parse(readFileSync('state.json', 'utf8')) : undefined;
const saveState = (state) => writeFileSync('state.json', JSON.stringify(state));
const prompt = 'Create files step1.txt through step5.txt in the current directory, one at a time, in order. '
  + 'Before creating each file, run `sleep 8` in bash as a separate tool call. '
  + 'Each file contains its step number. When all five exist, reply ALL DONE.';

const harness = createPi({
  auth: { DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL: 'https://api.deepseek.com' },
  providers: { deepseek: { api: 'openai-completions', models: [{
    id: 'deepseek-flash', name: 'deepseek-flash', reasoning: false, input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 16384,
  }] } },
});
const agent = new HarnessAgent({ harness, model: 'deepseek/deepseek-flash' });
mkdirSync('./box', { recursive: true });
const sandbox = createJustBashNetworkSandboxSessionFromNativeSandbox(
  await Sandbox.create({ fs: new ReadWriteFs({ root: './box' }), cwd: '/work' }),
);

const resumeFrom = loadSavedState();  // undefined on a first run
const session = await agent.createSession({ sessionId: 'demo', sandboxSession: sandbox, ...(resumeFrom && { resumeFrom }) });
let stopping = false;
process.on('SIGTERM', async () => { stopping = true; saveState(await session.stop()); process.exit(143); });  // 143: stopped, resume state written

const result = session.hasUnfinishedTurn()
  ? await agent.continueStream({ session })
  : await agent.stream({ session, prompt });
let failed = false;
for await (const part of result.stream) {
  if (part.type === 'text-delta') process.stdout.write(part.text);
  if (part.type === 'error') { failed = true; console.error(part.error); }
}
if (!stopping) { saveState(await session.detach()); process.exit(failed ? 1 : 0); }  // else the SIGTERM handler saves and exits
```

Uninterrupted, it finished in about 50 seconds, with the files under `./box/work/pi-demo/`. I killed it twice with `SIGKILL`, at about 30 and 33 seconds. Both times, the files written so far were in the sandbox and the conversation was gone. The adapter keeps Pi's session in memory (`SessionManager.inMemory` in its source). It writes it out only inside `stop()`, `detach()` or `suspendTurn()`, as part of the state they return. A killed process calls none of them, and the temp directory `$TMPDIR/ai-sdk-harness/pi/<session id>/` held no files afterwards.

Each time I started a new process with the same session id and the same prompt as the manual `--continue` command above, "You were interrupted. Continue the original task from where you left off.", which leaves the task out on purpose to show whether the conversation survived. (The JS script above would send the full task instead.) With no history, the model wrote no new file either time and asked what the remaining steps were. In October, it had written one more file before stopping.

With `SIGTERM` instead, it resumed and finished all six times I tried, because the handler ran. `session.stop()` aborted the turn and returned a resume state that included the unfinished turn. A new process passed it as `resumeFrom`, found `hasUnfinishedTurn()` true and called `continueStream()`. The state from `detach()` also goes to `createSession({ sessionId, resumeFrom })`; the one from `suspendTurn()` goes to `createSession({ sessionId, continueFrom })`.

The state now carries the session itself. In three of those six runs, I kept a separate snapshot of the state at stop time, before the resumed run could overwrite it; those snapshots contained 16 to 22 entries. There is no separate session copy in the sandbox to check. The [AI SDK docs](https://ai-sdk.dev/providers/ai-sdk-harnesses/pi) say a state recorded in the old format restores as a fresh session, so a `state.json` saved by the October version would start over. With `sessionStorage`, `stop()` appends the new entries to your log and the state keeps only the last entry's id.

In one of those three runs, `stop()` cut the third `sleep 8` short, 1.2 seconds in, and it was recorded as `(exit 0)`. Three sleeps should have remained, including the interrupted one, but on resume the model ran only two. In the other two runs, the signal landed between steps and nothing was cut short. `just-bash`'s `sleep` reports success when aborted; I didn't check other sandboxes.

On Linux, `docker stop` and `systemctl stop` both send `SIGTERM` first and by default wait 10 and 90 seconds before `SIGKILL`, so a handler like this covers planned shutdowns, as long as `stop()` finishes within that window. It does nothing for a crash or the OOM killer.

The adapter's `reattachInProcess` option, on by default, sounds like it should help here and doesn't: it lets a suspended turn reuse its live Pi session within the same process. Once the process is gone, there is nothing to reattach to.

## Pi Durable on Cloudflare: `PiHarness`

[`PiHarness`](https://developers.cloudflare.com/agents/harnesses/pi/) shipped in the Agents SDK on [2 October](https://developers.cloudflare.com/changelog/post/2026-10-02-pi-harness/). Here Pi Durable keeps its transcripts, its queue of incoming prompts and its tasks in the Durable Object's SQLite database. According to Cloudflare's docs, while Pi has work, the job's heartbeat alarm fires every 30 seconds. A crashed object restarts on the next heartbeat, and Pi continues from its last checkpoint.

Install the packages:

```bash
npm install agents@0.33.0 @earendil-works/pi-durable@1.5.0 @earendil-works/pi-ai@1.5.0 @earendil-works/pi-schema@1.5.0 @earendil-works/chord@1.5.0
npm install -D wrangler@4.158.0
```

I used `agents` 0.33.0 and Pi Durable 1.5.0; `agents` supports one Pi minor at a time, here `~1.5.0`, so pin them together. The October example fails to build with the current packages because `Type` is no longer exported from `@earendil-works/pi-ai`. This version compiled and ran under wrangler 4.158.0, with DeepSeek through `pi-ai` instead of the Workers AI binding in Cloudflare's examples:

```ts
import { DurableObject } from "cloudflare:workers";
import { createModels } from "@earendil-works/pi-ai/models";
import { deepseekProvider } from "@earendil-works/pi-ai/providers/deepseek";
import { createRegistry, defineExtension, defineTool, Harness } from "@earendil-works/pi-durable";
import { num, obj, str } from "@earendil-works/pi-schema";
import { PiHarness } from "agents/harness/pi";
import { Lifecycle } from "agents/lifecycle";

const TASK = "Create files step1.txt through step5.txt, one at a time, in order. "
  + "Before creating each file, call the sleep tool with seconds=8 as a separate tool call. "
  + "Each file contains its step number. When all five exist, reply ALL DONE.";

export class Assistant extends DurableObject<Env> {
  models = (() => {
    const m = createModels({ authContext: { env: async (k) => (this.env as any)[k], fileExists: async () => false } });
    m.setProvider(deepseekProvider());
    return m;
  })();
  registry = (() => {
    const r = createRegistry();
    const sql = this.ctx.storage.sql;
    sql.exec("CREATE TABLE IF NOT EXISTS files (name TEXT PRIMARY KEY, content TEXT)");
    r.install(defineExtension({ name: "steps", tools: [
      defineTool({ name: "sleep", description: "Wait for the given number of seconds.",
        parameters: obj({ seconds: num() }),
        execute: async ({ seconds }) => { await new Promise((ok) => setTimeout(ok, seconds * 1000));
          return { output: [{ type: "text", text: "slept" }] }; } }),
      defineTool({ name: "write_file", description: "Create or overwrite a file.",
        parameters: obj({ name: str(), content: str() }),
        replay: "safe",
        execute: async ({ name, content }) => { sql.exec("INSERT OR REPLACE INTO files VALUES (?, ?)", name, content);
          return { output: [{ type: "text", text: `wrote ${name}` }] }; } }),
    ] }));
    return r;
  })();
  harness = new PiHarness({
    harness: ({ storage, context, onWake }) =>
      Harness.open(storage, { models: this.models, registry: this.registry, onWake }, context),
    defaults: { model: this.models.getModel("deepseek", "deepseek-flash")!, thinkingLevel: "off" },
  });
  lifecycle = Lifecycle.install(this).use(this.harness);

  submit(task: string) { return this.harness.submit(task, { operationId: "steps-1" }); }
  wait() { return this.harness.wait("steps-1"); }
}

export default {
  async fetch(request: Request, env: Env) {
    const agent = env.Assistant.getByName("demo");
    const path = new URL(request.url).pathname;
    if (path === "/submit") return Response.json(await agent.submit(TASK));
    if (path === "/wait") return Response.json(await agent.wait());
    return new Response("not found", { status: 404 });
  },
};
```

Changes from October:

- Schemas come from `@earendil-works/pi-schema`.
- Tools return `output` instead of `content`.
- The factory passes `onWake` to `Harness.open`; per Cloudflare's docs, without it Pi's timer keeps the object in memory, and billed, while a task sleeps, and the harness logs a warning.

The Wrangler config I used, Cloudflare's minus the `ai` binding. The key goes in `.dev.vars` as `DEEPSEEK_API_KEY`, and `npx wrangler types` generates the `Env` type:

```jsonc
// wrangler.jsonc
{
  "name": "pi-agent",
  "main": "src/index.ts",
  "compatibility_date": "2026-11-06",
  "compatibility_flags": ["nodejs_compat"],
  "durable_objects": { "bindings": [{ "name": "Assistant", "class_name": "Assistant" }] },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["Assistant"] }]
}
```

`replay` is how a Pi Durable tool says whether it may run twice. `write_file` is `"safe"`, because it overwrites the row for that file name; `sleep` keeps the default, which means an interrupted call is not rerun. The `operationId` makes the submission idempotent: sending the same id again returns the same operation.

I ran it with `npx wrangler dev` (wrangler 4.158.0) on my machine, with no Cloudflare account involved. Uninterrupted, it finished in 49.6 seconds (48 in October). For the November kill test, I killed `wrangler` and its `workerd` runtime with `SIGKILL` 22, 28 and 33 seconds in, every time during a `sleep`, and restarted `wrangler dev` on the same local state about 3 seconds later. Restarting `wrangler dev` stands in for Cloudflare bringing the runtime back; what the test shows is that the object then resumes on its own.

I added a log line to the object's constructor. The object was constructed 4.9, 0.9 and 23.9 seconds after I issued the restart command, all within one heartbeat. No request reached the object before it resumed. Before I queried the finished result, the only requests logged after each restart were four requests to `/`, all after the object had resumed; the Worker answers those with 404 without calling the object. All five steps finished each time.

Each time, Pi Durable recorded the interrupted `sleep` as an error and the model called `sleep` again. Pi Durable didn't rerun the call itself, because the tool wasn't marked safe. It wrote this result instead:

```text
<harness>
[error] Tool sleep was interrupted and may have partially run
</harness>
```

The model called `sleep` again and went on. An overwrite is harmless to rerun, though none of my runs needed it. For a deploy or a payment, the default at least stops Pi Durable from rerunning the call silently: the model gets the error instead. It doesn't stop the model from calling the tool again, which is what it did with `sleep` all three times, so a tool that must not run twice still needs its own guard, such as an idempotency key. Compare the AI SDK runs above, where the aborted `sleep` came back as a success and the model moved on.

These were local runs. Cloudflare's docs describe the same recovery on its network, but I didn't deploy. The docs also list limits that matter for long unattended work:

- Pi Durable has no approval step for tool calls yet.
- A single model request that streams for more than 15 minutes can be cut off.
- `abort()` waits for a tool that ignores its abort signal.

## Which one fits unattended work

If your agent works on a git checkout with a real shell, and you have a machine and something to schedule it, use `pi --print`. It runs Pi 1.5.0, the session file came through all three November kills intact, and recovery is one command. You write the supervisor: the script above, plus a timer or cron entry to start it. If you start `pi` some other way, close its stdin and stop it with `SIGTERM`, not `SIGKILL`, so the tool commands still running go with it. Commands put in the background survive either way; a systemd scope or a container catches those.

If Pi is one feature inside a Node product, with a sandbox per user, the AI SDK harness fits. Wire `SIGTERM` to `session.stop()`, keep the resume state somewhere durable, and accept that it now runs Pi 1.5.0 behind an experimental API. A crash still loses everything since the last saved state; in my one-prompt test nothing had been saved, so that was the whole conversation. A command that `stop()` cuts short can also come back as a success, and `continueStream()` takes no new prompt, so check the result yourself after a resume, or write the task so that each step verifies the one before it. The script above already resends the full task when there is no saved state; don't replace that with a bare "continue" prompt.

If runs have to survive crashes with no supervisor of your own, and your tools are API calls rather than shell commands, look at Pi Durable on Cloudflare. In my local runs, once I restarted the runtime, it picked the work back up without any request. On Cloudflare's network, the docs say the heartbeat alarm restarts the object; I didn't deploy to check. It is also the newest of the three, since `PiHarness` arrived on 2 October. Pi Durable is experimental, and `agents` supports one Pi minor at a time, so pin both together. Earendil's announcement also shows Pi Durable on plain Node, with SQLite storage and a Node execution environment for the coding tools; I didn't test that.

### Running the Pi agent harness in Docker or a sandbox

The three put the sandbox boundary in different places. With the AI SDK, only the files and the shell are inside it, and Pi and its API key stay on the host: the adapter runs the sandbox's shell commands without passing on the host's environment. In a Worker there is no shell; each tool can do only what its code does. With the CLI, nothing is isolated until you put the whole `pi` process in a container or sandbox yourself. Pi's [containerization guide](https://pi.dev/docs/latest/containerization) covers plain Docker, Docker Sandboxes and OpenShell, which run the whole Pi process isolated, extensions included, and the Gondolin extension, which moves only the built-in tools into a micro-VM while Pi stays on the host.

## What all three leave to you

None of the three decides which task runs next, makes sure only one worker takes it, reviews the result, decides whether it may merge, or ships a release. I went through those questions for Claude Code in [Run Claude Code unattended](/blog/run-claude-code-unattended/), and they don't depend on the harness. Orbi is the layer I built for them on top of `pi --print`: it claims issues by label, reviews each pull request in a separate Pi session, merges only through a gate, and cuts a release when you open a release issue. [Orbi Cloud](/cloud/) runs it on your repositories.

## Related

Read the [Claude Code comparison](/compare/claude-code/) and [Cloud](/cloud/).
