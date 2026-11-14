// Death markers (FG's Death Markers): what a creature leaves on the map when
// it dies. Kraken draws its own sets (no pictures to ship): blood splatters
// in seven colours, skulls, and tombstones, each with several variants, and
// the GM picks a set for each creature type. Shared by the table server
// (which picks the marker) and the map (which draws it).

// A set: id, name, tint (its colour), kind (how it is drawn), count (variants).
export const MARKER_SETS = [
  { id: "blood-red", name: "Blood - Red", tint: "#8e0f12", kind: "blood", count: 12 },
  { id: "blood-black", name: "Blood - Black", tint: "#1b1716", kind: "blood", count: 12 },
  { id: "blood-green", name: "Blood - Green", tint: "#2f8a1e", kind: "blood", count: 12 },
  { id: "blood-violet", name: "Blood - Violet", tint: "#7a1fa8", kind: "blood", count: 12 },
  { id: "blood-blue", name: "Blood - Blue", tint: "#2a3fb8", kind: "blood", count: 12 },
  { id: "blood-yellow", name: "Blood - Yellow", tint: "#b39a12", kind: "blood", count: 12 },
  { id: "blood-brown", name: "Blood - Brown", tint: "#6e4a26", kind: "blood", count: 12 },
  { id: "ichor", name: "Ichor - Glowing", tint: "#5cff9d", kind: "blood", count: 12 },
  { id: "skull", name: "Skull", tint: "#e8e2d4", kind: "skull", count: 2 },
  { id: "skull-round", name: "Skull - Round", tint: "#e8e2d4", kind: "skull-round", count: 2 },
  { id: "tombstone", name: "Tombstone", tint: "#9a9c9f", kind: "tombstone", count: 5 },
  { id: "tombstone-round", name: "Tombstone - Round", tint: "#e8e2d4", kind: "tombstone-round", count: 5 },
  { id: "bones", name: "Bones", tint: "#e3d9c0", kind: "bones", count: 4 },
  { id: "scorch", name: "Scorch mark", tint: "#1a1310", kind: "scorch", count: 6 },
];

// Creature types, as each game's books name them (FG's Death Markers list).
const D20_TYPES = ["Aberration", "Animal", "Construct", "Dragon", "Elemental", "Fey", "Giant", "Humanoid", "Magical Beast", "Monstrous Humanoid", "Ooze", "Outsider", "Plant", "Undead", "Vermin"];
const FIVE_TYPES = ["Aberration", "Beast", "Celestial", "Construct", "Dragon", "Elemental", "Fey", "Fiend", "Giant", "Humanoid", "Monstrosity", "Ooze", "Plant", "Undead"];
const OLD_TYPES = ["Animal", "Construct", "Dragon", "Elemental", "Extraplanar", "Giant", "Humanoid", "Lycanthrope", "Monster", "Ooze", "Plant", "Undead", "Vermin"];
const SCIFI_TYPES = ["Animal", "Alien", "Human", "Robot", "Vehicle"];
export function creatureTypes(ruleset = "") {
  if (ruleset === "D&D 5E" || ruleset === "Descending Darkness") return FIVE_TYPES;
  if (ruleset === "D&D 3.5E" || ruleset === "Castles & Crusades") return D20_TYPES;
  if (ruleset === "AD&D 2E" || ruleset === "Basic Fantasy") return OLD_TYPES;
  if (ruleset === "Traveller" || ruleset === "Apeira Astra" || ruleset === "Starforged") return SCIFI_TYPES;
  return [...new Set([...D20_TYPES, ...FIVE_TYPES])].sort();
}

// Kraken's own choices to begin with (the GM changes them): undead violet, constructs and oozes black, plants green.
export const DEFAULT_BY_TYPE = { undead: "blood-violet", construct: "blood-black", robot: "blood-black", vehicle: "scorch", ooze: "blood-black", plant: "blood-green", elemental: "scorch", fiend: "blood-black", aberration: "ichor", alien: "ichor" };

// The creature's type, from its record (a type field, its race, its words), or "".
export function typeOf(record, name = "") {
  const data = record?.data ?? {};
  const said = [data.type, data.creaturetype, data.race, data.species, data.size, name].filter((value) => typeof value === "string").join(" ").toLowerCase();
  const all = [...new Set([...D20_TYPES, ...FIVE_TYPES, ...OLD_TYPES, ...SCIFI_TYPES])].map((type) => type.toLowerCase()).sort((a, b) => b.length - a.length);
  return all.find((type) => new RegExp(`\\b${type}s?\\b`).test(said)) ?? "";
}

