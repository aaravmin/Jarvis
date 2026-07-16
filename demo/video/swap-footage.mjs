#!/usr/bin/env node
/**
 * One-command footage swap.
 *  1. reads ../footage/footage-manifest.json (capture agent output)
 *  2. copies each .webm into ./public/footage/
 *  3. writes ./src/footage-manifest.json with available:true so the film
 *     renders real footage instead of stand-ins.
 *
 * Usage:  node swap-footage.mjs
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const footageDir = path.resolve(__dirname, "..", "footage");
const srcManifestPath = path.join(footageDir, "footage-manifest.json");
const publicDir = path.join(__dirname, "public", "footage");
const outManifestPath = path.join(__dirname, "src", "footage-manifest.json");

async function main() {
  let raw;
  try {
    raw = await fs.readFile(srcManifestPath, "utf8");
  } catch {
    console.error(`No manifest at ${srcManifestPath}. Nothing to swap.`);
    process.exit(1);
  }
  const parsed = JSON.parse(raw);
  const clips = Array.isArray(parsed) ? parsed : parsed.clips;
  if (!Array.isArray(clips)) {
    console.error("Manifest is not an array of clips and has no .clips array.");
    process.exit(1);
  }

  await fs.mkdir(publicDir, { recursive: true });

  const out = [];
  for (const c of clips) {
    if (!c.file) continue;
    const from = path.join(footageDir, c.file);
    const to = path.join(publicDir, c.file);
    try {
      await fs.copyFile(from, to);
    } catch (e) {
      console.warn(`  ! could not copy ${c.file}: ${e.message}`);
      continue;
    }
    out.push({ id: c.id, file: c.file, durationSec: c.durationSec, notes: c.notes ?? "" });
    console.log(`  copied ${c.file}  (${c.durationSec}s)  id=${c.id}`);
  }

  const manifest = { available: out.length > 0, clips: out };
  await fs.writeFile(outManifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`\nWrote ${outManifestPath} with ${out.length} clip(s), available=${manifest.available}.`);

  // Also mirror the capture's click tracks (used by the compositor to sync the caramel ripple +
  // zoom-on-click + page-switch flourish to real clicks). Write {} if the capture recorded none.
  const clicksFrom = path.join(footageDir, "clicks.json");
  const clicksTo = path.join(__dirname, "src", "clicks.json");
  let clicks = {};
  try {
    clicks = JSON.parse(await fs.readFile(clicksFrom, "utf8"));
  } catch {
    clicks = {};
  }
  await fs.writeFile(clicksTo, JSON.stringify(clicks, null, 2) + "\n");
  console.log(`Wrote ${clicksTo} with click tracks for: ${Object.keys(clicks).join(", ") || "(none)"}.`);
  console.log("Now render:  npm run render");
}

main();
