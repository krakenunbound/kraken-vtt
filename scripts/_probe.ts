import * as CANNON from "cannon-es";
import { diceOf, simulate } from "../src/dice/throw";
import type { ChatLine, RollTerm } from "../src/session/useSession";
// Swerves: a die's path across the table turns sharply (over 50 degrees in a
// frame) while it is fast, with nothing but the felt to turn it.
const terms: RollTerm[] = [{ kind: "dice", sign: 1, count: 4, sides: 20, rolls: [5, 9, 14, 2], kept: [true, true, true, true], sum: 30 }, { kind: "dice", sign: 1, count: 2, sides: 6, rolls: [3, 4], kept: [true, true], sum: 7 }];
const line = { id: "x", from: "", text: "", at: 0, roll: { formula: "4d20+2d6", label: "", total: 37, terms } } as ChatLine;
let swerves = 0, throws = 0, starts = 0;
for (let n = 0; n < 60; n++) {
  const dice = diceOf(line);
  const angle = Math.random() * Math.PI * 2;
  const r = simulate(dice, { x: 0.3 + Math.random() * 0.4, y: 0.3 + Math.random() * 0.4, vx: Math.cos(angle) * 3, vy: Math.sin(angle) * 3 }, 30, 16);
  throws++;
  const railX = (x: number) => x < 1.2 || x > 28.8;
  const railZ = (z: number) => z < 1.2 || z > 14.8;
  for (let d = 0; d < dice.length; d++) {
    const p = (f: number) => { const at = (f * dice.length + d) * 7; return [r.frames[at], r.frames[at + 1], r.frames[at + 2]]; };
    for (let f = 2; f < r.count; f++) {
      const [x0, , z0] = p(f - 2), [x1, y1, z1] = p(f - 1), [x2, , z2] = p(f);
      const a = [x1 - x0, z1 - z0], b = [x2 - x1, z2 - z1];
      const la = Math.hypot(...a), lb = Math.hypot(...b);
      if (la * 60 < 6 || lb * 60 < 6) continue;
      const turn = Math.acos(Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1]) / (la * lb))));
      if (turn < (50 * Math.PI) / 180 || railX(x1) || railZ(z1)) continue;
      // Near another die?
      let near = false;
      for (let o = 0; o < dice.length; o++) if (o !== d) { const at = ((f - 1) * dice.length + o) * 7; if (Math.hypot(r.frames[at] - x1, r.frames[at + 1] - y1, r.frames[at + 2] - z1) < 1.6) near = true; }
      if (near) { if (f < 8) starts++; continue; }
      swerves++;
      if (swerves <= 8) {
        const touched = (r.hits as any[]).filter((h) => h.who === d && Math.abs(h.frame - (f - 1)) <= 1).map((h) => `${h.other}@${h.frame}`);
        console.log(`  swerve die ${dice[d].kind} frame ${f - 1}: at ${x1.toFixed(1)},${y1.toFixed(2)},${z1.toFixed(1)} speed ${(la * 60).toFixed(0)}->${(lb * 60).toFixed(0)} turn ${(turn * 57.3).toFixed(0)}deg touched [${touched.join(" ")}]`);
      }
    }
  }
}
console.log(`${throws} hard throws of 6 dice: ${swerves} swerves off the felt alone, ${starts} shoves right at the start`);
