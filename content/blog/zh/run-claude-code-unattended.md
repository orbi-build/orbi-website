---
title: Claude Code headless 模式下操作被拒，退出码还是 0
date: 2026-10-01
summary: Claude Code 的 headless 模式就是 claude -p。没预先放行的操作被拒后，运行照样算成功，脚本得自己查 permission_denials 才知道。
lang: zh
author: Lawrence Liu
image: /img/blog-headless-card.png
mirror: run-claude-code-unattended
---

Claude Code 的 headless 模式，就是加了 `-p`（全称 `--print`）的非交互模式：不开界面，跑完一个提示词，把结果打到终端就退出。想把 Claude Code 放进 cron 或 CI，用的就是它。官方中文文档管这一页叫[「以编程方式运行 Claude Code」](https://code.claude.com/docs/zh-CN/headless)，headless 这个词只剩在网址里。

headless 运行没人回答授权提示，要授权的操作会被直接拒掉，而且被拒不算出错，退出码还是 0。得事先定好哪些操作能放行。最省事的是 `auto` 权限模式：

```bash
claude -p "修复 tests/test_auth.py 里失败的测试" \
  --permission-mode auto --permission-prompts none
```

这条命令单独跑，有操作被拒也看不出来：要加 `--output-format json`，再查 `permission_denials`，不管用哪种模式都一样。完整脚本见下文。

`--permission-prompts none` 可加可不加。cron 和 CI 里本来就没人回答授权提示，加了它，Claude 被拒之后不会再重试，也不会去调 AskUserQuestion 这类要人回答的工具。它要 Claude Code v2.1.259 以上，旧版本去掉就行。

`auto` 也不是总能用。模型不支持、设置里关掉了、Anthropic 在服务端关掉，会话都会改从 Manual 模式（即 `--permission-mode default`）启动，没预先放行的写入都会被拒。所以夜间任务我用 `dontAsk` 加白名单，它不依赖 `auto` 能不能用，下文的检查脚本就是这么配的。在 headless 下，`dontAsk` 放行的范围和 `default` 加同一份白名单一样；区别是[官方文档](https://code.claude.com/docs/zh-CN/permission-modes)把它定位成 CI 用的锁定模式，连显式的 `ask` 规则和 AskUserQuestion 都直接拒，会话从不等人输入。

我是 Lawrence Liu，Orbi 的创始人。Orbi 会把 GitHub Issue 一路做到合并和发版。Orbi 用的 agent 是开源的 Pi，不是 Claude Code，但后半篇讲的认领、评审、合并，用 Claude Code 搭循环一样绕不开。

## headless 模式怎么用

常用参数：

- `--allowedTools` 预先放行指定工具，`--permission-mode` 给其余操作定一个默认权限。
- `--output-format json` 让脚本拿到结果、会话 ID 和花费；换成 `stream-json`（要同时加 `--verbose`），会在运行过程中一条条输出事件。
- `--resume <session_id>` 接着之前某一次运行往下跑，ID 从那次运行的 JSON 里拿；`--continue` 接最近一次。
- `--max-budget-usd` 设花费上限，到了就停。这个花费是 Claude Code 自己估的，不是账单，实际还可能超过上限，所以要留点余量。
- `--dangerously-skip-permissions` 是让 Claude Code 不用确认就执行的最直接办法。它跳过常规的权限提示和检查。只有少数几类受保护的操作仍要人批准，这些在 headless 下会被拒。官方说只能在容器或虚拟机里、用非 root 用户跑。在自己的机器上跑，`auto` 或者 `dontAsk`（本该弹确认的操作一律拒绝）加白名单更稳妥。
- `--bare` 跳过机器和仓库里配置的 hooks、插件、MCP server 和 CLAUDE.md。不加的话，在一个你从没信任过的仓库里跑 headless，也会执行这个仓库自带的 hooks，而且不会弹信任对话框。`--bare` 不认订阅登录，要用 API key。

### headless 跑完会返回什么

（10 月 9 日补充）这篇是 10 月 1 日发的，后来我又用 Claude Code 2.1.281 跑了三次 headless，登录的是 Claude 订阅，想看看脚本到底能拿到什么。

第一次让它读一个只有一行的文件，回复第一个词：`claude -p "Read note.txt and reply with its first word only." --allowedTools "Read" --output-format json`。退出码 0，`"subtype": "success"`、`"is_error": false`，答案在 `result` 里，跑了两轮（`num_turns: 2`，一轮读文件，一轮回答）。它报的 `total_cost_usd` 是 0.49。订阅登录不会为这个数出账单，但这些 token 会算进订阅的用量额度：没加 `--bare`，这次运行把我 `~/.claude` 下的整套配置都加载了进来，CLAUDE.md、skills、插件全在，`usage.cache_creation_input_tokens` 是 59,671，就为了回一个词。我手上没有 API key，没法用 `--bare` 跑同一个任务对比，所以说不出它能省多少。

第二次跑 `claude --bare -p "say hi" --output-format json`，没设 `ANTHROPIC_API_KEY`。`--bare` 不读订阅登录，这次本来就该失败，我就是想看看失败长什么样。退出码是 1，JSON 里却还写着 `"subtype": "success"`。能看出失败的只有 `"is_error": true`，和 `result` 里那句 `Not logged in · Please run /login`。

第三次在 `--permission-mode default` 下让它写一个文件。headless 运行里没人批准写入，文件没写成，可退出码是 0，`"subtype": "success"`、`"is_error": false`。唯一的线索在 `permission_denials` 里，它列出了 Claude 试过又被拒的两次工具调用：一次 Bash 重定向，一次 Write 工具。我这次没预先放行任何写入。夜间任务要是碰上前面说的 `auto` 不可用、会话改从 Manual 模式启动，处境就和这次一样，可能一晚又一晚以 0 退出，什么也没干成。

脚本要查三样：退出码、`is_error`，还有 `permission_denials` 是不是空的。退出码 0 而 `is_error` 为 true 的情况我没碰到过，查它也顺带拦住了空输出和非 JSON。下面这段要放进 bash 脚本里用，别直接在终端里敲，`exit 1` 会把你的 shell 关掉。另外要装好 `jq`：

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

`dontAsk` 会拒掉所有本该弹确认的操作，读文件和白名单里的工具照常执行。`Bash(npm test *)` 放行带参数和不带参数的 `npm test`；`ls`、`cat`、`grep` 这类内置的只读命令通常不用逐项放行（显式的 deny 规则照样生效）。白名单里还有 `Edit`，所以 Claude 能改 `npm test` 实际跑的内容。这份白名单只能防手滑，当不了沙箱，任务还是要用专用用户来跑。

别的需要批准的 Bash 命令都会被拒，脚本会把它记成失败。先手动跑一次，看看 `permission_denials` 里列了哪些命令，愿意放行的再加进白名单。输出为空、不是 JSON 这些异常情况，脚本也都返回 1，我用一个假的 `claude` 脚本放进 `PATH` 逐个试过。

### headless 怎么登录

我自己用订阅账号，第一个卡住的就是登录。`--bare` 不认 Pro 或 Max 的登录。直接用 Anthropic API 时，要设 `ANTHROPIC_API_KEY`，或者用 `--settings` 传入 `apiKeyHelper`；Bedrock 这类云服务商照旧用它们自己的凭据。

想在 CI 里用订阅额度，先跑 `claude setup-token`，把打印出来的 token 设成 `CLAUDE_CODE_OAUTH_TOKEN`，并且不要加 `--bare`。token 有效期一年。机器上或仓库配置里只要设了 `ANTHROPIC_API_KEY`、`ANTHROPIC_AUTH_TOKEN` 或 `apiKeyHelper`，就会盖过它，所以要核对一次运行到底用的哪个凭据。

细节见[认证文档](https://code.claude.com/docs/zh-CN/authentication#generate-a-long-lived-token)。不能加 `--bare` 的时候，可以用 `--setting-sources user` 不读仓库自己的配置和 `.mcp.json`，`--settings '{"disableAllHooks":true}'` 可以在这一次运行里关掉 hooks。官方还说 `--bare` 将来会成为 `-p` 的默认值，到时候靠 token 登录的配置可能要改。

### 最小的 cron 定时任务

cron 的 `PATH` 很短，也不读你的 shell 配置，所以工作目录、可执行文件路径和凭据都要写全。token 放进一个只有运行这个任务的用户能读的文件（`chmod 600`），并且要用 `export`，否则 Claude 读不到：

```bash
# ~/.claude-nightly.env
export CLAUDE_CODE_OAUTH_TOKEN="..."
export PATH="/usr/local/bin:$HOME/.local/bin:$PATH"
```

`PATH` 这一行和 token 一样重要：Claude 在任务里执行的命令，比如你的测试工具，用的也是这个文件里的 `PATH`。你的工具装在哪，就把哪个目录加进去。

把上面的检查脚本存成 `$HOME/bin/claude-nightly.sh`，第一行加上 `#!/usr/bin/env bash`，再 `chmod +x`。有任何操作被拒，它都会以 1 退出。然后在这个用户的 crontab 里写（仓库路径换成你的）：

```bash
# crontab -e：每天凌晨 3 点
0 3 * * * cd /srv/myrepo && . "$HOME/.claude-nightly.env" && "$HOME/bin/claude-nightly.sh" >> "$HOME/claude-nightly.log" 2>&1
```

脚本靠环境文件里设的 `PATH` 找到 `claude`，所以这个 `PATH` 要包含 `which claude` 打印出来的目录。每次失败都会在日志里留下一行说明；`cd` 失败这类脚本启动前的错误不会进这个日志，要去看 cron 发的邮件或系统日志。`permission_denials` 那项检查不能删：换成 `auto` 后，一旦 `auto` 不可用、会话改从 Manual 模式启动，写入被拒时退出码照样是 0，只有这项检查能把那次运行记成失败。

如果你只需要这样一个定时任务，到这里就够了。

## claude -p 外面还缺的六件事

Orbi 从 8 月下旬开始交付自己仓库的 Issue，平时写代码、评审、合并都不用人动手；人负责打标签、拍板（包括下文那两次回滚），以及上生产前看一眼页面。截至 10 月 1 日发文时，[仓库](https://github.com/orbi-build/orbi)里有 599 个 Issue 带着 `ai-merged` 标签，最近一次发版是 9 月 30 日的 v0.5.58。想让 Issue 自动走到合并、发版，只在 `claude -p` 外面套个循环是不够的，下面六件事大多得你自己补。合并前的检查和隔离加固这两件，我是先做错了才改对的。下文的 runner，指的是围着 agent 转的那个循环进程：挑 Issue、起会话、收结果。

### 同一个 Issue 怎么只被拿一次

在 Orbi 里，人给 Issue 打上 `ai-ready` 标签。runner 先拿一把锁，再按优先级挑下一个 Issue：紧急的先做，然后是 bug。有这把锁，两个 runner 不会挑到同一个。选中后加上 `ai-in-progress`，之后的扫描都会跳过它，runner 接着从目标分支上一个固定的提交建 worktree。每一步都以评论写回 Issue，排队情况在 Issue 列表上也看得到。

用 cron 跑好几个 `claude -p` 的话，最低限度是同一台机器上的任务共用一把 `flock` 锁：挑一个带 `ai-ready`、没有 `ai-in-progress` 也没有 `ai-blocked` 的 Issue 并打上 `ai-in-progress`，都在锁里做完，再释放锁、启动 Claude。

### 用哪个系统用户跑

没人审批命令时，专用的系统用户能多加一层隔离：权限规则只限制工具，文件和凭据得靠换一个用户来隔开。Orbi Cloud 给每个接入的仓库单独开一个 Unix 用户。9 月 25 日，我看到 GitSpawn（借仓库的 git 配置让编程 agent 执行程序的漏洞），反应过度，开票让 Orbi 写了 1164 行加固代码，护的只是 runner 自己调用 git 的那几处，不到四个小时我又把它回滚了。agent 本来就以那个用户的身份运行，它自己就能用同样的权限执行 git，单独护住 runner 那几处什么也防不住。如果你用 cron 跑 `claude -p`，就给它一个专用用户，只放这个仓库的凭据。来龙去脉写在 [GitSpawn 那篇](/zh/blog/gitspawn-unattended-agent/)里。

### 谁来评审

Orbi 另起一个会话做评审。它看 PR 的 diff（从目标分支上固定下来的那个提交，到 PR 的最新提交），逐条对照 Issue 里的验收项，发现问题当场修，修完重跑全量测试，最后把结论和测试通过数一起贴回 Issue。写代码的会话不评自己的代码；评审会话自己改的那部分，就只有测试和 CI 把关，没有第三个会话再审。

用 `claude -p` 的话，最低限度是另起一个会话，只给它 diff 和验收项，让它出结论。

### 合并前最后一刻要查什么

合并前一刻，Orbi 会再确认五件事：评审结论对应的是 PR 现在的最新提交；这个提交包含目标分支的最新改动；它上面的 CI 已经跑通；GitHub 显示 PR 可以合并；Issue 上没有 `ai-blocked`。CI 还在跑，就等下一轮。前四条在[自动合并指南](/zh/guides/auto-merge-ai-prs/)里有说明。

最后一条是 9 月 30 日才补上的。北京时间 9 月 30 日凌晨 0 点 47 分，我给一个 Issue 打了 `ai-blocked`，还留言说它的 PR 不能合。71 秒后，runner 照样把它合了。合并前的检查重读了目标分支、PR 的最新提交和 CI，唯独没重读 Issue 的标签，评审期间加上的标签等于没加。当天早上我开了 [#1504](https://github.com/orbi-build/orbi/issues/1504)，随后回滚了这次合并：

![GitHub 上的 Issue #1504（截图里的时间是 UTC）：维护者打上 ai-blocked 71 秒后 PR 仍被合并的时间线，以及原因：merge_gate 从不重读 Issue 标签](/img/headless-1504-bug.webp)

Orbi 在我开票一分钟后认领，开了 [PR #1505](https://github.com/orbi-build/orbi/pull/1505)，独立评审一轮没发现问题，认领后 45 分钟合并。现在合并前会最后读一次标签，Issue 上有 `ai-blocked` 就不合。

![#1504 时间线的后半段：Orbi 开了 PR #1505，一轮评审后合并，标签从 ai-pr-opened 换成 ai-merged](/img/headless-1504-merged.webp)

你的循环如果最后一步是 `gh pr merge`，同样有这个漏洞。立即合并的情况下，在它前面加几行能把这个窗口缩小，但缩不到零：读完标签到真正合并之间加上的标签，也拦不住。这几行要存成 bash 脚本再运行；贴进交互终端的话，`:` 那一行报错后不会退出，后面几行照样执行：

```bash
#!/usr/bin/env bash
: "${ISSUE:?}" "${PR:?}" "${REVIEWED_SHA:?缺少评审通过的 SHA}"
labels=$(gh issue view "$ISSUE" --json labels -q '.labels[].name') || exit 1
grep -qx ai-blocked <<<"$labels" && { echo "blocked: $ISSUE"; exit 3; }
gh pr merge "$PR" --squash --match-head-commit "$REVIEWED_SHA"
```

Issue、PR、评审通过的 SHA 缺一个，`:` 那一行就退出；读不到标签，`labels=` 那一行也退出，免得查询失败反而放行。Issue 被拦下时脚本以 3 退出，循环不会把它当成成功。`--match-head-commit` 保证合进去的就是评审过的那个提交。

目标分支要求 merge queue 时是例外：必需的 CI 检查还没通过，`gh pr merge` 会开启自动合并；已经通过，会把 PR 排进队列。之后再加的阻止标签，这段脚本都管不到。

### 失败后停在哪个标签

能自己恢复的，Orbi 把 Issue 转成 `ai-fix-needed`，下一轮在同一个分支、同一个 PR 上接着做。需要人拍板的，就加上 `ai-blocked`（同时摘掉 `ai-in-progress`），留一条评论说明发生了什么。

9 月 28 日，[#1482](https://github.com/orbi-build/orbi/issues/1482) 的第一轮不到三分钟就结束了，一个提交都没有，Orbi 打上了 `ai-blocked`：

![Issue #1482：Orbi 启动 Pi 之后贴出「Orbi blocked — waiting on a human decision」，说明 agent 没有交付提交，HEAD 还停在起点](/img/headless-1482-blocked.webp)

这条评论只说了没提交，没说为什么。我判断 Issue 本身没问题，就摘掉了 `ai-blocked`。`ai-ready` 一直没摘，runner 下一轮就重新认领了它，第二轮开了 [PR #1491](https://github.com/orbi-build/orbi/pull/1491)，当天合并。

自己搭的循环失败时，至少把 JSON 里的 `result` 和 `permission_denials` 贴回 Issue，看的人就不用去翻日志。

### 谁来发版

Orbi 里发版也是一个 Issue，打 `ai-release` 标签，写明版本号和里程碑。Orbi 等里程碑里其余的 Issue 都关了，发版提交上的 CI 通过后打 tag。自己搭的话，最低限度也是让发版走一张票，等里程碑清空、CI 通过再打 tag。这是 v0.5.58 的发版 Issue，#1504 的修复就是随它发出去的：

![Issue #1508「Release v0.5.58」：范围是 v0.5.58 里程碑，Release 段写明版本号、目标分支和版本文件，Orbi 以 ai-in-progress 认领](/img/headless-1508-release.webp)

## 测试全过，手机上单词还是断了

循环全跑通，不代表结果对。9 月 25 日，Orbi 给这个网站合了一个[手机端表格的修复](https://github.com/orbi-build/orbi-website/pull/523)，现有的溢出测试全部通过。可 390px 宽的截图上，单词被从中间断开了。我按 390px 宽把 34 个表格页逐页量了一遍：横向溢出为零，但 25 个页面上有 193 处单词或数字被断开。下图是在现在的页面（2026 年 10 月）上套回那次的 CSS 复现的效果：

![在现在的页面上套回 PR #523 的 CSS，390px 下的 Orbi 与 Devin 能力对比表：「Task entry」被拆成「Tas」「k」「ent」「ry」](/img/headless-table-before.webp)

我把量到的数字写进 [#526](https://github.com/orbi-build/orbi-website/issues/526)，Orbi 认领后 53 分钟合并了修复。现在（2026 年 10 月）的同一张表：

![orbi.build 2026 年 10 月的同一张表，390px 下：这一行叠成一块，单词都是完整的](/img/headless-table-after.webp)

PR #523 的测试满足了原 Issue 的要求，只是原 Issue 没提单词断行。所以每次从 beta 推到生产之前，我都会在手机和电脑上把改过的页面打开看一遍。

## 不想自己搭自动化工作流的话

这些都能围着 `claude -p` 自己搭。Orbi 自己这一套写在 [workflow 文档](https://github.com/orbi-build/orbi/blob/main/docs/workflow.mdx)里，有八百来行。

也可以直接用 Orbi。它的 agent [Pi](https://github.com/earendil-works/pi) 和 runner 都是开源的，runner 可以[自托管](https://github.com/orbi-build/orbi)。Cloud 默认用 DeepSeek，额度含在套餐里；也可以自带 key。自带 key 时可选的服务商里有 Anthropic，走的是它的 OpenAI 兼容接口；Anthropic 把这个接口定位为测试用，而且不支持 prompt caching，token 花费会比能用缓存时高。改用 Orbi，放弃的是 Claude Code 这个工具，以及用 Claude Pro/Max 订阅额度来跑。[Orbi 与 Claude Code 对比](/zh/compare/claude-code/)里写了两者各自做到哪一步。

不想维护机器，可以[把仓库接入 Orbi Cloud](https://orbi.build/zh/cloud/?ref=blog-headless)。

## 相关

继续阅读：[Orbi 与 Claude Code 对比](/zh/compare/claude-code/)、[Claude Code 跑完之后，谁来合并 PR](/zh/blog/claude-code-github-actions-who-merges/) 与 [Cloud](/zh/cloud/)。
