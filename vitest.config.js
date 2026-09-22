import { defineConfig } from "vitest/config";

// `.worktrees/` holds the delivery runner's per-Issue checkouts — full copies
// of this repository, each with its own tests. They are gitignored, so CI
// never sees them, but a local `npm test` walked into all of them: 8432 of
// 8734 collected cases (96.5%) came from abandoned worktrees, and the extra
// workers raced for the fixed smoke-test port, turning healthy suites red at
// random. Vitest's default exclude is only node_modules and .git, so the
// directory has to be named here.
export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/.git/**", "**/.worktrees/**"],
  },
});
