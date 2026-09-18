// orbi-probe Worker (Issue #220). The site Worker's own observability logs
// existed the whole time /cloud answered 500, but nothing read them and
// nothing alerted. This Worker runs inside Cloudflare, so it complements —
// never replaces — external third-party probing (which stays out of scope,
// tracked separately): it watches the URLs prospects are actually given,
// every three minutes, from the same network those visitors use.

// THE check list (acceptance 5): adding a URL is a one-line entry here.
// Every check expects HTTP 200 on the final response after redirects (fetch
// follows redirects); expectBody, when set, is a substring assertion on the
// body, so an empty-shell 200 fails the check (acceptance 1).
const CHECKS = [
  { url: "https://orbi.build/cloud", expectBody: "Founding" },
  { url: "https://orbi.build/" },
  { url: "https://orbi.build/blog/", expectBody: "Blog" },
  { url: "https://docs.orbi.build/", expectBody: "Orbi" },
  { url: "https://beta.orbi.build/cloud" },
];

const EXPECT_STATUS = 200;
// A single failed run is flap, not an outage: alert only after two
// consecutive failures, once per transition (acceptance 3 and 4).
const ALERT_AFTER = 2;
const FETCH_TIMEOUT_MS = 10000;

// Analytics Engine data point layout, dataset orbi_probe_results. Queried
// through the SQL API (columns index1/blobN/doubleN, table = dataset name):
//   SELECT timestamp, index1 AS url, double1 AS status, double2 AS ok,
//          double3 AS latency_ms
//   FROM orbi_probe_results WHERE timestamp > NOW() - INTERVAL '1' HOUR
//   index1 = blob1 = url; blob2 = "ok" or the failed assertion;
//   double1 = final HTTP status (0 when the fetch itself failed);
//   double2 = 1 when every assertion passed, else 0; double3 = latency ms.
function writeDataPoint(env, result) {
  env.PROBE_RESULTS.writeDataPoint({
    indexes: [result.url],
    blobs: [result.url, result.ok ? "ok" : result.failure],
    doubles: [result.status, result.ok ? 1 : 0, result.latencyMs],
  });
}

async function checkUrl(check) {
  const started = Date.now();
  let status = 0;
  let failure = null;
  try {
    const response = await fetch(check.url, {
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    status = response.status;
    if (status !== EXPECT_STATUS) {
      failure = `HTTP ${status}, expected ${EXPECT_STATUS}`;
    } else if (check.expectBody && !(await response.text()).includes(check.expectBody)) {
      failure = `HTTP ${EXPECT_STATUS} but body does not contain "${check.expectBody}"`;
    }
  } catch (err) {
    failure = `fetch failed: ${err && err.message ? err.message : err}`;
  }
  return {
    url: check.url,
    status,
    ok: failure === null,
    failure,
    latencyMs: Date.now() - started,
  };
}

// Telegram Bot API sendMessage (core.telegram.org/bots/api#sendmessage):
// POST https://api.telegram.org/bot<token>/sendMessage with chat_id + text.
async function sendTelegram(env, text) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    throw new Error("TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID secrets are not configured");
  }
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text }),
  });
  if (!response.ok) {
    throw new Error(`telegram ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
}

// Alerting must never decide whether the measurement happened, so a Telegram
// failure is logged here (probe_alert_failed) and swallowed: the data point
// is already written, and the KV streak below marks the transition as
// alerted — a still-down URL does not re-alert on later runs (acceptance 4).
async function alert(env, text) {
  try {
    await sendTelegram(env, text);
  } catch (err) {
    console.error("probe_alert_failed", err && err.message ? err.message : err);
  }
}

// State is one KV key per URL holding the consecutive-failure streak
// (acceptance 4: one alert per transition). KV, not an Analytics Engine
// query, because reading AE would need a new Cloudflare API token secret
// while KV is a single binding the cron alone writes and reads.
async function settleAlertState(env, result) {
  const previous = Number((await env.PROBE_STATE.get(result.url)) ?? 0);
  if (result.ok) {
    if (previous >= ALERT_AFTER) {
      await alert(env, `🟢 orbi-probe: ${result.url} recovered — HTTP ${result.status}`);
    }
    if (previous > 0) {
      await env.PROBE_STATE.delete(result.url);
    }
    return;
  }
  const streak = previous + 1;
  await env.PROBE_STATE.put(result.url, String(streak));
  if (streak === ALERT_AFTER) {
    await alert(env, `🔴 orbi-probe: ${result.url} — ${result.failure} (${ALERT_AFTER} consecutive failures)`);
  }
}

async function probeUrl(env, check) {
  const result = await checkUrl(check);
  // History before alerting: the data point lands first, so an alert-path
  // failure can never lose the measurement (failure path).
  writeDataPoint(env, result);
  await settleAlertState(env, result);
}

async function runProbeRun(env) {
  await Promise.all(CHECKS.map((check) => probeUrl(env, check)));
}

export { CHECKS, runProbeRun };

export default {
  // A raising cron run must not be silent (failure path): the reason lands
  // in Workers Observability via probe_run_failed, and the rethrow marks the
  // invocation itself as failed.
  async scheduled(event, env) {
    try {
      await runProbeRun(env);
    } catch (err) {
      console.error("probe_run_failed", err && err.message ? err.message : err);
      throw err;
    }
  },
};
