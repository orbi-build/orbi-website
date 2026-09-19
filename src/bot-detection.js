// Bot marking for the attribution chain (Issue #243). Classification is
// Cloudflare's answer, not ours: the Workers plan computes
// request.cf.botManagement.score on every request (1-29 automated, 30-99
// likely human). The verdict is a marker only, never a block — a marked row
// can be reclassified while a dropped one is gone.
export function isBot(request) {
  const bm = request.cf?.botManagement;
  return bm ? bm.score <= 30 : false;
}

// The visit report carries the verdict alone (Issue #243): no UA, no
// Sec-Fetch-Mode, no stored score. Without botManagement (local wrangler
// dev) every visitor counts as human — the Issue forbids a fallback path.
export function visitSignals(request) {
  return { is_bot: isBot(request) ? 1 : 0 };
}
