import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import probe, { CHECKS, runProbeRun } from "../src/probe.js";

// Issue #220: nothing watched the public surface — /cloud answered 500 for an
// hour and only a human noticed. orbi-probe cron-probes the URLs prospects are
// actually given, writes one Analytics Engine data point per URL per run, and
// alerts Telegram once per failure/recovery transition.

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

function makeEnv() {
  const points = [];
  const store = new Map();
  return {
    points,
    store,
    TELEGRAM_BOT_TOKEN: "bot-token",
    TELEGRAM_CHAT_ID: "chat-123",
    PROBE_RESULTS: { writeDataPoint: (point) => points.push(point) },
    PROBE_STATE: {
      get: async (key) => (store.has(key) ? store.get(key) : null),
      put: async (key, value) => {
        store.set(key, value);
      },
      delete: async (key) => {
        store.delete(key);
      },
    },
  };
}

// The probe exercises the real public contract, so the doubles serve each
// URL's own expected body: an empty-shell 200 must fail the body assertion.
function ok(url) {
  const bodies = {
    "https://orbi.build/cloud": "<html>Founding coupon 100% off</html>",
    "https://orbi.build/": "<html>Turn GitHub Issues into tagged releases</html>",
    "https://orbi.build/blog/": "<html>Blog</html>",
    "https://docs.orbi.build/": "<html>Orbi documentation</html>",
    "https://beta.orbi.build/cloud": "<html>beta cloud</html>",
  };
  return new Response(bodies[url] ?? "<html>ok</html>", {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

// Route-matched double for every outgoing call: probe URLs from `route`,
// Telegram recorded into `sent`. Passing route=null fails every probe.
function mockHttp(route) {
  const sent = [];
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const target = String(url);
    calls.push(target);
    if (target.startsWith("https://api.telegram.org/")) {
      sent.push({
        url: target,
        body: JSON.parse(init.body),
      });
      return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 });
    }
    return route ? route(target) : new Response("down", { status: 500 });
  };
  return { calls, sent };
}

function pointFor(env, url) {
  return env.points.find((point) => point.blobs[0] === url);
}

describe("probe check list (Issue #220 acceptance 1 and 5)", () => {
  it("probes exactly the URLs the Issue names, with a body assertion where it demands one", () => {
    expect(CHECKS.map((check) => check.url)).toEqual([
      "https://orbi.build/cloud",
      "https://orbi.build/",
      "https://orbi.build/blog/",
      "https://docs.orbi.build/",
      "https://beta.orbi.build/cloud",
    ]);
    expect(CHECKS.map((check) => check.expectBody ?? null)).toEqual([
      "Founding",
      null,
      "Blog",
      "Orbi",
      null,
    ]);
  });
});

describe("probe run (Issue #220 acceptance 2)", () => {
  it("writes one Analytics Engine data point per URL with url, status, ok and latency", async () => {
    const { calls } = mockHttp(ok);
    const env = makeEnv();
    await runProbeRun(env);

    expect(calls.filter((url) => url.startsWith("https://api.telegram.org")).length).toBe(0);
    expect(new Set(env.points.map((point) => point.blobs[0]))).toEqual(
      new Set(CHECKS.map((check) => check.url)),
    );
    expect(env.points).toHaveLength(CHECKS.length);
    const cloud = pointFor(env, "https://orbi.build/cloud");
    expect(cloud.indexes).toEqual(["https://orbi.build/cloud"]);
    expect(cloud.blobs[1]).toBe("ok");
    expect(cloud.doubles[0]).toBe(200);
    expect(cloud.doubles[1]).toBe(1);
    expect(cloud.doubles[2]).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(cloud.doubles[2])).toBe(true);
  });

  it("fails the status assertion on a 500 without running the body assertion", async () => {
    mockHttp((url) =>
      url === "https://orbi.build/cloud" ? new Response("boom", { status: 500 }) : ok(url),
    );
    const env = makeEnv();
    await runProbeRun(env);

    const cloud = pointFor(env, "https://orbi.build/cloud");
    expect(cloud.doubles[0]).toBe(500);
    expect(cloud.doubles[1]).toBe(0);
    expect(cloud.blobs[1]).toContain("500");
    expect(cloud.blobs[1]).not.toContain("Founding");
    // a first failure is flap: suppressed, not alerted (acceptance 3)
    expect(env.store.get("https://orbi.build/cloud")).toBe("1");
  });

  it("fails the body assertion when a 200 ships an empty shell", async () => {
    mockHttp((url) =>
      url === "https://docs.orbi.build/"
        ? new Response("<html>maintenance placeholder</html>", {
            status: 200,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          })
        : ok(url),
    );
    const env = makeEnv();
    await runProbeRun(env);

    const docs = pointFor(env, "https://docs.orbi.build/");
    expect(docs.doubles[0]).toBe(200);
    expect(docs.doubles[1]).toBe(0);
    expect(docs.blobs[1]).toContain('body does not contain "Orbi"');
  });

  it("records a fetch-level failure as a failed check with status 0", async () => {
    globalThis.fetch = async (url) => {
      if (String(url).startsWith("https://api.telegram.org/")) {
        throw new Error("unexpected telegram call");
      }
      throw new Error("network unreachable");
    };
    const env = makeEnv();
    await runProbeRun(env);

    expect(env.points).toHaveLength(CHECKS.length);
    for (const point of env.points) {
      expect(point.doubles[0]).toBe(0);
      expect(point.doubles[1]).toBe(0);
      expect(point.blobs[1]).toContain("network unreachable");
    }
  });
});

