import { createI18n } from "@knotline/ui";

import en from "./messages/en.json";

const localeOverride = new URLSearchParams(globalThis.location?.search ?? "").get("locale");
const requested = localeOverride ? [localeOverride] : (globalThis.navigator?.languages ?? ["en"]);

export const i18n = createI18n({ catalogs: { en }, requested, fallback: "en" });
export const msg = i18n.msg;
