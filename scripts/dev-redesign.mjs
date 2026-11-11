import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const server = spawn(process.execPath, [
  require.resolve("next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", "3100",
  "--webpack", "--disable-source-maps"
], {
  env: { ...process.env, SIMPLECITY_LOCAL_REDESIGN: "1" },
  stdio: "inherit"
});
server.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
server.on("exit", (code) => { process.exitCode = code ?? 1; });
