# Comparison content audit

审查日期：2026-09-07 · Review date: 2026-09-07

This ledger is the review record for `/compare/` and every published comparison detail page. It deliberately records the claim class so a vendor statement is not presented as an Orbi measurement. “Official” means the vendor's own product, documentation, or repository material; “inference” means a bounded reading of that material; “Orbi” means a statement about this repository's documented behavior.

| Page | Claim covered | Class | Source URL | Treatment |
|---|---|---|---|---|
| `/compare/` | Orbi uses GitHub Issues, labels, PRs and self-hosted execution | Orbi | https://docs.orbi.build · https://github.com/orbi-build/orbi | Kept; described as self-hosted, not Cloud |
| `/compare/` | Hosted products determine their execution boundary and terms | Inference from official materials | https://www.anthropic.com/engineering/managed-agents · https://docs.github.com/en/copilot/concepts/agents/coding-agent · https://openai.com/codex/ · https://devin.ai/ | Kept with “can/change” wording; no quality claim |
| `/compare/openclaw/` | OpenClaw positioning, channels, models, deployment and licence | Official | https://openclaw.ai · https://github.com/openclaw/openclaw | Kept with source/date; no performance claim |
| `/compare/openclaw/` | Anthropic subscription-route change and reported usage context | Public report / vendor statement | https://x.com/bcherny · https://medium.com (article named and attributed on-page; no guessed deep-link) | Kept as a dated, attributed historical report; not stated as a framework failure |
| `/compare/github-copilot-coding-agent/` | Issue entry, hosted sandbox, eligible plan and GitHub policy | Official | https://docs.github.com/en/copilot/concepts/agents/coding-agent · https://github.com/features/copilot | Kept; price/limits are explicitly a dated snapshot |
| `/compare/managed-agents/` | Brain/Hands/Session architecture, API boundary and hosting | Official | https://www.anthropic.com/engineering/managed-agents · https://platform.claude.com/docs/en/managed-agents/overview | Kept; no claim of service quality |
| `/compare/managed-agents/` | Token, session-hour and web-search rates | Official pricing | https://www.anthropic.com/pricing · https://platform.claude.com/docs/en/managed-agents/overview | Kept as “listed on verification date”; readers are told to re-check |
| `/compare/openhands/` | Local/Docker/VM/cloud deployment, BYOK, automation and MIT licence | Official | https://github.com/All-Hands-AI/OpenHands · https://github.com/OpenHands/software-agent-sdk · https://github.com/OpenHands/automation | Kept; GitHub is described as one integration, not a sole queue |
| `/compare/hermes-agent/` | Personal-agent positioning, memory, skills, cron, providers and MIT licence | Official | https://github.com/NousResearch/hermes-agent · https://hermes-agent.nousresearch.com/ | Kept; clearly separated from Orbi's delivery loop |
| `/compare/hermes-agent/` | GitHub tools do not establish an unattended Issue→PR queue | Bounded inference | https://github.com/NousResearch/hermes-agent/tree/main/website/docs/user-guide/skills/bundled/github | Kept as “not documented”, not as a negative capability claim |
| `/compare/codex/` | Codex cloud task entry, sandbox and provider boundary | Official | https://openai.com/index/introducing-codex/ · https://platform.openai.com/docs/codex | Kept as a research snapshot and linked to source; no unsupported benchmark |
| All detail pages | Orbi self-hosted delivery flow and licence | Orbi | https://docs.orbi.build · https://github.com/orbi-build/orbi/blob/main/LICENSE.md | Kept; fair-code/Sustainable Use wording used instead of OSI “open source” for Orbi |
| All detail pages | Page title, description, canonical, hreflang, OG, Twitter and schema | Site implementation | https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls · https://ogp.me/ · https://schema.org/Article | Normalized and checked in source; dates remain visible on page |

## Positioning and conversion decisions

- **Self-hosted Orbi:** the comparison pages link to the documentation to install/run it on the reader's infrastructure. Model and hardware costs remain the operator's responsibility.
- **Cloud:** the website's `/apply` path is a limited founding pilot/application path, not a public plan or claimed generally available managed service. Comparison copy does not attribute a price, quota, customer, or shipped Cloud capability to Orbi.
- **Fit:** Orbi is for teams that already use GitHub Issues and need BYOK, infrastructure/data-boundary control, and inspectable delivery evidence. A hosted agent is a reasonable choice when the team prefers vendor-operated execution; no page claims one product is universally better.
- **CTA:** each page offers a source/vendor link plus a verifiable Orbi next step (documentation or comparison index). No CTA promises free quotas, customer results, rankings, or conversion outcomes.

## Change summary

1. Added Article JSON-LD and complete per-page OG/Twitter URL/title/description metadata to all 14 bilingual detail pages.
2. Added the missing `twitter:site` metadata to pages that lacked it.
3. Preserved dated source notes and added this claim ledger for reviewability.

The ledger is a dated snapshot. Vendor prices, availability, model lists, and policies must be checked again before procurement or architecture decisions.
