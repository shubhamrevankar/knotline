export type MessageCatalog = Readonly<Record<string, string>>;

const RTL_LANGUAGES = new Set(["ar", "fa", "he", "ps", "ur"]);
const PSEUDO_MAP: Readonly<Record<string, string>> = {
  a: "à",
  e: "ë",
  i: "ï",
  o: "ô",
  u: "ü",
  A: "À",
  E: "Ë",
  I: "Ï",
  O: "Ö",
  U: "Ü"
};

export function negotiateLocale(
  requested: readonly string[],
  available: readonly string[],
  fallback = "en"
): string {
  for (const candidate of requested) {
    const exact = available.find((locale) => locale.toLowerCase() === candidate.toLowerCase());
    if (exact) return exact;
    const language = candidate.split("-")[0]?.toLowerCase();
    const compatible = available.find((locale) => locale.split("-")[0]?.toLowerCase() === language);
    if (compatible) return compatible;
  }
  return available.includes(fallback) ? fallback : (available[0] ?? fallback);
}

export function textDirection(locale: string): "ltr" | "rtl" {
  return RTL_LANGUAGES.has(locale.split("-")[0]?.toLowerCase() ?? "") || locale === "ar-XB"
    ? "rtl"
    : "ltr";
}

export function pseudoLocalize(message: string): string {
  return `［${[...message].map((character) => PSEUDO_MAP[character] ?? character).join("")} ···］`;
}

function interpolate(message: string, values: Readonly<Record<string, unknown>>): string {
  return message.replace(/\{([a-z][a-zA-Z0-9]*)\}/gu, (token, key: string) => {
    const value = values[key];
    if (value === undefined) return token;
    if (typeof value === "string") return value;
    if (["number", "bigint", "boolean"].includes(typeof value))
      return `${value as number | bigint | boolean}`;
    return token;
  });
}

export interface I18n<Key extends string> {
  readonly locale: string;
  readonly direction: "ltr" | "rtl";
  msg: (key: Key, values?: Readonly<Record<string, unknown>>) => string;
  number: (value: number, options?: Intl.NumberFormatOptions) => string;
  currency: (value: number, currency: string) => string;
  date: (value: Date | number, options?: Intl.DateTimeFormatOptions) => string;
  list: (values: readonly string[], options?: Intl.ListFormatOptions) => string;
  plural: (value: number, forms: Readonly<Partial<Record<Intl.LDMLPluralRule, string>>>) => string;
}

export function createI18n<Catalog extends MessageCatalog>(options: {
  catalogs: Readonly<Record<string, Catalog>>;
  requested: readonly string[];
  fallback?: string;
}): I18n<Extract<keyof Catalog, string>> {
  const available = Object.keys(options.catalogs);
  const firstRequested = options.requested[0] ?? options.fallback ?? "en";
  const requestedPseudo = firstRequested === "en-XA" || firstRequested === "ar-XB";
  const locale = requestedPseudo
    ? firstRequested
    : negotiateLocale(options.requested, available, options.fallback);
  const catalogLocale = requestedPseudo ? (options.fallback ?? "en") : locale;
  const catalog = options.catalogs[catalogLocale] ?? options.catalogs[options.fallback ?? "en"];
  if (!catalog) throw new Error("The localization fallback catalog is unavailable");
  const formattingLocale = requestedPseudo ? "en" : locale;
  return {
    locale,
    direction: textDirection(locale),
    msg(key, values = {}) {
      const source = catalog[key];
      if (source === undefined) throw new Error(`Unknown localization key: ${key}`);
      const rendered = interpolate(source, values);
      return requestedPseudo ? pseudoLocalize(rendered) : rendered;
    },
    number: (value, numberOptions) =>
      new Intl.NumberFormat(formattingLocale, numberOptions).format(value),
    currency: (value, currency) =>
      new Intl.NumberFormat(formattingLocale, { style: "currency", currency }).format(value),
    date: (value, dateOptions) =>
      new Intl.DateTimeFormat(formattingLocale, dateOptions).format(value),
    list: (values, listOptions) =>
      new Intl.ListFormat(formattingLocale, listOptions).format(values),
    plural(value, forms) {
      const category = new Intl.PluralRules(formattingLocale).select(value);
      return interpolate(forms[category] ?? forms.other ?? "", { count: value });
    }
  };
}
