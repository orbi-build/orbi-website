---
title: Watch the seven steps, start to finish
date: 2026-09-21
summary: An 83-second video of the whole Orbi Cloud setup, from signing in with GitHub to subscribing after a tagged release. Every frame is the real product, and the seventh step is the one that starts paid delivery.
lang: en
---

There is now a video of the whole setup: [Orbi Cloud: from zero to a tagged release in seven steps](https://www.youtube.com/watch?v=_OEaBwrLvvs). It runs 83 seconds, it is in English, and it has chapters, so you can jump to the step you are stuck on.

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
