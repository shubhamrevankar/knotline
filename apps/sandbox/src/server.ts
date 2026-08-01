import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { executeSandbox } from "./executor.js";

const token = process.env.SANDBOX_INTERNAL_TOKEN;
if (!token) throw new Error("Missing required sandbox configuration: SANDBOX_INTERNAL_TOKEN");

const handle = async (request: IncomingMessage, response: ServerResponse) => {
  response.setHeader("content-type", "application/json");
  response.setHeader("cache-control", "no-store");
  if (request.url === "/healthz" && request.method === "GET") {
    response.end(JSON.stringify({ status: "ok" }));
    return;
  }
  if (
    request.url !== "/internal/v1/sandbox-executions" ||
    request.method !== "POST" ||
    request.headers.authorization !== `Bearer ${token}`
  ) {
    response.statusCode = 404;
    response.end(JSON.stringify({ error: { code: "NOT_FOUND" } }));
    return;
  }
  try {
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of request) {
      const part = Buffer.from(chunk as Uint8Array);
      bytes += part.length;
      if (bytes > 1_000_000) throw new Error("REQUEST_TOO_LARGE");
      chunks.push(part);
    }
    const result = await executeSandbox(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    response.end(JSON.stringify({ data: result }));
  } catch {
    response.statusCode = 422;
    response.end(JSON.stringify({ error: { code: "SANDBOX_REQUEST_INVALID" } }));
  }
};

const server = createServer((request, response) => void handle(request, response));
server.listen(Number(process.env.SANDBOX_PORT ?? "4300"), process.env.SANDBOX_HOST ?? "127.0.0.1");
