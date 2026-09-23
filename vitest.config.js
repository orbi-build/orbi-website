import { defineConfig } from "vitest/config";

// Two projects, split by what a suite needs in order to run.
//
// `node` is what the deploy gates run (`npm test`): pure Node, no browser.
// `browser` drives Playwright Chromium and belongs to CI, which installs it
// and where a failure costs nothing. The production workflow contract in
// tests/test_landing.py:934 forbids `playwright install` there, for a reason
// recorded next to it:
//
//   2026-09-10: the browser smoke was removed from this workflow. It
//   asserted design contracts (CTA placement, footer link sets, anchor
//   wording) that a deploy gate must not own: three times in one day it
//   rolled a correct production build back to a three-day-old version
//   because a CTA had moved between the hero and the nav.
//
// Until now `npm test` was a bare `vitest run`, so the six browser suites
// added on 2026-09-21 (hero scale, heading line-height, Cloud card overflow,
// footer overflow, blog step images) silently became a deploy dependency and
// reddened the production promotion twice with
// "browserType.launch: Executable doesn't exist".
//
// The suites themselves stay: they are layout regressions worth guarding.
// CI runs them on every PR, so a break still cannot reach main.
const BROWSER_SUITES = [
  "tests/blog-step-images.test.js",
  "tests/blog-table-overflow.test.js",
  "tests/cloud-layout.test.js",
  "tests/compare-table-layout.test.js",
  "tests/footer-overflow.test.js",
  "tests/hero-layout.test.js",
  "tests/homepage-heading.test.js",
  "tests/homepage.smoke.test.js",
  "tests/social-proof-layout.test.js",
];

// `.worktrees/` holds the delivery runner's per-Issue checkouts — full copies
// of this repository, each with its own tests. They are gitignored, so CI
// never sees them, but a local `npm test` walked into all of them: 8432 of
// 8734 collected cases (96.5%) came from abandoned worktrees, and the extra
// workers raced for the fixed smoke-test port, turning healthy suites red at
// random. Vitest's default exclude is only node_modules and .git, so the
// directory has to be named here.
const NEVER = ["**/node_modules/**", "**/.git/**", "**/.worktrees/**"];

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "node",
          include: ["tests/**/*.test.js"],
          exclude: [...NEVER, ...BROWSER_SUITES],
        },
      },
      {
        test: {
          name: "browser",
          include: BROWSER_SUITES,
          exclude: NEVER,
        },
      },
    ],
  },
});
