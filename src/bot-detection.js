// Bot marking for the attribution chain (Issue #240). The zone is on the
// Cloudflare free plan, where request.cf.botManagement does not exist, so
// classification is the industry-standard pair (Plausible, Fathom, Umami):
// a crawler user-agent list plus a datacenter-ASN list. The result is a
// marker only, never a block — rules will be wrong at first, and a marked
// row can be reclassified while a dropped one is gone.
import { CRAWLER_UA_PATTERNS } from "./bot-ua-patterns.js";

// One combined alternation. The upstream patterns carry no inline flags and
// no backreferences (asserted by the generator), so wrapping each in a
// non-capturing group preserves its exact semantics while keeping a single
// compiled regex on the hot path.
const crawlerUa = new RegExp(CRAWLER_UA_PATTERNS.map((pattern) => `(?:${pattern})`).join("|"));

// Datacenter ASNs — a deliberately small positive list of the hosting
// providers automated traffic actually launches from. Absence decides the
// VPN case (Fathom's guidance): Mullvad (AS51818, AS216025), iCloud Private
// Relay and VPN-heavy hosts like M247 (AS9009) are not listed, so humans
// behind them are never flagged. Matched on request.cf.asn — the stable
// number; asOrganization is the drifting label of the same ASN. Known cost,
// accepted in the Issue: developers on cloud dev environments get marked
// too, which is why this layer only marks.
const DATACENTER_ASNS = new Set([
  16509, // Amazon AWS
  14618, // Amazon AWS us-east-1
  396982, // Google Cloud
  8075, // Microsoft Azure
  14061, // DigitalOcean
  24940, // Hetzner
  63949, // Linode (Akamai)
  20473, // Vultr
  16276, // OVH
  31898, // Oracle Cloud
  45102, // Alibaba Cloud
  132203, // Tencent Cloud
  12876, // Scaleway
  36351, // IBM Cloud (SoftLayer)
]);

// Report field caps: the UA is stored truncated at 120 chars and
// Sec-Fetch-Mode at 64 — overlong input must truncate, never error.
const UA_MAX_CHARS = 120;
const SEC_FETCH_MODE_MAX_CHARS = 64;

function capped(value, maxChars) {
  return value === null || value.length <= maxChars ? value : value.slice(0, maxChars);
}

export function isBot(userAgent, asn) {
  return crawlerUa.test(userAgent ?? "") || (typeof asn === "number" && DATACENTER_ASNS.has(asn));
}

// The classification evidence a visitor_events row stores (is_bot / ua /
// sec_fetch_mode, orbi-cloud companion of this Issue). Sec-Fetch-Mode is
// recorded as a positive-human signal only — it never participates in the
// verdict, because pre-16.4 Safari sends nothing and filtering on it would
// silently drop those humans.
export function visitSignals(request) {
  const userAgent = request.headers.get("User-Agent");
  return {
    is_bot: isBot(userAgent, request.cf?.asn) ? 1 : 0,
    ua: capped(userAgent, UA_MAX_CHARS),
    sec_fetch_mode: capped(request.headers.get("Sec-Fetch-Mode"), SEC_FETCH_MODE_MAX_CHARS),
  };
}
