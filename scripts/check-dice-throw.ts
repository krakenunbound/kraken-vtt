// The 3D dice land on the number the host rolled: for every kind of die
// (d100 as a tens and a ones die), a throw is simulated and the die is
// labelled so that the face it rests on carries that number. The dice come to
// rest, on the table, inside the window's edges, from a gentle toss or a hard
// flick (which carries the hand's speed and bounces off the rails).
import * as THREE from "three";
import { bottomFace, model, topFace } from "../src/dice/models";
import { diceOf, labelsFor, simulate, type Die } from "../src/dice/throw";
import type { ChatLine, RollTerm } from "../src/session/useSession";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const width = 30;
const depth = 16;
let throws = 0;
let still = 0;
const sides = [2, 3, 4, 6, 8, 10, 12, 20, 100];
for (const side of sides) {
  for (let round = 0; round < 6; round++) {
    const rolls = Array.from({ length: 3 }, () => 1 + Math.floor(Math.random() * side));
    const terms: RollTerm[] = [{ kind: "dice", sign: 1, count: rolls.length, sides: side, rolls, kept: rolls.map(() => true), sum: rolls.reduce((a, b) => a + b, 0) }];
    const line = { id: "x", from: "Ann", text: "", at: 0, roll: { formula: `${rolls.length}d${side}`, label: "", total: 0, terms } } as ChatLine;
    const dice = diceOf(line);
    assert(dice.length === (side === 100 ? 6 : 3), `d${side}: dice ${dice.length}`);
    // Every other throw a hard flick (as fast as a hand goes), the rest gentle to brisk.
    const hard = round % 2 === 1;
    const angle = Math.random() * Math.PI * 2;
    const thrown = hard ? { x: Math.random(), y: Math.random(), vx: Math.cos(angle) * (round === 5 ? 8 : 3), vy: Math.sin(angle) * (round === 5 ? 8 : 3) } : { x: Math.random(), y: Math.random(), vx: Math.random() * 2 - 1, vy: Math.random() * 2 - 1 };
    const result = simulate(dice, thrown, width, depth);
    throws += 1;
    if (result.count < 6 * 60) still += 1;
    dice.forEach((die, index) => {
      const values = labelsFor(die, result.rest[index]);
      const top = topFace(die.kind, result.rest[index]);
      if (die.kind === "d4") {
        // Read at the top: every face but the one it rests on shows its number.
        const bottom = bottomFace(die.kind, result.rest[index]);
        assert(values.every((value, face) => (face === bottom ? value !== die.label : value === die.label)), `d4 shows ${values.join()} resting on ${bottom}, wanted ${die.label}`);
      } else {
        assert(values[top] === die.label, `d${side} (${die.kind}) shows ${values[top]} on top, wanted ${die.label}`);
        assert([...values].sort().join() === [...(die.faces ?? model(die.kind).shape.values)].sort().join(), `${die.kind}: every number once`);
        if (side === 2 || side === 3) assert(die.kind === "d6" && values.every((value) => Number(value) >= 1 && Number(value) <= side), `a d${side} is a d6 numbered 1-${side}: ${values.join()}`);
      }
      const last = (result.count - 1) * dice.length + index;
      const [x, y, z] = [result.frames[last * 7], result.frames[last * 7 + 1], result.frames[last * 7 + 2]];
      assert(x > 0 && x < width && z > 0 && z < depth && y > 0 && y < 1.2, `${die.kind} rests on the table: ${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}`);
      const q = new THREE.Quaternion(result.frames[last * 7 + 3], result.frames[last * 7 + 4], result.frames[last * 7 + 5], result.frames[last * 7 + 6]);
      if (die.kind === "d4") assert(bottomFace(die.kind, q) === bottomFace(die.kind, result.rest[index]), "d4: the recorded rest is the one labelled");
      else assert(topFace(die.kind, q) === top, `${die.kind}: the recorded rest is the one labelled`);
    });
  }
}
// A d100 of 100 is 00 and 0; of 7 is 00 and 7; d10 of 10 is 0.
const one = (side: number, value: number) =>
  diceOf({ id: "x", from: "", text: "", at: 0, roll: { formula: "", label: "", total: value, terms: [{ kind: "dice", sign: 1, count: 1, sides: side, rolls: [value], kept: [true], sum: value }] } } as ChatLine).map((die) => die.label).join(" ");
