// A small QR code encoder for the invite link (ISO/IEC 18004, after Project
// Nayuki's reference): byte mode, error correction M (L when the text needs
// the room), versions 1 to 6 (up to 134 bytes; no version blocks are needed
// below 7). Returns the modules (true is dark), or null when the text is too
// long for a QR code this small.

const ECC_PER_BLOCK = { L: [7, 10, 15, 20, 26, 18], M: [10, 16, 26, 18, 24, 16] } as const;
const BLOCKS = { L: [1, 1, 1, 1, 1, 2], M: [1, 1, 1, 2, 2, 4] } as const;
const FORMAT_BITS = { L: 1, M: 0 } as const;
const ALIGNMENT = [[], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34]];
type Level = "L" | "M";

function rawModules(version: number) {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const align = Math.floor(version / 7) + 2;
    result -= (25 * align - 10) * align - 55;
  }
  return result;
}
const totalCodewords = (version: number) => Math.floor(rawModules(version) / 8);
const dataCodewords = (version: number, level: Level) => totalCodewords(version) - ECC_PER_BLOCK[level][version - 1] * BLOCKS[level][version - 1];

// GF(256) with the polynomial 0x11D.
function multiply(x: number, y: number) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}
function divisor(degree: number) {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = multiply(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = multiply(root, 0x02);
  }
  return result;
}
function remainder(data: number[], by: number[]) {
  const result = by.map(() => 0);
  for (const byte of data) {
    const factor = byte ^ (result.shift() as number);
    result.push(0);
    by.forEach((coefficient, index) => {
      result[index] ^= multiply(coefficient, factor);
    });
  }
  return result;
}

export function qrModules(text: string): boolean[][] | null {
  const bytes = [...new TextEncoder().encode(text)];
  let version = 0;
  let level: Level = "M";
  for (const wanted of ["M", "L"] as Level[]) {
    for (let v = 1; v <= 6 && !version; v++) if (4 + 8 + bytes.length * 8 <= dataCodewords(v, wanted) * 8) [version, level] = [v, wanted];
    if (version) break;
  }
  if (!version) return null;

  // The data: byte mode, the count, the bytes, a terminator, padding.
  const bits: number[] = [];
  const put = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  put(4, 4);
  put(bytes.length, 8);
  for (const byte of bytes) put(byte, 8);
  const capacity = dataCodewords(version, level) * 8;
  put(0, Math.min(4, capacity - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) put(pad, 8);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((byte, bit) => (byte << 1) | bit, 0));

  // Error correction, by blocks, interleaved.
  const blockCount = BLOCKS[level][version - 1];
  const eccLength = ECC_PER_BLOCK[level][version - 1];
  const total = totalCodewords(version);
  const shortBlocks = blockCount - (total % blockCount);
  const shortLength = Math.floor(total / blockCount);
  const by = divisor(eccLength);
  const blocks: number[][] = [];
  for (let i = 0, k = 0; i < blockCount; i++) {
    const length = shortLength - eccLength + (i < shortBlocks ? 0 : 1);
    const part = data.slice(k, k + length);
    k += length;
    const ecc = remainder(part, by);
    if (i < shortBlocks) part.push(0);
    blocks.push([...part, ...ecc]);
  }
  const codewords: number[] = [];
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((block, index) => {
      if (i !== shortLength - eccLength || index >= shortBlocks) codewords.push(block[i]);
    });
  }

  // The symbol: finders, timing, alignment, the format areas reserved, the dark module.
  const size = version * 4 + 17;
  const modules = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const fixed = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const set = (x: number, y: number, dark: boolean) => {
    modules[y][x] = dark;
    fixed[y][x] = true;
  };
  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  const finder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const distance = Math.max(Math.abs(dx), Math.abs(dy));
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, distance !== 2 && distance !== 4);
      }
  };
  finder(3, 3);
  finder(size - 4, 3);
  finder(3, size - 4);
  const centres = ALIGNMENT[version - 1];
  for (const cy of centres)
    for (const cx of centres) {
      if ((cx === 6 && cy === 6) || (cx === 6 && cy === centres[centres.length - 1]) || (cy === 6 && cx === centres[centres.length - 1])) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  const format = (mask: number) => {
    const value = (FORMAT_BITS[level] << 3) | mask;
    let rem = value;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const word = ((value << 10) | rem) ^ 0x5412;
    const bit = (i: number) => ((word >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6));
    set(8, 8, bit(7));
    set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
  };
  format(0);

  // The codewords, in the zigzag from the bottom right.
  let index = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vertical = 0; vertical < size; vertical++)
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vertical : vertical;
        if (fixed[y][x] || index >= codewords.length * 8) continue;
        modules[y][x] = ((codewords[index >>> 3] >>> (7 - (index & 7))) & 1) === 1;
        index++;
      }
  }

  // The mask that leaves the fewest look-alike patterns (runs, blocks, imbalance).
  const masks = [
    (x: number, y: number) => (x + y) % 2 === 0,
    (_x: number, y: number) => y % 2 === 0,
    (x: number) => x % 3 === 0,
    (x: number, y: number) => (x + y) % 3 === 0,
    (x: number, y: number) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x: number, y: number) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x: number, y: number) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x: number, y: number) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ];
  const apply = (mask: number) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fixed[y][x] && masks[mask](x, y)) modules[y][x] = !modules[y][x];
  };
  const penalty = () => {
    let score = 0;
    let dark = 0;
    for (let y = 0; y < size; y++) {
      for (const line of [modules[y], modules.map((row) => row[y])]) {
        let run = 1;
        for (let x = 1; x <= size; x++) {
          if (x < size && line[x] === line[x - 1]) run++;
          else {
            if (run >= 5) score += run - 2;
            run = 1;
          }
        }
      }
      for (let x = 0; x < size; x++) {
        if (modules[y][x]) dark++;
        if (x < size - 1 && y < size - 1 && modules[y][x] === modules[y][x + 1] && modules[y][x] === modules[y + 1][x] && modules[y][x] === modules[y + 1][x + 1]) score += 3;
      }
    }
    return score + Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
  };
  let best = 0;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    apply(mask);
    format(mask);
    const score = penalty();
    if (score < bestScore) [best, bestScore] = [mask, score];
    apply(mask);
  }
  apply(best);
  format(best);
  return modules;
}

// The code as an SVG path (one square per dark module), with a quiet zone of four.
export function qrSvgPath(modules: boolean[][]) {
  let path = "";
  modules.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) path += `M${x + 4} ${y + 4}h1v1h-1z`;
    }),
  );
  return { path, size: modules.length + 8 };
}
