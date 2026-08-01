import { describe, expect, it } from "vitest";

import { createI18n, negotiateLocale, pseudoLocalize, textDirection } from "./i18n.js";

describe("localization runtime", () => {
  const catalogs = { en: { "hello.person": "Hello {name}" } } as const;

  it("negotiates exact, language, fallback, pseudo, and RTL locales", () => {
    expect(negotiateLocale(["EN"], ["en"])).toBe("en");
    expect(negotiateLocale(["en-IN"], ["en"])).toBe("en");
    expect(negotiateLocale(["fr"], ["en"])).toBe("en");
    expect(negotiateLocale([], ["fr"], "en")).toBe("fr");
    expect(negotiateLocale([], [], "en")).toBe("en");
    expect(textDirection("ur-PK")).toBe("rtl");
    expect(textDirection("ar-XB")).toBe("rtl");
    expect(textDirection("en-US")).toBe("ltr");
    expect(pseudoLocalize("Hello")).toContain("ë");
    expect(pseudoLocalize("123")).toContain("123");
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

  it("preserves unsupported interpolation values and reports invalid catalogs or keys", () => {
    const richer = createI18n({
      catalogs: {
        en: {
          value: "{missing}:{number}:{flag}:{object}",
          plural: "unused"
        }
      },
      requested: [],
      fallback: "en"
    });
    expect(richer.locale).toBe("en");
    expect(richer.msg("value", { number: 3, flag: true, object: {} })).toBe(
      "{missing}:3:true:{object}"
    );
    expect(() => richer.msg("missing" as "value")).toThrow("Unknown localization key");
    expect(richer.plural(1, {})).toBe("");
    expect(() => createI18n({ catalogs: {}, requested: ["fr"] })).toThrow(
      "fallback catalog is unavailable"
    );
  });

  it("uses a normal requested locale without pseudo-localization", () => {
    const localized = createI18n({
      catalogs: { en: { hello: "Hello" }, fr: { hello: "Bonjour" } },
      requested: ["fr-FR"],
      fallback: "en"
    });
    expect(localized.locale).toBe("fr");
    expect(localized.msg("hello")).toBe("Bonjour");
  });
});