describe("Telegram transitions (Issue #220 acceptance 3 and 4)", () => {
  const down = () =>
    mockHttp((url) =>
      url === "https://orbi.build/cloud" ? new Response("boom", { status: 500 }) : ok(url),
    );

  it("alerts exactly once after two consecutive failures, naming url, status and assertion", async () => {
    const { sent } = down();
    const env = makeEnv();

    await runProbeRun(env);
    expect(sent).toEqual([]);

    await runProbeRun(env);
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe("https://api.telegram.org/botbot-token/sendMessage");
    expect(sent[0].body.chat_id).toBe("chat-123");
    expect(sent[0].body.text).toContain("https://orbi.build/cloud");
    expect(sent[0].body.text).toContain("500");
    expect(sent[0].body.text).toContain("expected 200");

    await runProbeRun(env);
    expect(sent).toHaveLength(1);
  });

  it("sends one recovery message when the URL comes back, then stays quiet", async () => {
    let current = (url) =>
      url === "https://orbi.build/cloud" ? new Response("boom", { status: 500 }) : ok(url);
    const { sent } = mockHttp((url) => current(url));
    const env = makeEnv();
    await runProbeRun(env);
    await runProbeRun(env);
    expect(sent).toHaveLength(1);

    current = ok;
    await runProbeRun(env);
    expect(sent).toHaveLength(2);
    expect(sent[1].body.text).toContain("https://orbi.build/cloud");
    expect(sent[1].body.text).toContain("recovered");
    expect(env.store.has("https://orbi.build/cloud")).toBe(false);

    await runProbeRun(env);
    expect(sent).toHaveLength(2);
  });

  it("stays fully silent when a single failure is followed by success", async () => {
    let current = (url) =>
      url === "https://orbi.build/blog/" ? new Response("boom", { status: 503 }) : ok(url);
    const { sent } = mockHttp((url) => current(url));
    const env = makeEnv();
    await runProbeRun(env);
    expect(sent).toEqual([]);

    current = ok;
    await runProbeRun(env);
    expect(sent).toEqual([]);
    expect(env.store.size).toBe(0);
  });

  it("keeps a healthy URL out of the alert state entirely", async () => {
    mockHttp(ok);
    const env = makeEnv();
    await runProbeRun(env);
    expect(env.store.size).toBe(0);
  });
});

describe("failure paths (Issue #220 failure path)", () => {
  it("logs probe_alert_failed and keeps the data point when Telegram is unreachable", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    let telegramCalls = 0;
    globalThis.fetch = async (url) => {
      const target = String(url);
      if (target.startsWith("https://api.telegram.org/")) {
        telegramCalls += 1;
        return new Response("Bad Gateway", { status: 502 });
      }
      return target === "https://orbi.build/cloud" ? new Response("boom", { status: 500 }) : ok(target);
    };
    const env = makeEnv();

    await runProbeRun(env);
    await runProbeRun(env);

    expect(error).toHaveBeenCalledWith("probe_alert_failed", expect.stringContaining("502"));
    // the measurement survives the alerting outage
    expect(env.points).toHaveLength(2 * CHECKS.length);
    // the failure is logged once per transition, not on every later run
    await runProbeRun(env);
    expect(telegramCalls).toBe(1);
  });

  it("logs probe_run_failed with the reason when the run itself raises", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mockHttp(ok);
    const env = makeEnv();
    env.PROBE_STATE.get = async () => {
      throw new Error("kv unavailable");
    };

    await expect(probe.scheduled({ cron: "*/3 * * * *" }, env)).rejects.toThrow("kv unavailable");
    expect(error).toHaveBeenCalledWith("probe_run_failed", expect.stringContaining("kv unavailable"));
  });
});

describe("wrangler configuration pins (Issue #220 evidence)", () => {
  const config = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
  const probeSection = config.slice(config.indexOf("[env.probe]"));

  it("defines the probe as its own worker with no ingress and the */3 cron", () => {
    expect(probeSection).toContain('name = "orbi-probe"');
    expect(probeSection).toContain('main = "src/probe.js"');
    // override the inherited production custom domains: the probe must never
    // take ingress away from the site Worker
    expect(probeSection).toContain("routes = []");
    expect(probeSection).toContain('crons = ["*/3 * * * *"]');
  });

  it("binds the Analytics Engine history dataset and the KV alert state", () => {
    expect(probeSection).toContain('binding = "PROBE_RESULTS"');
    expect(probeSection).toContain('dataset = "orbi_probe_results"');
    expect(probeSection).toContain('binding = "PROBE_STATE"');
  });
});
