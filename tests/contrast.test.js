import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const css = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");

function variable(name) {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i"));
  expect(match, `missing --${name}`).not.toBeNull();
  return match[1];
}

function luminance(hex) {
  const channels = hex.match(/[0-9a-f]{2}/gi).map((value) => Number.parseInt(value, 16) / 255);
  const [red, green, blue] = channels.map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(foreground, background) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function declaration(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  expect(match, `missing rule for ${selector}`).not.toBeNull();
  return match[1];
}

describe("light-surface accent contrast", () => {
  it.each([
    ["run-on-light", "paper"],
    ["run-on-light", "paper-2"],
    ["signal-on-light", "paper"],
    ["signal-on-light", "paper-2"],
  ])("keeps --%s readable on --%s", (foreground, background) => {
    expect(contrast(variable(foreground), variable(background))).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    [".founding-offer .founding-price", "run-on-light"],
    [".founding-availability", "run-on-light"],
    [".trust-line-paper li::before", "run-on-light"],
    [".shift-list em", "signal-on-light"],
    [".proof-arrow", "signal-on-light"],
    [".future-loop li::after", "signal-on-light"],
    [".faq-item summary::after", "signal-on-light"],
  ])("uses the light-surface token for %s", (selector, token) => {
    expect(declaration(selector)).toMatch(new RegExp(`color:\\s*var\\(--${token}\\)`));
  });
});
