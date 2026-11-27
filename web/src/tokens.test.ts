import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// WCAG 2.x contrast, computed from the real token file so a bad colour change fails the build.
const css = readFileSync(resolve(process.cwd(), "src/styles/tokens.css"), "utf8");
function block(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9A-Fa-f]{6})/g)].map((m) => [m[1], m[2]]));
}
const light = block(":root {");
const dark = { ...light, ...block(':root[data-theme="dark"], .band-dark') };
const lum = (hex: string) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

const TEXT_PAIRS: [string, string, number][] = [
  ["text", "bg", 4.5], ["text", "surface", 4.5], ["text", "surface-2", 4.5], ["text-muted", "bg", 4.5], ["text-muted", "surface", 4.5], ["text-muted", "surface-2", 4.5],
  ["on-primary", "primary", 4.5], ["on-accent", "accent", 4.5], ["accent", "bg", 4.5], ["accent", "surface", 4.5],
  ["success", "success-bg", 4.5], ["warning", "warning-bg", 4.5], ["danger", "danger-bg", 4.5], ["info", "info-bg", 4.5],
  ["danger", "surface", 4.5], ["danger", "bg", 4.5], ["success", "surface", 4.5],
  ["on-hero", "hero-bg", 4.5], ["on-hero-muted", "hero-bg", 4.5], ["on-hero", "bar", 4.5], ["on-mango", "mango", 4.5],
];
for (const [name, t] of [["light", light], ["dark", dark]] as const) {
  describe(`${name} theme contrast (WCAG AA)`, () => {
    for (const [fg, bg, min] of TEXT_PAIRS) it(`${fg} on ${bg} is at least ${min}:1`, () => expect(ratio(t[fg], t[bg])).toBeGreaterThanOrEqual(min));
    it("focus ring and control borders are at least 3:1 on their backgrounds", () => {
      expect(ratio(t.focus, t.bg)).toBeGreaterThanOrEqual(3);
      expect(ratio(t.focus, t.surface)).toBeGreaterThanOrEqual(3);
    });
  });
}
describe("hero text on the mint gradient", () => {
  it("dark text on the light mint and light text on the deep mint stay readable", () => {
    expect(ratio(light.text, "#BDEBD6")).toBeGreaterThanOrEqual(7);
    expect(ratio(light.accent, "#BDEBD6")).toBeGreaterThanOrEqual(3); // large headline text needs 3:1
    expect(ratio(dark.text, "#1B3D30")).toBeGreaterThanOrEqual(7);
    expect(ratio(dark.accent, "#1B3D30")).toBeGreaterThanOrEqual(3);
  });
});
