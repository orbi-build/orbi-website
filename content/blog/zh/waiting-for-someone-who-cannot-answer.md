---
title: 我们的引擎在等一个用户给不出的答案
date: 2026-09-22
summary: 引擎为人的决定而暂停，却只接受托管租户给不出的答案。同一个缺口的三种形态，一个下午全部找出，附命令输出与数据库证据。
lang: zh
author: Orbi
image: /img/blog-waiting.png
mirror: waiting-for-someone-who-cannot-answer
---

有一类故障不像故障。没有崩溃，没有报错，系统完全按设计在运行——它在等。
而它等的那个人不知道自己被等着，也没有回应的手段。

这样的东西我们发布了三个。一个下午全找出来了，因为我们终于变成了自己的客户。

## 等待本身是对的

我们的引擎不会自己推进版本。里程碑关闭后，空闲 tick 会开一张票：这一版完了，
候选是这些，下一版发哪个。然后它停下。

这个锁是刻意的，我们不打算去掉。**发什么版本是产品决定。** 一个因为上一版装满了
就自己选下一个版本号的引擎，是把计数器当成了判断。

所以票是对的，停也是对的。错的是票里那句话：

> 请人工运行 `orbi milestone set <目标版本>` 推进 `active_milestone`。

这条指引假定你有 CLI、有宿主机的 shell。托管租户两样都没有——沙箱跑在我们的机器上，
这正是托管的含义。引擎在一张租户看得见的票上提了问题，却只接受一种他产不出的答案。

更糟的是，托管沙箱压根不渲染 `auto_next_milestone = false`，所以**连那张票都不会开**。
引擎静默地停下，等一个从来没人被告知要做的决定。

## 我们撞上它的那天

2026-09-22，我们把 `orbi-build/orbi`——引擎自己的仓库——迁进了自家的托管沙箱。
当天上午它就从那个沙箱发布了 v0.5.39。

然后里程碑关闭，一切停止。没有通知，没有报错。交付就是不动了，
直到有人发现，手工用 `gh api` 建出 v0.5.40，再直接编辑策略文件。

这个缺口我们已经在生产上让客户扛了一段时间。直到把自己的发版线放到它后面，才感觉到。

## 同一个形状，在界面上

同一天稍晚，一次完整的产品走查——注册、装 App、绑仓库、开通沙箱、开 Issue、
交付、合并、发版——暴露了第二个实例。

状态页有一个发版表单。它是一个文本框。你凭记忆敲一个版本号，那个字符串就成了发版范围。

页面从不告诉你有哪些里程碑。我们查了：
`grep -rn "milestone" src/pages/status.ts src/page.ts` 零命中。一行都没有。
而在同一个文件往前六百行，页面对 Issue 是这么做的：

> 这些 Issue 还没有交给 Orbi：给 Issue 打上 ai-ready 标签，Orbi 就会开始处理。

**页面已经在替你扫 GitHub 并列出你能操作的东西了。** 只是这份好意从没延伸到里程碑。
于是你敲一个记得一半的版本号，敲错了也没人告诉你——拒绝发生在异步的引擎侧，
在一张你得自己去找的票上。

## 同一个形状，在配置里

第三个实例解释了前两个。

引擎每个 tick 都会把当前里程碑写进仓库变量。这个值来自 `config.active_milestone`——
它住在沙箱自己的 `orbi.toml` 文件里。不是 GitHub，不是我们的控制面。

所以控制面可以建出一张 release 票，而沙箱仍然认为什么都没在跑。两个系统，两个答案，
没有对账。在我们的生产日志里，每个 tick 一次，针对我们刚走查过的那个仓库：

```
INFO active_milestone_variable_absent repo=orbi-build/orbi-beta-e2e-org-09182001
```

然后我们去看一个字段是怎么从控制面进到那个文件的，发现**根本没有通用机制**。
有四个各自手写的同步函数——`sync_orbi_toml_engine_track`、`sync_orbi_toml_providers`、
`sync_orbi_toml_oauth`，加上初次渲染——每个为一个字段而加，每个都 stage 一个临时文件
再原子替换。注释记录了这个累积过程：

```bash
# Issue #116: the connect-time base branch rides the payload and must reach
#             the rendered orbi.toml
# Issue #770: attribution_footer rides the same way
```

加一个字段要改四个文件。所以没人加 `active_milestone`：
`grep -rn "active_milestone" src/*.ts host-provisioner/*.sh` 零命中。
**控制面不知道这个字段存在。**

## 租户能碰什么，不能碰什么

有一个设计问题，我们一看文件系统就自己解决了。

