import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "node_modules/@ffmpeg/core/dist/umd");
const target = resolve(root, "public/ffmpeg");
await mkdir(target, { recursive: true });
await copyFile(resolve(source, "ffmpeg-core.js"), resolve(target, "ffmpeg-core.js"));
await copyFile(resolve(source, "ffmpeg-core.wasm"), resolve(target, "ffmpeg-core.wasm"));
