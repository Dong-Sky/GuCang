// Mechanical export of the approved raster mark; does not redraw the logo.
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
const source = process.argv[2];
if (!source) throw new Error("Pass the approved logo image path");
await mkdir("public/brand", { recursive: true });
const mark = await sharp(source).trim({ threshold: 15 }).png().toBuffer();
await sharp(mark).resize(160, 160, { fit: "contain", background: "#ffffff" }).png().toFile("public/brand/gc-monogram.png");
for (const size of [192, 512]) {
  const inset = Math.round(size * 0.2), content = size - inset * 2;
  await sharp(mark).resize(content, content, { fit: "contain", background: "#ffffff" }).extend({ top: inset, bottom: inset, left: inset, right: inset, background: "#ffffff" }).png().toFile(`public/brand/icon-${size}.png`);
}