本来我们要为「租户手工改了托管字段怎么办」设计合并语义。然后查了一下：

```console
$ sudo ls -la /home/<sandbox>/orbi/orbi.toml
-rw------- 1 orbi-... orbi-... 926 Sep 22 06:39 orbi.toml

$ sudo ls -la /home/<sandbox>/.ssh/
-rw------- ... id_ed25519       # 出站 deploy key
-rw-r--r-- ... id_ed25519.pub
-rw------- ... known_hosts
                                # 没有 authorized_keys
```

`0600`、属主是沙箱用户、没有 `authorized_keys`。**租户连 SSH 都进不去。**
没有手改需要对账。

这让设计比我们假设的更简单：控制面是唯一写者，合并只需保留**其他控制面字段**，
不存在外部 drift。它还指向一条更强的不变式值得守住：`orbi.toml` 应该是纯派生产物，
能仅凭控制面状态完整重建。今天它不是。engine track 和 providers 只活在沙箱里，
控制面手里是部分真相。那四个同步函数各自维护着真相的一个碎片。

## 拉还是推，也自己解决了

配置下发到沙箱，直觉上的取舍是拉（沙箱定时问）还是推（控制面主动触发）。

推意味着给沙箱主机开入站通道，拉意味着最多一个刷新周期的延迟。
常规做法是在延迟与攻击面之间权衡。

但那个周期已经是一分钟：

```console
$ systemctl cat orbi-cloud-provisioner.timer | grep OnUnit
OnUnitActiveSec=1min
```

而且刷新端点的查询是 `WHERE r.status = 'active' AND t.status = 'active'`——
**每个活跃沙箱每分钟都过一遍**，不只是待开通的。所以拉最多costs 六十秒，
而这个动作本来就要等引擎下一次认领。**没有取舍可权衡。**
推会为了省不到一分钟而开一条入站路径。

先量再吵，花了两条命令。

## 一个被数据库纠正的错误诊断

读生产日志时我们发现六小时内 288 条一模一样的错误：

```
ERROR milestone_reconcile_failed repo=zzuu080603/VCPToolBox-macOS
subprocess.CalledProcessError: ... /milestones?state=all ... exit status 1
```

直觉读法是凭据失效，我们就是这么写进票里的。在沙箱内复现拿到
`401 Bad credentials`——看起来更坐实了，尤其那个仓是 public、用维护者 token 读得到。

然后我们查了数据库，诊断当场塌掉：

```
login=cdredfox    tenant=inactive  codeduck          repo=inactive
login=zzuu080603  tenant=active    VCPToolBox-macOS  repo=inactive   ← 报错的
login=zzuu080603  tenant=active    Tianshu-harness   repo=active     ← 正常的
```

两个报错的沙箱对应的仓库都是 **inactive**。刷新端点按 `status = 'active'` 过滤，
所以这些 token 从来不会被刷新——这是设计，而且是对的。**同一个租户的 active 仓库完全正常。**
对照组就摆在同一个查询结果里。

真正的缺陷从来不是凭据。是我们对已经关掉的仓库还在做里程碑对账，永远地，每 tick 一次。
那个 401 是一条正确的策略撞上一个本该停下的循环的症状。

**先读报错，再读数据——顺序反了，** 我们就是反着做的，于是开了一张根因写错的票，
后来不得不公开订正。

## 三者的共同点

三个缺陷，一个形状：**系统知道一件用户需要知道的事，而没有说出来。**

它知道有哪些里程碑，却让你凭记忆敲一个。它知道有一个决定悬着，
却让你去用一个你没有的 CLI。它知道控制面的意图，却让沙箱握着另一个答案。

三个都不报错，因为三个都不是错误。每个组件都在正常工作。
缺口在组件之间，在那个「本该有人被递过来一样东西，却没有」的空隙里。

这个空隙从代码内部看不见。你 grep 不到它，测试也不会因为它失败，因为没有任何东西坏了。
找到它的办法是站到用户站的位置——对我们来说，就是把自己的发版线搬到自家产品上，
然后等它停。

它四个小时就停了。

---

*相关票，全部开于 2026-09-22：
[orbi-cloud#878](https://github.com/orbi-build/orbi-cloud/issues/878)（托管租户没有决定通路）、
[orbi-cloud#869](https://github.com/orbi-build/orbi-cloud/issues/869)（界面列出里程碑）、
[orbi-cloud#870](https://github.com/orbi-build/orbi-cloud/issues/870)（通用配置下发，
而不是第五个手写同步函数）、
[orbi#1283](https://github.com/orbi-build/orbi/issues/1283)（根因一开始写错的那张）。*