assert(one(100, 100) === "00 0" && one(100, 7) === "00 7" && one(100, 42) === "40 2" && one(10, 10) === "0", "percentile and d10 labels");
// Dice already on the table: a second throw at the same spot knocks against
// them and never comes to rest inside or on top of them (they are where they lie).
const restOf = (result: ReturnType<typeof simulate>, n: number) =>
  Array.from({ length: n }, (_, die) => {
    const at = ((result.count - 1) * n + die) * 7;
    return { x: result.frames[at], y: result.frames[at + 1], z: result.frames[at + 2] };
  });
let knocks = 0;
for (let round = 0; round < 12; round++) {
  const first: Die[] = Array.from({ length: 4 }, () => ({ kind: "d6", label: "3" }));
  const toss = { x: 0.5, y: 0.5, vx: 0.05, vy: 0.02 };
  const a = simulate(first, toss, width, depth);
  const second: Die[] = Array.from({ length: 4 }, () => ({ kind: "d20", label: "7" }));
  const b = simulate(second, { x: 0.38, y: 0.5, vx: 0.9, vy: 0.05 }, width, depth, undefined, [{ kinds: first.map((die) => die.kind), frames: a.frames, count: a.count, from: a.count, until: 100000 }]);
  if (b.hits.some((hit) => hit.onDie)) knocks += 1;
  const lying = restOf(a, first.length);
  for (const die of restOf(b, second.length)) {
    assert(die.y < 1.2, `a die thrown into others rests on the table, not on them: y ${die.y.toFixed(2)}`);
    for (const other of lying) assert(Math.hypot(die.x - other.x, die.z - other.z) > 0.85, `a die never ends inside another: ${Math.hypot(die.x - other.x, die.z - other.z).toFixed(2)} apart`);
  }
  // Rolling at the same time (the first throw just leaving the hand): still never inside it at rest.
  const c = simulate(second, { x: 0.45, y: 0.52, vx: 0.4, vy: 0 }, width, depth, undefined, [{ kinds: first.map((die) => die.kind), frames: a.frames, count: a.count, from: 0, until: 100000 }]);
  for (const die of restOf(c, second.length)) for (const other of lying) assert(Math.hypot(die.x - other.x, die.z - other.z) > 0.85, `a die thrown with others in flight ends clear of them: ${Math.hypot(die.x - other.x, die.z - other.z).toFixed(2)}`);
}
assert(knocks >= 6, `a throw into dice on the table knocks against them: ${knocks}/12`);
// (A rare throw runs to the limit; it still ends on its last frame, showing the right number.)
assert(still >= throws - 1, `throws come to rest within 6 s: ${still}/${throws}`);
console.log(`ok ${throws} throws: every die shows the host's number (${still} settled before the limit); a throw into dice already on the table knocks against them (${knocks}/12) and none ends inside or on another`);

// A natural 20 and a 1, heard: the sad trombone steps down and ends on its
// longest, sagging note; the fanfare climbs and ends on its highest, held.
{
  const { naturalTune } = await import("../src/dice/critSound");
  const low = naturalTune("low");
  const high = naturalTune("high");
  assert(low.every((note, index) => index === 0 || note.freq < low[index - 1].freq), "the trombone steps down");
  const last = low[low.length - 1];
  assert(last.length === Math.max(...low.map((note) => note.length)) && (last.slideTo ?? last.freq) < last.freq && last.wobble, "its last note is the longest, sagging and wobbling");
  assert(high[high.length - 1].freq === Math.max(...high.map((note) => note.freq)) && high[high.length - 1].length === Math.max(...high.map((note) => note.length)), "the fanfare ends on its highest note, held");
  console.log("ok a natural 20's fanfare and a natural 1's sad trombone");
}
