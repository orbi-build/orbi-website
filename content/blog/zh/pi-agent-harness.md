---
title: Pi agent harness 三种跑法：kill -9 后如何恢复
date: 2026-10-06
summary: 我在 11 月 6 日重测 Pi CLI、AI SDK 和 Cloudflare PiHarness，记录进程被杀后的会话恢复结果，并给出安装命令、监督脚本和可运行示例。
lang: zh
author: Larry 🍀 Orbi
image: /img/blog-pi-agent-harness-card.png
mirror: pi-agent-harness
series: pi
---

[Pi](https://pi.dev) 是 Earendil 团队做的开源编程 agent，Pi agent harness（也叫 Pi harness）就是其中驱动模型的循环：发送提示词、执行模型要求的工具调用、记录对话，直到模型不再调用工具。这篇写给要无人值守运行 coding agent 的开发者。我在 2026 年 11 月 6 日用 Pi 1.5.0 和 Pi Durable 1.5.0 重测了三种跑法，下文给出进程被 kill 后剩下什么、由谁重启，以及安装命令、`pi --print` 监督脚本和可运行的 AI SDK、Cloudflare 示例。

2026 年 10 月 1 日，Earendil 发布 Pi 1.0，同时推出了实验性的第二套 harness：Pi Durable。它在每一步保存检查点，让任务能在原进程退出后继续。

我是 Larry 🍀 Orbi，Orbi 的创始人。Orbi 在没人盯着的情况下跑 Pi：给它一张 GitHub issue，顺利的话拿回一个评审过、已合并的 PR。Orbi 怎么启动 Pi，写在[本系列第一篇](/zh/blog/orbi-on-pi-coding-agent/)里；Pi 外面那层 runner 写在 [Pi 专题页](/zh/guides/pi-coding-agent/)里。我最初在 2026 年 10 月 6 日用 Pi 1.0.0 做了这些测试，11 月 6 日又用 Pi 1.5.0 和当时的适配器、Durable Object 相关包全部重跑。本文报告的是 11 月的结果。

## Pi agent harness 是什么

harness 是模型外面那层程序，负责拼请求、执行工具、保存对话、判断一次运行什么时候结束；模型本身只生成文字和工具调用。Pi 有意把这层做得很小：系统提示词很短，默认只给模型 `read`、`bash`、`edit`、`write` 四个工具（见 Pi 的 [CLI 文档](https://pi.dev/docs/latest/cli)）。默认情况下，编程 agent 把会话存成 JSONL 文件，一行一条记录，内容包括消息、工具结果，以及切换模型之类的变化。对话记录指向各自的父记录，因此可以从之前的任意位置分叉。扩展是加载进 Pi 进程的 TypeScript 模块，skill 是模型需要时才加载的说明，子 agent、权限确认等功能留给它们实现。Pi 没做哪些事、Orbi 在那些位置补了什么，见[第一篇的对应章节](/zh/blog/orbi-on-pi-coding-agent/#pi-留给用户的那一层-orbi-放在哪)。

Pi 命令行有四种模式：交互式终端、print、JSON，以及通过 stdin、stdout 通信的 RPC；另外还有 SDK，可以把 Pi 嵌进 Node 程序。Pi 的 [How Pi works 文档](https://pi.dev/docs/latest/how-pi-works)说，这些接口使用同一套 agent 和会话机制。RPC 我没测。下文的 AI SDK 适配器基于 Pi 的 SDK，但把会话放在内存里，通过生命周期方法返回的状态交给调用方。

### Pi 编程 harness 和 Pi Durable 有什么区别

从 10 月 1 日起，「pi harness」可能指同一个团队的两样东西。一种是 Pi 编程 harness，也就是 Pi 编程 agent（`@earendil-works/pi-coding-agent`，`pi` 命令）。按 Earendil 的定位，它是给一个人在终端前用的。Earendil 在 [Pi Durable 发布文](https://earendil.com/posts/pi-durable/)里这样描述 `pi` 进程死掉后的处理：你看看发生了什么，再让它继续。Pi Durable（`@earendil-works/pi-durable`）是另一个库，用来搭能自行持续运行的 agent。

Pi Durable 把每次模型调用、工具调用都作为一个任务，存好检查点再往下走，新进程打开同一份存储就能继续。它与 Pi 共用模型层 `pi-ai`，和 `pi` 命令是两套程序。它也提供那四个编程工具，但要先接上执行环境，也就是真正读文件、跑命令的地方。Pi Durable 自带 Node 执行环境。Cloudflare Worker 没有 shell，文件系统也是虚拟的，`/tmp` 只在单次请求内有效，因此在 Cloudflare 上得自己写工具。

## Pi harness 怎么安装和运行

Pi 需要 Node.js 22.19 或更新版本。官方安装脚本是 `curl -fsSL https://pi.dev/install.sh | sh`，也可以用下面的 npm 命令。交互式使用时，在项目目录运行 `pi`，再在 Pi 里用 `/login` 接入订阅或 API key。无人值守时，把 provider 的 key 放进环境变量，用 `pi --print` 运行。设好 `DEEPSEEK_API_KEY` 后，我跑了：

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
pi --version          # printed 1.5.0 on 6 November 2026
pi --print --provider deepseek --model deepseek-flash "Reply with only the word READY." < /dev/null
```

print 命令返回了 `READY`。我测试了 npm 安装和这条 `--print` 命令，没有测试 curl 安装脚本和交互式 `/login`。下面看运行到一半杀掉进程会怎样。

## 三种无人值守跑法，kill -9 后各剩下什么

表里的 Durable Object 是 Cloudflare 上一种带独立存储、按名字寻址的 Worker 实例。

| | `pi --print` | AI SDK `HarnessAgent` | Cloudflare `PiHarness` |
|---|---|---|---|
| 跑的是什么 | Pi 1.5.0（10 月为 1.0.0），作为子进程 | Pi 编程 agent 1.5.0，通过 `@ai-sdk/harness-pi` 1.0.177 跑在你的 Node 进程里（10 月为 1.0.141，依赖 Pi `^0.85.1`） | Pi Durable 1.5.0，通过 Cloudflare Agents SDK（npm 包 `agents`）0.33.0 跑在 Durable Object 里；`agents` 每次只支持 Pi 的一个次版本，这里是 `~1.5.0` |
| 状态 | 稳定版 | 实验性（AI SDK 文档注明 harness 包属于实验性） | Pi Durable 属于实验性 |
| 测试用的工具 | Pi 自带的 `bash` 和 `write` | Pi 自带的 `bash` 和 `write`，在沙箱里执行 | 我写的两个工具：`sleep`，以及往 SQLite 存一行的 `write_file` |
| kill 次数与结果 | `SIGKILL` 三次，用 `--continue` 重新启动，每次都完成了任务 | `SIGKILL` 两次，对话都恢复不了，磁盘上也没留下会话记录（临时目录为空）。`SIGTERM` 六次，处理函数调用 `session.stop()`，每次都恢复并完成了任务。其中三次另存了停止时的状态快照；这三份中，一次 `sleep` 被 `stop()` 提前打断，却记成成功（`(exit 0)`） | `SIGKILL` 三次，我重启本地运行时后，对象没收到任何请求就自行恢复，三次都完成了任务 |
| 会话记录在哪 | `--session-dir` 下的 JSONL 文件，一行一条记录 | 一轮运行期间放在内存里。`stop()`、`detach()` 和 `suspendTurn()` 返回的状态包含会话记录；使用新增的 `sessionStorage` 选项时，状态只留最后一条记录的 id，记录写入你自己的只追加日志。调用这三个方法之一前，不会写出任何会话记录 | Durable Object 的 SQLite 数据库中，以 `pi_` 开头的表 |
| 扩展和 key | OS 用户和受信任仓库提供的扩展、skill，除非传 `--no-extensions`、`--no-skills`。key 来自该用户的环境变量或 `auth.json` | 不自动发现扩展，只用代码里传入的工厂函数。key 来自 `auth` 记录、你自己的凭据存储或宿主机环境变量，留在宿主机 | 扩展是 Worker 安装进 registry 的对象，key 是 Worker secret |
| 进程死了谁重启 | 你的监督程序，还得清理 `pi` 留下的工具进程：`SIGKILL` 后仍在运行的命令，以及命令放到后台的进程 | 你的代码，用之前 `stop()`、`detach()` 或 `suspendTurn()` 保存的状态恢复；如果这三个方法都没调用就被 `SIGKILL`，就没有状态可恢复 | 按 Cloudflare 文档，只要 Pi 还有工作，心跳 alarm 每 30 秒触发一次（`agents/harness/pi` 中的 `HEARTBEAT_MS = 3e4`）。本地实测，对象在发出重启命令后 0.9、4.9、23.9 秒构造，都在一个心跳周期内 |
| 卡住了谁发现 | 你的监督程序 | 你的代码：`stream()` 接受 abort signal | 你的代码，通过 `abort()`；没有内置机制，忽略 abort signal 的工具会一直占着会话 |
| 要自己运维什么 | 一台机器和一个监督程序 | 一个 Node 服务和一个沙箱 | 不需要自己的服务器；部署需要 Cloudflare 账号，编程工具需要你提供执行环境 |

每次给模型的任务都一样：按顺序创建 `step1.txt` 到 `step5.txt`，每建一个文件前先单独调用一次 8 秒的 sleep，全部完成后回复 `ALL DONE`。实际发送的提示词如下；Cloudflare 版本把在 bash 中运行 `sleep 8` 换成了「call the sleep tool with seconds=8」，并去掉「in the current directory」：

```text
Create files step1.txt through step5.txt in the current directory, one at a time, in order. Before creating each file, run `sleep 8` in bash as a separate tool call. Each file contains its step number. When all five exist, reply ALL DONE.
```

不打断时，一次约 50 秒。每次用的都是 DeepSeek API 上的 `deepseek-flash`。11 月的硬杀测试中，我在运行 22 到 33 秒时发送 `SIGKILL`（`kill -9`）。进程无法捕获这个信号，Linux 的 OOM killer 在内存不足时发的也是它。AI SDK 那条路径还测了能被进程捕获的 `SIGTERM`，它只有在这种情况下才恢复成功。下文都是 2026 年 11 月 6 日在我自己机器上的重测结果。

这张表不适合拿来比较性能：三边跑的代码不同，Cloudflare 测试用的是我写的两个工具，因为 Worker 没有 shell，也不能跨请求保留文件。我只比较硬杀之后留下什么，以及谁得介入。

## 用 `pi --print` 无头运行 Pi，怎么恢复会话

无头运行 Pi 用 `pi --print`（简写 `-p`）：执行提示词，打印最终回答，然后退出；正常退出码是 0，provider 不接受模型名这类错误会返回 1。加上 `--mode json` 后，每个事件会按行输出为 JSON，但要自己检查事件里的错误：同样用被拒绝的模型名，JSON 模式退出码是 0，输出里却有 `"stopReason":"error"`。我用了下面的命令，`--no-context-files` 跳过 `AGENTS.md` 等上下文文件，另外两个开关跳过所有自动发现的扩展和 skill，包括我自己装的和仓库里的：

```bash
pi --print --mode json \
   --no-extensions --no-skills --no-context-files \
   --provider deepseek --model deepseek-flash \
   --session-dir ./sess "<task>" < /dev/null
```

print 模式无法询问是否信任项目。如果没传 `--approve`，没有替你回答信任提示的扩展，也没为这个目录保存过决定，默认的 `defaultProjectTrust: "ask"` 会让 Pi 静默跳过仓库自己的 `.pi` 设置、扩展和 skill（见 [security 文档](https://pi.dev/docs/latest/security)）。可以在命令行传 `--approve` 或 `--no-approve` 明确决定。

11 月用 Pi 1.5.0 测了三次，每次都在 `sleep 8` 期间杀进程。三份会话文件的最后一行都是模型发出的 `bash` 调用，后面没有结果；文件仍是合法 JSONL。每次 kill 后不久检查，被打断的 `sleep 8` 都还在运行。

Pi 会让每条 `bash` 命令脱离出去，自成一个进程组（Pi `bash.js` 中的 `detached: true`）。命令返回后，Pi 就不再跟踪它的进程组；收到 `SIGTERM` 或 `SIGHUP` 时，会杀掉仍在运行的那些（`print-mode.js`）。`SIGKILL` 不给它清理的机会。我让 Pi 运行 `sleep 97`，用 `timeout -s KILL 15s` 杀掉 Pi，一秒后 `sleep 97` 仍在运行。同样的测试换成普通 `timeout 15s`，发送 `SIGTERM`，就没留下进程。如果硬杀后留下的是卡住的测试进程，它会继续占着端口、写着文件，而下一次尝试已经启动。命令放到后台的进程，例如 `npm run dev &`，不管 Pi 怎样退出都会留下，因为命令返回时 Pi 已经停止跟踪它。

Pi 之外得有程序发现进程退出，再把它启动。恢复只需要一条命令：

```bash
pi --print --continue --session-dir ./sess \
   --no-extensions --no-skills --no-context-files \
   --provider deepseek --model deepseek-flash \
   "You were interrupted. Continue the original task from where you left off." < /dev/null
```

`--continue` 会打开 `--session-dir` 下、从同一工作目录启动的最近一个会话，所以每个任务要用单独的会话目录。目录为空时，它会新建会话。11 月三次恢复都建齐了五个文件，回复 `ALL DONE`，三次恢复后的运行分别用了约 33、32、22 秒。保留了会话文件的两次里，模型都先用 `ls` 和 `cat` 检查 step 文件，再继续。

这两份会话文件里，被打断的 `bash` 调用在恢复前后都没有补上结果。聊天 API 要求每次工具调用都有结果，Pi 的模型层因此会在构造请求时补一条：`pi-ai` 为孤立调用插入 `No result provided`，并标为错误（`@earendil-works/pi-ai` 1.5.0 中的 `transform-messages.js`）。模型能看到这条失败结果，会话文件里却没有。回放、审计会话文件时，要考虑这种缺结果的调用。

下面是一个简短的监督脚本。每次尝试都有时限，到点后 `timeout` 先发 `SIGTERM`，让 Pi 清理仍在运行的工具命令；只有 Pi 卡住不退，才在 30 秒后发 `SIGKILL`。`pi` 非零退出就恢复同一个会话，连首次在内最多尝试三次。脚本用的是 GNU `timeout`，面向 Linux；macOS 没有自带这个命令，Homebrew 的 coreutils 装的是 `gtimeout`，我没有在 macOS 测试。保存为 `pi-task.sh`，用 bash 执行：

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

我测了四种情况。用 `PI_TIME_LIMIT=25s` 跑 step 任务，超时两次（退出码 124），第三次完成，始终在同一个会话文件里，也没有留下 `sleep`。用 15 秒时限跑 `sleep 97` 任务，三次都超时，结束后没有残留进程。换成 DeepSeek 不接受的模型名，三次都以 1 退出，脚本最终也退出 1。给一个简短提示词，答完退出 0。

重试提示词重复了原任务，因此第一次尝试即使在 Pi 保存任何记录前就退出，重试时也还有任务可做。脚本没有传 `--approve` 或 `--no-approve`；任务需要仓库自己的 `.pi` 设置时，加上 `--approve`。扩展和 skill 仍由 `--no-extensions`、`--no-skills` 禁用。退出 0 只代表 Pi 结束了这次运行，任务是否完成要另外检查，比如确认五个文件是否齐全。

如果 `pi` 最终仍死于 `SIGKILL`，例如 OOM killer 或 30 秒后的强制终止，正在运行的工具命令会留下；命令放到后台的进程则无论 Pi 怎样退出都会留下。在 Linux 上，可以用 `systemd-run --user --scope` 启动每次尝试，结束后停止对应 scope，把这些进程一起清理，这需要 systemd 用户会话。也可以把每次尝试放进独立容器。

Orbi 用 `pi --print` 跑过有记录的 169 次交付，按 DeepSeek 闲时公开价计算，每次 token 费用中位数为 0.082 美元（见[第一篇](/zh/blog/orbi-on-pi-coding-agent/)）。它恢复被杀的交付时不用 `--continue`，会启动新会话，附一段未完成工作的简短说明。会话卡住时，Orbi 的看门狗也会杀掉该会话启动的工具进程，见[专题页的对应章节](/zh/guides/pi-coding-agent/#会话没声音了)。

### stdin 不关闭，`pi --print` 为什么一直等

Pi 的 [CLI 文档](https://pi.dev/docs/latest/cli)说明，管道送来的 stdin 会加在第一条提示词前：

```bash
echo "the secret word is BANANA" | pi --print "reply with only the secret word"
# BANANA
```

文档没提到的是，Pi 要一直读到 stdin 关闭才往下走（Pi `main.js` 中的 `readPipedStdin` 等待流的 `end` 事件）。如果继承的是一根没人关闭的管道，它就会一直等，没有输出，也不报错：

```bash
sleep 40 | timeout 20 pi --print "reply with only PONG"            # pi killed at 20 s (exit 124), nothing printed
sleep 40 | timeout 20 pi --print "reply with only PONG" < /dev/null # PONG printed
```

两行都要等 `sleep 40` 结束才返回，因为 shell 会等整条管道结束。这两行要用 bash 运行；zsh 的 MULTIOS 选项会把管道和文件的内容都传给同时接了两者的命令，所以第二行在 zsh 里也会卡住。前面没有管道时，给命令加 `< /dev/null` 在这两种 shell 中都有效。

在终端不接管道，直接运行 `pi --print "..."` 没问题，因为 stdin 是 TTY 时 Pi 会跳过读取。systemd 默认给服务的 stdin 是 `/dev/null`（`StandardInput=null`），所以定时器启动的进程只要不自行给 `pi` 传管道，就不会遇到这个问题。自己启动 `pi`、让它继承一根未关闭的管道则会。启动代码里应指定 Python 的 `stdin=subprocess.DEVNULL`、Node 的 `stdio: ['ignore', ...]`，或 shell 的 `< /dev/null`。

我最初写这篇文章时，Orbi 的 runner 也有这个问题：它用 `subprocess.Popen` 启动 Pi，没有设置 `stdin`。这个问题当天就修了（[orbi-build/orbi#1562](https://github.com/orbi-build/orbi/issues/1562)），runner 现在会传 `stdin=subprocess.DEVNULL`。

## 用 AI SDK 把 Pi 嵌进 Node 程序

[`@ai-sdk/harness-pi`](https://ai-sdk.dev/providers/ai-sdk-harnesses/pi) 把 Pi 放在宿主 Node 进程里，文件和 shell 操作交给沙箱；Vercel 的说法是，Pi 把沙箱当作远程文件系统和 shell。沙箱可以用 Vercel Sandbox，也可以用 `just-bash`，后者是带虚拟文件系统、在进程内运行的 bash。我把 `just-bash` 接到真实目录上，让文件在进程被杀后还能保留。适配器 1.0.177 依赖 `@earendil-works/pi-coding-agent` `^1.0.3`，npm 实际安装了 1.5.0，所以这条路径现在也用当前的 Pi。10 月用的适配器 1.0.141 依赖 Pi `^0.85.1`。我选择测适配器，是因为它把文件和 shell 分到了沙箱里；Pi 自带的 SDK 没做 kill 测试。

下面的脚本去掉了日志。一轮正常结束且流中没有错误时，脚本退出 0，任务是否完成仍要另外检查；流报告错误时退出 1；收到 `SIGTERM`、`stop()` 返回恢复状态后退出 143，方便监督程序区分。脚本固定使用 `state.json` 和同一个 session id，所以和 `pi-task.sh` 一样，每个任务要用独立目录。需要 Node 22.19 或更新版本，这是内置 Pi 的要求。把脚本存为 `run.mjs`，安装我用的版本，设好 `DEEPSEEK_API_KEY` 后运行：

```bash
npm i @ai-sdk/harness@1.0.174 @ai-sdk/harness-pi@1.0.177 @ai-sdk/sandbox-just-bash@1.0.174 just-bash@2.14.5
DEEPSEEK_API_KEY=... node run.mjs   # run it again after a SIGTERM to resume
```

`just-bash` 要固定在 2.x。不指定版本的 `npm i just-bash` 会安装 3.6.0，与沙箱包依赖的 2.14.5 同时存在。

这份脚本在适配器 1.0.177 上直接运行，无需改动：

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

不打断时，约 50 秒完成，文件在 `./box/work/pi-demo/` 下。我在约 30 秒和 33 秒时分别用 `SIGKILL` 杀了一次。两次都是已写好的文件留在沙箱里，对话丢失。适配器把 Pi 会话放在内存中（源码中的 `SessionManager.inMemory`），只有调用 `stop()`、`detach()` 或 `suspendTurn()` 时才把会话放进返回的状态。进程被杀后，三个方法都没有执行，临时目录 `$TMPDIR/ai-sdk-harness/pi/<session id>/` 里也没有文件。

每次我都用相同的 session id 起新进程，发出和上文手动 `--continue` 一样的提示词：「You were interrupted. Continue the original task from where you left off.」。这里故意不带原任务，用来检查对话是否保住了；上面的 JS 脚本会发送完整任务。没有历史，模型两次都没新建文件，只问剩下的步骤是什么。

换成 `SIGTERM` 后，六次都恢复并完成了任务，因为信号处理函数执行了。`session.stop()` 中止当前轮次，返回包含未完成轮次的恢复状态。新进程将它作为 `resumeFrom` 传入，发现 `hasUnfinishedTurn()` 为真，再调用 `continueStream()`。`detach()` 返回的状态同样传给 `createSession({ sessionId, resumeFrom })`；`suspendTurn()` 返回的状态则传给 `createSession({ sessionId, continueFrom })`。

现在，返回的状态本身就包含会话。六次测试中，我有三次在停止时另存了状态快照，避免被恢复后的运行覆盖；这些快照包含 16 到 22 条记录。沙箱里没有另一份会话副本可供检查。[AI SDK 文档](https://ai-sdk.dev/providers/ai-sdk-harnesses/pi)说明，旧格式状态恢复时会新建会话，所以 10 月版本保存的 `state.json` 会从头开始。使用 `sessionStorage` 时，`stop()` 把新记录追加到你的日志，状态中只保留最后一条记录的 id。

三份快照中有一次，`stop()` 在第 3 次 `sleep 8` 运行到 1.2 秒时将它打断，结果却记为 `(exit 0)`。算上被打断的这次，本该还剩三次 sleep，恢复后模型只跑了两次，因为它把被打断的那次当成了已完成。这次运行最后五个文件都在，也报告了完成，只是少等了一次。另外两次信号落在步骤之间，没有打断任何调用。`just-bash` 的 `sleep` 在中止时会报告成功，其他沙箱我没检查。

Linux 上的 `docker stop` 和 `systemctl stop` 都先发送 `SIGTERM`，默认分别等待 10 秒和 90 秒后才发 `SIGKILL`。只要 `stop()` 能在这段时间内完成，这样的处理函数就能应对计划内停机；进程崩溃或 OOM killer 杀进程时，它起不了作用。

适配器默认开启的 `reattachInProcess` 也无法恢复已死进程。这个选项让暂停的轮次在同一个进程里复用仍然活着的 Pi 会话，进程退出后就没有会话可重新连接。

## 在 Cloudflare 上运行 Pi Durable：`PiHarness`

[`PiHarness`](https://developers.cloudflare.com/agents/harnesses/pi/) 在 [10 月 2 日](https://developers.cloudflare.com/changelog/post/2026-10-02-pi-harness/)加入 Agents SDK。Pi Durable 在这里把对话记录、收到的提示词队列和任务存进 Durable Object 的 SQLite。按 Cloudflare 文档，只要 Pi 还有工作，任务的心跳 alarm 每 30 秒触发一次；对象崩溃后，下次心跳会重新启动它，Pi 从上一个检查点继续。

先安装依赖：

```bash
npm install agents@0.33.0 @earendil-works/pi-durable@1.5.0 @earendil-works/pi-ai@1.5.0 @earendil-works/pi-schema@1.5.0 @earendil-works/chord@1.5.0
npm install -D wrangler@4.158.0
```

我用 `agents` 0.33.0 和 Pi Durable 1.5.0。`agents` 每次只支持 Pi 的一个次版本，这里是 `~1.5.0`，所以要一起固定版本。10 月的示例用当前包构建会失败，因为 `@earendil-works/pi-ai` 已不再导出 `Type`。下面这版在 wrangler 4.158.0 下编译并运行过，通过 `pi-ai` 接 DeepSeek，替代 Cloudflare 示例中的 Workers AI 绑定：

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

和 10 月相比，代码有三处变化：

- schema 从 `@earendil-works/pi-schema` 导入。
- 工具返回 `output`，替代原来的 `content`。
- 工厂函数把 `onWake` 传给 `Harness.open`。按 Cloudflare 文档，不传时，任务 sleep 期间 Pi 的定时器会让对象留在内存中并持续计费，harness 也会记录警告。

Wrangler 配置用的是 Cloudflare 示例去掉 `ai` 绑定后的版本。把 key 写进 `.dev.vars`，变量名为 `DEEPSEEK_API_KEY`，再用 `npx wrangler types` 生成 `Env` 类型：

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

`replay` 用来声明 Pi Durable 的工具能否重复执行。`write_file` 标为 `"safe"`，因为它按文件名覆盖同一行；`sleep` 保持默认，被打断的调用不会自动重跑。`operationId` 让提交具有幂等性，同一个 id 再次提交，返回的还是原来的操作。

我在自己机器上用 `npx wrangler dev`（wrangler 4.158.0）运行，没有使用 Cloudflare 账号。启动后访问 `/submit` 提交任务，访问 `/wait` 等待结果。不打断时耗时 49.6 秒。11 月三次 kill 分别在第 22、28、33 秒，用 `SIGKILL` 杀掉 `wrangler` 及其 `workerd` 运行时，每次都在 `sleep` 期间；约 3 秒后，用同一份本地状态重新启动 `wrangler dev`。这里手动重启运行时，模拟 Cloudflare 恢复运行时；测试证明的是运行时回来之后，对象会自行接着跑。

我在对象构造函数中加了一行日志。三次分别在发出重启命令后 4.9、0.9、23.9 秒构造对象，都在一个心跳周期内。恢复前没有请求到达对象。在我查询最终结果前，每次重启后只记录了四个发往 `/` 的请求，而且都在对象恢复之后；Worker 对这些请求直接返回 404，不会调用对象。三次都完成了五步。

每次 Pi Durable 都把被打断的 `sleep` 记录为错误，随后模型重新调用 `sleep`。由于工具没有标为可安全重跑，Pi Durable 自己没有重跑调用，写入的是这条结果：

```text
<harness>
[error] Tool sleep was interrupted and may have partially run
</harness>
```

模型看到错误后再次调用 `sleep`，然后继续。覆盖写可以安全重做，不过这几次测试都没需要重做写入。部署、扣款这类操作保持默认，至少能避免 Pi Durable 静默重跑：模型会收到错误。但模型仍可能再次调用工具，三次测试里的 `sleep` 都是如此。因此，绝不能重复执行的工具仍需要自己的防护，例如幂等键。对照上面的 AI SDK 测试，被中止的 `sleep` 报告成功，模型就直接往下走了。

这些都是本地测试。Cloudflare 文档描述了它在线上网络中相同的恢复机制，但我没有部署验证。长时间无人值守运行时，文档里的几条限制也需要考虑：

- Pi Durable 还没有工具调用审批环节。
- 单次模型请求流式输出超过 15 分钟，可能被截断。
- `abort()` 会等待忽略 abort signal 的工具返回。

## 无人值守跑 Pi，该选哪一种

如果 agent 要在真实的 git 仓库里跑 shell，而你有自己的机器和调度程序，用 `pi --print`。它运行 Pi 1.5.0，11 月三次硬杀都保住了会话文件，一条命令就能恢复。监督程序要自己写，可以用上面的脚本，加定时器或 cron 启动。如果用其他方式启动 `pi`，记得关闭 stdin，停止时优先发 `SIGTERM`，让仍在运行的工具命令一起退出。`SIGKILL` 没有这个清理机会；后台命令无论哪种信号都会留下，要用 systemd scope 或容器清理。

如果 Pi 只是你 Node 服务里的一个组件，每个用户各有一个沙箱，AI SDK harness 更合适。把 `SIGTERM` 接到 `session.stop()`，把恢复状态存到持久存储，这条路径现在运行 Pi 1.5.0，API 仍属实验性。崩溃仍会丢掉上次保存状态之后的全部进度；我用一条提示词跑的测试在硬杀前还没保存过，丢失的就是整段对话。被 `stop()` 打断的命令可能记成成功，而 `continueStream()` 不接受新提示词，所以恢复后要自己核对结果，或者让任务的每一步先检查上一步。上面的脚本在没有保存状态时会重发完整任务，别换成一句不带任务内容的「继续」。

任务需要在崩溃后恢复、你又不想自写监督程序，工具也主要调用 API 时，可以考虑 Cloudflare 上的 Pi Durable。本地测试中，我重启运行时后，对象没有收到请求就继续了任务。在线上，Cloudflare 文档说心跳 alarm 会重新启动对象，这一点我没部署验证。它也是三者中最新的一条路径，`PiHarness` 在 10 月 2 日才加入。Pi Durable 属于实验性，`agents` 每次只支持 Pi 的一个次版本，要一起固定版本。Earendil 的发布文也展示了普通 Node 上的 Pi Durable：使用 SQLite 存储，再给编程工具接 Node 执行环境。这个组合我没测。

### 在 Docker 或沙箱里运行 Pi agent harness

三种跑法的沙箱边界不同。AI SDK 只把文件和 shell 放在沙箱里，Pi 和 API key 留在宿主机；适配器执行沙箱命令时不会传入宿主机环境变量。Worker 没有 shell，每个工具能做什么由它的代码决定。CLI 要等你把整个 `pi` 进程放进容器或沙箱才有隔离。Pi 的[容器化指南](https://pi.dev/docs/latest/containerization)介绍了普通 Docker、Docker Sandboxes 和 OpenShell，它们会隔离整个 Pi 进程，包括扩展；Gondolin 扩展则只把内置工具放入微虚拟机，Pi 留在宿主机。

## 任务调度、PR 评审和发版，还得自己接

下一个跑什么任务、怎样确保只有一个 worker 认领、谁评审结果、能否合并、怎样发版，这三种跑法都没有替你决定。我在 [Claude Code 无人值守运行](/zh/blog/run-claude-code-unattended/)里逐一讨论过，这些问题不依赖具体的 harness。Orbi 是我为此在 `pi --print` 之上搭的那一层：按标签认领 issue，每个 PR 用独立 Pi 会话评审，通过合并门禁才合并，收到发版 issue 后发版。[Orbi Cloud](/zh/cloud/) 可以把它跑在你的仓库上。

## 相关

延伸阅读：[Orbi 与 Claude Code 的对比](/zh/compare/claude-code/)、[Orbi Cloud](/zh/cloud/)。
