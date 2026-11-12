// Kraken's own top-down starship pictures, drawn with a canvas (the ship
// tokens, games/tokens/Ships, are made from these by
// scripts/make-ship-tokens.mjs). Nose up, on a clear background. A hull is a
// half outline (x from the centre line, y down, 0..1 of the picture) mirrored;
// then the cockpit, the engines' glow, the turrets and panel lines.

const HULLS = {
  Courier: {
    half: [[0, 0.06], [0.08, 0.2], [0.13, 0.42], [0.2, 0.6], [0.3, 0.72], [0.3, 0.8], [0.16, 0.84], [0.12, 0.92], [0, 0.9]],
    cockpit: [0.5, 0.24, 0.035, 0.08],
    engines: [[-0.08, 0.92, 0.05], [0.08, 0.92, 0.05]],
    turrets: [[0, 0.56]],
    tint: ["#c9d3dc", "#6f7f8f"],
    stripe: "#2f80c8",
  },
  "Free Trader": {
    half: [[0, 0.1], [0.1, 0.12], [0.16, 0.2], [0.18, 0.3], [0.32, 0.34], [0.34, 0.66], [0.2, 0.7], [0.2, 0.82], [0.14, 0.88], [0, 0.88]],
    cockpit: [0.5, 0.17, 0.06, 0.04],
    engines: [[-0.1, 0.9, 0.06], [0.1, 0.9, 0.06]],
    turrets: [[0, 0.44]],
    pods: [[-0.37, 0.5, 0.06, 0.13], [0.37, 0.5, 0.06, 0.13]],
    tint: ["#d7c8a8", "#7a6a50"],
    stripe: "#c8742f",
  },
  "Salvage Tug": {
    half: [[0, 0.22], [0.16, 0.22], [0.16, 0.12], [0.22, 0.06], [0.26, 0.1], [0.24, 0.3], [0.3, 0.36], [0.3, 0.74], [0.22, 0.84], [0, 0.86]],
    cockpit: [0.5, 0.28, 0.07, 0.04],
    engines: [[0, 0.9, 0.11]],
    turrets: [[-0.14, 0.46], [0.14, 0.46]],
    tint: ["#e0c34a", "#6f5b1c"],
    stripe: "#2b2b2b",
  },
  "Patrol Cutter": {
    half: [[0, 0.03], [0.06, 0.14], [0.12, 0.34], [0.16, 0.5], [0.3, 0.64], [0.32, 0.76], [0.18, 0.78], [0.18, 0.9], [0, 0.92]],
    cockpit: [0.5, 0.2, 0.03, 0.07],
    engines: [[-0.12, 0.93, 0.045], [0, 0.95, 0.055], [0.12, 0.93, 0.045]],
    turrets: [[0, 0.4], [-0.2, 0.66], [0.2, 0.66]],
    tint: ["#e6eaee", "#5b6672"],
    stripe: "#c83a3a",
  },
  Fighter: {
    half: [[0, 0.12], [0.05, 0.3], [0.1, 0.5], [0.36, 0.74], [0.36, 0.8], [0.12, 0.76], [0.08, 0.86], [0, 0.84]],
    cockpit: [0.5, 0.38, 0.035, 0.08],
    engines: [[0, 0.89, 0.06]],
    turrets: [],
    guns: [[-0.3, 0.6], [0.3, 0.6]],
    tint: ["#9aa7b4", "#3d4652"],
    stripe: "#e0b030",
  },
  Corsair: {
    half: [[0, 0.04], [0.07, 0.18], [0.2, 0.22], [0.12, 0.34], [0.14, 0.48], [0.34, 0.6], [0.26, 0.66], [0.3, 0.8], [0.16, 0.8], [0.12, 0.9], [0, 0.88]],
    cockpit: [0.5, 0.26, 0.04, 0.05],
    engines: [[-0.09, 0.91, 0.05], [0.09, 0.91, 0.05]],
    turrets: [[0, 0.42], [-0.2, 0.6], [0.2, 0.6]],
    tint: ["#5d5f66", "#1d1e23"],
    stripe: "#a61f2f",
  },
};
export const SHIP_ART = Object.keys(HULLS);

