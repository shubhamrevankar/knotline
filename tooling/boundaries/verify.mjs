#!/usr/bin/env node

import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

async function workspaceDirectories(root) {
  const directories = [];
  for (const family of ["apps", "packages"]) {
    const parent = resolve(root, family);
    for (const entry of await readdir(parent, { withFileTypes: true })) {
      if (entry.isDirectory()) directories.push(resolve(parent, entry.name));
    }
  }
  return directories;
}

async function sourceFiles(directory) {
  const files = [];
  async function visit(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      if (["dist", "node_modules", "coverage"].includes(entry.name)) continue;
      const next = join(path, entry.name);
      if (entry.isDirectory()) await visit(next);
      else if (entry.isFile() && /\.[cm]?[jt]sx?$/u.test(entry.name)) files.push(next);
    }
  }
  try {
    await visit(resolve(directory, "src"));
  } catch {
    // A workspace may contain tooling only.
  }
  return files;
}

function imports(source) {
  const selected = [];
  const pattern = /(?:from\s+|import\s*\(|require\s*\()\s*["']([^"']+)["']/gu;
  for (const match of source.matchAll(pattern)) if (match[1]) selected.push(match[1]);
  return selected;
}

function hasCycle(graph) {
  const visiting = new Set();
  const visited = new Set();
  function visit(node, path) {
    if (visiting.has(node)) return [...path, node];
    if (visited.has(node)) return null;
    visiting.add(node);
    for (const dependency of graph.get(node) ?? []) {
      const cycle = visit(dependency, [...path, node]);
      if (cycle) return cycle;
    }
    visiting.delete(node);
    visited.add(node);
    return null;
  }
  for (const node of graph.keys()) {
    const cycle = visit(node, []);
    if (cycle) return cycle;
  }
  return null;
}

export async function verifyBoundaries(root) {
  const errors = [];
  const workspaces = [];
  for (const directory of await workspaceDirectories(root)) {
    const manifest = JSON.parse(await readFile(resolve(directory, "package.json"), "utf8"));
    workspaces.push({
      directory,
      name: manifest.name,
      family: relative(root, directory).split(sep)[0],
      declared: new Set([
        ...Object.keys(manifest.dependencies ?? {}),
        ...Object.keys(manifest.devDependencies ?? {}),
        ...Object.keys(manifest.peerDependencies ?? {})
      ])
    });
  }
  const byName = new Map(workspaces.map((workspace) => [workspace.name, workspace]));
  const graph = new Map(workspaces.map((workspace) => [workspace.name, new Set()]));
  for (const workspace of workspaces) {
    for (const dependency of workspace.declared) {
      if (!byName.has(dependency)) continue;
      graph.get(workspace.name)?.add(dependency);
      if (workspace.family === "packages" && byName.get(dependency)?.family === "apps") {
        errors.push(
          `${workspace.name}: shared packages cannot depend on applications (${dependency})`
        );
      }
    }
    for (const file of await sourceFiles(workspace.directory)) {
      const source = await readFile(file, "utf8");
      if (
        source.includes("process.env.OPENAI_API_KEY") &&
        workspace.name !== "@knotline/model-gateway-service"
      ) {
        errors.push(
          `${relative(root, file)}: only the model gateway service may read the OpenAI credential`
        );
      }
      if (
        source.includes("process.env.TOOL_BROKER_RECORDED_CREDENTIAL") &&
        workspace.name !== "@knotline/tool-broker-service"
      ) {
        errors.push(
          `${relative(root, file)}: only the tool broker service may read provider credentials`
        );
      }
      for (const specifier of imports(source)) {
        if (specifier.startsWith("@knotline/") && !workspace.declared.has(specifier)) {
          errors.push(`${relative(root, file)}: undeclared workspace import ${specifier}`);
        }
        if (specifier.startsWith(".")) {
          const selected = resolve(dirname(file), specifier);
          if (!selected.startsWith(`${workspace.directory}${sep}`)) {
            errors.push(`${relative(root, file)}: relative import escapes ${workspace.name}`);
          }
        }
      }
    }
  }
  const cycle = hasCycle(graph);
  if (cycle) errors.push(`workspace dependency cycle: ${cycle.join(" -> ")}`);
  return { errors, workspaces: workspaces.length };
}

const root = resolve(new URL("../..", import.meta.url).pathname);
const result = await verifyBoundaries(root);
if (result.errors.length > 0) {
  for (const error of result.errors) process.stderr.write(`${error}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`package boundaries passed (${String(result.workspaces)} workspaces)\n`);
}
