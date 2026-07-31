import { describe, expect, it } from "vitest";

import { createI18n, negotiateLocale, pseudoLocalize, textDirection } from "./i18n.js";

describe("localization runtime", () => {
  const catalogs = { en: { "hello.person": "Hello {name}" } } as const;

  it("negotiates exact, language, fallback, pseudo, and RTL locales", () => {
    expect(negotiateLocale(["en-IN"], ["en"])).toBe("en");
    expect(negotiateLocale(["fr"], ["en"])).toBe("en");
    expect(textDirection("ar-XB")).toBe("rtl");
    expect(pseudoLocalize("Hello")).toContain("ë");
  });

  it("formats messages, plurals, numbers, dates, currency, and lists", () => {
    const i18n = createI18n({ catalogs, requested: ["en-XA"] });
    expect(i18n.msg("hello.person", { name: "Maya" })).toContain("Màyà");
    expect(i18n.plural(2, { one: "{count} item", other: "{count} items" })).toContain("2");
    expect(i18n.number(1_000)).toContain("1,000");
    expect(i18n.currency(12, "USD")).toContain("12");
    expect(i18n.date(Date.UTC(2026, 0, 1), { timeZone: "UTC" })).toBeTruthy();
    expect(i18n.list(["one", "two"])).toContain("one");
  });
});
