// Bot marking for the attribution chain (Issues #240, #243, #251, #280).
// #251 measured the live request on beta through the /__cf diagnostic
// (2026-09-20): request.cf itself is populated (asn, colo) but botManagement
// is absent. botManagement is only set when the site buys the Cloudflare Bot
// Management product — an Enterprise add-on we do not buy; #243's
// score-based classification rested on a field we never had, and every row
// landed is_bot=0. The signals every plan does carry are request.cf.asn
// ("All plans have access to" per the Cloudflare docs, checked 2026-09-20)
// and the User-Agent, so the classification is (Issue #280):
// - ASN: a cloud/datacenter ASN is a crawler or a scripted client — real
//   people do not browse the site from a datacenter IP. Highest-signal
//   check: #280 reviewed the production rows by behavior and 93% were
//   crawlers, none of them ever marked.
// - UA substrings: crawlers that self-identify, plus the generic
//   bot/crawler/spider fallback; the exact UA of the probes we run
//   ourselves stays pinned too.
// - Short-window behavior: one vid scanning many paths, or many one-hit vids
//   sharing the same UA/ASN/source fingerprint.
// The verdict is a marker only, never a block — a marked row can be
// reclassified while a dropped one is gone. visitSignals stores the
// judgment inputs with the row (asn, ua_hash — never the raw UA, which is
// PII), so a verdict later found wrong can be re-derived from the stored
// evidence instead of being wrong forever.
const BOT_LIST_TTL_MS = 5 * 60 * 1000;
let botListsCache = null;

const KNOWN_PROBE_UAS = new Set([
  "Better Uptime Bot Mozilla/5.0",
]);

const BEHAVIOR_WINDOW_MS = 5 * 60 * 1000;
const DURABLE_BEHAVIOR_WINDOW_MS = 48 * 60 * 60 * 1000;
const PRUNE_INTERVAL_MS = 30 * 1000;
const PATH_BREADTH_THRESHOLD = 12;
const DURABLE_PATH_BREADTH_THRESHOLD = 8;
const BURST_VID_THRESHOLD = 8;
const MAX_TRACKED_VIDS = 1024;
const MAX_TRACKED_FINGERPRINTS = 256;
const MAX_VIDS_PER_FINGERPRINT = 64;

// These maps are only the short-window fast path. Slow scans use the durable
// visitor_events aggregate below, so a cold isolate does not lose that signal.
const behaviorByVid = new Map();
const burstByFingerprint = new Map();
let nextPruneAt = 0;

function setBounded(map, key, value, limit) {
  if (!map.has(key) && map.size >= limit) {
    map.delete(map.keys().next().value);
  }
  map.set(key, value);
}

function pruneBehavior(now) {
  if (now < nextPruneAt) return;
  nextPruneAt = now + PRUNE_INTERVAL_MS;
  for (const [vid, visit] of behaviorByVid) {
    if (now - visit.firstSeen > BEHAVIOR_WINDOW_MS) behaviorByVid.delete(vid);
  }
  for (const [fingerprint, burst] of burstByFingerprint) {
    if (now - burst.firstSeen > BEHAVIOR_WINDOW_MS) burstByFingerprint.delete(fingerprint);
  }
}

function observeBehavior({ vid, path, fingerprint, now = Date.now() }) {
  if (!vid || !path) return {};
  pruneBehavior(now);

  const current = behaviorByVid.get(vid) || {
    firstSeen: now,
    paths: new Set(),
  };
  if (current.paths.size < PATH_BREADTH_THRESHOLD) current.paths.add(path);
  setBounded(behaviorByVid, vid, current, MAX_TRACKED_VIDS);

  let oneHitVidBurst = false;
  if (fingerprint) {
    const burst = burstByFingerprint.get(fingerprint) || {
      firstSeen: now,
      vids: new Map(),
      detected: false,
    };
    if (!burst.detected) {
      const priorHits = burst.vids.get(vid) || 0;
      setBounded(burst.vids, vid, priorHits + 1, MAX_VIDS_PER_FINGERPRINT);
      burst.detected = [...burst.vids.values()].filter((hits) => hits === 1).length
        >= BURST_VID_THRESHOLD;
    }
    setBounded(burstByFingerprint, fingerprint, burst, MAX_TRACKED_FINGERPRINTS);
    oneHitVidBurst = burst.detected;
  }

  return {
    manyPaths: current.paths.size >= PATH_BREADTH_THRESHOLD,
    oneHitVidBurst,
  };
}

