import { spawn } from "node:child_process";

import {
  sandboxExecutionRequestSchema,
  sandboxExecutionResultSchema,
  type SandboxExecutionResult
} from "@knotline/contracts";

import { RUNNER_PROGRAM } from "./runner-program.js";

export const executeSandbox = async (input: unknown): Promise<SandboxExecutionResult> => {
  const request = sandboxExecutionRequestSchema.parse(input);
  const started = Date.now();
  const child = spawn(process.execPath, ["--max-old-space-size=64", "-e", RUNNER_PROGRAM], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { LANG: "C.UTF-8", PATH: "/usr/local/bin:/usr/bin:/bin" }
  });
  const output: Buffer[] = [];
  const errors: Buffer[] = [];
  let size = 0;
  let overflow = false;
  child.stdout.on("data", (chunk: Buffer) => {
    size += chunk.length;
    if (size > request.maxOutputBytes) {
      overflow = true;
      child.kill("SIGKILL");
      return;
    }
    output.push(chunk);
  });
  child.stderr.on("data", (chunk: Buffer) => errors.push(chunk));
  child.stdin.end(JSON.stringify({ source: request.source, input: request.input }));
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill("SIGKILL");
  }, request.timeoutMs);
  const exitCode = await new Promise<number | null>((resolve) => child.once("close", resolve));
  clearTimeout(timer);
  let parsed: unknown;
  if (!timedOut && !overflow && exitCode === 0) {
    try {
      parsed = JSON.parse(Buffer.concat(output).toString("utf8"));
    } catch {
      overflow = true;
    }
  }
  const state = timedOut ? "timed_out" : overflow || exitCode !== 0 ? "failed" : "succeeded";
  return sandboxExecutionResultSchema.parse({
    operationId: request.operationId,
    runtime: request.runtime,
    imageDigest: process.env.SANDBOX_IMAGE_DIGEST ?? "local-unpublished-image",
    state,
    ...(state === "succeeded" ? { output: parsed } : {}),
    exitCode,
    durationMs: Date.now() - started,
    ...(timedOut
      ? { errorCode: "SANDBOX_TIMEOUT" }
      : overflow
        ? { errorCode: "SANDBOX_OUTPUT_INVALID_OR_TOO_LARGE" }
        : exitCode !== 0
          ? { errorCode: `SANDBOX_EXIT_${String(exitCode)}` }
          : {})
  });
};
