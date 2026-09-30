const base = process.env.PROMOTION_BASE_REF ?? "";
const head = process.env.PROMOTION_HEAD_REF ?? "";
const headRepo = process.env.PROMOTION_HEAD_REPO ?? "";
const repository = process.env.PROMOTION_REPOSITORY ?? "";

if (base === "main" && (head !== "beta" || headRepo !== repository)) {
  console.error(`::error::main 只接受来自本仓库 beta 分支的 PR（当前 head：${headRepo}:${head}）。先把改动合进 beta，再开 beta → main。`);
  process.exitCode = 1;
} else {
  console.log(`promotion-source passed: ${base || "non-pull-request"} <- ${headRepo}:${head}`);
}
