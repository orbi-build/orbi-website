// Shared third-party request guard for the Playwright browser suites.
//
// Every page ships fourteen footer badge images (site/partials/footer.html) plus
// Cloudflare Web Analytics' beacon (scripts/build-pages.mjs), and some posts
// embed a YouTube iframe. The suites navigate with
// `goto(..., { waitUntil: "load" })`, which waits for all of them, so every run
// raced servers the tests do not own. On 2026-10-05 that turned CI's
// "Run browser layout tests" step into intermittent timeouts (Issue #871).
//
// `guardBrowserRequests` answers each third-party request inside Chromium:
// images get a transparent placeholder at the size the page declares, scripts
// get an empty 200, anything else is aborted. It also records the third-party
// requests that got a response without being intercepted, so a suite can
// assert none did with `assertNoExternalRequests`.
//
// The counters are module state, and Vitest isolates test files, so a counter
// covers exactly the pages the file that imported it opened.

// The footer badge embeds in site/partials/footer.html, each served here at its
// real source ratio so the rendered box proves the ratio rather than the
// vendor's declared size. Verified against the live sources on 2026-10-20:
// LaunchNest 205x36, AI Agents Directory 200x50, AI Agents Listing 200x50,
// Toolradar 280x80, Altern 430x151 (PNG), SaaSpa.ge 200x60 (SVG), Tooluck
// 336x88; and on 2026-10-28 neeed.directory 139x44 (SVG, Issue #1092) and
// zplatform.ai 250x60 (PNG, Issue #1092). Since Issue #1038 the shared footer
// rule renders every badge at 28px high, so the placeholder's natural size
// decides only the width the source ratio implies (e.g. LaunchNest
// 205/36 * 28 = 159.44).
export const BADGE_PLACEHOLDER_SIZES = [
  { host: "launchnest.io", width: 205, height: 36 },
  { host: "aiagentsdirectory.com", width: 168, height: 42 },
  { host: "aiagentslisting.com", width: 168, height: 42 },
  { host: "toolradar.com", width: 147, height: 42 },
  { host: "data.altern.ai", width: 430, height: 151 },
  { host: "saaspa.ge", width: 200, height: 60 },
  { host: "www.tooluck.org", width: 336, height: 88 },
  { host: "neeed.directory", width: 139, height: 44 },
  { host: "zplatform.ai", width: 250, height: 60 },
];
const FALLBACK_PLACEHOLDER_SIZE = { width: 1, height: 1 };

const blockedRequests = new Set();
const interceptedRequests = new WeakSet();

function isNetworkUrl(url) {
  return url.protocol === "http:" || url.protocol === "https:";
}

export function placeholderSvg(url) {
  const size = BADGE_PLACEHOLDER_SIZES.find((badge) => badge.host === new URL(url).hostname)
    ?? FALLBACK_PLACEHOLDER_SIZE;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}"></svg>`;
}

// Answer every request that is not the local test server from inside the
// browser, and remember the ones that were not answered.
export function guardBrowserRequests(context, origin) {
  const localOrigin = new URL(origin).origin;

  // Count a third-party request only once a response for it arrives. A lazy
  // footer badge can start loading while the page is closing: the "request"
  // event fires, the page is gone before the route handler runs, and the
  // request is cancelled without touching the network. Counting it on
  // "request" made that teardown race a guard failure (PR #893, run 37728049058).
  context.on("response", (response) => {
    const request = response.request();
    const url = new URL(request.url());
    if (!isNetworkUrl(url) || url.origin === localOrigin) return;
    blockedRequests.add(request);
  });

  return context.route(
    (url) => isNetworkUrl(url) && url.origin !== localOrigin,
    (route) => {
      const request = route.request();
      interceptedRequests.add(request);
      if (request.resourceType() === "image") {
        return route.fulfill({
          status: 200,
          contentType: "image/svg+xml",
          body: placeholderSvg(request.url()),
        });
      }
      if (request.resourceType() === "script") {
        return route.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8", body: "" });
      }
      return route.abort();
    },
  );
}

// browser.newPage() opens its own context; guard that context before the page
// can navigate. Page options (deviceScaleFactor, viewport) are context options,
// so they are passed through untouched.
export async function guardedPage(browser, origin, options) {
  const page = await browser.newPage(options);
  await guardBrowserRequests(page.context(), origin);
  return page;
}

// Third-party requests the guard saw but did not intercept: they went to the
// real external network.
export function allowedExternalRequests() {
  return [...blockedRequests]
    .filter((request) => !interceptedRequests.has(request))
    .map((request) => request.url());
}

export function assertNoExternalRequests() {
  const allowed = allowedExternalRequests();
  if (allowed.length > 0) {
    throw new Error(
      `${allowed.length} third-party request(s) reached the network because nothing intercepted them: `
      + allowed.join(", "),
    );
  }
}
