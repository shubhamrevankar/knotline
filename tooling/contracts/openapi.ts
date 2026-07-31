#!/usr/bin/env tsx

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { HTTP_ROUTE_CONTRACTS } from "@knotline/contracts";
import { z } from "zod";

const root = resolve(new URL("../..", import.meta.url).pathname);
const output = resolve(root, "packages/contracts/generated/openapi.json");
const apiSource = resolve(root, "apps/api/src/app.ts");

function jsonSchema(schema: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema, {
    target: "draft-7",
    unrepresentable: "any",
    reused: "ref"
  });
}

export function generateOpenApi(): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const route of HTTP_ROUTE_CONTRACTS) {
    const parameters = [...route.path.matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/gu)].map((match) => ({
      in: "path",
      name: match[1],
      required: true,
      schema: { type: "string", minLength: 1, maxLength: 160 }
    }));
    const responses = Object.fromEntries(
      Object.entries(route.responses).map(([status, schema]) => [
        status,
        {
          description: Number(status) < 400 ? "Successful response" : "Typed error response",
          headers: {
            "Knotline-Request-Id": {
              description: "Stable request correlation identifier",
              schema: { type: "string" }
            },
            traceparent: {
              description: "W3C distributed tracing context",
              schema: { type: "string" }
            }
          },
          content: { "application/json": { schema: jsonSchema(schema) } }
        }
      ])
    );
    const operation: Record<string, unknown> = {
      operationId: route.operationId,
      summary: route.summary,
      tags: route.tags,
      "x-knotline-exposure": route.exposure,
      ...(parameters.length === 0 ? {} : { parameters }),
      ...(route.requestBody === undefined
        ? {}
        : {
            requestBody: {
              required: true,
              content: { "application/json": { schema: jsonSchema(route.requestBody) } }
            }
          }),
      responses
    };
    const path = (paths[route.path] ??= {});
    path[route.method.toLowerCase()] = operation;
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "Knotline internal API",
      version: "0.1.0",
      description: "Generated from the repository-owned transport contract registry."
    },
    servers: [{ url: "http://localhost:4100", description: "Local development" }],
    paths
  };
}

export function serializedOpenApi(): string {
  return `${JSON.stringify(generateOpenApi(), null, 2)}\n`;
}

async function assertRuntimeRouteParity(): Promise<void> {
  const source = await readFile(apiSource, "utf8");
  const implemented = [
    ...source.matchAll(/app\.(get|post|put|patch|delete)(?:<[\s\S]*?>)?\(\s*"([^"]+)"/gu)
  ]
    .map((match) => {
      const method = match[1]?.toUpperCase();
      const path = match[2]?.replace(/:([A-Za-z][A-Za-z0-9]*)/gu, "{$1}");
      return `${method} ${path}`;
    })
    .filter(
      (operation) =>
        !["GET /health/live", "GET /health/ready"].includes(operation) &&
        !operation.includes(" /__local/")
    )
    .sort();
  const contracted = HTTP_ROUTE_CONTRACTS.map((route) => `${route.method} ${route.path}`).sort();
  if (JSON.stringify(implemented) !== JSON.stringify(contracted)) {
    throw new Error(
      `Runtime/OpenAPI route drift: runtime=${implemented.join(",")} contract=${contracted.join(",")}`
    );
  }
  for (const route of HTTP_ROUTE_CONTRACTS) {
    if (route.path.startsWith("/v1/") && route.exposure !== "browser_internal") {
      throw new Error(`${route.method} ${route.path} must be browser_internal.`);
    }
  }
}

const mode = process.argv[2] ?? "check";
if (mode === "generate") {
  await assertRuntimeRouteParity();
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, serializedOpenApi());
  process.stdout.write(`generated ${output}\n`);
} else if (mode === "check") {
  await assertRuntimeRouteParity();
  const expected = serializedOpenApi();
  let actual = "";
  try {
    actual = await readFile(output, "utf8");
  } catch {
    // Missing generated output is drift.
  }
  if (actual !== expected) {
    process.stderr.write("OpenAPI output has drifted; run the generation command.\n");
    process.exitCode = 1;
  } else {
    process.stdout.write(
      `OpenAPI contract passed (${String(HTTP_ROUTE_CONTRACTS.length)} operations)\n`
    );
  }
} else {
  throw new Error("OpenAPI mode must be generate or check.");
}
