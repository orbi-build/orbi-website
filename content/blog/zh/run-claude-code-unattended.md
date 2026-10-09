---
title: Claude Code headless 模式是什么？自动化开发还差六件事
date: 2026-10-01
summary: Claude Code 的 headless 模式就是 claude -p 非交互模式，跑完一个提示词就退出。做自动化开发，认领、运行用户、评审、合并、续跑和发版还得自己搭。
lang: zh
author: Lawrence Liu
image: /img/blog-headless-card.png
mirror: run-claude-code-unattended
---

Claude Code 的 headless 模式，就是加了 `-p`（全称 `--print`）的非交互模式：不开交互界面，跑完一个提示词，把结果打到终端就退出。Claude 自己出错时返回非零退出码，但工具调用被拒不算出错，退出码照样是 0（下文有实测）。官方中文文档把这一页叫[「以编程方式运行 Claude Code」](https://code.claude.com/docs/zh-CN/headless)，正文里叫非交互模式，headless 这个词只留在了网址里。把 Claude Code 放进 cron 或 CI 做自动化执行，靠的就是它。没人回答授权提示时，headless 运行会直接拒掉需要授权的操作，所以要给它一个放行的权限模式：

```bash
claude -p "修复 tests/test_auth.py 里失败的测试" \
  --permission-mode auto --permission-prompts none
```

`--permission-prompts none` 在这里是可选的：普通 cron 或 CI 里本来就没人回答授权提示，它的作用是告诉 Claude 被拒的操作别再重试，并拿掉 AskUserQuestion 这类需要人来回答的工具。它要求 Claude Code v2.1.259 及以上，旧版本去掉就行。`auto` 也不一定可用：模型不支持、设置里关掉了，或者 Anthropic 临时停用，会话都会改从 Manual 模式（也就是 `--permission-mode default`）启动，这时没有预先放行的写入都会被拒，运行却仍可能以 0 退出、报成功。放进 cron 之前，配上后面「headless 跑完返回什么」一节的检查脚本。

我是 Lawrence Liu，Orbi 的维护者。Orbi 做的事是把 GitHub Issue 无人值守地变成合并、发版的改动。Orbi 用的 agent 是 Pi，不是 Claude Code。下面讲的都是 agent 外面那一圈，用 Claude Code 搭循环一样绕不开。

## headless（非交互）模式怎么用：参数、返回值、认证和 cron

headless 模式给你的是一个没人看着也能跑完的会话。放进 cron 或 CI 之后，有几个参数要知道：

- `--allowedTools` 预先放行指定工具，`--permission-mode` 给其余操作定一个默认权限。
- `--output-format json` 让脚本拿到结果、会话 ID 和花费；`stream-json` 则在运行过程中逐条输出事件。
- `--resume <session_id>` 接着之前的某次运行继续，ID 从那次运行的 JSON 里取；`--continue` 接最近一次。
- `--max-budget-usd` 设一个花费上限，花费到了这个数就停。这里的花费是 Claude Code 自己的估算，不是账单，而且实际可能超过上限，要留出余量。
- `--dangerously-skip-permissions` 是让 Claude Code 不用确认就执行的最直接办法。它跳过常规的权限提示和检查（仍有少数保护生效，headless 运行里仍需人批准的操作会被拒绝），官方说只能在容器或虚拟机里、用非 root 用户跑。在自己的机器上跑，`auto` 或者 `dontAsk` 加白名单更稳妥。
- `--bare` 跳过机器和仓库里配置的 hooks、插件、MCP server 和 CLAUDE.md。不加的话，在一个你从没信任过的仓库里跑 headless，照样会执行这个仓库自带的 hooks，而且不会弹信任对话框。它还不认 Pro、Max 的订阅登录，必须用 API key（见下文「headless 登录与认证」）。

### headless 跑完返回什么，脚本该看哪个字段

这篇 10 月 1 日发出。10 月 9 日，我用 Claude Code 2.1.281 补测了三次 headless，登录的是 Claude 订阅，看脚本到底能拿到什么。

第一次让它读一个只有一行的文件，回复第一个词：`claude -p "Read note.txt and reply with its first word only." --allowedTools "Read" --output-format json`。退出码 0，`"subtype": "success"`、`"is_error": false`，答案在 `result` 里，跑了两轮（`num_turns: 2`，一轮读文件，一轮回答）。它报的 `total_cost_usd` 是 0.49。订阅登录没有对应的账单，但这个数背后的 token 是实打实的：没加 `--bare`，这次运行把我 `~/.claude` 下的整套配置都加载了进来，CLAUDE.md、skills、插件都在里面，`usage.cache_creation_input_tokens` 是 59,671，只为回一个词。我手上没有 API key，没法用 `--bare` 跑同一个任务做对比，所以说不出它能省多少。

第二次跑 `claude --bare -p "say hi" --output-format json`，没设 `ANTHROPIC_API_KEY`。`--bare` 不读订阅登录，这次注定失败，我就是想看失败长什么样。退出码 1，可 JSON 里照样写着 `"subtype": "success"`。失败只体现在 `"is_error": true`，以及 `result` 里那句 `Not logged in · Please run /login`。

第三次在 `--permission-mode default` 下让它写一个文件。headless 运行里没人批准写入，文件没写成，可这次退出码 0，`"subtype": "success"`、`"is_error": false`。唯一的痕迹在 `permission_denials` 里：它列出了 Claude 尝试过、被拒掉的两次工具调用，一次 Bash 重定向，一次 Write 工具。这次我没有预先放行任何写入，夜间任务碰上前面说的 `auto` 不可用、会话改从 Manual 模式（`default`）启动时，处境一模一样：可能一晚接一晚以 0 退出，什么都没做成。

所以脚本要查三样：退出码、`is_error`、`permission_denials` 是否为空。我没见过退出码 0 而 `is_error` 为 true 的情况，查它算多一道保险。下面这段放进 bash 脚本里用，别在终端里直接敲，因为 `exit 1` 会把你的 shell 关掉。需要装 `jq`：

```bash
out=$(claude -p "Run the test suite and fix what fails" \
  --permission-mode dontAsk --allowedTools "Read,Edit,Bash(npm test *)" \
  --output-format json)
status=$?
if [ "$status" -ne 0 ]; then
  echo "claude exited with $status" >&2
  jq -r '.result // empty' <<<"$out" >&2
  exit 1
fi
if [ "$(jq -r '.is_error' <<<"$out")" != "false" ]; then
  echo "claude reported an error, or its output was empty or not JSON" >&2
  jq -r '.result' <<<"$out" >&2
  exit 1
fi
denied=$(jq '.permission_denials | if type == "array" then length else error("no permission_denials") end' <<<"$out") || exit 1
if [ "$denied" -ne 0 ]; then
  echo "$denied tool calls were denied:" >&2
  jq -r '.permission_denials[].tool_name' <<<"$out" >&2
  exit 1
fi
```

`dontAsk` 会拒掉所有原本要弹确认的操作，读文件和白名单里的工具照常执行。`Bash(npm test *)` 放行带不带参数的 `npm test`。`ls`、`cat`、`grep` 这类只读命令在任何模式下都不用列也能跑；白名单里还有 `Edit`，Claude 能改 `npm test` 实际跑的内容，所以这份白名单只防误操作，算不上沙箱，任务要用下文说的专用用户跑。其余需要批准的 Bash 命令会被拒，这段脚本会把它记成失败，所以先手动跑一次，看 `permission_denials` 里列了哪些命令，把你愿意放行的加进白名单。只有退出码 0、`is_error` 为 false、没有任何操作被拒，这段脚本才以 0 退出；Claude 失败、有操作被拒、输出为空、不是 JSON、或者缺 `permission_denials` 字段，它都以 1 退出。这几种情况我都写了一个假的 `claude` 脚本放进 `PATH`，逐一试过。

### headless 登录与认证

订阅用户最容易卡在登录上。`--bare` 不认 Pro 或 Max 的登录。直接用 Anthropic API 时，要设 `ANTHROPIC_API_KEY`，或者用 `--settings` 传入 `apiKeyHelper`；Bedrock 这类云服务商照旧用它们自己的凭据。

想在 CI 里用订阅额度，先跑 `claude setup-token`，把打印出来的 token 设成 `CLAUDE_CODE_OAUTH_TOKEN`，并且不要加 `--bare`。这个 token 有两点要注意：

- 有效期一年。
- `ANTHROPIC_API_KEY`、`ANTHROPIC_AUTH_TOKEN` 或 `apiKeyHelper` 优先于它，不管是设在机器上还是仓库的配置里，所以要核对一次运行到底用的哪个凭据。

细节见[认证文档](https://code.claude.com/docs/zh-CN/authentication#generate-a-long-lived-token)。不能加 `--bare` 的时候，可以用 `--setting-sources user` 不读仓库自己的配置和 `.mcp.json`，`--settings '{"disableAllHooks":true}'` 可以在这一次运行里关掉 hooks。官方还说 `--bare` 将来会成为 `-p` 的默认值，到时候靠 token 登录的配置可能要改。

### 最小的 cron 定时任务

cron 的 `PATH` 很短，也不读你的 shell 配置，所以工作目录、可执行文件路径和凭据都要写全。token 放进一个只有运行这个任务的用户能读的文件（`chmod 600`），并且要用 `export`，否则 Claude 读不到：

```bash
# ~/.claude-nightly.env
export CLAUDE_CODE_OAUTH_TOKEN="..."
export PATH="/usr/local/bin:$HOME/.local/bin:$PATH"
```

`PATH` 这一行和 token 一样重要：Claude 在任务里执行的命令，比如你的测试工具，看到的也是 cron 那个很短的 `PATH`。你的工具装在哪，就把哪加进去。

把前面「headless 跑完返回什么」那一节的检查脚本存成 `$HOME/bin/claude-nightly.sh`，第一行加上 `#!/usr/bin/env bash`，再 `chmod +x`。它用的是 `dontAsk` 加白名单，不依赖 `auto` 是否可用，有任何操作被拒都会以 1 退出。然后在这个用户的 crontab 里写（仓库路径换成你的）：

```bash
# crontab -e：每天凌晨 3 点
0 3 * * * cd /srv/myrepo && . "$HOME/.claude-nightly.env" && "$HOME/bin/claude-nightly.sh" >> "$HOME/claude-nightly.log" 2>&1
```

脚本靠环境文件里设的 `PATH` 找到 `claude`，所以那一行要包含 `which claude` 打印出来的目录。每次失败都会在日志里留下一行说明；`cd` 失败这类脚本启动前的错误不会进这个日志。如果你想用 `auto`，就保留 `permission_denials` 那项检查，这样退回 Manual 模式的那次运行会被记成失败。

如果你只需要这样一个定时任务，到这里就够了。下面的内容是给想让 GitHub Issue 一路自动走到合并、发版的人。

## 用 claude -p 做自动化开发，还要自己解决的六件事

Orbi 从 8 月下旬开始无人值守地交付自己仓库里的 Issue。截至 10 月 1 日发文时，[仓库](https://github.com/orbi-build/orbi)里有 599 个 Issue 带着 `ai-merged` 标签，最近一次发版是 9 月 30 日的 v0.5.58。下面有几件事，我是先做错了才改对的。只在 `claude -p` 外面套个循环，这六件事全得你自己补。

### 认领哪个 Issue，而且只认领一次

在 Orbi 里，人给 Issue 打上 `ai-ready` 标签。runner 在一把认领锁里选票，两个 runner 不会同时拿到同一个 Issue；选中后加上 `ai-in-progress`，之后的扫描都会跳过它。认领的 runner 接着从一个固定的提交建 worktree。紧急的先做，然后是 bug。每一步都以评论的形式写回 Issue，所以队列就是 Issue 列表，运行日志就是 Issue 的时间线。

### 用哪个系统用户跑

没人审批命令时，专用的系统用户能多加一层隔离，这是权限规则和沙箱替代不了的。Orbi Cloud 给每个接入的仓库单独开一个 Unix 用户。9 月 25 日，我看到 GitSpawn（借仓库的 git 配置让编程 agent 执行程序的漏洞），反应过度，开票让 Orbi 写了 1164 行加固代码，不到四个小时又撤了。agent 本来就以那个用户的身份运行，单独护住 runner 自己调用的 git 什么也防不住。如果你用 cron 跑 `claude -p`，就给它一个专用用户，只放这个仓库的凭据。来龙去脉写在 [GitSpawn 那篇](/zh/blog/gitspawn-unattended-agent/)里。

### 谁来评审

Orbi 另起一个会话做评审。它拿 Issue 里的验收项，对照 PR 冻结下来的 base 提交和 head 提交逐条检查，发现问题当场修，最后把结论和测试通过数一起贴回 Issue。写代码的那个会话不参与评审。

### 什么时候能合并

合并前一刻，Orbi 会再确认四件事：评审结论对应的是 PR 现在的最新提交；这个提交包含目标分支的最新改动；它上面的 CI 已经跑通；GitHub 显示 PR 可以合并。CI 还在跑，就等下一轮。每一条在[自动合并指南](/zh/guides/auto-merge-ai-prs/)里都有说明。

这张清单直到 9 月 30 日上午都有个漏洞。北京时间 9 月 30 日凌晨 0 点 47 分（UTC 9 月 29 日 16 点 47 分，下图里的时间是 UTC），我给一个 Issue 打了 `ai-blocked`，还留言说它的 PR 不能合。71 秒后，runner 照样把它合了。合并前的检查重读了目标分支、最新提交和 CI，唯独没重读 Issue 的标签，评审期间加上的标签等于没加。当天早上我开了 [#1504](https://github.com/orbi-build/orbi/issues/1504)，随后回滚了这次合并：

![GitHub 上的 Issue #1504（截图里的时间是 UTC）：维护者打上 ai-blocked 71 秒后 PR 仍被合并的时间线，以及原因：merge_gate 从不重读 Issue 标签](/img/headless-1504-bug.webp)

Orbi 在我开票一分钟后认领，开了 [PR #1505](https://github.com/orbi-build/orbi/pull/1505)，独立评审一轮没发现问题，认领后 45 分钟合并。现在合并前会最后读一次标签，Issue 上有 `ai-blocked` 就不合。

![#1504 时间线的后半段：Orbi 开了 PR #1505，一轮评审后合并，标签从 ai-pr-opened 换成 ai-merged](/img/headless-1504-merged.webp)

你的循环如果最后一步是 `gh pr merge`，同样有这个漏洞。立即合并的情况下，在它前面加几行能把这个窗口缩小，但缩不到零：读完标签到真正合并之间加上的标签，照样拦不住。这几行要存成 bash 脚本再运行；直接贴进交互终端的话，缺了 SHA 也拦不住后面那几行。

`:` 那一行要求 Issue、PR 和评审通过的 SHA 都必须给出；`labels=` 那一行读不到标签就直接退出，免得查询失败反而放行；`grep` 那一行在 Issue 被拦下时以非零码退出，这样循环不会把它当成成功；`--match-head-commit` 保证合进去的正是评审过的那个提交。如果目标分支要求 merge queue，检查没通过时 `gh pr merge` 会开启自动合并，通过时会把 PR 排进队列，之后再加的阻止标签这段脚本管不到：

```bash
#!/usr/bin/env bash
: "${ISSUE:?}" "${PR:?}" "${REVIEWED_SHA:?缺少评审通过的 SHA}"
labels=$(gh issue view "$ISSUE" --json labels -q '.labels[].name') || exit 1
grep -qx ai-blocked <<<"$labels" && { echo "blocked: $ISSUE"; exit 3; }
gh pr merge "$PR" --squash --match-head-commit "$REVIEWED_SHA"
```

### 失败了怎么办

能自己恢复的，Orbi 把 Issue 转成 `ai-fix-needed`，下一轮在同一个分支、同一个 PR 上接着做。需要人拍板的，就停在 `ai-blocked`，留一条评论说明发生了什么。

这条评论有时并不够用。9 月 28 日，[#1482](https://github.com/orbi-build/orbi/issues/1482) 的第一轮不到三分钟就结束了，一个提交都没有，Orbi 打上了 `ai-blocked`：

![Issue #1482：Orbi 启动 Pi 之后贴出「Orbi blocked — waiting on a human decision」，说明 agent 没有交付提交，HEAD 还停在起点](/img/headless-1482-blocked.webp)

这条评论只说了没提交，没说为什么，我只能去翻日志。我判断 Issue 本身没问题，摘掉了 `ai-blocked`。`ai-ready` 一直没摘，runner 下一轮就重新认领了它，第二轮开了 [PR #1491](https://github.com/orbi-build/orbi/pull/1491)，当天合并。

### 谁来发版

对发布出去给人用的工具来说，修复要进了版本，用户才拿得到。Orbi 里发版也是一个 Issue，打 `ai-release` 标签，写明版本号和里程碑。Orbi 等里程碑里其余的 Issue 都关了，发版提交上的 CI 通过后打 tag。这是 v0.5.58 的发版 Issue，#1504 的修复就是随它发出去的：

![Issue #1508「Release v0.5.58」：范围是 v0.5.58 里程碑，Release 段写明版本号、目标分支和版本文件，Orbi 以 ai-in-progress 认领](/img/headless-1508-release.webp)

## 六件事之外，还留给人做的一步

如果你的自动化会改界面，光靠自动测试不够。9 月 25 日，Orbi 给这个网站合了一个[手机端表格的修复](https://github.com/orbi-build/orbi-website/pull/523)，现有的溢出测试全部通过。可 390px 宽的截图上，单词被从中间断开了。我按 390px 宽把 34 个表格页逐页量了一遍：横向溢出为零，但 25 个页面上有 193 处单词或数字被断开。下图是在现在的页面（2026 年 10 月）上套回那次的 CSS 复现的效果：

![在现在的页面上套回 PR #523 的 CSS，390px 下的 Orbi 与 Devin 能力对比表：「Task entry」被拆成「Tas」「k」「ent」「ry」](/img/headless-table-before.webp)

我把量到的数字写进 [#526](https://github.com/orbi-build/orbi-website/issues/526)，Orbi 认领后 53 分钟合并了修复。现在（2026 年 10 月）的同一张表：

![orbi.build 2026 年 10 月的同一张表，390px 下：这一行叠成一块，单词都是完整的](/img/headless-table-after.webp)

PR #523 的测试做到了它那个 Issue 要求的，可那个 Issue 里没提单词断行。所以每次从 beta 推到生产之前，我都会在手机和电脑上把改过的页面打开看一遍。

## 不想自己搭自动化工作流的话

上面这六件事都能围着 `claude -p` 自己搭：认领加锁、专用的运行用户、另起一个会话评审、合并前检查、失败续跑、发版任务。Orbi 自己这一套写在 [workflow 文档](https://github.com/orbi-build/orbi/blob/main/docs/workflow.mdx)里，有八百来行。

也可以直接用 Orbi。它的 agent [Pi](https://github.com/earendil-works/pi) 和 runner 都是开源的，runner 可以[自托管](https://github.com/orbi-build/orbi)。模型可以接 DeepSeek，也可以接其他你有 key 的服务，Anthropic 的 API 也在列表里，Claude 模型照样能用。放弃的是 Claude Code 这个工具，以及用 Claude Pro/Max 订阅额度来跑。[Orbi 与 Claude Code 对比](/zh/compare/claude-code/)里写了两者各自做到哪一步。

不想维护机器，可以[把仓库接入 Orbi Cloud](https://orbi.build/zh/cloud/?ref=blog-headless)。

## 相关

继续阅读：[Orbi 与 Claude Code 对比](/zh/compare/claude-code/)、[Claude Code 跑完之后，谁来合并 PR](/zh/blog/claude-code-github-actions-who-merges/) 与 [Cloud](/zh/cloud/)。
