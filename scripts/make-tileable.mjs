// Makes a picture seamless (tileable) for a desktop wallpaper or a dice
// texture: two passes of an offset blend. Pass one blends the picture with
// itself shifted by half its width, feathered so the shifted copy shows at the
// left and right edges (where it runs on across the wrap) and the original in
// the middle (hiding the shifted copy's own seam); pass two does the same top
// to bottom. It can also darken the result to a target brightness, for a
// quiet desktop.
//   node scripts/make-tileable.mjs <in> <out> [--size 768] [--dark 0.28] [--feather 0.3]
// A 2x2 check (four copies side by side) is written beside it as <out>.check.png
// with --check.
import sharp from "sharp";

const [input, output, ...rest] = process.argv.slice(2);
if (!input || !output) {
  console.error("make-tileable <in> <out> [--size N] [--dark 0..1] [--feather 0..0.5] [--check]");
  process.exit(1);
}
const option = (name, fallback) => {
  const at = rest.indexOf(`--${name}`);
  return at >= 0 ? Number(rest[at + 1]) : fallback;
};
const size = option("size", 768);
const dark = option("dark", 0);
const feather = option("feather", 0.3);

const { data, info } = await sharp(input).resize(size, size, { fit: "cover" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const w = info.width;
const h = info.height;
const c = info.channels;

// 1 in the middle, easing to 0 at the edges (over the feather's share of the size).
const weight = (at, length) => {
  const edge = Math.min(at, length - 1 - at) / (length * feather);
  const t = Math.min(1, edge);
  return t * t * (3 - 2 * t);
};
function pass(source, horizontal) {
  const out = Buffer.alloc(source.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const sx = horizontal ? (x + w / 2) % w : x;
      const sy = horizontal ? y : (y + h / 2) % h;
      const m = horizontal ? weight(x, w) : weight(y, h);
      const a = (y * w + x) * c;
      const b = (sy * w + sx) * c;
      for (let k = 0; k < c; k++) out[a + k] = Math.round(source[a + k] * m + source[b + k] * (1 - m));
    }
  return out;
}
let pixels = pass(pass(data, true), false);

if (dark > 0) {
  let sum = 0;
  for (let i = 0; i < pixels.length; i += c) sum += (0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2]) / 255;
  const mean = sum / (pixels.length / c);
  if (mean > dark) {
    const scale = dark / mean;
    for (let i = 0; i < pixels.length; i++) pixels[i] = Math.round(pixels[i] * scale);
  }
}
const picture = sharp(pixels, { raw: { width: w, height: h, channels: c } });
await picture.clone().webp({ quality: 88 }).toFile(output);
if (rest.includes("--check")) {
  const tile = await picture.clone().png().toBuffer();
  await sharp({ create: { width: w * 2, height: h * 2, channels: 3, background: "#000" } })
    .composite([0, 1, 2, 3].map((i) => ({ input: tile, left: (i % 2) * w, top: Math.floor(i / 2) * h })))
    .resize(w, h)
    .png()
    .toFile(`${output}.check.png`);
}
console.log(`ok ${output} (${w}x${h})`);
