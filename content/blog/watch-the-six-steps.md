---
title: Watch the seven steps, start to finish
date: 2026-09-21
summary: An 83-second video follows the real Orbi Cloud setup from GitHub sign-in to a tagged release and subscription. The seventh step starts paid delivery for Cloud.
lang: en
author: Orbi
image: /img/blog-watch-six-steps.png
video_name: Orbi Cloud setup from zero to a tagged release in seven steps
video_description: An 83-second walkthrough of the seven-step Orbi Cloud setup from GitHub sign-in through subscription.
video_thumbnail: /img/blog-watch-six-steps.png
video_upload_date: 2026-09-21
video_duration: PT1M23S
video_embed_url: https://www.youtube.com/embed/_OEaBwrLvvs
---

There is now a video of the whole setup: [Orbi Cloud: from zero to a tagged release in seven steps](https://www.youtube.com/watch?v=_OEaBwrLvvs). It runs 83 seconds, it is in English, and it has chapters, so you can jump to the step you are stuck on.

<figure class="post-media"><iframe src="https://www.youtube.com/embed/_OEaBwrLvvs" title="Orbi Cloud setup from zero to subscription in seven steps" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe><figcaption>Watch the complete seven-step Orbi Cloud setup.</figcaption></figure>

### Seven key screens from the seven-step flow

<figure class="post-media">
<img src="/img/step-1-sign-in.png" alt="Orbi Cloud sign-in screen" width="2560" height="1440" srcset="/img/step-1-sign-in.png 1x, /img/step-1-sign-in-2x.png 2x" sizes="(min-width: 900px) 784px, 100vw" loading="eager">
<figcaption>Step 1: Orbi Cloud sign-in screen.</figcaption>
</figure>

<figure class="post-media">
<img src="/img/step-2-install-app.png" alt="GitHub App installation screen" width="2560" height="1440" srcset="/img/step-2-install-app.png 1x, /img/step-2-install-app-2x.png 2x" sizes="(min-width: 900px) 784px, 100vw" loading="eager">
<figcaption>Step 2: GitHub App installation screen.</figcaption>
</figure>

<figure class="post-media">
<img src="/img/step-3-connect-repo.png" alt="Repository connection form" width="2560" height="1440" srcset="/img/step-3-connect-repo.png 1x, /img/step-3-connect-repo-2x.png 2x" sizes="(min-width: 900px) 784px, 100vw">
<figcaption>Step 3: Repository connection form.</figcaption>
</figure>

<figure class="post-media">
<img src="/img/step-4-provision.png" alt="Environment provisioning status" width="2560" height="1440" srcset="/img/step-4-provision.png 1x, /img/step-4-provision-2x.png 2x" sizes="(min-width: 900px) 784px, 100vw">
<figcaption>Step 4: Environment provisioning status.</figcaption>
</figure>

<figure class="post-media">
<img src="/img/step-5-first-issue.png" alt="First Issue status screen" width="2560" height="1440" srcset="/img/step-5-first-issue.png 1x, /img/step-5-first-issue-2x.png 2x" sizes="(min-width: 900px) 784px, 100vw">
<figcaption>Step 5: First Issue status screen.</figcaption>
</figure>

<figure class="post-media">
<img src="/img/step-6-release.png" alt="Release form with version field" width="2560" height="1440" srcset="/img/step-6-release.png 1x, /img/step-6-release-2x.png 2x" sizes="(min-width: 900px) 784px, 100vw">
<figcaption>Step 6: Release form with version field.</figcaption>
</figure>

<figure class="post-media">
<img src="/img/step-7-subscribe.png" alt="Managed Cloud subscription screen" width="2560" height="1440" srcset="/img/step-7-subscribe.png 1x, /img/step-7-subscribe-2x.png 2x" sizes="(min-width: 900px) 784px, 100vw">
<figcaption>Step 7: Managed Cloud subscription screen.</figcaption>
</figure>

The seven steps are the current Cloud onboarding path:

1. **Sign in** with your GitHub identity.
2. **Install the Orbi GitHub App** on your account.
3. **Connect a repository** — the repo and the base branch Orbi works from.
4. **Provision the environment.** About a minute.
5. **Your first Issue.** Label it `ai-ready`, and Orbi writes the code and opens a pull request.
6. **Cut a release.** Type the version; Orbi bumps it, tags it and publishes the GitHub Release.
7. **Subscribe.** The first `__FREE_DELIVERIES__` deliveries are free; then the plan is US$`__CLOUD_MONTHLY_USD__`/month with `__INCLUDED_TOKENS__` tokens included. When the allowance runs out, only new deliveries pause: your data stays intact, and you can cancel at any time.

## The seventh step is the one that starts paid delivery

Steps one through six are setup and delivery: you are handing Orbi the things it cannot infer — an identity, an installation, a repository, a runtime, an Issue, and a release. Step seven is where you opt into the Managed Cloud plan after the `__FREE_DELIVERIES__` free deliveries.

The release step still requires your decision: *you decide the version, Orbi never increments it for you.* The runner will bump the version file, create the tag and publish the Release. It will not choose the number. A version is a claim about what changed and who should care — that is a product decision, and reading it off a counter would be pretending otherwise. The release scope comes from the Milestone carrying that exact title; without one, the release stops at scope derivation and tells you why.

Step five is one label, and you can add it without leaving the terminal:

```bash
gh issue edit <number> --add-label ai-ready
```

## What you are actually looking at

Every screen in the video is the product rendering, not a mockup: the sign-in card, the connect form with its repository and base-branch fields, the progress bar counting the step you are on, the connected-repository table with its provisioning status, the release form with the version box, and the subscription step. The GitHub App page is the real one at [github.com/apps/orbi-build](https://github.com/apps/orbi-build).

If you want to read instead of watch, the same path is in the docs: [docs.orbi.build](https://docs.orbi.build). If you want to run the whole thing on your own machine instead of ours, that is the same product, [free to self-host](https://github.com/orbi-build/orbi).

Start here: [orbi.build/cloud](https://orbi.build/cloud/?ref=blog-seven-steps).
