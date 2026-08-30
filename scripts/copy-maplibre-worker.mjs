// MapLibre resolves its worker with `new URL('./maplibre-gl-worker.mjs',
// import.meta.url)`. Inside a bundled chunk that resolves to /_next/static/
// chunks/, where the file does not exist, so the worker never starts and vector
// tiles and clustering silently render nothing. Copying the worker (and the
// shared chunk it imports) into public/ gives us a stable URL to hand to
// maplibregl.setWorkerUrl().
import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const source = dirname(require.resolve("maplibre-gl/dist/maplibre-gl.mjs"));
const target = join(process.cwd(), "public", "maplibre");
const files = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

await mkdir(target, { recursive: true });
for (const file of files) {
  await copyFile(join(source, file), join(target, file));
}
console.log(`Copied ${files.length} MapLibre worker files to public/maplibre`);
