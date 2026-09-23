import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function browserHarness() {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const source = html.match(/<script>\(\(\)=>\{[\s\S]*?engagement_report_failed[\s\S]*?<\/script>/)?.[0]
    .replace(/^<script>|<\/script>$/g, "");
  expect(source).toBeTruthy();

  let now = 0;
  let timerId = 0;
  const timers = [];
  const handlers = new Map();
  const beacons = [];
  const document = {
    visibilityState: "visible",
    documentElement: { scrollHeight: 400 },
  };
  const context = {
    Blob,
    Date: { now: () => now },
    console: { warn() {} },
    document,
    innerHeight: 100,
    scrollY: 0,
    location: { pathname: "/" },
    navigator: { sendBeacon: (_url, body) => { beacons.push(body); return true; } },
    addEventListener: (type, handler) => {
      const list = handlers.get(type) ?? [];
      list.push(handler);
      handlers.set(type, list);
    },
    setTimeout: (handler, delay) => {
      timers.push({ id: ++timerId, at: now + delay, handler });
      return timerId;
    },
  };
  vm.runInNewContext(source, context);

  const advance = (milliseconds) => {
    const target = now + milliseconds;
    while (true) {
      timers.sort((a, b) => a.at - b.at);
      const timer = timers[0];
      if (!timer || timer.at > target) break;
      timers.shift();
      now = timer.at;
      timer.handler();
    }
    now = target;
  };
  const dispatch = (type, event = {}) => {
    for (const handler of handlers.get(type) ?? []) handler(event);
  };
  const events = async () => Promise.all(beacons.map(async body => JSON.parse(await body.text())));
  return { advance, context, dispatch, document, events };
}

describe("engagement browser reporter", () => {
  it("does not engage before ten visible seconds or without interaction", async () => {
    const early = await browserHarness();
    early.dispatch("pointerdown");
    early.advance(9_999);
    expect((await early.events()).filter(event => event.kind === "engaged")).toHaveLength(0);

    const idle = await browserHarness();
    idle.advance(20_000);
    expect((await idle.events()).filter(event => event.kind === "engaged")).toHaveLength(0);
  });

  it("engages once after ten cumulative visible seconds and an interaction", async () => {
    const page = await browserHarness();
    page.dispatch("keydown");
    page.advance(6_000);
    page.document.visibilityState = "hidden";
    page.dispatch("visibilitychange");
    page.advance(20_000);
    page.document.visibilityState = "visible";
    page.dispatch("visibilitychange");
    page.advance(4_000);
    expect((await page.events()).filter(event => event.kind === "engaged")).toHaveLength(1);

    page.dispatch("pointerdown");
    page.advance(20_000);
    expect((await page.events()).filter(event => event.kind === "engaged")).toHaveLength(1);
  });

  it("reports the reached scroll band only once across hide and pagehide", async () => {
    const page = await browserHarness();
    page.context.scrollY = 104;
    page.document.visibilityState = "hidden";
    page.dispatch("visibilitychange");
    page.context.scrollY = 300;
    page.dispatch("pagehide");

    const depths = (await page.events()).filter(event => event.kind === "scroll_depth");
    expect(depths).toEqual([{ kind: "scroll_depth", path: "/", detail: "50" }]);
  });
});
