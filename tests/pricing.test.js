import { describe, expect, it } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pricing from "../src/pricing.json";
import { handleFetch } from "../src/worker.js";

const PUBLIC_DIR = fileURLToPath(new URL("../public/", import.meta.url));
const TOKEN = pricing.monthlyUsdToken;
const USD = String(pricing.cloudMonthlyUsd);

// The pages whose price mentions the Issue pins (originally 12 across the two
// cloud pages; #99 added the homepage card and the cost tables since). Every
// carrier that shows the monthly price must ship the token, not a literal.
const PRICE_PAGES = [
  "index.html",
  "zh/index.html",
  "cloud/index.html",
  "zh/cloud/index.html",
  "cost/index.html",
  "zh/cost/index.html",
];

// "$79" as OUR monthly price, not as a substring of another figure ($790,
// $7,900) or of unrelated content (hex tokens, Anthropic's $15 on the
// managed-agents page). A digit or comma right after the value disqualifies.
// The JSON-LD carrier states the price without a currency sign, so its
// `"price": "…"` form counts too.
function literalPrice(value) {
  return new RegExp(`\\$${value}(?![\\d,])|"price":\\s*"${value}"`, "g");
}

async function listHtmlFiles(dir = PUBLIC_DIR) {
  const files = await Promise.all(
    (await readdir(dir, { withFileTypes: true })).map(async (entry) => {
      const path = `${dir}${entry.name}`;
      if (entry.isDirectory()) return listHtmlFiles(`${path}/`);
      return entry.name.endsWith(".html") ? [path] : [];
    }),
  );
  return files.flat();
}

async function rawPage(relativePath) {
  return readFile(`${PUBLIC_DIR}${relativePath}`, "utf8");
}

// The real serving path: the shipped bytes go through handleFetch exactly as
// production serves them, with Cloud login configured (production and beta
// both do — the CTA rewrite stays off there).
function serve(raw, path) {
  return handleFetch(new Request(`https://orbi.build${path}`), {
    CLOUD_LOGIN_URL: "https://beta.orbi.build/api/login",
    ASSETS: {
      fetch: () =>
        Promise.resolve(
          new Response(raw, { headers: { "Content-Type": "text/html; charset=utf-8", Etag: '"asset-1"' } }),
        ),
    },
  });
}

describe("Cloud monthly price constant (Issue #102)", () => {
  it("ships every price occurrence as the token, never as a literal", async () => {
    for (const path of await listHtmlFiles()) {
      const raw = await readFile(path, "utf8");
      expect(raw.match(literalPrice(USD)), path).toBeNull();
      expect(raw.match(new RegExp(`"price":\\s*"${USD}"`)), path).toBeNull();
    }
    for (const relativePath of PRICE_PAGES) {
      expect(await rawPage(relativePath), relativePath).toContain(TOKEN);
    }
  });

  it("serves the constant into every carrier through the real Worker path", async () => {
    for (const relativePath of PRICE_PAGES) {
      const response = await serve(await rawPage(relativePath), `/${relativePath.replace(/index\.html$/, "")}`);
      const body = await response.text();
      expect(body, relativePath).not.toContain(TOKEN);
      expect(body.match(literalPrice(USD)), relativePath).not.toBeNull();
      // A rewritten body is a new representation: the asset file's validators
      // must not answer conditional requests for it.
      expect(response.headers.get("etag"), relativePath).toBeNull();
    }
  });

  it("keeps the JSON-LD Offer valid and priced at the constant", async () => {
    for (const relativePath of ["cloud/index.html", "zh/cloud/index.html"]) {
      const response = await serve(await rawPage(relativePath), `/${relativePath.replace(/index\.html$/, "")}`);
      const body = await response.text();
      const scripts = [...body.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => m[1]);
      expect(scripts.length, relativePath).toBeGreaterThan(0);
      const offers = scripts.flatMap((script) => {
        const data = JSON.parse(script); // throws if the substitution broke the structure
        return (data["@graph"] ?? [data]).filter((node) => node["@type"] === "Offer");
      });
      expect(offers, relativePath).toHaveLength(1);
      expect(offers[0].price, relativePath).toBe(USD);
      expect(offers[0].description, relativePath).toContain("100% off");
    }
  });

  it("syncs every occurrence after a constant change", async () => {
    // A hypothetical new price applied through the same seam the Worker uses
    // (token -> value over the shipped bytes): every position that shows the
    // old value must move to the new one, with none left behind.
    const next = "123";
    for (const relativePath of PRICE_PAGES) {
      const raw = await rawPage(relativePath);
      const tokenCount = raw.split(TOKEN).length - 1;
      expect(tokenCount, relativePath).toBeGreaterThan(0);
      const repriced = raw.replaceAll(TOKEN, next);
      expect(repriced, relativePath).not.toContain(TOKEN);
      expect(repriced.match(literalPrice(USD)), relativePath).toBeNull();
      expect(repriced.match(literalPrice(next)), relativePath).toHaveLength(tokenCount);
    }
  });
});
