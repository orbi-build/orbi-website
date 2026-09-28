import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/worker.js";

const envFor = (fetchImpl) => ({
  CLOUD_VISIT_URL: "https://cloud.test/api/internal/visit",
  WEBSITE_SECRET: "secret",
  CLOUD: fetchImpl,
});

async function send(kind, detail, env, waits, extra = {}, ua = "Mozilla/5.0") {
  const body = { kind, ...extra };
  if (detail !== undefined) body.detail = detail;
  const response = await worker.fetch(
    new Request("https://beta.orbi.build/cloud/e", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: "vid=visitor-1", "User-Agent": ua },
      body: JSON.stringify(body),
    }),
    env,
    { waitUntil: promise => waits.push(promise) },
  );
  await Promise.all(waits);
  await new Promise(resolve => setTimeout(resolve, 0));
  return response;
}

describe("browser engagement endpoint", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ["visit", undefined],
    ["engaged", undefined],
    ["cta_click", "cloud-hero"],
    ["cta_click", "pricing-year"],
    ["cta_click", "pricing-month"],
    ["cta_click", "pricing-solo-year"],
    ["cta_click", "pricing-solo-month"],
    ["cta_click", "pricing-pro-year"],
    ["cta_click", "pricing-pro-month"],
    ["cta_click", "film-play"],
    ["cta_click", "film-50"],
    ["cta_click", "film-100"],
    ["cta_click", "film-end-cloud"],
    ["cta_click", "film-end-selfhost"],
    ["scroll_depth", "75"],
  ])("forwards %s/%s with the visitor identity", async (kind, detail) => {
    const reports = [];
    const env = envFor({
      fetch: async request => {
        reports.push(await request.json());
        return new Response(null, { status: 204 });
      },
    });
    const response = await send(kind, detail, env, [], kind === "visit"
      ? { path: "/cloud/", search: "?ref=x-2609281823", referrer: "" }
      : {});
    expect(response.status).toBe(204);
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ kind, vid: "visitor-1", path: kind === "visit" ? "/cloud/" : "/cloud/e", is_bot: 0 });
    if (detail !== undefined) expect(reports[0].detail).toBe(detail);
    if (kind === "visit") expect(reports[0].ref).toBe("x-2609281823");
  });

  it.each([
    ["https://news.ycombinator.com/", "news.ycombinator.com"],
    ["https://orbi.build/", ""],
  ])("derives visit ref from referrer %s", async (referrer, ref) => {
    const reports = [];
    const env = envFor({ fetch: async request => { reports.push(await request.json()); return new Response(null, { status: 204 }); } });
    await send("visit", undefined, env, [], { path: "/cloud/", search: "", referrer });
    expect(reports[0].ref).toBe(ref);
  });

  it("drops bot events before forwarding", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const reports = [];
    const env = { ...envFor({ fetch: async request => { reports.push(await request.json()); return new Response(null, { status: 204 }); } }), VISITOR_EVENTS_DB: {
      prepare: sql => ({ all: async () => ({ results: sql.includes("bot_asns") ? [] : [{ needle: "headless" }] }) }),
    } };
    await send("engaged", undefined, env, [], {}, "Mozilla/5.0 HeadlessChrome/153");
    expect(reports).toHaveLength(0);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('"evt":"visit_dropped"'));
  });

  it.each([
    [{ kind: "unknown" }],
    [{ kind: "cta_click", detail: "not-allowed" }],
    [{ kind: "scroll_depth", detail: "60" }],
    [{ kind: "engaged", detail: "extra" }],
  ])("rejects invalid event %j without forwarding", async event => {
    const forwarded = vi.fn(async () => new Response(null, { status: 204 }));
    const response = await worker.fetch(
      new Request("https://beta.orbi.build/cloud/e", {
        method: "POST", body: JSON.stringify(event), headers: { Cookie: "vid=visitor-1", "User-Agent": "Mozilla/5.0" },
      }),
      envFor({ fetch: forwarded }),
      { waitUntil() {} },
    );
    expect(response.status).toBe(400);
    expect(forwarded).not.toHaveBeenCalled();
  });

  it("returns 204 and warns when forwarding fails", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const waits = [];
    const response = await send("engaged", undefined, envFor({ fetch: async () => { throw new Error("offline"); } }), waits);
    expect(response.status).toBe(204);
    expect(warning).toHaveBeenCalledWith("visit_report_failed:", "offline");
  });
});