// The marker a creature leaves: its type's set (the GM's, else Kraken's choice), the default's else; a variant and a turn at random.
export function markerFor(settings, record, name = "", random = Math.random) {
  const type = typeOf(record, name);
  const chosen = settings?.byType?.[type];
  const id = chosen || (chosen === undefined ? DEFAULT_BY_TYPE[type] : "") || settings?.default || "blood-red";
  const set = MARKER_SETS.find((item) => item.id === id) ?? MARKER_SETS[0];
  const turns = set.kind === "blood" || set.kind === "scorch" || set.kind === "bones";
  return { set: set.id, variant: Math.floor(random() * set.count), rotation: turns ? Math.floor(random() * 360) : Math.floor(random() * 21) - 10, type };
}

// A seeded random (the same splatter every time for a variant).
function seeded(seed) {
  let value = (seed * 2654435761) >>> 0 || 1;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}
const round = (value) => Math.round(value * 10) / 10;
// A blob around (cx, cy), radius r, wobbled.
function blob(random, cx, cy, r, points = 10, wobble = 0.35) {
  const out = [];
  for (let i = 0; i < points; i++) {
    const angle = (i / points) * Math.PI * 2;
    const reach = r * (1 - wobble / 2 + random() * wobble);
    out.push([cx + Math.cos(angle) * reach, cy + Math.sin(angle) * reach]);
  }
  // A smooth closed curve through the points (midpoint quadratic curves).
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  let d = `M${round(mid(out[out.length - 1], out[0])[0])} ${round(mid(out[out.length - 1], out[0])[1])}`;
  for (let i = 0; i < out.length; i++) {
    const next = out[(i + 1) % out.length];
    const m = mid(out[i], next);
    d += `Q${round(out[i][0])} ${round(out[i][1])} ${round(m[0])} ${round(m[1])}`;
  }
  return `${d}Z`;
}

