export const RUNNER_PROGRAM = String.raw`
const { Script, createContext } = require("node:vm");
const chunks = [];
process.stdin.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
process.stdin.on("end", () => {
  const envelope = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  const context = createContext(
    {
      input: structuredClone(envelope.input),
      result: undefined,
      console: Object.freeze({ log: () => undefined })
    },
    { codeGeneration: { strings: false, wasm: false } }
  );
  const script = new Script(
    '"use strict"; result = (() => { ' + envelope.source + '\n })();',
    { filename: "workspace-program.js" }
  );
  script.runInContext(context, { timeout: 9000, breakOnSigint: true });
  process.stdout.write(JSON.stringify(context.result ?? null));
});
`;
