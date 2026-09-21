---
title: Watch the six steps, start to finish
date: 2026-09-21
summary: A 66-second video of the whole Orbi Cloud setup, from signing in with GitHub to cutting a tagged release. Every frame is the real product, and the sixth step is the one the engine will not do for you.
lang: en
author: Orbi
image: /img/blog-watch-six-steps.png
video_name: Orbi Cloud setup from zero to a tagged release
video_description: A 66-second walkthrough of the Orbi Cloud setup from GitHub sign-in to a tagged release.
video_thumbnail: /img/blog-watch-six-steps.png
video_upload_date: 2026-09-21
video_duration: PT1M6S
video_embed_url: https://www.youtube.com/embed/4rOzCMwiXhI
---

There is now a video of the whole setup: [Orbi Cloud: from zero to a tagged release in six steps](https://www.youtube.com/watch?v=4rOzCMwiXhI). It runs 66 seconds, it is in English, and it has chapters, so you can jump to the step you are stuck on.

<figure class="post-media"><iframe src="https://www.youtube.com/embed/4rOzCMwiXhI" title="Orbi Cloud setup from zero to a tagged release" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe><figcaption>Watch the complete Orbi Cloud setup.</figcaption></figure>

### The six screens

<figure class="post-media"><img src="/img/step-1-sign-in.png" alt="Orbi Cloud sign-in screen" loading="lazy"><figcaption>Step 1: Orbi Cloud sign-in screen.</figcaption></figure>

<figure class="post-media"><img src="/img/step-2-install-app.png" alt="GitHub App installation screen" loading="lazy"><figcaption>Step 2: GitHub App installation screen.</figcaption></figure>

<figure class="post-media"><img src="/img/step-3-connect-repo.png" alt="Repository connection form" loading="lazy"><figcaption>Step 3: Repository connection form.</figcaption></figure>

<figure class="post-media"><img src="/img/step-4-provision.png" alt="Environment provisioning status" loading="lazy"><figcaption>Step 4: Environment provisioning status.</figcaption></figure>

<figure class="post-media"><img src="/img/step-5-first-issue.png" alt="First Issue status screen" loading="lazy"><figcaption>Step 5: First Issue status screen.</figcaption></figure>

<figure class="post-media"><img src="/img/step-6-release.png" alt="Release form with version field" loading="lazy"><figcaption>Step 6: Release form with version field.</figcaption></figure>


The six steps are the same six the status page counts:

1. **Sign in** with your GitHub identity.
2. **Install the Orbi GitHub App** on your account.
3. **Connect a repository** — the repo and the base branch Orbi works from.
4. **Provision the environment.** About a minute.
5. **Your first Issue.** Label it `ai-ready`, and Orbi writes the code and opens a pull request.
6. **Cut a release.** Type the version; Orbi bumps it, tags it and publishes the GitHub Release.

## The sixth step is a decision, not a button

Steps one through five are setup: you are handing Orbi the things it cannot infer — an identity, an installation, a repository, a runtime. Step five is where it starts working on its own.

Step six is different, and the video says so out loud: *you decide the version, Orbi never increments it for you.* The runner will bump the version file, create the tag and publish the Release. It will not choose the number. A version is a claim about what changed and who should care — that is a product decision, and reading it off a counter would be pretending otherwise. The release scope comes from the Milestone carrying that exact title; without one, the release stops at scope derivation and tells you why.

That is also why the step exists at all in the onboarding bar. An engine that silently tagged releases would be easier to demo and worse to operate.

Step five is one label, and you can add it without leaving the terminal:

```bash
gh issue edit <number> --add-label ai-ready
```

## What you are actually looking at

Every screen in the video is the product rendering, not a mockup: the sign-in card, the connect form with its repository and base-branch fields, the progress bar counting the step you are on, the connected-repository table with its provisioning status, the release form with the version box. The GitHub App page is the real one at [github.com/apps/orbi-build](https://github.com/apps/orbi-build).

If you want to read instead of watch, the same path is in the docs: [docs.orbi.build](https://docs.orbi.build). If you want to run the whole thing on your own machine instead of ours, that is the same product, [open source and self-hostable](https://github.com/orbi-build/orbi).

Start here: [orbi.build/cloud](https://orbi.build/cloud/?ref=blog-six-steps).
