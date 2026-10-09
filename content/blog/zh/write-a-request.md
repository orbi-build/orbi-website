---
title: 写需求：说一句话，Orbi Cloud 替你写好 GitHub Issue
date: 2026-10-09
summary: 在 Orbi Cloud 里说一句想改什么，Orbi 先读你的仓库，写出 Issue 草稿，要你决定的地方用选择题问你，你确认后才开始做。每一步都配了截图。
lang: zh
author: Lawrence Liu
image: /img/blog-write-request-card.png
mirror: write-a-request
---

Orbi Cloud 新上的「写需求」，让你不用自己写 Issue：用一两句话说想改什么，Orbi 先读你的仓库，写出 Issue 草稿，要你决定的地方做成选择题问你。你看过草稿、点了「交给 Orbi 开始做」，GitHub 上才会建出 Issue。

Orbi 是 agent 时代的软件黑灯工厂：GitHub Issue 进去，评审过、合并好的改动出来；另开一张发版票，Orbi 再把合并的改动打成带 tag 的版本，产线上不用人盯着。写代码的编程 agent 只是其中一个工位，在隔离的工作区里干活；另一个没参与写代码的 AI 会话负责评审 PR；从认领打了 `ai-ready` 标签的 Issue，到合并、打版本，整条产线由 Orbi 来管。Orbi Cloud 就是我们替你运营的这座工厂。CI 和评审通过后，Orbi 默认自己合并；在 GitHub 上给分支设成合并前需要 1 个批准，它就会等你批准再合。

