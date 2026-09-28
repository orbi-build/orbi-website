// Bot marking for the attribution chain. The classification uses only the
// maintained ASN and User-Agent lists plus the probe/empty-UA signals; page
// behavior is deliberately not a bot rule (Issue #618).
const BOT_LIST_TTL_MS = 5 * 60 * 1000;
let botListsCache = null;

const KNOWN_PROBE_UAS = new Set([
  "Better Uptime Bot Mozilla/5.0",
]);

async function loadBotLists(db) {
  const now = Date.now();
  if (botListsCache && botListsCache.db === db && botListsCache.expiresAt > now) return botListsCache;
  if (!db) return { asns: new Set(), needles: [], expiresAt: now + BOT_LIST_TTL_MS, db };

  try {
    const [asnRows, uaRows] = await Promise.all([
      db.prepare("SELECT asn FROM bot_asns").all(),
      db.prepare("SELECT needle FROM bot_ua_needles").all(),
    ]);
    botListsCache = {
      asns: new Set((asnRows?.results ?? []).map(row => Number(row.asn))),
      needles: (uaRows?.results ?? []).map(row => String(row.needle).toLowerCase()),
      expiresAt: now + BOT_LIST_TTL_MS,
      db,
    };
    return botListsCache;
  } catch (error) {
    console.warn("bot_lists_query_failed:", error && error.message ? error.message : error);
    botListsCache = { asns: new Set(), needles: [], expiresAt: now + BOT_LIST_TTL_MS, db };
    return botListsCache;
  }
}

export async function isBot(request, db) {
  const lists = await loadBotLists(db);
  if (lists.asns.has(Number(request.cf?.asn))) return true;
  const rawUA = request.headers.get("User-Agent") ?? "";
  if (rawUA === "") return true;
  if (KNOWN_PROBE_UAS.has(rawUA)) return true;
  const ua = rawUA.toLowerCase();
  return lists.needles.some(needle => ua.includes(needle));
}

export async function visitSignals(request, _visit = {}, db) {
  const ua = request.headers.get("User-Agent") ?? "";
  const uaHash = (await sha256Hex(ua)).slice(0, 16);
  return {
    is_bot: await isBot(request, db) ? 1 : 0,
    asn: request.cf?.asn ?? null,
    ua_hash: uaHash,
  };
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
