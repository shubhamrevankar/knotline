import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { modelGatewayErrorSchema } from "@knotline/contracts";
import { GatewayFailure } from "@knotline/model-gateway";

import { buildGatewayFromEnvironment } from "./config.js";

const gateway = buildGatewayFromEnvironment();
const internalToken = process.env.MODEL_GATEWAY_INTERNAL_TOKEN;
if (!internalToken)
  throw new Error("Missing required gateway configuration: MODEL_GATEWAY_INTERNAL_TOKEN");

const handleRequest = async (request: IncomingMessage, response: ServerResponse) => {
  response.setHeader("content-type", "application/json");
  response.setHeader("cache-control", "no-store");
  if (request.url === "/healthz" && request.method === "GET") {
    response.statusCode = 200;
    response.end(JSON.stringify({ status: "ok" }));
    return;
  }
  if (
    request.url !== "/internal/v1/model-invocations" ||
    request.method !== "POST" ||
    request.headers.authorization !== `Bearer ${internalToken}`
  ) {
    response.statusCode = 404;
    response.end(JSON.stringify({ error: { code: "NOT_FOUND" } }));
    return;
  }
  try {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      const bytes = Buffer.from(chunk as Uint8Array);
      size += bytes.length;
      if (size > 2_000_000) throw new Error("REQUEST_TOO_LARGE");
      chunks.push(bytes);
    }
    const result = await gateway.invoke(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    response.statusCode = 200;
    response.end(JSON.stringify({ data: result }));
  } catch (cause) {
    const detail =
      cause instanceof GatewayFailure
        ? cause.detail
        : modelGatewayErrorSchema.parse({
            code: "INVALID_OUTPUT",
            retryable: false,
            providerAccepted: false,
            message: "The gateway request was invalid."
          });
    response.statusCode = detail.retryable ? 503 : 422;
    response.end(JSON.stringify({ error: detail }));
  }
};

const server = createServer((request, response) => {
  void handleRequest(request, response);
});

server.listen(
  Number(process.env.MODEL_GATEWAY_PORT ?? "4200"),
  process.env.MODEL_GATEWAY_HOST ?? "127.0.0.1"
);
