import fs from "node:fs";
import path from "node:path";

function loadEnvFileIfPresent(filename: string) {
  const filePath = path.join(process.cwd(), filename);

  if (!fs.existsSync(filePath)) return;

  try {
    process.loadEnvFile(filePath);
  } catch {
    // Ignore malformed or unsupported env files in non-CLI contexts.
  }
}

loadEnvFileIfPresent(".env");
loadEnvFileIfPresent(".env.local");

