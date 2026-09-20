import { beforeEach, describe, expect, it, vi } from "vitest";
import { isBot, resetBehaviorSignals, visitSignals } from "../src/bot-detection.js";

// Issue #280: classification rested on an exact match of one probe UA, so
// the 2856 crawler rows in visitor_events all landed is_bot=0. The two
// signals every Cloudflare plan carries are request.cf.asn (botManagement
// is an Enterprise add-on we do not buy — #251 measured it absent live)
// and the User-Agent string. The verdict is a marker only, never a block;
// visitSignals stores the judgment inputs (asn, ua_hash — never the raw
// UA) so a wrong verdict can be re-derived from the row instead of being
// wrong forever.
describe("bot detection (Issue #280)", () => {
  const CHROME_127 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36";
  const SAFARI_17 = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
  const FIREFOX_127 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0";
  const GPTBOT = "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)";
  const BETTER_UPTIME = "Better Uptime Bot Mozilla/5.0";

  function requestWith({ ua, asn, ip, path = "/" } = {}) {
    const headers = ua === undefined ? {} : { "User-Agent": ua };
    if (ip !== undefined) headers["CF-Connecting-IP"] = ip;
    const request = new Request(`https://beta.orbi.build${path}`, { headers });
    if (asn !== undefined) request.cf = { asn };
    return request;
  }

  beforeEach(() => {
    vi.useRealTimers();
    resetBehaviorSignals();
  });

  // The pinned hashes are the SHA-256 of the UA, first 16 hex characters,
  // computed outside the implementation (openssl dgst -sha256) — the report
  // stores the hash so a verdict can be re-derived without keeping the raw
  // UA string.
  const CHROME_127_HASH = "286fc7e32b7b67d0";
  const GPTBOT_HASH = "d1e6777ea082ce0f";
  const EMPTY_UA_HASH = "e3b0c44298fc1c14";

  it("marks every cloud-provider ASN a bot, browser UA or not", () => {
    const cloudAsns = [
      [16509, "AWS us-east"],
      [14618, "AWS us-east-1 ec2"],
      [15169, "GCP"],
      [396982, "Google Cloud"],
      [8075, "Azure"],
      [24940, "Hetzner"],
      [14061, "DigitalOcean"],
      [16276, "OVH"],
      [63949, "Linode"],
    ];
    for (const [asn, provider] of cloudAsns) {
      expect(isBot(requestWith({ ua: CHROME_127, asn })), `${provider} AS${asn}`).toBe(true);
    }
  });

  it("marks residential ASNs human: real people browse from ISP IPs, not datacenters", () => {
    expect(isBot(requestWith({ ua: CHROME_127, asn: 7922 })), "Comcast AS7922").toBe(false);
    expect(isBot(requestWith({ ua: CHROME_127, asn: 4134 })), "China Telecom AS4134").toBe(false);
  });

  it("marks every self-identifying crawler UA a bot", () => {
    const crawlerUAs = [
      GPTBOT,
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
      "CCBot/2.0 (https://commoncrawl.org/faq/)",
      "Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com)",
      "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)",
      "Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)",
      "Mozilla/5.0 (compatible; DataForSeoBot/1.0; +https://dataforseo.com/dataforseo-bot)",
      "MJ12bot/v1.4.8 (http://mj12bot.com/)",
      "Mozilla/5.0 (compatible; DotBot/1.2; +https://opensiteexplorer.org/dotbot)",
      "Mozilla/5.0 (compatible; PetalBot;+https://webmaster.petalsearch.com/site/petalbot)",
      "Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)",
    ];
    for (const ua of crawlerUAs) {
      expect(isBot(requestWith({ ua })), ua).toBe(true);
    }
  });

  it("marks the generic bot/crawler/spider fallback substrings a bot, any case", () => {
    for (const ua of ["foo/1.0 (bot)", "SomeCrawler/2.0", "x-spider/1", "AnythingBot/3.0"]) {
      expect(isBot(requestWith({ ua })), ua).toBe(true);
    }
  });

  it("marks our own Better Uptime probe a bot", () => {
    expect(isBot(requestWith({ ua: BETTER_UPTIME }))).toBe(true);
  });

  it("marks real browsers human", () => {
    for (const ua of [CHROME_127, SAFARI_17, FIREFOX_127]) {
      expect(isBot(requestWith({ ua })), ua).toBe(false);
    }
  });

  it("classifies without request.cf at all (local dev): UA-only, human", () => {
    expect(isBot(requestWith({ ua: CHROME_127 }))).toBe(false);
  });

  it("marks one vid scanning many paths in a short window", async () => {
    for (let path = 0; path < 11; path += 1) {
      expect(await visitSignals(requestWith({ ua: CHROME_127, path: `/page-${path}` }), {
        vid: "scanner",
        path: `/page-${path}`,
        ref: "",
      })).toMatchObject({ is_bot: 0 });
    }
    expect(await visitSignals(requestWith({ ua: CHROME_127, path: "/page-11" }), {
      vid: "scanner",
      path: "/page-11",
      ref: "",
    })).toMatchObject({ is_bot: 1 });
  });

  it("marks a burst of one-hit vids sharing a source fingerprint", async () => {
    for (let index = 0; index < 7; index += 1) {
      expect(await visitSignals(requestWith({ ua: CHROME_127, ip: "203.0.113.10", path: `/page-${index}` }), {
        vid: `crawler-${index}`,
        path: `/page-${index}`,
        ref: "direct",
      })).toMatchObject({ is_bot: 0 });
    }
    expect(await visitSignals(requestWith({ ua: CHROME_127, ip: "203.0.113.10", path: "/page-7" }), {
      vid: "crawler-7",
      path: "/page-7",
      ref: "direct",
    })).toMatchObject({ is_bot: 1 });
  });

  it("expires one-hit observations outside the short window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-20T16:00:00Z"));
    for (let index = 0; index < 7; index += 1) {
      await visitSignals(requestWith({ ua: CHROME_127, ip: "203.0.113.10" }), {
        vid: `old-crawler-${index}`,
        path: `/old-${index}`,
        ref: "direct",
      });
    }
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    expect(await visitSignals(requestWith({ ua: CHROME_127, ip: "203.0.113.10" }), {
      vid: "new-crawler",
      path: "/new",
      ref: "direct",
    })).toMatchObject({ is_bot: 0 });
  });

  it("does not merge different client IPs into one burst based only on ISP ASN and browser UA", async () => {
    for (let index = 0; index < 8; index += 1) {
      expect(await visitSignals(requestWith({
        ua: CHROME_127,
        asn: 7922,
        ip: `203.0.113.${index + 1}`,
        path: `/visitor-${index}`,
      }), {
        vid: `human-${index}`,
        path: `/visitor-${index}`,
        ref: "direct",
      })).toMatchObject({ is_bot: 0 });
    }
  });

  it("keeps a normal referred visitor human", async () => {
    for (const [index, path] of ["/", "/pricing/", "/docs/"].entries()) {
      expect(await visitSignals(requestWith({ ua: CHROME_127, path }), {
        vid: "human",
        path,
        ref: "x-2609201650",
      })).toMatchObject({ is_bot: 0 });
    }
  });

  it("returns the verdict with its evidence: asn and ua_hash, never the raw UA", async () => {
    const signals = await visitSignals(requestWith({ ua: GPTBOT, asn: 16509 }));
    expect(signals).toEqual({ is_bot: 1, asn: 16509, ua_hash: GPTBOT_HASH });
    expect(JSON.stringify(signals)).not.toContain("GPTBot");
  });

  it("reports a human visit with its residential asn and UA hash", async () => {
    const signals = await visitSignals(requestWith({ ua: CHROME_127, asn: 7922 }));
    expect(signals).toEqual({ is_bot: 0, asn: 7922, ua_hash: CHROME_127_HASH });
  });

  it("reports asn null without request.cf (local dev)", async () => {
    const signals = await visitSignals(requestWith({ ua: CHROME_127 }));
    expect(signals).toEqual({ is_bot: 0, asn: null, ua_hash: CHROME_127_HASH });
  });

  it("hashes a missing UA as the empty string", async () => {
    const signals = await visitSignals(requestWith({}));
    expect(signals.ua_hash).toBe(EMPTY_UA_HASH);
  });

  it("ua_hash is stable for the same UA and differs across UAs", async () => {
    const first = await visitSignals(requestWith({ ua: CHROME_127 }));
    const second = await visitSignals(requestWith({ ua: CHROME_127 }));
    const other = await visitSignals(requestWith({ ua: FIREFOX_127 }));
    expect(first.ua_hash).toBe(second.ua_hash);
    expect(first.ua_hash).not.toBe(other.ua_hash);
  });
});
