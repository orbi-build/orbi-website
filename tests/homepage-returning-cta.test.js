// Issue #1372: the homepage's three Cloud CTAs recognise a returning visitor.
// The shipped markup is the new-visitor state; a request carrying Cloud's own
// cookies — orbi_session (7 days) while the session is live, orbi_last_tenant
// (90 days) once it expired — gets the label that says what /cloud/login will
// actually do, and its own data-cta value so those clicks never land in the
// new-visitor conversion counts. The href never changes: /cloud/login itself
// validates the session and lands a live one in the dashboard.
//
// This drives the Worker over the built public/ pages, the same bytes a browser
// receives, with the Cookie header a real visitor's browser sends.

import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { handleFetch } from "../src/worker.js";

const pages = {
  "/": await readFile(new URL("../public/index.html", import.meta.url), "utf8"),
  "/zh/": await readFile(new URL("../public/zh/index.html", import.meta.url), "utf8"),
};

const CTAS = [
  { name: "hero", key: "cloud-start" },
  { name: "midway", key: "midway-cloud" },
  { name: "closing", key: "closing-start" },
];

const STATES = {
  newVisitor: {
    en: { label: "Try Orbi Cloud free →", suffix: "" },
    zh: { label: "免费试用 Orbi Cloud →", suffix: "" },
  },
  signedIn: {
    en: { label: "Open dashboard →", suffix: "-signed-in" },
    zh: { label: "打开控制台 →", suffix: "-signed-in" },
  },
  returning: {
    en: { label: "Sign in →", suffix: "-returning" },
    zh: { label: "登录 →", suffix: "-returning" },
  },
};

async function homepage(path, cookie) {
  const html = pages[path];
  const response = await handleFetch(
    new Request(`https://orbi.build${path}`, { headers: cookie ? { Cookie: cookie } : {} }),
    {
      ASSETS: {
        fetch: () => Promise.resolve(new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } })),
      },
      CLOUD_LOGIN_URL: "https://beta.orbi.build/api/login",
    },
  );
  return response.text();
}

// The three CTAs are single-line anchors with a plain-text label, so one
// pattern reads each of them out of the served page.
function cta(body, key) {
  const match = body.match(new RegExp(`<a [^>]*data-cta="${key}" href="([^"]+)"[^>]*>([^<]*)</a>`));
  return match && { href: match[1], label: match[2] };
}

const LANG = {
  "/": { lang: "en", login: "/cloud/login" },
  "/zh/": { lang: "zh", login: "/zh/cloud/login" },
};

const CASES = [
  { state: "signedIn", cookie: "orbi_session=live-session-value", why: "a live Cloud session" },
  { state: "returning", cookie: "orbi_last_tenant=acme", why: "a visitor whose session expired" },
  { state: "newVisitor", cookie: null, why: "a first visit" },
];

describe("homepage CTAs for returning visitors (Issue #1372)", () => {
  for (const path of Object.keys(pages)) {
    const contract = LANG[path];
    for (const { state, cookie, why } of CASES) {
      it(`${path} shows the ${state} wording and data-cta for ${why}`, async () => {
        const body = await homepage(path, cookie);
        const expected = STATES[state][contract.lang];
        for (const { key } of CTAS) {
          const found = cta(body, key + expected.suffix);
          expect(found, `${path} ${key}: data-cta="${key}${expected.suffix}"`).toBeTruthy();
          expect(found.label, `${path} ${key}: label`).toBe(expected.label);
          expect(found.href, `${path} ${key}: href`).toBe(contract.login);
        }
        // Exactly one CTA per position: the other states' values must be gone,
        // or a page would carry two of the same button.
        for (const other of Object.values(STATES)) {
          const suffix = other[contract.lang].suffix;
          if (suffix === expected.suffix) continue;
          for (const { key } of CTAS) {
            expect(body, `${path}: stale data-cta="${key}${suffix}"`).not.toContain(`data-cta="${key}${suffix}"`);
          }
        }
      });
    }

    it(`${path} keeps the live-session wording when both cookies are present`, async () => {
      const body = await homepage(path, "orbi_session=live; orbi_last_tenant=acme");
      const expected = STATES.signedIn[contract.lang];
      for (const { key } of CTAS) {
        expect(cta(body, key + expected.suffix)?.label, `${path} ${key}`).toBe(expected.label);
      }
    });

    it(`${path} leaves every other CTA alone`, async () => {
      const plain = await homepage(path, null);
      const returning = await homepage(path, "orbi_session=live");
      const otherCtas = (body) => [...body.matchAll(/data-cta="([^"]+)"/g)]
        .map((match) => match[1])
        .filter((name) => !CTAS.some(({ key }) => name.startsWith(key)));
      expect(otherCtas(returning)).toEqual(otherCtas(plain));
    });
  }

  it("does not rewrite the Cloud page's own CTAs", async () => {
    const html = await readFile(new URL("../public/cloud/index.html", import.meta.url), "utf8");
    const response = await handleFetch(
      new Request("https://orbi.build/cloud/", { headers: { Cookie: "orbi_session=live" } }),
      {
        ASSETS: {
          fetch: () => Promise.resolve(new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } })),
        },
        CLOUD_LOGIN_URL: "https://beta.orbi.build/api/login",
      },
    );
    const body = await response.text();
    expect(cta(body, "cloud-hero")?.label).toBe("Try Orbi Cloud free →");
  });

  it("keeps the new-visitor wording when Cloud is not configured", async () => {
    const html = pages["/"];
    const response = await handleFetch(
      new Request("https://orbi.build/", { headers: { Cookie: "orbi_session=live" } }),
      {
        ASSETS: {
          fetch: () => Promise.resolve(new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } })),
        },
      },
    );
    const body = await response.text();
    for (const { key } of CTAS) {
      expect(cta(body, key)?.label, key).toBe(STATES.newVisitor.en.label);
      expect(body).not.toContain(`${key}-signed-in`);
    }
  });
});
