// Patch real webm durations (ffprobe) into footage-manifest.json, replacing the null durationSec the
// capture script writes. Also verifies each clip is over the 200KB floor. Run after capturing.
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FOOTAGE_DIR = path.resolve(__dirname, "../..", "demo/footage");
const MANIFEST_PATH = path.join(FOOTAGE_DIR, "footage-manifest.json");

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
let allOk = true;
for (const entry of manifest) {
  const file = path.join(FOOTAGE_DIR, entry.file);
  const dur = parseFloat(
    execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${file}"`).toString().trim(),
  );
  const bytes = fs.statSync(file).size;
  entry.durationSec = Math.round(dur * 100) / 100;
  delete entry.wallClockSec; // wall-clock is a capture artifact, not a footage fact
  const kb = Math.round(bytes / 1024);
  const ok = bytes > 200 * 1024;
  if (!ok) allOk = false;
  console.log(`${ok ? "OK " : "!! "} ${entry.file.padEnd(16)} ${String(kb).padStart(5)} KB  ${entry.durationSec}s`);
}
// Keep the field order clean: id, file, durationSec, notes.
const clean = manifest.map((e) => ({ id: e.id, file: e.file, durationSec: e.durationSec, notes: e.notes }));
fs.writeFileSync(MANIFEST_PATH, JSON.stringify(clean, null, 2) + "\n");
console.log(`\nWrote ${MANIFEST_PATH}`);
console.log(allOk ? "All clips over the 200KB floor." : "WARNING: a clip is under 200KB.");
