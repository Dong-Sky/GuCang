// Side-by-side review at a matching 390px mobile viewport. No visual retouching.
import sharp from "sharp";
const [reference, capture, output] = process.argv.slice(2);
if (!output) throw new Error("Usage: node scripts/compare-ui.mjs reference capture output");
const left = await sharp(reference).resize({ width: 390 }).png().toBuffer();
const right = await sharp(capture).resize({ width: 390 }).png().toBuffer();
const a = await sharp(left).metadata(), b = await sharp(right).metadata();
await sharp({ create: { width: 796, height: Math.max(a.height, b.height), channels: 3, background: "#ffffff" } }).composite([{ input: left, left: 0, top: 0 }, { input: right, left: 406, top: 0 }]).png().toFile(output);
