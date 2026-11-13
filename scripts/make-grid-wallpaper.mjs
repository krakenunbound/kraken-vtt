// Desktop wallpapers with a grid on them (FG's hex grid on black, a battle
// mat's squares): a texture made seamless (an offset blend, as
// make-tileable.mjs), coloured to a target, and a grid drawn over it that
// repeats exactly at the picture's edges, so the whole thing tiles with no
// seam. Big (2048 wide) so the repeat hardly shows.
//   node scripts/make-grid-wallpaper.mjs <in> <out.webp> --grid hex|square|none
//        [--tint r,g,b] [--line r,g,b,a] [--light a] [--cells 16] [--width 2048] [--check]
import sharp from "sharp";

const [input, output, ...rest] = process.argv.slice(2);
const option = (name, fallback) => {
  const at = rest.indexOf(`--${name}`);
  return at >= 0 ? rest[at + 1] : fallback;
};
const grid = option("grid", "hex");
const width = Number(option("width", 2048));
const cells = Number(option("cells", 16));
const tint = option("tint", "") ? option("tint", "").split(",").map(Number) : null;
const line = option("line", "0,0,0,0.5").split(",").map(Number);
const light = Number(option("light", 0.05));

// The picture's height: a whole number of grid repeats (hexes repeat every two rows).
const hexWidth = width / cells;
const size = hexWidth / Math.sqrt(3);
const height = grid === "hex" ? Math.round(3 * size * Math.round(width / (3 * size))) : grid === "square" ? width : width;

const { data, info } = await sharp(input).resize(width, height, { fit: "cover", kernel: "lanczos3" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const c = info.channels;
// Seamless: blend with itself shifted by half, feathered (left-right, then top-bottom).
const weight = (at, length) => {
  const t = Math.min(1, Math.min(at, length - 1 - at) / (length * 0.3));
  return t * t * (3 - 2 * t);
};
function pass(source, horizontal) {
  const out = Buffer.alloc(source.length);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const sx = horizontal ? (x + width / 2) % width : x;
      const sy = horizontal ? y : (y + Math.floor(height / 2)) % height;
      const m = horizontal ? weight(x, width) : weight(y, height);
      const a = (y * width + x) * c;
      const b = (sy * width + sx) * c;
      for (let k = 0; k < c; k++) out[a + k] = Math.round(source[a + k] * m + source[b + k] * (1 - m));
    }
  return out;
}
let pixels = pass(pass(data, true), false);
// Coloured to a target average (the variation kept).
if (tint) {
  const mean = [0, 0, 0];
  for (let i = 0; i < pixels.length; i += c) for (let k = 0; k < 3; k++) mean[k] += pixels[i + k];
  for (let k = 0; k < 3; k++) mean[k] /= pixels.length / c;
  for (let i = 0; i < pixels.length; i += c) for (let k = 0; k < 3; k++) pixels[i + k] = Math.max(0, Math.min(255, Math.round((pixels[i + k] / Math.max(1, mean[k])) * tint[k])));
}

// The grid, as SVG: every cell drawn whole, repeated past the edges so the edges meet.
const stroke = `rgba(${line[0]},${line[1]},${line[2]},${line[3]})`;
const glint = `rgba(255,255,255,${light})`;
let paths = "";
if (grid === "hex") {
  const rows = Math.round(height / (1.5 * size));
  for (let row = -1; row <= rows; row++)
    for (let col = -1; col <= cells; col++) {
      const cx = col * hexWidth + (row % 2 ? hexWidth / 2 : 0);
      const cy = row * 1.5 * size;
      const corners = Array.from({ length: 6 }, (_, i) => {
        const angle = (Math.PI / 180) * (60 * i - 30);
        return `${(cx + size * Math.cos(angle)).toFixed(2)},${(cy + size * Math.sin(angle)).toFixed(2)}`;
      });
      paths += `M${corners.join("L")}Z`;
    }
} else if (grid === "square") {
  const step = width / cells;
  for (let i = 0; i <= cells; i++) paths += `M${(i * step).toFixed(2)},0V${height}M0,${(i * step).toFixed(2)}H${width}`;
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${
  paths ? `<path d="${paths}" fill="none" stroke="${glint}" stroke-width="1.2" transform="translate(1.2 1.2)"/><path d="${paths}" fill="none" stroke="${stroke}" stroke-width="2.6"/>` : ""
}</svg>`;
const base = sharp(pixels, { raw: { width, height, channels: c } });
const picture = await base.composite([{ input: Buffer.from(svg) }]).png().toBuffer();
await sharp(picture).webp({ quality: 86 }).toFile(output);
if (rest.includes("--check")) {
  const half = await sharp(picture).resize(Math.round(width / 2), Math.round(height / 2)).toBuffer();
  const w = Math.round(width / 2);
  const h = Math.round(height / 2);
  await sharp({ create: { width: w * 2, height: h * 2, channels: 3, background: "#000" } })
    .composite([0, 1, 2, 3].map((i) => ({ input: half, left: (i % 2) * w, top: Math.floor(i / 2) * h })))
    .resize(1200)
    .png()
    .toFile(`${output}.check.png`);
}
console.log(`ok ${output} (${width}x${height}, ${grid})`);