// Draws the design's ship on a 2D canvas context of size x size.
export function drawShip(ctx, design, size = 512) {
  const hull = HULLS[design] ?? HULLS.Courier;
  const px = (x) => (0.5 + x) * size;
  const py = (y) => y * size;
  ctx.clearRect(0, 0, size, size);
  // A margin all round, for the engines' glow.
  ctx.save();
  ctx.translate(size * 0.09, size * 0.03);
  ctx.scale(0.82, 0.82);
  const outline = () => {
    ctx.beginPath();
    hull.half.forEach(([x, y], index) => (index ? ctx.lineTo(px(x), py(y)) : ctx.moveTo(px(x), py(y))));
    for (const [x, y] of hull.half.slice().reverse()) ctx.lineTo(px(-x), py(y));
    ctx.closePath();
  };
  // Engine glow behind the hull.
  for (const [x, y, r] of hull.engines) {
    const glow = ctx.createRadialGradient(px(x), py(y), 0, px(x), py(y) + r * size * 1.2, r * size * 2.6);
    glow.addColorStop(0, "rgba(140, 220, 255, 0.95)");
    glow.addColorStop(0.35, "rgba(60, 150, 255, 0.55)");
    glow.addColorStop(1, "rgba(30, 80, 255, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.ellipse(px(x), py(y) + r * size * 0.9, r * size * 1.4, r * size * 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // The hull: metal lit from the left, a dark rim.
  outline();
  const metal = ctx.createLinearGradient(px(-0.35), 0, px(0.35), 0);
  metal.addColorStop(0, hull.tint[0]);
  metal.addColorStop(0.55, hull.tint[1]);
  metal.addColorStop(1, hull.tint[1]);
  ctx.fillStyle = metal;
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = size * 0.03;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = size * 0.008;
  ctx.strokeStyle = "rgba(10,12,16,0.85)";
  ctx.stroke();
  // Pods (a trader's cargo).
  for (const [x, y, w, h] of hull.pods ?? []) {
    const pod = ctx.createLinearGradient(px(x - w), 0, px(x + w), 0);
    pod.addColorStop(0, hull.tint[1]);
    pod.addColorStop(0.5, hull.tint[0]);
    pod.addColorStop(1, hull.tint[1]);
    ctx.fillStyle = pod;
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.lineWidth = size * 0.006;
    ctx.beginPath();
    ctx.roundRect(px(x - w), py(y - h), w * 2 * size, h * 2 * size, size * 0.02);
    ctx.fill();
    ctx.stroke();
  }
  // Panel lines and the spine.
  ctx.save();
  outline();
  ctx.clip();
  ctx.strokeStyle = "rgba(0,0,0,0.22)";
  ctx.lineWidth = size * 0.003;
  for (let y = 0.08; y < 0.95; y += 0.06) {
    ctx.beginPath();
    ctx.moveTo(px(-0.4), py(y));
    ctx.lineTo(px(0.4), py(y));
    ctx.stroke();
  }
  for (const x of [-0.12, -0.06, 0.06, 0.12]) {
    ctx.beginPath();
    ctx.moveTo(px(x), py(0));
    ctx.lineTo(px(x), py(1));
    ctx.stroke();
  }
  // The livery stripe down the spine.
  ctx.fillStyle = hull.stripe;
  ctx.globalAlpha = 0.85;
  ctx.fillRect(px(-0.012), py(0.05), size * 0.024, size * 0.85);
  ctx.globalAlpha = 1;
  // A sheen.
  const sheen = ctx.createLinearGradient(0, py(0), 0, py(1));
  sheen.addColorStop(0, "rgba(255,255,255,0.22)");
  sheen.addColorStop(0.4, "rgba(255,255,255,0)");
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, size, size);
  ctx.restore();
  // The cockpit's canopy.
  const [cx, cy, cw, ch] = hull.cockpit;
  const glass = ctx.createLinearGradient(0, py(cy - ch), 0, py(cy + ch));
  glass.addColorStop(0, "#bff3ff");
  glass.addColorStop(1, "#1b5f8c");
  ctx.fillStyle = glass;
  ctx.strokeStyle = "rgba(0,0,0,0.7)";
  ctx.lineWidth = size * 0.005;
  ctx.beginPath();
  ctx.ellipse(cx * size, py(cy), cw * size, ch * size, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Engine bells.
  for (const [x, y, r] of hull.engines) {
    ctx.fillStyle = "#2a2f36";
    ctx.beginPath();
    ctx.ellipse(px(x), py(y) - r * size * 0.3, r * size, r * size * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#9fe6ff";
    ctx.beginPath();
    ctx.ellipse(px(x), py(y) - r * size * 0.3, r * size * 0.6, r * size * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Turrets: a ring and twin barrels forward.
  for (const [x, y] of hull.turrets) {
    ctx.fillStyle = "#30353d";
    ctx.strokeStyle = "rgba(0,0,0,0.8)";
    ctx.lineWidth = size * 0.004;
    ctx.fillRect(px(x) - size * 0.012, py(y) - size * 0.07, size * 0.008, size * 0.06);
    ctx.fillRect(px(x) + size * 0.004, py(y) - size * 0.07, size * 0.008, size * 0.06);
    ctx.beginPath();
    ctx.arc(px(x), py(y), size * 0.032, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  for (const [x, y] of hull.guns ?? []) {
    ctx.fillStyle = "#30353d";
    ctx.fillRect(px(x) - size * 0.006, py(y) - size * 0.12, size * 0.012, size * 0.12);
  }
  ctx.restore();
}
