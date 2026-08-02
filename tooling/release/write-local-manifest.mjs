import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const tag = process.env.KNOTLINE_RELEASE_TAG || "local";
if (!/^[a-z0-9][a-z0-9._-]{0,63}$/u.test(tag)) throw new Error("INVALID_RELEASE_TAG");

const components = ["model-gateway", "sandbox", "tool-broker", "api", "worker", "web"];
const inspect = (image) =>
  JSON.parse(execFileSync("docker", ["image", "inspect", image], { encoding: "utf8" }))[0];
const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

const images = Object.fromEntries(
  components.map((component) => {
    const reference = `knotline-personal/${component}:${tag}`;
    const metadata = inspect(reference);
    return [
      component,
      {
        reference,
        imageId: metadata.Id,
        created: metadata.Created,
        platform: `${metadata.Os}/${metadata.Architecture}`
      }
    ];
  })
);
const manifest = {
  schemaVersion: 1,
  product: "Knotline",
  releaseTag: tag,
  sourceRevision: git("rev-parse", "HEAD"),
  sourceDirty: git("status", "--porcelain").length > 0,
  generatedAt: new Date().toISOString(),
  promotionPolicy: "Promote these image contents without rebuilding application source.",
  images
};

const directory = resolve("artifacts/releases");
mkdirSync(directory, { recursive: true });
const output = resolve(directory, `${tag}.json`);
writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
process.stdout.write(`Release manifest written to ${output}\n`);
