#!/usr/bin/env node

import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

import { canonicalJson } from "../quality/plan-contract.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SCHEMA_PATH = join(ROOT, "contracts", "generated", "localization-schema.json");
const KEY = /^[a-z][a-z0-9]*(?:\.[a-z0-9]+)+$/u;
const PLACEHOLDER = /\{([a-z][a-zA-Z0-9]*)\}/gu;
const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"]);

function placeholders(message) {
  return [...new Set([...message.matchAll(PLACEHOLDER)].map((match) => match[1]))].sort();
}

export function validateCatalogs(catalogs) {
  const errors = [];
  const base = catalogs.en;
  if (!base) return ["The canonical en catalog is required."];
  for (const [locale, catalog] of Object.entries(catalogs)) {
    for (const [key, message] of Object.entries(catalog)) {
      if (!KEY.test(key)) errors.push(`${locale}: invalid message key ${key}`);
      if (typeof message !== "string" || message.trim() === "") {
        errors.push(`${locale}: ${key} must be a non-empty string`);
        continue;
      }
      if (base[key] === undefined && locale !== "en") errors.push(`${locale}: unknown key ${key}`);
      if (
        locale !== "en" &&
        base[key] !== undefined &&
        JSON.stringify(placeholders(base[key])) !== JSON.stringify(placeholders(message))
      ) {
        errors.push(`${locale}: placeholder drift for ${key}`);
      }
    }
    for (const key of Object.keys(base)) {
      if (catalog[key] === undefined) errors.push(`${locale}: missing key ${key}`);
    }
  }
  return errors;
}

export function validateUsages(usages, canonicalCatalog) {
  const errors = [];
  for (const usage of usages) {
    if (usage.dynamic) {
      errors.push(`${usage.file}:${usage.line}: msg() requires a literal localization key`);
    } else if (!KEY.test(usage.key)) {
      errors.push(`${usage.file}:${usage.line}: invalid localization key ${usage.key}`);
    } else if (canonicalCatalog[usage.key] === undefined) {
      errors.push(`${usage.file}:${usage.line}: unknown localization key ${usage.key}`);
    }
  }
  return errors;
}

async function filesBelow(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
    if (["dist", "node_modules", "coverage"].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesBelow(path)));
    else if (SOURCE_EXTENSIONS.has(extname(entry.name))) files.push(path);
  }
  return files;
}

export function extractUsages(source, file = "source.ts") {
  const kind = file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  const usages = [];
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "msg"
    ) {
      const argument = node.arguments[0];
      const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      if (
        argument &&
        (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))
      ) {
        usages.push({ file, line: position.line + 1, key: argument.text, dynamic: false });
      } else {
        usages.push({ file, line: position.line + 1, key: "", dynamic: true });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return usages;
}

async function loadCatalogs() {
  const catalogs = {};
  for (const application of await readdir(join(ROOT, "apps"), { withFileTypes: true })) {
    if (!application.isDirectory()) continue;
    const directory = join(ROOT, "apps", application.name, "src", "messages");
    for (const name of await readdir(directory).catch(() => [])) {
      if (!name.endsWith(".json")) continue;
      const locale = name.slice(0, -5);
      if (catalogs[locale]) throw new Error(`Duplicate locale catalog: ${locale}`);
      catalogs[locale] = JSON.parse(await readFile(join(directory, name), "utf8"));
    }
  }
  return catalogs;
}

async function loadUsages() {
  const files = [
    ...(await filesBelow(join(ROOT, "apps"))),
    ...(await filesBelow(join(ROOT, "packages")))
  ].sort();
  const usages = [];
  for (const path of files) {
    const file = relative(ROOT, path);
    usages.push(...extractUsages(await readFile(path, "utf8"), file));
  }
  return usages;
}

export function buildSchema(catalogs, usages) {
  const usageByKey = new Map();
  for (const usage of usages.filter(({ dynamic }) => !dynamic)) {
    const locations = usageByKey.get(usage.key) ?? [];
    locations.push(`${usage.file}:${usage.line}`);
    usageByKey.set(usage.key, locations);
  }
  return {
    schemaVersion: 1,
    canonicalLocale: "en",
    locales: Object.keys(catalogs).sort(),
    messages: Object.keys(catalogs.en ?? {})
      .sort()
      .map((key) => ({
        key,
        placeholders: placeholders(catalogs.en[key]),
        usedBy: [...new Set(usageByKey.get(key) ?? [])].sort()
      }))
  };
}

function selfTest() {
  const valid = {
    en: { "hello.person": "Hello {name}" },
    fr: { "hello.person": "Bonjour {name}" }
  };
  if (validateCatalogs(valid).length !== 0) throw new Error("Valid catalogs were rejected.");
  const invalid = {
    en: { "hello.person": "Hello {name}" },
    fr: { "hello.person": "Bonjour {person}", "Unknown Key": "Unexpected" }
  };
  if (validateCatalogs(invalid).length < 3) throw new Error("Localization drift was accepted.");
  const usages = extractUsages('msg("hello.person"); msg("missing.key"); msg(dynamicKey);');
  const errors = validateUsages(usages, valid.en);
  if (errors.length !== 2) throw new Error(`Usage drift was accepted: ${errors.join(", ")}`);
  const schema = buildSchema(valid, usages);
  if (schema.messages[0]?.placeholders[0] !== "name")
    throw new Error("Placeholder schema extraction failed.");
}

async function main() {
  if (process.argv.includes("--self-test")) {
    selfTest();
    process.stdout.write("Localization contract self-test passed.\n");
    return;
  }
  const catalogs = await loadCatalogs();
  const usages = await loadUsages();
  const errors = [...validateCatalogs(catalogs), ...validateUsages(usages, catalogs.en ?? {})];
  if (errors.length > 0) {
    for (const error of errors) process.stderr.write(`${error}\n`);
    process.exitCode = 1;
    return;
  }
  const expected = canonicalJson(buildSchema(catalogs, usages));
  if (process.argv.includes("generate")) {
    await writeFile(SCHEMA_PATH, expected, "utf8");
    process.stdout.write(`Generated ${relative(ROOT, SCHEMA_PATH)}.\n`);
    return;
  }
  const actual = await readFile(SCHEMA_PATH, "utf8").catch(() => "");
  if (actual !== expected) {
    process.stderr.write("Localization schema is stale; run pnpm generate:localization.\n");
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `Localization catalogs, ${usages.length} message usages, placeholders, and schema passed.\n`
  );
}

await main();
