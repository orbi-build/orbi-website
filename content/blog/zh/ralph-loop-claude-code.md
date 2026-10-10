---
title: Ralph loop 跑完之后，谁来评审和合并
date: 2026-10-10
summary: Ralph loop 把同一段提示词反复喂给编程 agent，常见做法是让 agent 自己宣布做完。我实测了一次，第 4 轮测试全过，agent 写下 DONE；换一个会话评审，却发现 slugify 会把破折号直接删掉。搜索靠前的十几个页面里，只有 Huntley 的原文讲了合并交给谁：交给循环自己。
lang: zh
author: Lawrence Liu
image: /img/blog-ralph-loop-card.png
mirror: ralph-loop-claude-code
---

Ralph loop（也叫 Ralph Wiggum 循环、Ralph 循环）是一种让编程 agent 无人值守干活的办法：同一段提示词反复喂给 agent，一轮接一轮。最原始的写法自己不会停，常见的做法是加一个出口，让 agent 自己宣布活干完了。这个名字是 Geoffrey Huntley 在 [2025 年 7 月的文章](https://ghuntley.com/ralph/)里起的，最小写法只有一行 bash（原文写的是 `claude-code`，换成现在的 Claude Code 命令行就是 `claude -p`）：

```bash
while :; do cat PROMPT.md | claude-code ; done
```

每一轮都是新会话，agent 只能靠上一轮留在仓库里的文件知道做到了哪。它往前做一步就退出，循环再把它拉起来。Thoughtworks 在 2026 年 4 月把 [Ralph loop 收进了技术雷达](https://www.thoughtworks.com/en-us/radar/techniques/ralph-loop)，放在「评估」环，意思是值得了解它会带来什么影响，还没到建议在项目里试用的程度。

Huntley 说这适合从零起的新项目，「预期做到九成」。他说自己绝不会用在现有代码库上，还提醒你「时不时醒来会发现代码库编译不过」。写提示词的建议是每轮只让它做一件事。

我是 Lawrence Liu，Orbi 的创始人。Orbi 是一座软件黑灯工厂：一张 GitHub Issue 进去，编程 agent 写代码，另一个会话评审，然后合并，多数时候不用人守着。调度这一切的程序叫 runner，runner 本身也是一个循环。我一直想知道，最朴素的 Ralph loop 会在哪出问题、最后由谁收尾。10 月 10 日我用 Claude Code 跑了一次，对象是一个很小的 Python 库。第 4 轮测试全绿，agent 写下了 DONE。之后我另开一个会话评审，花了 0.11 美元，它找出一处不符合规格的地方，结论是不能合并。

## 官方 ralph-loop 插件默认不设轮数上限

Anthropic 把这个思路做成了 Claude Code 插件 [ralph-loop](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/ralph-loop)，早先叫 ralph-wiggum。它不用外层的 bash 循环，而是用一个 Stop hook：Claude 想结束会话时被拦下，同一段提示词再塞回去。所以整个循环跑在一个会话里，上下文会一轮轮累积下来。用法是：

```text
/ralph-loop "<提示词>" --max-iterations 20 --completion-promise "DONE"
```

不加参数它就不会停。启动循环的脚本 `setup-ralph-loop.sh` 里，`--max-iterations` 默认是 0，也就是不限轮数，启动时会提示：不设上限、也不设完成暗号的话，循环会一直跑下去。想中途结束，插件带了一个 `/cancel-ralph` 命令。README 的建议是永远设上 `--max-iterations`。

除了到上限或手动取消，循环是否结束由 agent 自己说了算：只有 Claude 写出你设定的完成暗号（这里是 `<promise>DONE</promise>`）循环才会结束，每轮塞回去的提示里还专门写了一句「别为了退出撒谎」。

Claude Code 另外内置了 [`/goal`](https://code.claude.com/docs/zh-CN/goal) 命令：每一轮结束后，由另一个模型检查条件有没有满足，而不是干活的那个模型自己说了算。

## 用 Claude Code 实测一次 Ralph loop

我没用插件，用的是 Huntley 那种外层循环，这样每一轮都是一个独立进程，方便量。

任务是一个叫 textkit 的小库：`slugify`、`truncate`、`wrap` 三个函数加一个命令行。规格一共 4 条，后面要用到的那条是「重音字母折成 ASCII（é → e）；不是 a-z 或 0-9 的连续字符变成一个 `-`」。我照规格写了 15 个测试，textkit 包里先不写实现，测试全红。`PROMPT.md` 全文如下：

```text
Study spec.md and fix_plan.md. Pick the single most important unfinished item,
implement it, and run `python -m pytest -q`.
Update fix_plan.md (create it if missing) with what is done and what is left,
then commit with git.
Only when every test passes and fix_plan.md lists nothing left, write the word
DONE into a file named STATUS.
```

意思是：读规格和 `fix_plan.md`，挑一件最重要的事做完、跑测试、更新 `fix_plan.md`、git 提交；全部通过时在 `STATUS` 文件里写 DONE。

我给循环设了 10 轮上限，用 Claude Code 2.1.281 的 headless 模式跑，模型是 Claude Opus 5.5，登录的是订阅。`--setting-sources ""` 让我自己的 CLAUDE.md、hooks 和插件都不参与，`--strict-mcp-config` 不加载 MCP 服务，更接近一台干净的机器。`dontAsk` 的意思是白名单以外、本该弹确认的调用一律拒绝，不等人。下面的脚本比我实测那版多了三处保护：先清掉旧的 DONE，某一轮失败就停，每轮把被拒的调用打印出来。`claude` 的参数和实测时一样，每轮的 JSON 也同样存在仓库外面。存成脚本用，需要装 `jq`。

我用一个假的 `claude` 放进 `PATH` 逐个试过：上次残留的 DONE 会先被清掉，不会让循环提前结束；非零退出码、`is_error` 为 true、空输出、跑满 10 轮没有 DONE，都会让脚本以 1 退出。

```bash
#!/usr/bin/env bash
# 在任务仓库里运行；每轮的日志写到仓库外面的上一级目录。
rm -f STATUS
for i in $(seq 1 10); do
  log="../round-$i.json"
  claude -p "$(cat PROMPT.md)" --setting-sources "" --strict-mcp-config \
    --permission-mode dontAsk \
    --allowedTools "Read,Edit,Write,Glob,Grep,Bash(python -m pytest *),Bash(python3 -m pytest *),Bash(git *)" \
    --output-format json > "$log"
  status=$?
  if [ "$status" -ne 0 ] || [ "$(jq -r '.is_error' "$log")" != false ]; then
    echo "round $i failed (exit $status)" >&2; exit 1
  fi
  jq -r '.permission_denials[]? | "\(.tool_name) \(.tool_input.command // .tool_input.file_path // "")"' "$log" | sed "s/^/round $i denied: /" >&2
  [ "$(cat STATUS 2>/dev/null)" = DONE ] && break
done
[ "$(cat STATUS 2>/dev/null)" = DONE ] || { echo "no DONE after 10 rounds" >&2; exit 1; }
```

每轮结束我数一次通过的测试，再读 JSON。订阅登录不按次扣钱，表里的花费是 Claude Code 按 API 价格自己估的，下文所有美元数字都是这个口径。

| 轮次 | 秒数 | agent 回合数（`num_turns`） | 估算花费 | 被拒的调用 | 通过的测试 |
|---|---|---|---|---|---|
| 1 | 28 | 8 | 0.18 美元 | 0 | 4 / 15 |
| 2 | 40 | 9 | 0.19 美元 | 1 | 8 / 15 |
| 3 | 28 | 9 | 0.18 美元 | 1 | 12 / 15 |
| 4 | 27 | 9 | 0.17 美元 | 1 | 15 / 15，写下 DONE |

两分钟，0.72 美元左右。每轮正好做完规格里的一条、提交一次，正合「每轮一件事」的要求。三次被拒里有两次是 Claude 想用 `python - <<EOF` 改 `fix_plan.md`，白名单里没有它，它就换成 Edit 工具接着做。第三次在第 4 轮：被拒的是一条把跑测试和手动检查命令行（`python -m textkit wrap 0 x`）串在一起的命令。Claude 在总结里写了它想手动验证宽度非法的情况、命令被权限拦下，然后照样写下了 DONE。这一轮退出码是 0，`is_error` 是 false。所以无人值守跑的时候，还得从 JSON 里查 `permission_denials`，这一点我在 [Claude Code headless 模式那篇](/zh/blog/run-claude-code-unattended/)里写过。

接着我照着规格另写了 13 个测试，循环从没见过，比如 `slugify("Ça va, l'été 2026")`、自定义省略号、宽度从 1 到 19 的每种截断长度、制表符、不带参数的命令行。13 个全过，测试层面已经挑不出问题。

## 换一个会话来评审，发现 slugify 不符合规格

然后我把 diff 和规格交给一个新的 `claude -p` 会话。用的还是同一个模型，在 `dontAsk` 下不给白名单，并在提示词里要求它不用工具，也不带写代码那个会话的历史。评审提示词如下，后面接上规格和 diff：

```text
You are reviewing a change you did not write. Do not use any tools; answer
from the text below. List every place where the code does not meet the spec,
or is wrong for an input the spec covers. For each: the input, expected,
actual. Last line: MERGE or DO NOT MERGE.
```

意思是：这段改动不是你写的，只根据下面的文字回答，逐条列出代码不符合规格的地方，写明输入、期望和实际，最后一行只写 MERGE 或 DO NOT MERGE。

花了 0.11 美元，结论是 DO NOT MERGE。它找到的问题是真的：循环写的 `slugify` 用 `encode("ascii", "ignore")` 折重音，这一步会把折不成 ASCII 的字符直接删掉，本该把它变成 `-` 的正则根本看不到它：

```text
slugify("foo—bar")  -> 'foobar'   （规格：'foo-bar'）
slugify("a€b")      -> 'ab'       （规格：'a-b'）
```

一共 28 个测试，没有一个用到破折号或货币符号，所以全部通过，代码却违反了规格。

我把评审意见当作下一轮的提示词再喂回去。这一轮花了 0.26 美元，修好了 `slugify`，按评审列出的输入补了 6 个测试，仓库里的测试从 15 个变成 21 个，又写下 DONE；我那 13 个也仍然全过。第二次评审（0.15 美元）给了 MERGE，同时列出 8 处规格本身有两种读法的地方，比如 `x²` 里的上标 `²` 算不算数字。这类问题评审定不了，得由定规格的人拍板。

循环、两次评审加一轮修复，一共 1.24 美元左右。

## 排在前面的 Ralph loop 教程，很少讲做完以后谁来合并

10 月 10 日我搜了「ralph loop」和「ralph wiggum loop」，排在前面的 14 个页面里能打开 13 个。有 3 个建议你回来以后看一眼结果，有 2 个提到可以让循环开 PR 而不是直接提交到 `main`，但只是可选做法。除了 Huntley 本人把合并和打 tag 交给循环，其余页面都没讲谁来合并，在发版前设人工关口的也没有。

Huntley 自己的答案是交给循环：他的提示词让循环提交、推送，「一没有构建和测试错误就打 tag」；他后来那篇 [everything is a ralph loop](https://ghuntley.com/loop/) 写的是一个循环自己修 bug、自动部署、再验证生效。前面说过，他只建议用在新项目上。新项目通常还没人依赖：一个还没人用的、随时可以扔掉的仓库，合并和打 tag 交给循环也无妨；一旦有人依赖它的结果就不行了，而这些教程没讲那时候该怎么变。

换成别人要依赖的仓库，就剩下三个问题：

1. 谁来评审。我这次实测里，写代码的会话写下了 DONE，只看规格和 diff 的会话给了 DO NOT MERGE。`/goal` 至少把「是否做完」交给了另一个模型判断，但它不对照规格审 diff。
2. 谁来合并、发版。用 Huntley 的提示词，循环自己推送、打 tag；用插件，循环里没人管这件事，最后落到恰好在场的人身上。`/goal` 和插件都不碰合并。
3. 什么时候该停下来问人。有些失败根本不在这次改动里，比如 `main` 本来就是红的。一个只会「测试不过就再试」的循环，分不清哪些失败是自己造成的。

## 有上限的循环，在生产里是什么样

Orbi 的 runner 驱动的是 Pi 编程 agent，不是 Claude Code；这里比的是循环外面的分工，和用哪个 agent 无关。runner 是一个出口写死的循环。写代码的会话只提交，不推送、不合并。评审会话在一个固定下来的提交（冻结提交）上审，能修的当场修，结论对应的是修完以后的那个提交。评审自己改的部分没有第三个会话再审，只靠 CI 和合并前检查把关。合并前检查再确认四件事：结论对应的还是 PR 现在的最新提交、这个提交包含最新的 `main`、CI 是绿的、GitHub 显示可以合并。评审最多五轮。

同一个失败连续出现三次，或者合并前检查发现某项失败在 `main` 上本来就是红的，runner 就给 Issue 打上 `ai-blocked`，写明原因，然后停下。CI 分诊是仓库里的一个工作流，PR 上的 CI 一失败就触发。它不看 `main`，只按失败特征（哪个工作流、哪个任务、在哪个分支上失败）把 Issue 打回去。拿失败和 `main` 对照，是合并前检查做的事，要等一轮评审结束后才跑。

[orbi#1554](https://github.com/orbi-build/orbi/issues/1554) 就走了这条路，而且走得并不完美。10 月 5 日凌晨 3 点 31 分（北京时间），Orbi 认领了它。CI 以同样的失败特征连续挂了两次，还没触发重复失败的门槛，每次仓库里的 CI 分诊流程都把 Issue 打回 `ai-fix-needed`（Orbi 用来表示「在同一个 PR 上再修一轮」的标签）。也就是说，前两轮它都把这个失败当成了自己的问题。4 点 22 分，合并前检查拿失败的检查去对照 `main`，发现失败的 macOS 兼容性检查在 `main` 上本来就是红的。这一项在目标分支上就过不了，只改这个 Issue 范围内的代码，CI 不会变绿，Orbi 停了：

<figure>
<img src="/img/ralph-1554-blocked.webp" alt="Orbi 在 Issue #1554 上的评论：blocked，等人决定，原因是合并前检查发现 main 在 macos-compatibility 检查上已经是红的">
<figcaption>修了两轮之后，合并前检查发现有一项失败的检查在 main 上本来就是红的，于是停下。</figcaption>
</figure>

当天 main 修好以后（[orbi#1552](https://github.com/orbi-build/orbi/issues/1552) 是其中一处修复），我在 13 点 39 分把它换回 `ai-fix-needed`，13 点 58 分合并，评审一轮，没有问题。像我那样的朴素 Ralph loop 只跑本地测试，根本看不到这个 CI 失败，本地 pytest 一绿就会写下 DONE。就算给它接上 CI，它里面也没有「拿失败去对照 `main`」这一步，没有任何东西会告诉它失败不是自己造成的。

给个量级：不算发版 Issue，我取了 Orbi 自己仓库里 9 月 28 日到 10 月 10 日 6 点（北京时间）之间合并的最近 40 张 Issue。其中 36 张既没被打回也没停过（评审当场修掉的问题不算打回）；剩下 4 张都中途停在过 `ai-blocked`，这 4 张里有 2 张还被打回修过，#1554 是这 2 张之一。只被打回、没停过的一张也没有。停下以后一直没合并的 Issue 不在这个数里。

## 什么时候适合用 Ralph loop

写新代码、规格短而能测、结果在别人依赖之前你会亲自看一遍，这时候用它很合适。但即便 textkit 只有 4 条规格、一开始就配了 15 个测试，单靠测试还是漏了一个 bug，所以测试之外还得有一道独立评审，人或另一个会话都行。

如果要无人值守地跑：

- 一定要设轮数上限。用插件就加 `--max-iterations`，自己写循环就加计数器。
- 每一轮都查退出码、`is_error` 和 `permission_denials`。
- 评审交给一个上下文干净的会话，评审意见当作下一轮的提示词。
- 不给循环推 `main` 的权限。给分支加保护，合并前要求检查通过、有人或会话评审过；失败在 `main` 上也出现时，让循环停下来问人。

Orbi 的 runner 把写代码、评审、合并分开：评审在独立会话里对照 Issue 和 diff 审，能修的当场修（它改的部分靠 CI 和合并前检查把关，没有另一个会话再审），合并由 runner 来做、不归 agent；发版走一张单独的发版 Issue，只有人能给它打上 `ai-release` 标签，所以一个里程碑什么时候发版由人决定。Pi 本身是开源的（[GitHub](https://github.com/earendil-works/pi)）。[runner 也是开源的](https://github.com/orbi-build/orbi)，也可以[把仓库接入 Orbi Cloud](https://orbi.build/zh/cloud/?ref=blog-ralph)，拿自己的 Issue 试一试。

## 相关

继续阅读：[Claude Code headless 模式下操作被拒，退出码还是 0](/zh/blog/run-claude-code-unattended/)、[Claude Code 跑完之后，谁来合并 PR](/zh/blog/claude-code-github-actions-who-merges/)、[Orbi 与 Claude Code 对比](/zh/compare/claude-code/) 与 [Cloud](/zh/cloud/)。
