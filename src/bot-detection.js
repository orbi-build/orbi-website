// Bot marking for the attribution chain (Issues #243, #251). #251 measured
// the live request on beta through the /__cf diagnostic (2026-09-20):
// request.cf itself is populated (asn, colo) but botManagement is absent on
// this account/plan, so #243's score-based classification could never fire —
// every row landed is_bot=0. The working marker is an exact UA match of the
// probes we actually run against the site (the attribution e2e's Better
// Stack monitor string), not a substring sweep and not a 1500-entry list.
// The verdict is a marker only, never a block — a marked row can be
// reclassified while a dropped one is gone.
const KNOWN_PROBE_UAS = new Set([
  "Better Uptime Bot Mozilla/5.0",
]);

export function isBot(request) {
  return KNOWN_PROBE_UAS.has(request.headers.get("User-Agent") ?? "");
}

// The visit report carries the verdict alone: no UA, no stored score, no ASN.
export function visitSignals(request) {
  return { is_bot: isBot(request) ? 1 : 0 };
}
