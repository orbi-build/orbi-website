---
title: Why Orbi is open source again
date: 2026-09-24
summary: Orbi began on Apache-2.0 and switched to the Sustainable Use License on Sep 4. From v0.5.44 it is AGPL-3.0, or the SUL if AGPL is ruled out. Here is why.
lang: en
author: Orbi
image: /img/blog-agpl.png
mirror: orbi-is-open-source-again
---

As of [v0.5.44](https://github.com/orbi-build/orbi/releases/tag/v0.5.44), released on September 24, Orbi is licensed under **AGPL-3.0, or the Sustainable Use License (SUL) v1.0**. You pick one. Self-hosting is free under either, and GitHub now reports the repository's license as AGPL-3.0.

This is the second license change in a month, so here is the whole history and the reasoning behind each step.

### The timeline

| Date | License | Where |
|---|---|---|
| Aug 26 | Apache-2.0 | [#81](https://github.com/orbi-build/orbi/issues/81) added the LICENSE file |
| Sep 4 | Sustainable Use License v1.0 | commit [365c5bc](https://github.com/orbi-build/orbi/commit/365c5bc) |
| Sep 24 | AGPL-3.0 or SUL v1.0 | [#1332](https://github.com/orbi-build/orbi/issues/1332), shipped in v0.5.44 |

### Why we left Apache on September 4

Apache-2.0 lets anyone take the code and sell it as a hosted service. Orbi's runner is meant to run on your own machine, and the SUL draws its line in the same place: free for your own use, a separate agreement if you resell it as a service. It is the license n8n uses, and its restriction and patent clauses were copied word for word.

Timing mattered too. The repository was ten days old and had a single copyright holder, so the change needed one person's agreement. The commit also added a relicensing clause to `CONTRIBUTING.md`. Contributors agree that their work may be released under a different license later, **provided that license continues to allow self-hosted use free of charge**.

### What the Sustainable Use License cost us

The SUL is not an OSI-approved license, so Orbi could not be described as open source. That turned out to matter more than we expected.

Several lists that fit Orbi accept only open source projects. [kyrolabs/awesome-agents](https://github.com/kyrolabs/awesome-agents/blob/main/CONTRIBUTING.md) says a contribution "needs to be open source". [Awesome-AI-Agents](https://github.com/Jenqyang/Awesome-AI-Agents/blob/main/CONTRIBUTING.md) says licenses that only make the source public "will usually be rejected". Everywhere else, every description of Orbi needed the same footnote: the source is public and self-hosting is free, but it is not OSI open source.

### Why AGPL, and why keep the SUL

AGPL-3.0 is OSI-approved. It also has a network clause: if you modify Orbi and offer it to others as a service, you have to publish your changes under the same license. It does not stop anyone from running an unmodified Orbi as a service. The SUL did stop that, and we are giving it up.

Elastic made the same move in 2024, when it [added AGPL](https://www.elastic.co/blog/elasticsearch-is-open-source-again) as an option next to its existing licenses. We kept the SUL as the alternative because some companies do not allow AGPL code at all. They can still use Orbi under the SUL.

The relicensing clause made this possible, and its condition still holds. Self-hosting stays free under both licenses. The one outside contributor so far started contributing after the clause was in place.

### What changes for you

- **Self-hosting**: nothing. It is free under either license, with your own model and your own repository.
- **Describing Orbi**: you can call it open source now, and list it anywhere that requires an OSI license.
- **Offering Orbi to others as a service**: under AGPL-3.0 you can, as long as you publish any modifications. The SUL does not allow it without a separate agreement.
- **Orbi Cloud**: unchanged. It is the paid hosted version, run by us.

The package metadata carries both options as one SPDX expression, from `pyproject.toml`:

```toml
license = "AGPL-3.0-only OR LicenseRef-Sustainable-Use-1.0"
license-files = ["LICENSE", "docs/licenses/sustainable-use-license.md"]
```

The files are in the repository: [`LICENSE`](https://github.com/orbi-build/orbi/blob/main/LICENSE) holds the unmodified GNU AGPL-3.0 text, and [`docs/licenses/sustainable-use-license.md`](https://github.com/orbi-build/orbi/blob/main/docs/licenses/sustainable-use-license.md) holds the SUL and a short note on how the two options work.

## Related

Read the [OpenHands comparison](/compare/openhands/) and [Cloud](/cloud/).