// The shapes of a marker, in a 100 x 100 box centred on 50,50: a list of
// { d (an SVG path), fill ("tint", "dark", "light", or a colour), opacity }.
export function markerShapes(setId, variant = 0) {
  const set = MARKER_SETS.find((item) => item.id === setId) ?? MARKER_SETS[0];
  const random = seeded(variant * 7919 + set.kind.length * 104729 + 17);
  const shapes = [];
  if (set.kind === "blood") {
    // A pool, splashes thrown out from it, and droplets: each variant its own.
    const spread = 0.7 + random() * 0.6;
    shapes.push({ d: blob(random, 50 + (random() - 0.5) * 10, 50 + (random() - 0.5) * 10, 18 + random() * 10, 12, 0.5), fill: "tint", opacity: 0.92 });
    const throws = 3 + Math.floor(random() * 5);
    const main = random() * Math.PI * 2;
    for (let i = 0; i < throws; i++) {
      const angle = main + (random() - 0.5) * Math.PI * spread * (variant % 3 === 0 ? 2 : 1.1);
      const far = 18 + random() * 24;
      shapes.push({ d: blob(random, 50 + Math.cos(angle) * far, 50 + Math.sin(angle) * far, 4 + random() * 8, 8, 0.6), fill: "tint", opacity: 0.88 });
      for (let k = 0; k < 2; k++) {
        const drop = far + 8 + random() * 14;
        shapes.push({ d: blob(random, 50 + Math.cos(angle) * drop, 50 + Math.sin(angle) * drop, 1.2 + random() * 2.4, 6, 0.3), fill: "tint", opacity: 0.85 });
      }
    }
    // A darker heart and a sheen, so it reads as wet.
    shapes.push({ d: blob(random, 48, 48, 9 + random() * 5, 9, 0.4), fill: "dark", opacity: 0.45 });
    shapes.push({ d: blob(random, 44, 43, 3 + random() * 2, 7, 0.3), fill: "light", opacity: 0.18 });
    return shapes;
  }
  if (set.kind === "scorch") {
    shapes.push({ d: blob(random, 50, 50, 34 + random() * 6, 16, 0.45), fill: "tint", opacity: 0.55 });
    shapes.push({ d: blob(random, 50, 50, 22 + random() * 6, 12, 0.5), fill: "tint", opacity: 0.7 });
    shapes.push({ d: blob(random, 50, 50, 10 + random() * 4, 9, 0.4), fill: "#3a1206", opacity: 0.75 });
    return shapes;
  }
  if (set.kind === "bones") {
    const bone = (x1, y1, x2, y2) => {
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const nx = -Math.sin(angle) * 2.6;
      const ny = Math.cos(angle) * 2.6;
      const knob = (x, y) => `M${round(x + nx * 1.6)} ${round(y + ny * 1.6)}a4 4 0 1 0 0.1 0Z M${round(x - nx * 1.6)} ${round(y - ny * 1.6)}a4 4 0 1 0 0.1 0Z`;
      return `M${round(x1 + nx)} ${round(y1 + ny)}L${round(x2 + nx)} ${round(y2 + ny)}L${round(x2 - nx)} ${round(y2 - ny)}L${round(x1 - nx)} ${round(y1 - ny)}Z ${knob(x1, y1)} ${knob(x2, y2)}`;
    };
    const count = 2 + (variant % 3);
    for (let i = 0; i < count; i++) {
      const angle = random() * Math.PI;
      const cx = 50 + (random() - 0.5) * 20;
      const cy = 50 + (random() - 0.5) * 20;
      const half = 16 + random() * 10;
      shapes.push({ d: bone(cx - Math.cos(angle) * half, cy - Math.sin(angle) * half, cx + Math.cos(angle) * half, cy + Math.sin(angle) * half), fill: "tint", opacity: 1 });
    }
    return shapes;
  }
  const round_ = set.kind.endsWith("-round");
  if (round_) shapes.push({ d: "M50 6a44 44 0 1 0 0.1 0Z", fill: "#0b0b0d", opacity: 0.92 });
  if (set.kind.startsWith("skull")) {
    // A skull, and crossbones (variant 0) or horns (variant 1).
    if (variant % 2 === 0) {
      shapes.push({ d: "M22 26l56 50M78 26l-56 50", fill: "none", stroke: "tint", width: 8, opacity: 1 });
      shapes.push({ d: "M17 21a6 6 0 1 0 8 8M83 21a6 6 0 1 1-8 8M17 81a6 6 0 1 1 8-8M83 81a6 6 0 1 0-8-8", fill: "tint", opacity: 1 });
    } else shapes.push({ d: "M30 30C20 22 16 12 18 6c4 8 10 14 18 16ZM70 30c10-8 14-18 12-24-4 8-10 14-18 16Z", fill: "tint", opacity: 1 });
    shapes.push({ d: "M50 22c-15 0-25 10-25 23 0 8 4 13 9 16v9h32v-9c5-3 9-8 9-16 0-13-10-23-25-23Z", fill: "tint", opacity: 1 });
    shapes.push({ d: "M40 40a6 7 0 1 0 0.1 0ZM60 40a6 7 0 1 0 0.1 0ZM50 52l-4 7h8Z", fill: "#111", opacity: 1 });
    shapes.push({ d: "M40 63v6M46 63v7M54 63v7M60 63v6", fill: "none", stroke: "#111", width: 2, opacity: 1 });
    return shapes;
  }
  // A tombstone: plain, carved lines, a skull, a cross, or a hand from the grave.
  const stone = "M30 80V40a20 20 0 0 1 40 0v40Z";
  const ground = "M18 80h64v6H18Z";
  const which = variant % 5;
  if (which === 3) shapes.push({ d: "M44 22h12v20h14v12H56v26H44V54H30V42h14Z", fill: "tint", opacity: 1 });
  else if (which === 4) {
    shapes.push({ d: "M42 80l2-22-6-10 3-2 5 7 1-14h3l1 14 2-16h3l-1 17 3-13h3l-3 18 5-9 3 1-6 14 1 15Z", fill: "tint", opacity: 1 });
  } else {
    shapes.push({ d: stone, fill: "tint", opacity: 1 });
    if (which === 1) shapes.push({ d: "M39 46h22M39 54h22M39 62h16", fill: "none", stroke: "#2a2a2c", width: 3, opacity: 0.8 });
    if (which === 2) shapes.push({ d: "M50 40c-7 0-11 5-11 10 0 4 2 6 4 7v4h14v-4c2-1 4-3 4-7 0-5-4-10-11-10Zm-5 9a2.5 3 0 1 0 0.1 0Zm10 0a2.5 3 0 1 0 0.1 0Z", fill: "#2a2a2c", opacity: 0.85 });
  }
  shapes.push({ d: ground, fill: "tint", opacity: 0.85 });
  return shapes;
}
