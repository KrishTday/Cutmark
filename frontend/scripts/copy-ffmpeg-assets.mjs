import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "node_modules/@ffmpeg/core/dist/umd");
const target = resolve(root, "public/ffmpeg");
const mtSource = resolve(root, "node_modules/@ffmpeg/core-mt/dist/umd");
const mtTarget = resolve(root, "public/ffmpeg-mt");
await mkdir(target, { recursive: true });
await mkdir(mtTarget, { recursive: true });
await copyFile(resolve(source, "ffmpeg-core.js"), resolve(target, "ffmpeg-core.js"));
await copyFile(resolve(source, "ffmpeg-core.wasm"), resolve(target, "ffmpeg-core.wasm"));
await Promise.all(["ffmpeg-core.js", "ffmpeg-core.wasm", "ffmpeg-core.worker.js"].map((asset) =>
  copyFile(resolve(mtSource, asset), resolve(mtTarget, asset)),
));
