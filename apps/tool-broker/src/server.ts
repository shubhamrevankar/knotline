import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { ToolBrokerFailure } from "@knotline/tool-broker";

import { buildBrokerFromEnvironment } from "./config.js";

const broker = await buildBrokerFromEnvironment();
const token = process.env.TOOL_BROKER_INTERNAL_TOKEN;
if (!token)
  throw new Error("Missing required tool broker configuration: TOOL_BROKER_INTERNAL_TOKEN");

const handle = async (request: IncomingMessage, response: ServerResponse) => {
  response.setHeader("content-type", "application/json");
  response.setHeader("cache-control", "no-store");
  if (request.url === "/healthz" && request.method === "GET") {
    response.end(JSON.stringify({ status: "ok" }));
    return;
  }
  if (
    request.url !== "/internal/v1/tool-executions" ||
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
    const receipt = await broker.execute(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    response.end(JSON.stringify({ data: receipt }));
  } catch (cause) {
    response.statusCode = cause instanceof ToolBrokerFailure && cause.retryable ? 503 : 422;
    response.end(
      JSON.stringify({
        error: {
          code: cause instanceof ToolBrokerFailure ? cause.code : "TOOL_REQUEST_INVALID",
          uncertain: cause instanceof ToolBrokerFailure && cause.uncertain
        }
      })
    );
  }
};

const server = createServer((request, response) => void handle(request, response));
server.listen(
  Number(process.env.TOOL_BROKER_PORT ?? "4400"),
  process.env.TOOL_BROKER_HOST ?? "127.0.0.1"
);
