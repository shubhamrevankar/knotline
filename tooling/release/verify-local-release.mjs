import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const tag = process.env.KNOTLINE_RELEASE_TAG || "local";
const manifest = JSON.parse(readFileSync(resolve(`artifacts/releases/${tag}.json`), "utf8"));
for (const [component, expected] of Object.entries(manifest.images)) {
  const actual = JSON.parse(
    execFileSync("docker", ["image", "inspect", expected.reference], { encoding: "utf8" })
  )[0];
  if (actual.Id !== expected.imageId) throw new Error(`RELEASE_IMAGE_CHANGED:${component}`);
}

const compose = [
  "compose",
  "-f",
  "infra/docker-compose.yml",
  "-f",
  "infra/docker-compose.release.yml",
  "ps",
  "--status",
  "running",
  "--services"
];
const running = new Set(
  execFileSync("docker", compose, { encoding: "utf8" }).trim().split("\n").filter(Boolean)
);
for (const service of ["api", "worker", "web", "model-gateway", "sandbox", "tool-broker"])
  if (!running.has(service)) throw new Error(`RELEASE_SERVICE_NOT_RUNNING:${service}`);

for (const [name, url] of [
  ["web", "http://localhost:5173/ready"],
  ["api-through-web", "http://localhost:5173/v1/me/bootstrap"],
  ["api", "http://localhost:4100/health/ready"]
]) {
  const response = await fetch(url, { redirect: "manual" });
  if (name === "api-through-web" ? response.status !== 401 : !response.ok)
    throw new Error(`RELEASE_ENDPOINT_UNHEALTHY:${name}:${response.status}`);
}

const webImage = manifest.images.web.reference;
const previewAddressScan = spawnSync(
  "docker",
  [
    "run",
    "--rm",
    "--entrypoint",
    "grep",
    webImage,
    "-R",
    "-n",
    "http://localhost:4100",
    "/usr/share/nginx/html"
  ],
  { encoding: "utf8" }
);
if (previewAddressScan.status === 0) throw new Error("RELEASE_WEB_CONTAINS_PREVIEW_API_ADDRESS");
if (previewAddressScan.status !== 1)
  throw new Error(`RELEASE_WEB_SCAN_FAILED:${previewAddressScan.stderr.trim()}`);

const webOrigin = "http://localhost:5173";
const start = await fetch(`${webOrigin}/edge/v1/auth/google/authorizations`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: webOrigin },
  body: JSON.stringify({ returnTargetId: "workflows" }),
  redirect: "manual"
});
if (!start.ok) throw new Error(`RELEASE_AUTH_START_FAILED:${start.status}`);
const initiationCookie = start.headers.get("set-cookie")?.split(";", 1)[0];
const { authorizationUrl } = await start.json();
if (!initiationCookie || new URL(authorizationUrl).origin !== webOrigin)
  throw new Error("RELEASE_AUTH_NOT_SAME_ORIGIN");

const provider = await fetch(authorizationUrl, {
  headers: { cookie: initiationCookie },
  redirect: "manual"
});
if (provider.status !== 303) throw new Error(`RELEASE_AUTH_PROVIDER_FAILED:${provider.status}`);
const providerCallback = provider.headers.get("location");
if (!providerCallback || new URL(providerCallback).origin !== webOrigin)
  throw new Error("RELEASE_AUTH_CALLBACK_NOT_SAME_ORIGIN");

const callback = await fetch(providerCallback, {
  headers: { cookie: initiationCookie },
  redirect: "manual"
});
if (callback.status !== 303) throw new Error(`RELEASE_AUTH_CALLBACK_FAILED:${callback.status}`);
const callbackDestination = callback.headers.get("location");
const resultHandle = new URL(callbackDestination, webOrigin).hash
  .slice(1)
  .split("&")
  .map((part) => part.split("="))
  .find(([key]) => key === "result")?.[1];
if (!resultHandle) throw new Error("RELEASE_AUTH_RESULT_MISSING");

const exchange = await fetch(`${webOrigin}/edge/v1/auth/google/exchange`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    cookie: initiationCookie,
    origin: webOrigin
  },
  body: JSON.stringify({ resultHandle: decodeURIComponent(resultHandle) })
});
if (!exchange.ok) throw new Error(`RELEASE_AUTH_EXCHANGE_FAILED:${exchange.status}`);
const sessionCookies = exchange.headers
  .getSetCookie()
  .map((value) => value.split(";", 1)[0])
  .join("; ");
const authenticated = await fetch(`${webOrigin}/v1/me/bootstrap`, {
  headers: { cookie: sessionCookies }
});
if (!authenticated.ok)
  throw new Error(`RELEASE_AUTHENTICATED_BOOTSTRAP_FAILED:${authenticated.status}`);

process.stdout.write(`Release ${tag} matches its manifest and is healthy.\n`);