async function loadBotLists(db) {
  const now = Date.now();
  if (botListsCache && botListsCache.db === db && botListsCache.expiresAt > now) return botListsCache;

  if (!db) {
    return { asns: new Set(), needles: [], expiresAt: now + BOT_LIST_TTL_MS, db };
  }

  try {
    const [asnRows, uaRows] = await Promise.all([
      db.prepare("SELECT asn FROM bot_asns").all(),
      db.prepare("SELECT needle FROM bot_ua_needles").all(),
    ]);
    botListsCache = {
      asns: new Set((asnRows?.results ?? []).map((row) => Number(row.asn))),
      needles: (uaRows?.results ?? []).map((row) => String(row.needle).toLowerCase()),
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

export async function isBot(request, behavior = {}, db) {
  const lists = await loadBotLists(db);
  if (lists.asns.has(Number(request.cf?.asn))) return true;
  const rawUA = request.headers.get("User-Agent") ?? "";
  if (rawUA === "") return true;
  if (KNOWN_PROBE_UAS.has(rawUA)) return true;
  const ua = rawUA.toLowerCase();
  if (lists.needles.some((needle) => ua.includes(needle))) return true;
  return behavior.manyPaths === true
    || behavior.oneHitVidBurst === true
    || behavior.slowScan === true;
}

async function durableSlowScan(db, { asn, uaHash, vid, path, now }) {
  const sinceEpochSeconds = Math.floor((now - DURABLE_BEHAVIOR_WINDOW_MS) / 1000);
  try {
    const result = await db.prepare(`
      WITH matching_events AS (
        SELECT vid, path
        FROM visitor_events
        WHERE kind = 'visit'
          AND ua_hash = ?
          AND asn = ?
          AND created_at >= datetime(?, 'unixepoch')
      ), one_hit_vids AS (
        SELECT vid, MIN(path) AS path
        FROM matching_events
        WHERE vid <> ?
        GROUP BY vid
        HAVING COUNT(*) = 1
      )
      SELECT COUNT(*) AS vids,
             COUNT(DISTINCT path) AS paths,
             COALESCE(MAX(path = ?), 0) AS current_path_seen,
             (SELECT COUNT(*) FROM matching_events WHERE vid = ?) AS current_vid_hits
      FROM one_hit_vids
    `).bind(uaHash, asn, sinceEpochSeconds, vid, path, vid).first();
    const vids = Number(result?.vids ?? 0);
    const paths = Number(result?.paths ?? 0);
    const currentVidHits = Number(result?.current_vid_hits ?? 0);
    const currentIsOneHit = currentVidHits === 0;
    const currentAddsPath = currentIsOneHit && Number(result?.current_path_seen ?? 0) === 0;
    return vids + (currentIsOneHit ? 1 : 0) >= BURST_VID_THRESHOLD
      && paths + (currentAddsPath ? 1 : 0) >= DURABLE_PATH_BREADTH_THRESHOLD;
  } catch (error) {
    console.warn("bot_behavior_query_failed:", error && error.message ? error.message : error);
    return false;
  }
}

// Reset is used by the focused tests so independent visitor journeys do not
// share the Worker isolate's short-lived observation window.
export function resetBehaviorSignals() {
  behaviorByVid.clear();
  burstByFingerprint.clear();
  nextPruneAt = 0;
  botListsCache = null;
}

// The verdict travels with its inputs: the asn that was seen and a hash of
// the UA (SHA-256, first 16 hex) — enough to re-derive the classification,
// never enough to identify the visitor.
export async function visitSignals(request, visit = {}, db) {
  const ua = request.headers.get("User-Agent") ?? "";
  const uaHash = (await sha256Hex(ua)).slice(0, 16);
  const clientIp = request.headers.get("CF-Connecting-IP");
  // Cloudflare supplies CF-Connecting-IP to the Worker. Hash it before using
  // it as an isolate-local key: an ASN can contain millions of unrelated
  // people, while an IP + UA + source identifies the requested burst without
  // retaining the visitor's raw address.
  const fingerprint = clientIp && visit.vid && visit.path
    ? await sha256Hex(`${clientIp}|${request.cf?.asn ?? ""}|${uaHash}|${visit.ref || "direct"}`)
    : null;
  const behavior = observeBehavior({
    vid: visit.vid,
    path: visit.path,
    fingerprint,
  });
  if (db && request.cf?.asn !== undefined && request.cf?.asn !== null && visit.vid && visit.path) {
    behavior.slowScan = await durableSlowScan(db, {
      asn: request.cf.asn,
      path: visit.path,
      uaHash,
      vid: visit.vid,
      now: Date.now(),
    });
  }
  return {
    is_bot: await isBot(request, behavior, db) ? 1 : 0,
    asn: request.cf?.asn ?? null,
    ua_hash: uaHash,
  };
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
