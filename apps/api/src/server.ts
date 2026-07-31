import { loadConfig } from "@knotline/config";

import { buildApp } from "./app.js";

const environment = loadConfig(process.env);

const app = await buildApp({
  environment: environment.environment,
  logLevel: environment.logLevel,
  webOrigin: environment.api.webOrigin.origin
});

await app.listen({ host: "0.0.0.0", port: environment.api.port });
