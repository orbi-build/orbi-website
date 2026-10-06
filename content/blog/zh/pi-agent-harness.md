---
title: Pi agent harness 三种跑法：kill -9 之后谁能接上
date: 2026-10-06
summary: 同一个任务，分别用 pi --print、AI SDK 的 HarnessAgent、Cloudflare 的 PiHarness 跑，跑到一半 kill -9。哪种能自己接上，哪种得你写监督程序，会话记录各自存在哪。
lang: zh
author: Lawrence Liu
image: /img/blog-pi-agent-harness-card.png
mirror: pi-agent-harness
series: pi
---

Pi agent harness 指的是 [Pi](https://pi.dev) 里驱动模型的那个循环。Pi 是 Earendil 团队做的开源编程 agent，它的 harness 做的事是：把提示词发给模型，执行模型要的工具调用，把每一步记进会话文件，如此往复，直到模型不再要工具。2026 年 10 月 1 日，Earendil 发布 Pi 1.0，同时发了一个实验性的第二套 harness：Pi Durable。它给每一步存检查点，跑它的进程死了，任务还能接着跑。

我是 Lawrence Liu，Orbi 的维护者。Orbi 在没人盯着的情况下跑 Pi：给它一张 GitHub issue，顺利的话拿回一个评审过、已合并的 PR。Orbi 怎么启动 Pi，写在[本系列第一篇](/zh/blog/orbi-on-pi-coding-agent/)里；Pi 外面那层 runner 写在 [Pi 专题页](/zh/guides/pi-coding-agent/)里。这篇比较三种「没人坐在键盘前」跑 Pi 的方式，对每一种做同一件事：起一个任务，跑到一半杀掉进程，看还剩下什么。

## Pi agent harness 是什么

harness 指模型外面那层程序：拼请求、执行工具、保存对话、判断一次运行什么时候结束。模型本身只产出文字和工具调用。Pi 有意把这层做得很小：系统提示词很短，默认只给模型四个工具，`read`、`bash`、`edit`、`write`（见 Pi 的 [CLI 文档](https://pi.dev/docs/latest/cli)）。一个会话是一个 JSONL 文件，一行一条记录：消息、工具结果，还有换模型这类配置变化。对话类的记录都记着自己的父记录是哪一条，所以可以从任意一步分叉出去，整个会话是一棵树。扩展是加载进 Pi 进程的 TypeScript 模块，skill 是模型需要时才加载的说明，子 agent、权限确认这类功能都留给它们去做。Pi 故意不做哪些事、Orbi 在那些位置补了什么，见[第一篇](/zh/blog/orbi-on-pi-coding-agent/)。

Pi 的命令行有四种模式：交互式终端、print、JSON，以及走 stdin 和 stdout 的 RPC；另外还有一个 SDK，可以把它嵌进 Node 程序。Pi 的文档说这些接口用的是同一套 agent 和会话机制，所以 RPC 和 SDK 存的会话文件和命令行一样。RPC 我没有测；下文的 AI SDK 适配器底下用的是 Pi 的 SDK，但会话文件存在哪由它自己决定。

### pi harness 还是 Pi Durable

从 10 月 1 日起，「pi harness」可能指同一个团队的两样东西。按 Earendil 的定位，Pi 编程 agent（`@earendil-works/pi-coding-agent`，也就是 `pi` 命令）是给一个人在终端前用的 harness。Earendil 在 [Pi Durable 的发布文](https://earendil.com/posts/pi-durable/)里这样描述 `pi` 命令的进程死掉以后的情形：你看看发生了什么，再让它继续。Pi Durable（`@earendil-works/pi-durable`）是另一个库，用来搭能自己一直跑下去的 agent。在它里面，每次模型调用、每次工具调用都是一个任务，往下走之前先存检查点，新进程打开同一份存储就能接着跑。它和 Pi 共用模型层 `pi-ai`，但它不是 `pi` 命令。它也带着那四个写代码用的工具，但得先给它们接一个执行环境，也就是真正去读文件、跑命令的地方，工具才能用；Pi Durable 自带一个 Node 的执行环境，但它在 Cloudflare Worker 里用不了。

## 三种无人值守的跑法，同一个测试

表里的 Durable Object，是 Cloudflare 上一种带自己存储、按名字寻址的 Worker 实例。

| | `pi --print` | AI SDK `HarnessAgent` | Cloudflare `PiHarness` |
|---|---|---|---|
| 跑的是什么 | Pi 1.0.0，作为子进程 | Pi 编程 agent 0.85.1，跑在你的 Node 进程里，经由 `@ai-sdk/harness-pi` 1.0.141 | Pi Durable 1.0.4，跑在 Durable Object 里，经由 Cloudflare Agents SDK（npm 包 `agents`）0.26.0 |
| 状态 | 稳定版 | 实验性 | Pi Durable 是实验性，`PiHarness` 标 beta |
| 测试用的工具 | Pi 自带的 `bash` 和 `write` | Pi 自带的 `bash` 和 `write`，在沙箱里执行 | 我写的两个工具：`sleep`，以及往 SQLite 存一行的 `write_file` |
| kill 了几次，结果 | `SIGKILL` 两次，用 `--continue` 重新拉起，两次都跑完 | `SIGKILL` 两次：两次的对话都恢复不了（宿主机临时目录里还留着一份，但没有 API 读它）。`SIGTERM` 七次，处理函数里调了 `session.stop()`：每次都接上并跑完。其中三次查了会话文件：两次信号打断了命令，都被记成成功；另一次没有命令被打断 | `SIGKILL` 三次。我重启本地运行时后，对象没收到任何请求就自己起来，三次都跑完 |
| 会话记录在哪 | `--session-dir` 里的 JSONL 文件，一行一条记录 | 一轮进行中放在宿主机的临时目录，只有 stop、detach、suspend 时才拷进沙箱 | Durable Object 的 SQLite 里以 `pi_` 开头的表 |
| 扩展和 key | OS 用户装的、受信任的仓库里带的，都会加载，除非传 `--no-extensions`、`--no-skills`。key 来自这个用户的环境变量或 `auth.json` | 不自动发现扩展，只跑你在代码里传的工厂函数。key 来自 `auth` 参数、你自己的凭据存储或宿主机的环境变量，留在宿主机 | 扩展是 Worker 代码里装进 registry 的对象，key 是 Worker secret |
| 进程死了谁拉起 | 你的监督程序，`pi` 留下的工具进程也得由它清：`SIGKILL` 之后还在跑的命令，以及放到后台的东西 | 你的代码，从之前 `stop()`、`detach()` 或 `suspendTurn()` 存下的状态接着跑 | 按 Cloudflare 文档，是任务没做完时每 30 秒一次的心跳 alarm。本地实测在重启后 1 到 10 秒内恢复，和任务开始后约第 30 秒到期的第一次 alarm 对得上，具体是哪一次 alarm 响的没确认 |
| 卡住了谁发现 | 你的监督程序 | 你的代码：`stream()` 接受 abort signal | 你的代码，通过 `abort()`；没有内置机制，忽略 abort signal 的工具会让会话一直占着 |
| 要自己运维什么 | 一台机器，加一个监督程序 | 一个 Node 服务，加一个沙箱 | 不用自己的服务器；部署需要 Cloudflare 账号，写代码用的工具要你自己提供执行环境 |

每次给模型的指令都一样：按顺序建 `step1.txt` 到 `step5.txt`，每建一个文件之前先调一次 8 秒的 sleep，全部建完回复 `ALL DONE`。实际发出去的提示词如下（Cloudflare 那边把「在 bash 里跑 `sleep 8`」换成了「调用 sleep 工具，seconds=8」，也去掉了「in the current directory」）：

```text
Create files step1.txt through step5.txt in the current directory, one at a time, in order. Before creating each file, run `sleep 8` in bash as a separate tool call. Each file contains its step number. When all five exist, reply ALL DONE.
```

不打断的话，一次大约 50 秒。模型都是 DeepSeek API 上的 `deepseek-flash`。在第 19 到 33 秒之间，我用 `SIGKILL`（也就是 `kill -9`）杀进程。进程接不住这个信号，Linux 内存不够时 OOM killer 发的也是它。AI SDK 那条我还试了进程接得住的 `SIGTERM`，结果 AI SDK 只有在这种情况下才恢复得了。所有测试都在 2026 年 10 月 6 日、在我自己的机器上跑。

表里也看得出来，这不是严格对等的评测：三边跑的代码不一样，Cloudflare 那边因为 Worker 里没有 shell 和文件系统，用的是我自己写的两个工具。我只比一件事：硬杀之后还剩下什么，谁得出手。

## 用 `pi --print` 无头运行 Pi

无头跑 Pi 就是 `pi --print`（简写 `-p`）：执行提示词，打印最终回答，正常退出码是 0，出错是 1（比如 provider 不认这个模型名）。加 `--mode json` 则把每个事件按行输出成 JSON，但这时要自己查事件里有没有错误：同样是被拒的模型名，JSON 模式退出码是 0，输出里留着 `"stopReason":"error"`。我用的命令如下，`--no-context-files` 是不读 `AGENTS.md` 这类文件，另外两个开关是不加载任何自动发现的扩展和 skill，我机器上的和仓库里的都算：

```bash
pi --print --mode json \
   --no-extensions --no-skills --no-context-files \
   --provider deepseek --model deepseek-flash \
   --session-dir ./sess "<任务>" < /dev/null
```

print 模式下 Pi 没法问你信不信任这个项目。如果没有 `--approve` 这类参数，没有能替你回答信任确认的扩展，也没有为这个目录存过决定，`defaultProjectTrust` 默认的 `"ask"` 会让它悄悄跳过仓库自己的 `.pi` 设置、扩展和 skill（见 [security 文档](https://pi.dev/docs/latest/security)）。要在命令行上定下来，就传 `--approve` 或 `--no-approve`。

杀了两次。第一次，模型刚写完 `step3.txt`、正在想下一步，会话文件最后一行是那次写文件的结果。第二次，kill 落在第四次 `sleep 8` 刚开始的时候，最后一行是模型发出的 `bash` 调用，后面没有结果。两次留下的会话文件都是合法的 JSONL，kill 之前的内容一条没少。

不过 `SIGKILL` 并没有把东西全停掉。Pi 跑每条 `bash` 命令时都让它脱离出去，自成一个进程组（Pi `bash.js` 里的 `detached: true`）。命令一返回，Pi 就不再跟踪它的进程组；收到 `SIGTERM` 或 `SIGHUP` 时，它会杀掉还在跑的那些（`print-mode.js`）。`SIGKILL` 连这个机会都不给它。我让 Pi 跑 `sleep 97`，用 `timeout -s KILL 15s` 杀掉它，一秒后 `sleep 97` 还在跑；同样的测试换成发 `SIGTERM` 的普通 `timeout 15s`，什么都没留下。`SIGKILL` 留下的要是卡住的测试，它会继续占着端口、继续写文件，下一次尝试就在旁边开跑了。命令放到后台的东西，比如 `npm run dev &`，不管 Pi 怎么退出都会留下来，因为命令一返回 Pi 就不再跟踪它了。

得有 Pi 之外的程序发现进程没了，再把它拉起来。恢复只要一条命令：

```bash
pi --print --continue --session-dir ./sess \
   --no-extensions --no-skills --no-context-files \
   --provider deepseek --model deepseek-flash \
   "You were interrupted. Continue the original task from where you left off." < /dev/null
```

`--continue` 会重新打开 `--session-dir` 目录里、从同一个工作目录启动的最近一个会话，所以每个任务给一个单独的会话目录。目录是空的话，它就开一个新会话。两次都建齐了五个文件、回了 `ALL DONE`，分别用了 21 秒和 22 秒，基本都是剩下那两次 sleep 的时间。在两步之间被切断的那次，模型直接从第 4 步接着做，什么都没查；在 sleep 刚开始时被切断的那次，它先跑了一句 `ls step*.txt`，看到三个文件，再接着做。

被打断的那次 `bash` 调用，恢复前后都没有在会话文件里补上结果。聊天类模型 API 要求每个工具调用都有结果，所以 Pi 的模型层每次拼请求时自己补一条：`pi-ai` 给这种孤立的调用插一条合成结果，内容是 `No result provided`，标记为错误（`@earendil-works/pi-ai` 的 `transform-messages.js`）。模型看到的是一次失败的调用，文件里却没有这条记录。回放或审计会话文件时，会遇到没有结果的工具调用。

监督程序可以短到这样。每次尝试都限时，到点时 `timeout` 先发 `SIGTERM`，让 Pi 把还在跑的工具命令杀掉，Pi 卡住不退的话 30 秒后再补 `SIGKILL`。`pi` 退出码非 0，就接着同一个会话再跑，连第一次在内最多三次。存成 `pi-task.sh`，用 bash 执行：

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

我按四种情况跑了一遍。设 `PI_TIME_LIMIT=25s` 跑 step 任务，超时两次（exit 124），第三次跑完，始终是同一个会话文件，也没有残留的 `sleep`。限时 15 秒跑 `sleep 97` 那个任务，三次都超时，结束后没有任何进程留下。换成 DeepSeek 不认的模型名，三次都是 exit 1，脚本退出 1。给一句简单的提示词，答完退出 0。重试的提示词里带着原任务，所以第一次尝试就算在 Pi 存下任何东西之前就死了，重试也不会两眼一抹黑。脚本没传 `--approve` 也没传 `--no-approve`，任务要用仓库自己的 `.pi` 设置的话，就加上 `--approve`；仓库里的扩展和 skill 因为 `--no-extensions`、`--no-skills` 照样不加载。退出 0 只说明 Pi 跑完了这一次，任务做没做完要另外查，比如看五个文件在不在。

如果 `pi` 最后还是死于 `SIGKILL`（OOM killer，或者那 30 秒后的补刀），还在跑的工具命令会留下来；命令放到后台的东西，不管 Pi 怎么退出都会留下。在 Linux 上可以用 `systemd-run --user --scope` 启动每次尝试，结束后停掉这个 scope，把它们也收掉，这需要 systemd 用户会话；也可以把每次尝试放进单独的容器。

Orbi 用 `pi --print` 跑过有记录的 169 次交付（按 DeepSeek 闲时公开价，每次 token 花费中位数 0.082 美元，见[第一篇](/zh/blog/orbi-on-pi-coding-agent/)），它的恢复方式不一样：它不用 `--continue`，而是起一个新会话，附一段关于没做完的工作的简短说明。会话卡住时，它的看门狗也会把这个会话启动的工具进程一起杀掉，详见[专题页](/zh/guides/pi-coding-agent/)。

### stdin 不关，无头 Pi 会一直等

Pi 的 [CLI 文档](https://pi.dev/docs/latest/cli)写了，管道传进来的 stdin 会拼到第一条提示词前面：

```bash
echo "the secret word is BANANA" | pi --print "reply with only the secret word"
# BANANA
```

文档没写的是，Pi 会一直读 stdin，直到它关闭（Pi `main.js` 里的 `readPipedStdin` 等的是流的 `end` 事件）。如果 stdin 是一根没人关的管道，Pi 就一直等，不输出，也不报错：

```bash
sleep 40 | timeout 20 pi --print "reply with only PONG"            # pi 在 20 秒时被杀（exit 124），什么都没打印
sleep 40 | timeout 20 pi --print "reply with only PONG" < /dev/null # 1 秒左右打印出 PONG
```

两行都要等 `sleep 40` 结束才返回，因为 shell 要等整条管道跑完。这两行要在 bash 里跑。zsh 的 MULTIOS 选项会把管道和文件同时喂给命令，第二行在 zsh 里一样会卡住。只有同一条命令既接管道又写 `< /dev/null` 时才这样；前面没有管道的命令加 `< /dev/null`，在哪个 shell 里都管用。

在终端里不接管道、直接敲 `pi --print "..."` 没问题，那时 stdin 是 TTY，Pi 不读它。systemd 和 launchd 给服务的 stdin 是 `/dev/null`，定时器拉起的进程只要自己不往 `pi` 塞管道，就碰不到这个坑。但如果某个程序启动 `pi`、让它继承了一根开着的管道，就会中招。你自己启动 `pi` 的话，Python 传 `stdin=subprocess.DEVNULL`，Node 用 `stdio: ['ignore', ...]`，shell 里加 `< /dev/null`。

Orbi 自己的 runner 代码里有这个漏洞，只是目前的部署方式碰不到。它用 `subprocess.Popen` 启动 Pi，没设 `stdin`。我把这段调用原样抄进脚本，在 stdin 接一根开着的管道跑，20 秒没有任何输出；改成 `stdin=subprocess.DEVNULL` 后不到一秒就有了回答。Orbi 的 runner 跑在 systemd、launchd 下，或者在不加 `-i` 的 Docker 里，这几种情况 stdin 都是 `/dev/null`，不会触发这个等待。

## 通过 Vercel AI SDK 把 Pi 嵌进 Node 程序

[`@ai-sdk/harness-pi`](https://ai-sdk.dev/providers/ai-sdk-harnesses/pi) 让 Pi 跑在宿主 Node 进程里，读写文件、执行命令都交给沙箱。按 Vercel 的说法，Pi 把沙箱当成远程的文件系统和 shell。沙箱可以是 Vercel Sandbox，也可以是 `just-bash`，一个跑在进程内、带虚拟文件系统的 bash。我用的是挂在真实目录上的 `just-bash`，这样进程被杀后文件还在。动手前先看一眼版本：1.0.141 版的适配器依赖 `@earendil-works/pi-coding-agent` `^0.85.1`，npm 装下来是 0.85.1，所以这条路现在跑的还不是 Pi 1.0。用 Pi 自带的 SDK 也能把 Pi 1.0 直接嵌进 Node；我测这个适配器，是因为它多了一层沙箱隔离，Pi 自带的 SDK 被杀之后怎样，我没测。

完整脚本如下，去掉了日志。一轮结束、流里没报错时退出 0（任务做没做完还得另查），流里报了错退出 1，被 `SIGTERM` 停下、`stop()` 返回了恢复状态时退出 143，监督程序能分清这三种情况。`state.json` 和 session id 都是写死的，所以每个任务用单独的目录，和 `pi-task.sh` 一样。需要 Node 22.19 或更高（内置的 Pi 有这个要求），存成 `run.mjs`，装上我用的版本，设好 `DEEPSEEK_API_KEY` 再跑：

```bash
npm i @ai-sdk/harness@1.0.139 @ai-sdk/harness-pi@1.0.141 @ai-sdk/sandbox-just-bash@1.0.139 just-bash@2.14.5
DEEPSEEK_API_KEY=... node run.mjs   # run it again after a SIGTERM to resume
```

脚本：

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

const resumeFrom = loadSavedState();  // 第一次运行时为 undefined
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

不打断的话大约 50 秒跑完，文件落在 `./box/work/pi-demo/` 下。我在大约 33 秒时 `SIGKILL` 了两次，两次都是已经写好的文件还在沙箱里，对话却回不去了。一轮进行中（这次整个任务就是一轮，因为只有一条提示词），适配器把 Pi 的会话写在宿主机的临时目录 `$TMPDIR/ai-sdk-harness/pi/<session id>/`，只有在 `session.stop()`、`detach()` 或 `suspendTurn()` 里才拷进沙箱。这三个都会返回一份恢复用的状态：`stop()` 和 `detach()` 的传给 `createSession({ sessionId, resumeFrom })`，`suspendTurn()` 的传给 `createSession({ sessionId, continueFrom })`。被杀的进程一个都来不及调。

临时目录里那份事后还在磁盘上，但没有哪个 API 会读它，我也没试着手工拼回去。两次我都用同一个 session id 起了个新进程，提示词和上文手动 `--continue` 恢复命令里那句一样，是 "You were interrupted. Continue the original task from where you left off."。这句故意不带原任务，为的是看对话历史还在不在（照上面的 JS 脚本跑，发出去的会是完整任务）。没有历史，模型两次都是看了看现有文件，只补了下一个就停：第一次被杀时已有 3 个文件，补了 `step4.txt`；第二次也是在约 33 秒时杀的，却只有 2 个（那次各步的时间我没记，说不清为什么慢了一步），补了 `step3.txt`。两次都没做完五个。第二次它还说明，找不到原始指令的任何记录，是根据文件名推测着往下做的。

换成 `SIGTERM`，我试的七次都接上并跑完，因为处理函数跑了；其中五次留了日志，另外两次只记了结果。`session.stop()` 中止当前这一轮，把会话拷进沙箱，返回一个带着未完成那一轮的恢复状态。新进程把它当 `resumeFrom` 传进去，`hasUnfinishedTurn()` 为真，调 `continueStream()`。适配器源码里有一点要注意：这次拷贝是尽力而为的。拷贝失败时，`stop()` 会吞掉错误、照样返回恢复状态（`pi-session.ts`）。下一个进程就会从沙箱里之前某次存下的旧副本（在沙箱主目录的 `.ai-sdk/harness-pi/` 下）接着跑，一份都没有的话就从空对话开始。所以退出 143 也好、`state.json` 写出来了也好，都证明不了最新的进度已经存下；要打开那个目录下的会话 JSONL，看最后几条记录是不是停在你预期的地方。

其中三次我查了会话文件。有两次，第 4 次 `sleep 8` 只跑了约 2.1 秒和 0.6 秒就被 `stop()` 打断，会话文件却都记成 `(exit 0)`。本来应该还剩两次 sleep（重跑第 4 次，再加第 5 次），模型却以为第 4 次已经做完，只跑了第 5 次，两次恢复各用了 12 秒。另一次信号来的时候第 3 次 sleep 已经跑完、`step3.txt` 还没写，没有东西被打断，还剩两次 sleep，恢复用了 22 秒。`just-bash` 的 `sleep` 被中止时会报成功，别的沙箱我没测。

在 Linux 上，`docker stop` 和 `systemctl stop` 都是先发 `SIGTERM`，默认分别等 10 秒和 90 秒才发 `SIGKILL`，所以只要 `stop()` 在这段时间里做完，这种处理函数就管得住计划内的停机。崩溃和 OOM killer 它管不了。

适配器有个 `reattachInProcess` 选项（默认开），听名字像是能救场，其实不能：它只是让暂停的一轮在同一个进程里复用活着的 Pi 会话。进程没了，也就没有东西可以复用。

## Cloudflare 上的 Pi Durable：`PiHarness`

[`PiHarness`](https://developers.cloudflare.com/agents/harnesses/pi/) 是 Agents SDK 在 [10 月 2 日](https://developers.cloudflare.com/changelog/post/2026-10-02-pi-harness/)加进来的。在这条路上，Pi Durable 把对话记录、待处理的提示词队列和任务都存在 Durable Object 的 SQLite 里。按 Cloudflare 文档的说法，只要还有没做完的任务，`PiHarness` 就排着一个每 30 秒触发一次的 alarm（Durable Object 的定时器）；对象在跑到一半时死掉，下一次 alarm 会把它拉起来，Pi Durable 从上一个检查点接着跑。

接线代码如下。Cloudflare 的示例用的是 Workers AI 绑定，我换成了通过 `pi-ai` 接 DeepSeek：

```ts
import { DurableObject } from "cloudflare:workers";
import { Type } from "@earendil-works/pi-ai";
import { createModels } from "@earendil-works/pi-ai/models";
import { deepseekProvider } from "@earendil-works/pi-ai/providers/deepseek";
import { createRegistry, defineExtension, defineTool, Harness } from "@earendil-works/pi-durable";
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
        parameters: Type.Object({ seconds: Type.Number() }),
        execute: async ({ seconds }) => { await new Promise((ok) => setTimeout(ok, seconds * 1000));
          return { content: [{ type: "text", text: "slept" }] }; } }),
      defineTool({ name: "write_file", description: "Create or overwrite a file.",
        parameters: Type.Object({ name: Type.String(), content: Type.String() }),
        replay: "safe",
        execute: async ({ name, content }) => { sql.exec("INSERT OR REPLACE INTO files VALUES (?, ?)", name, content);
          return { content: [{ type: "text", text: `wrote ${name}` }] }; } }),
    ] }));
    return r;
  })();
  harness = new PiHarness({
    harness: ({ storage, context }) => Harness.open(storage, { models: this.models, registry: this.registry }, context),
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

我用的 Wrangler 配置如下，就是 Cloudflare 指南里那份去掉 `ai` 绑定。key 写在 `.dev.vars` 里，变量名 `DEEPSEEK_API_KEY`；`Env` 类型用 `wrangler types` 生成：

```jsonc
// wrangler.jsonc
{
  "name": "pi-agent",
  "main": "src/index.ts",
  "compatibility_date": "2026-10-06",
  "compatibility_flags": ["nodejs_compat"],
  "durable_objects": { "bindings": [{ "name": "Assistant", "class_name": "Assistant" }] },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["Assistant"] }]
}
```

`replay` 是 Pi Durable 的工具用来声明自己能不能跑两次的字段。`write_file` 标了 `"safe"`，因为它按文件名覆盖那一行；`sleep` 保持默认，也就是被打断后不重跑。`operationId` 让提交变成幂等的：同一个 id 再提交一次，拿回的还是原来那次操作。

我用 `wrangler dev`（wrangler 4.147.0）在自己机器上跑，全程不涉及 Cloudflare 账号。不打断的话 48 秒跑完。kill 测试的做法是：提交任务，第 19 到 30 秒用 `SIGKILL` 杀掉 `wrangler` 和它的 `workerd` 运行时，两秒后在同一份本地状态上重新起 `wrangler dev`，在它恢复之前不发任何请求。重启 `wrangler dev` 相当于 Cloudflare 把运行时重新拉起来，这个测试说明的是：运行时回来之后，对象会自己接着跑。日志也显示，恢复之前没有请求碰过它：第一次，工具调用恢复之前没有任何请求记录；后两次我在对象的构造函数里加了一行日志，它出现时前面同样没有请求。三次都在我重启 `wrangler dev` 之后 1 到 10 秒内恢复，五步全部做完。这和文档里 30 秒的 alarm 对得上：任务开始时设下的 alarm 大约在第 30 秒到期，要么刚好落在重启之后，要么运行时回来时已经过期、马上就响。具体是哪一次 alarm 响的，我没去确认。

三次里有两次是在 `sleep` 进行中被杀的，重启后模型都重新调了一次 `sleep`。我存下来的第一次的对话记录说明了原因：这个工具没标可安全重跑，Pi Durable 没有重跑被打断的那次调用，而是给它写了一条结果，标记为错误：

```text
<harness>
[error] Tool sleep was interrupted and may have partially run
</harness>
```

模型回了一句 "The sleep was interrupted. Let me retry the sleep before creating step4"（sleep 被打断了，建 step4 之前我再 sleep 一次），重新调用，然后继续。第三次 kill 正好落在第二次 sleep 结束的时候，它的结果已经存下来了，重启后模型直接去写 `step2.txt`。`write_file` 这种覆盖写，被打断后重跑也无害，只是这三次都没碰上。部署、扣款这类工具保持默认，至少 Pi Durable 不会悄悄重跑，模型拿到的是一条错误。但这挡不住模型自己再调一次，上面两次它对 `sleep` 就是这么做的，所以绝不能跑两次的工具还得自己带防护，比如幂等键。对比上面 AI SDK 那两次：被中止的 `sleep` 报的是成功，模型就直接往下走了。

这些都是本地跑的。Cloudflare 文档说线上的恢复机制一样，但我没部署。文档还列了几条限制，对长时间无人值守的任务有影响：

- Pi Durable 目前没有工具调用的审批环节。
- 单次模型请求流式输出超过 15 分钟，可能被截断。
- `abort()` 会一直等，直到忽略 abort signal 的工具自己返回。

## 无人值守选哪种

如果 agent 要在 git 检出目录里用真正的 shell 干活，你手上又有机器和调度它的东西，用 `pi --print`。它跑的是 Pi 1.0，会话文件两次硬杀都完好，恢复只要一条命令。监督程序得你自己写：上面那个脚本，再加一个定时器或 cron 来启动它。不用这个脚本、自己写启动代码的话，记得关 stdin，停它时用 `SIGTERM` 而不是 `SIGKILL`，这样还在跑的工具命令会跟着走。放到后台的命令怎么停都会留下，要靠 systemd scope 或容器来收。

如果 Pi 只是一个 Node 产品里的一项功能，每个用户一个沙箱，AI SDK harness 合适。把 `SIGTERM` 接到 `session.stop()`，把恢复状态存到持久的地方，同时接受它目前跑的是 Pi 0.85、API 还是实验性的。进程崩溃时，上一次存档之后的东西都会丢；我那个一条提示词的测试里什么都没存过，丢的就是整段对话。另外，被 `stop()` 打断的命令可能记成成功，而 `continueStream()` 又带不了新的提示词，所以恢复之后要自己核对结果，或者把任务写成每一步先检查上一步。上面的脚本在没有存档时本来就会重发完整任务，别把它换成「继续」这种不带原任务的提示词。

如果任务必须在没有自己的监督程序的情况下扛过崩溃，而你的工具是 API 调用、不是 shell 命令，可以看 Cloudflare 上的 Pi Durable。我本地测试时，重启运行时之后，它不需要任何请求就接着干活。线上按 Cloudflare 文档，是心跳 alarm 把对象重新拉起来，但我没部署验证。它也是三者里最新的，`PiHarness` 10 月 2 日才加进来。Pi Durable 是实验性，`PiHarness` 标 beta。Earendil 的发布文里还演示了在普通 Node 上跑 Pi Durable：SQLite 存储，配一个 Node 执行环境给写代码的工具用。这个组合我没测。

### 在 Docker 或沙箱里跑 Pi agent harness

三种跑法的沙箱边界划在不同地方。AI SDK 只把文件和 shell 放进沙箱，Pi 和它的 API key 留在宿主机：适配器在沙箱里执行命令时，不会把宿主机的环境变量传进去。Worker 里没有 shell，每个工具能做的就是它代码里写的那些事。CLI 默认什么都不隔离，除非你自己把整个 `pi` 进程放进容器或沙箱。Pi 的[容器化文档](https://pi.dev/docs/latest/containerization)讲了纯 Docker、Docker Sandboxes 和 OpenShell，这三种把整个 Pi 进程连同扩展一起隔离；还有 Gondolin 扩展，它只把内置工具放进微虚拟机，Pi 本身留在宿主机。

## 三种都不替你管的事

下一个跑哪个任务、怎么保证只有一个 worker 认领它、谁来评审、能不能合并、什么时候发版，这三种跑法都不管。我在 [Claude Code 无人值守运行](/zh/blog/run-claude-code-unattended/)里拿 Claude Code 把这几个问题过了一遍，它们跟用哪个 harness 无关。Orbi 就是我在 `pi --print` 之上为这些问题搭的那一层：按标签认领 issue，每个 PR 用单独的 Pi 会话评审，只通过合并闸门合并，你开一张发版 issue 它就发版。[Orbi Cloud](/zh/cloud/) 把它跑在你自己的仓库上。

## 相关

延伸阅读：[Orbi 与 Claude Code 的对比](/zh/compare/claude-code/)、[Orbi Cloud](/zh/cloud/)。