我是 Lawrence Liu，Orbi 的维护者。截图是 10 月 8 日和 9 日在 beta.orbi.build 的测试仓库 `xqliu/orbi-e2e-2609260042` 里实拍的，来自几个不同的需求，图注写了来源；功能在 orbi.build 上也已上线。想看一个需求从一句话一直走到合并，[英文版](/blog/write-a-request/)里有完整的例子。只想查用法，看文档里的[写需求](https://cloud-docs.orbi.build/zh/write-a-requirement)一页。

## 为什么让 Orbi 来写 Issue

Orbi 照着 Issue 做事。Issue 只有一句话，Orbi 就得自己猜：改哪个文件、要什么行为、做到什么算完。猜错了，就得先把需求补清楚：还没合并的 PR 可以接着改，已经合并的改动可能要回滚。

把 Issue 写清楚，通常得先看懂代码。写需求让 Orbi 先读代码再动笔，所以草稿里写的是真实的文件路径、行号和会跑的测试。它发现的分叉会在写代码之前做成选择题问你。没问到的判断，作为假设写在回复里。

## 在哪里写需求

用 GitHub 登录、连接仓库之后，你会进到状态页，上面列着你连接的仓库和 Orbi 手上的任务，有一个「写需求」按钮。每个连接的仓库算一个项目，连了好几个的话，用「切换项目」选一个。这一页像聊天：你说一句，Orbi 回一段，可以接着往下聊。

<figure class="post-media">
<img src="/img/blog-write-request-zh-entry.webp" alt="写需求页：「说说你想改什么」下面是输入框、「让 Orbi 写草稿」按钮和三个例子；最上面一行写着上一个需求和它的状态，右侧是「查看结果」按钮。" width="1200" height="989">
<figcaption>写需求入口。最上面那一行是这个项目上一个交给 Orbi 的需求：新增 bug 反馈 Issue 模板（英文版里的例子），所以标题是英文。</figcaption>
</figure>

想改什么就直接写：加功能、修 bug、改文字都行，一句话就够。你用中文写，Issue 就用中文写，除非仓库的 AGENTS.md 或 CONTRIBUTING.md 另有语言要求。有两处例外：Issue 第一行写明谁提交的，这一行是程序固定写进去的，目前不管你用什么语言写都是中文；小节标题偶尔会是英文。

## Orbi 读代码的时候

点「让 Orbi 写草稿」之后，页面上有两个阶段，旁边有计时。「看懂你的项目」下面会列出 Orbi 看过的文件和正在看的文件；「对照你的原话检查」是 Orbi 拿写好的草稿回头和你那句话对一遍，看有没有跑偏。

<figure class="post-media">
<img src="/img/blog-write-request-zh-working.webp" alt="Orbi 正在写草稿，已写 0:48。「看懂你的项目」下面：看过 CHANGELOG.md，正在看 .gitignore。" width="1200" height="916">
<figcaption>第 48 秒。这个需求交出去后成了 Issue #77，加了一个「功能建议」Issue 模板，下文 README 那个需求提到的就是它。</figcaption>
</figure>

一份草稿一般要 1 到 2 分钟。页面可以关掉，草稿从最后一次修改起保留 7 天。回来时从状态页点「写需求」，再点「打开草稿」就能接着看。每个项目同时只有一份草稿，写新的需求会替换它。

## 它先告诉你代码里已经有什么

这次的需求是：在 README 的「如何贡献」里补一句，提功能建议请用新的「功能建议」模板。Orbi 读完仓库，先把现状说清楚：这句话其实已经写在「如何贡献」第 2 条的末尾（第 26 到 28 行），模板文件也已经在了，只是这句提示埋在讲另一个模板的段落里，不容易看到。

<figure class="post-media">
<img src="/img/blog-write-request-zh-reply.webp" alt="Orbi 的回复：第一句说这份改动会让 README 的「如何贡献」里出现一条独立、一眼可见的提示；接着列出它在确认现状时发现的两点，包括这句话已经在第 26 到 28 行；最后写明它的假设。" width="1200" height="989">
<figcaption>回复的第一句用大白话说改完会有什么不同，后面是它查到的现状和它做的假设。</figcaption>
</figure>

所以草稿只是把已有的那句提出来单列一条，下面的选择题里也有「不改」。

## 草稿长什么样

回复下面是草稿本身，交给 Orbi 之后它就是那张 Issue 的正文。开头是你的原话，接着是「当前状态」：哪个文件、第几行、现在写的是什么、哪些测试覆盖相关文件（这里是两条检查模板内容的测试），都写成能直接核对的样子。再往下是用户能看到的结果、验收条件、评审要看的证据，以及 Orbi 有意不做的相关改动。草稿长的话先折叠，点「展开全文」看全部。

<figure class="post-media">
<img src="/img/blog-write-request-zh-draft.webp" alt="需求草稿卡片：标题「README「如何贡献」：把「功能建议」模板提示单列一句」，下面是「需求」原话和「当前状态」，当前状态里引用了「如何贡献」一节第 16 到 29 行、那句提示所在的第 26 到 28 行、模板文件路径和两个内容检查的测试名。" width="1200" height="989">
<figcaption>草稿开头的「需求」和「当前状态」。</figcaption>
</figure>

## 拿不准的地方，它会问

草稿下面，「Orbi 先替你选好了下面几项」列着它发现、需要你决定的地方。每道题 2 到 4 个选项，外加一个可以自己写的「其他（自己写）」；Orbi 已经替你选好了推荐项，草稿也是按推荐项写的。推荐项没问题，就什么都不用动，直接交给 Orbi。如果一句话太含糊、连草稿都没法写，Orbi 会先只提问，你选完再点「按选项写草稿」。

<figure class="post-media">
<img src="/img/blog-write-request-zh-questions.webp" alt="选择题「处理方式」：README 第 2 条末尾其实已经写了这句，你希望怎么处理？选项有「提为独立一条（推荐）」「保持现状，不改 README」「改到 CONTRIBUTING.md」和「其他（自己写）」。第二道题问原来那段说明怎么处理。" width="1200" height="989">
<figcaption>推荐项排在第一个，草稿就是按它写的。</figcaption>
</figure>

选项不合适就换一个。改了选项之后，按钮会变成「按选项重写草稿」，重写完成之前，「交给 Orbi 开始做」是灰的。改了又后悔，点「恢复原来的选择」，输入框里还没发出的话也会一起清掉。

草稿本身不能直接手改；选项里没有的要求，写在草稿下方的输入框里（「要补充或修改，写在这里」），Orbi 重写时会带着你在输入框里说过的所有话。

## 交给 Orbi 之前看清楚

「交给 Orbi 开始做」按钮下面有几行字，说明交出去以后会发生什么。其中讲合并的那句，写成什么样取决于任务要合入的分支是否要求合并前至少 1 个批准。这个分支是连接仓库时设的，一般就是默认分支。

- 没要求批准（测试仓库就是这样）：「Orbi 自检通过后会直接合并。想先看再合并，可以在 GitHub 给仓库设置合并前需要 1 个批准」。
- 要求批准：自检通过后，等你在 GitHub 批准 PR 再合并。
- 页面读不到设置：只写「改好后 Orbi 先自己检查，通过才合并到项目」，不说会不会等你批准。

「自检」指你仓库的 CI 加上 Orbi 自己的评审。

<figure class="post-media">
<img src="/img/blog-write-request-zh-handoff.webp" alt="「交给 Orbi 开始做」按钮下面：会在你的 GitHub 仓库里建一个 Issue，Orbi 照它去做。Orbi 自检通过后会直接合并。想先看再合并，可以在 GitHub 给仓库设置合并前需要 1 个批准（怎么设置）。再下面一行说明免费次数已经用完。" width="1200" height="989">
<figcaption>这张还是上面 README 那个需求。截图时测试账户的免费次数刚好用完，所以最后多了一行：现在交给 Orbi 也行，Issue 会先建好，订阅后才能开工。这个需求我们没有交出去。</figcaption>
</figure>

Orbi 的评审会读改动、要求修改，但它不是 GitHub 上的那种批准。Orbi 不会批准自己的 PR，所以要求 1 个批准的仓库里，任务会停在「等你批准」，你批准后它才合并。「怎么设置」链到 GitHub 讲分支保护规则的官方文档。

## 交给 Orbi 以后

交给 Orbi 会在你的仓库里建一张普通的 Issue：第一行写明是你通过 Orbi 提交的，后面就是你认可的那份草稿，一字不改。页面不跳走，草稿那一块变成一张任务卡片，会自己更新。

<figure class="post-media">
<img src="/img/blog-write-request-zh-handed-off.webp" alt="已交给 Orbi：接入 Stripe 付款并在 CI 里验证一笔真实扣款。状态：一般 1 分钟内开始。按钮：在 GitHub 查看（Issue #69）、再写一个需求。" width="1200" height="717">
<figcaption>刚交给 Orbi 的样子，Issue #69。按 Issue 里写明的要求，它在现有的 CI workflow 里加了一个只在手动触发时才跑的 job 来做真实扣款，平常的 CI 不跑这一步，所以是绿的，后来顺利合并了。测试仓库没配密钥，从没真扣过钱。</figcaption>
</figure>

顺利的话，状态先显示「一般 1 分钟内开始」，然后依次是「排队中」「进行中」「Orbi 检查中」，最后「已完成」。要求批准的仓库中间会多一步「等你批准」，出了问题会变成「卡住了」（见下一节）。[英文版](/blog/write-a-request/)里那个例子是新增一个 bug 反馈 Issue 模板，从交出到合并大约 7 分钟。10 月 9 日 00:20 交出，00:24 开出 PR，00:27 合并（北京时间），改动是一个 19 行的模板文件。

<figure class="post-media">
<img src="/img/blog-write-request-zh-done.webp" alt="已完成：README：新增一行联系方式「邮箱：support@orbi.build」。已合并到项目。什么时候生效，取决于你的项目怎么发布或部署。按钮：查看改动（PR #60）、再写一个需求。" width="1200" height="666">
<figcaption>已完成的样子，PR #60：README 里加一行联系方式。可以直接点去看合并的 PR。</figcaption>
</figure>

离开再回来，写需求页最上面那一行会显示上一个需求和它现在的状态，点「查看结果」就能重新打开这张卡片。所有任务也都能在状态页上看到。

## 卡住的时候

下面这个任务（Issue #71）和 #69 一样涉及 Stripe，但扣款验证放进了每次 CI，是故意造来失败的：要求 CI 每次 push 和 PR 都跑一次 Stripe 扣款验证，密钥从仓库 secret 里读、付款方式从仓库变量里读，缺密钥就让 CI 失败。测试仓库里这些都没有。

新加的检查照 Issue 的要求做了：没配密钥就失败，CI 一直是红的，而 Orbi 不会在 CI 红的时候合并。草稿里列出了这项检查需要的 secret 和变量，但写需求不会替你核对它们配好没有。检查失败后，Orbi 的评审把任务停下来等人决定，Issue 被打上 `ai-blocked` 标签。Orbi 没有为了让 CI 变绿去删检查或改测试，PR 里它们都原样留着。

<figure class="post-media">
<img src="/img/blog-write-request-zh-blocked.webp" alt="卡住了：CI 在 push 和 PR 上执行 Stripe 扣款验证，密钥取自仓库 secret STRIPE_SECRET_KEY，缺密钥时直接失败。Orbi 已停下：有件事需要你拿主意。改动没有合并到项目。不算免费次数。联系我们：Telegram 群、support@orbi.build。按钮：查看 Orbi 的说明、再写一个需求。" width="1200" height="721">
<figcaption>卡住的任务，主按钮直达 Orbi 的说明。</figcaption>
</figure>

卡片上没写具体原因，点「查看 Orbi 的说明」会打开 Orbi 在 Issue 里写的[那条评论](https://github.com/xqliu/orbi-e2e-2609260042/issues/71#issuecomment-6063352853)，原因在那里：缺 Stripe 密钥。这次它给了两条路：按 Issue 的要求，把 Stripe 密钥配成仓库 secret、付款方式配成仓库变量；或者改掉 Issue 里「缺密钥就必须让 CI 失败」这条决定。不管选哪条，卡住的任务都不会自己接着做：重跑 CI、只摘掉 `ai-blocked` 标签或者留评论都没用。

先把原因修好，再在 Issue 上换标签（Issue 得是打开的）：PR 还开着的，把 `ai-blocked` 换成 `ai-fix-needed`，Orbi 在原来的 PR 和分支上接着改；还没有 PR 的，换成 `ai-ready`。

这个任务我们没有恢复：它是故意造的失败，测完就把 [Issue #71](https://github.com/xqliu/orbi-e2e-2609260042/issues/71) 和它的 PR 关掉了。

## 要花多少

免费试用有 \_\_FREE\_DELIVERIES\_\_ 次交付。失败的、卡住的（比如上面那个，卡片上也写着「不算免费次数」）、没合并就结束的都不占次数，只有合并了的才算。写草稿不占免费交付次数。

免费次数用完后照样能写草稿。这时交给 Orbi 会马上建好 Issue，但 Orbi 随即摘掉它的 `ai-ready` 标签，并在 Issue 里留言说明原因。订阅后到状态页，点这个 Issue 旁边的「试试 →」，它会给 Issue 打上 `ai-ready`，Orbi 这才开始做。这个按钮只在没有别的任务在跑时列出来。有任务在跑，就等它结束，或者直接在 GitHub 上给这个 Issue 打 `ai-ready`。

按月付费的话，Solo 每月 US$\_\_SOLO\_MONTHLY\_USD\_\_（含 \_\_SOLO\_INCLUDED\_TOKENS\_\_ tokens 模型用量），Pro 每月 US$\_\_CLOUD\_MONTHLY\_USD\_\_（含 \_\_INCLUDED\_TOKENS\_\_ tokens）。写草稿和交付一样计入每月用量。当月用量用完后，新草稿和新交付都会暂停（进行中的会做完），下个月 1 号恢复（按 UTC 算月份），不会额外扣钱。接了自己模型 API key 的账户不受这个限制。详情看 [Orbi Cloud 页面](/zh/cloud/?ref=blog-write-request)。

## 什么时候自己写 Issue 更快

你已经清楚要改什么、也知道怎么验收，那直接在 GitHub 上建 Issue、打上 `ai-ready` 标签更快。你知道要解决什么问题、但不知道它落在代码哪里，或者想在动工前先让 Orbi 把需要你决定的问题列出来，这时用写需求。

三个让草稿更好用的习惯：

- 先说你想要的结果。比如写「提建议的人要写清楚想解决什么问题」这样一句，Orbi 会自己在代码里找最合适的改法；你已经知道要改哪个文件、有什么限制，也一并写上。
- 一次只提一件事。Orbi 动工前会先检查 Issue，它判断一张票里塞了几件不相干的事时，会在 Issue 里留言让你拆开，任务先停着；拆开后重新打上 `ai-ready`。这一步是模型的判断，不保证每次都能拦下。
- 交给 Orbi 之前，读一读回复里写的假设。读偏了，在输入框里补一句就行。

## 相关

- [写需求](https://cloud-docs.orbi.build/zh/write-a-requirement)：Cloud 文档里的用法说明
- [ai-ready: 12 factors for unattended software delivery](/aiready/)（英文）：什么样的 Issue 能被可靠交付
- [AI agent：从 GitHub Issue 到合并与发版](/zh/guides/issue-to-release/)：整条交付流程的专题
- [Orbi 和编程 agent 的对比](/zh/compare/)
- [Orbi Cloud 套餐](/zh/cloud/)
