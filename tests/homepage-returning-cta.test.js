// Issues #1372, #1377: the homepage's three Cloud CTAs, the page header's CTA
// and the note under the hero button all recognise a returning visitor.
// The shipped markup is the new-visitor state; a request carrying Cloud's own
// cookies — orbi_session (7 days) while the session is live, orbi_last_tenant
// (90 days) once it expired — gets the label that says what /cloud/login will
// actually do, and its own data-cta value so those clicks never land in the
// new-visitor conversion counts. The href never changes: /cloud/login itself
// validates the session and lands a live one in the dashboard. The note's
// first segment only describes a first visit ("GitHub sign-in and App install
// required"), so a returning visitor does not see it; its self-host link stays.
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
    en: { label: "Try Orbi Cloud free →", navLabel: "Try Cloud with GitHub", suffix: "" },
    zh: { label: "免费试用 Orbi Cloud →", navLabel: "用 GitHub 试用 Cloud", suffix: "" },
  },
  signedIn: {
    en: { label: "Open dashboard →", navLabel: "Open dashboard", suffix: "-signed-in" },
    zh: { label: "打开控制台 →", navLabel: "打开控制台", suffix: "-signed-in" },
  },
  returning: {
    en: { label: "Sign in →", navLabel: "Sign in", suffix: "-returning" },
    zh: { label: "登录 →", navLabel: "登录", suffix: "-returning" },
  },
};

// Issue #1377: the hero note's first segment is the new-visitor reassurance —
// the exact shipped sentence, asserted so a returning visitor's page is known
// to drop that sentence and not some other one.
const NOTE_FIRST = {
  en: "GitHub sign-in and App install required. No credit card required",
  zh: "需 GitHub 授权并安装 App。不用绑卡。",
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

// The hero note paragraph: one line of spans, so the first <p> end closes it.
function heroNote(body) {
  return body.match(/<p class="hero-cta-note">[\s\S]*?<\/p>/)?.[0] ?? "";
}

// Every data-cta value that carries the visitor state (Issues #1372, #1377).
const VISITOR_CTA_KEYS = [...CTAS.map(({ key }) => key), "nav-start"];

const CASES = [
  { state: "signedIn", cookie: "orbi_session=live-session-value", why: "a live Cloud session" },
  { state: "returning", cookie: "orbi_last_tenant=acme", why: "a visitor whose session expired" },
  { state: "newVisitor", cookie: null, why: "a first visit" },
];

describe("homepage first screen for returning visitors (Issues #1372, #1377)", () => {
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
        // Issue #1377: the page header's button is the same handoff, so it says
        // the same thing and keeps the same login href.
        const nav = cta(body, `nav-start${expected.suffix}`);
        expect(nav, `${path} nav: data-cta="nav-start${expected.suffix}"`).toBeTruthy();
        expect(nav.label, `${path} nav: label`).toBe(expected.navLabel);
        expect(nav.href, `${path} nav: href`).toBe(contract.login);
        // Exactly one CTA per position: the other states' values must be gone,
        // or a page would carry two of the same button.
        for (const other of Object.values(STATES)) {
          const suffix = other[contract.lang].suffix;
          if (suffix === expected.suffix) continue;
          for (const key of VISITOR_CTA_KEYS) {
            expect(body, `${path}: stale data-cta="${key}${suffix}"`).not.toContain(`data-cta="${key}${suffix}"`);
          }
        }
        // Issue #1377: the note's first segment describes a first visit only;
        // the self-host link in the same line survives in every state.
        const note = heroNote(body);
        expect(note, `${path}: hero CTA note missing`).toBeTruthy();
        expect(note, `${path}: the self-host link`).toContain('data-cta="hero-github"');
        if (state === "newVisitor") {
          expect(note, `${path}: the new-visitor note`).toContain(
            `<span class="hero-cta-note-first">${NOTE_FIRST[contract.lang]}</span>`,
          );
        } else {
          expect(note, `${path}: the first-visit sentence must be gone`).not.toContain("hero-cta-note-first");
          // A separator left behind would open the line with a lone "·".
          expect(note, `${path}: the separator must go with the sentence`).not.toContain("hero-cta-note-separator");
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
        .filter((name) => !VISITOR_CTA_KEYS.some((key) => name.startsWith(key)));
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
    // The shared nav and the Cloud page's own note keep the new-visitor state:
    // Issue #1377 changes the homepage only.
    expect(cta(body, "nav-start")?.label, "/cloud/ nav-start").toBe("Try Cloud with GitHub");
    expect(body, "/cloud/ must not carry a state-only data-cta").not.toMatch(/nav-start-(signed-in|returning)/);
    expect(body, "/cloud/ hero note keeps its first segment").toContain("hero-cta-note-first");
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
    for (const key of VISITOR_CTA_KEYS) {
      const label = key === "nav-start" ? STATES.newVisitor.en.navLabel : STATES.newVisitor.en.label;
      expect(cta(body, key)?.label, key).toBe(label);
      expect(body).not.toContain(`${key}-signed-in`);
    }
    expect(heroNote(body), "the new-visitor note").toContain("hero-cta-note-first");
  });
});
