import { describe, expect, it, vi } from "vitest";
import { isBot, visitSignals } from "../src/bot-detection.js";

describe("bot detection", () => {
  const CHROME = "Mozilla/5.0 Chrome/127.0.0.0 Safari/537.36";
  const GPTBOT = "Mozilla/5.0 (compatible; GPTBot/1.2)";
  const db = {
    prepare(sql) {
      return { all: async () => sql.includes("bot_asns")
        ? { results: [{ asn: 16509 }] }
        : { results: [{ needle: "headless" }, { needle: "gptbot" }] } };
    },
  };
  const requestWith = ({ ua = CHROME, asn } = {}) => {
    const request = new Request("https://beta.orbi.build/", { headers: { "User-Agent": ua } });
    if (asn !== undefined) request.cf = { asn };
    return request;
  };

  it("keeps only maintained ASN and UA list signals", async () => {
    expect(await isBot(requestWith({ asn: 16509 }), db)).toBe(true);
    expect(await isBot(requestWith({ ua: `${CHROME} HeadlessChrome/127` }), db)).toBe(true);
    expect(await isBot(requestWith({ ua: GPTBOT }), db)).toBe(true);
    expect(await isBot(requestWith({ ua: CHROME, asn: 7922 }), db)).toBe(false);
  });

  it("marks empty and known probe user agents", async () => {
    const empty = new Request("https://beta.orbi.build/");
    expect(await isBot(empty)).toBe(true);
    expect(await isBot(requestWith({ ua: "Better Uptime Bot Mozilla/5.0" }))).toBe(true);
  });

  it("does not classify page behavior as bot behavior", async () => {
    expect(await isBot(requestWith({ ua: CHROME }), db)).toBe(false);
    expect(await visitSignals(requestWith({ ua: CHROME }), {
      vid: "same-visitor", path: "/many-paths", ref: "direct",
    }, db)).toMatchObject({ is_bot: 0 });
  });

  it("returns only verdict evidence and hashes the UA", async () => {
    const signals = await visitSignals(requestWith({ ua: GPTBOT, asn: 16509 }), {}, db);
    expect(signals).toEqual({ is_bot: 1, asn: 16509, ua_hash: "2efd9661f00ea09e" });
    expect(JSON.stringify(signals)).not.toContain("GPTBot");
  });

  it("logs a failed list query and treats it as non-bot", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failed = { prepare: () => ({ all: async () => { throw new Error("database unavailable"); } }) };
    try {
      expect(await isBot(requestWith(), failed)).toBe(false);
      expect(warning).toHaveBeenCalledWith("bot_lists_query_failed:", "database unavailable");
    } finally {
      warning.mockRestore();
    }
  });
});
