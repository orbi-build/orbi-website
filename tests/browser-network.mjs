// Shared third-party request guard for the Playwright browser suites.
//
// Every page ships four footer directory badges (site/partials/footer.html) and
// Cloudflare Web Analytics' beacon (scripts/build-pages.mjs), and some posts
// embed a YouTube iframe. The suites navigate with
// `goto(..., { waitUntil: "load" })`, which waits for all of them, so every run
// raced servers the tests do not own. On 2026-10-05 that turned CI's
// "Run browser layout tests" step into intermittent timeouts (Issue #871).
//
// `guardBrowserRequests` answers each third-party request inside Chromium:
// images get a transparent placeholder at the size the page declares, scripts
// get an empty 200, anything else is aborted. It also records the third-party
// requests that reached the network without being intercepted, so a suite can
// assert none did with `assertNoExternalRequests`.
//
// The counters are module state, and Vitest isolates test files, so a counter
// covers exactly the pages the file that imported it opened.

// The four footer badge embeds declared in site/partials/footer.html, with the
// size the page declares. LaunchNest's embed declares only width="240"; its
// live badge is 205x36, so 240x42.146 keeps that ratio and the <img> renders
// 240x42 exactly like it does online. The other three declare width and height,
// which fix the rendered box regardless of the placeholder's natural size.
const BADGE_PLACEHOLDER_SIZES = [
  { host: "launchnest.io", width: 240, height: 42.146 },
  { host: "aiagentsdirectory.com", width: 168, height: 42 },
  { host: "aiagentslisting.com", width: 168, height: 42 },
  { host: "toolradar.com", width: 147, height: 42 },
];
const FALLBACK_PLACEHOLDER_SIZE = { width: 1, height: 1 };

const blockedRequests = new Set();
const interceptedRequests = new WeakSet();

function isNetworkUrl(url) {
  return url.protocol === "http:" || url.protocol === "https:";
}

function placeholderSvg(url) {
  const size = BADGE_PLACEHOLDER_SIZES.find((badge) => badge.host === new URL(url).hostname)
    ?? FALLBACK_PLACEHOLDER_SIZE;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}"></svg>`;
}

// Answer every request that is not the local test server from inside the
// browser, and remember the ones that were not answered.
export function guardBrowserRequests(context, origin) {
  const localOrigin = new URL(origin).origin;

  context.on("request", (request) => {
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
