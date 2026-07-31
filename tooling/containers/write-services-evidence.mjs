#!/usr/bin/env node

import { writeFile } from "node:fs/promises";

const output = process.argv[2];
if (!output) throw new Error("An evidence output path is required");

let input = "";
for await (const chunk of process.stdin) input += chunk;
const services = [...new Set(input.split(/\s+/u).filter(Boolean))].sort();
if (services.length === 0 || services.some((service) => !/^[a-z][a-z0-9-]+$/u.test(service))) {
  throw new Error("Compose service evidence was empty or invalid");
}
await writeFile(
  output,
  `${JSON.stringify({ schemaVersion: 1, scope: "localhost-only", services }, null, 2)}\n`
);
