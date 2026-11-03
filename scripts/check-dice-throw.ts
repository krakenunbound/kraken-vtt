// The 3D dice land on the number the host rolled: for every kind of die
// (d100 as a tens and a ones die), a throw is simulated and the die is
// labelled so that the face it rests on carries that number. The dice come to
// rest, on the table, inside the window's edges, from a gentle toss or a hard
// flick (which carries the hand's speed and bounces off the rails).
import * as THREE from "three";
import { bottomFace, model, topFace } from "../src/dice/models";
import { diceOf, labelsFor, simulate } from "../src/dice/throw";
import type { ChatLine, RollTerm } from "../src/session/useSession";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const width = 30;
const depth = 16;
let throws = 0;
let still = 0;
const sides = [4, 6, 8, 10, 12, 20, 100];
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
        assert([...values].sort().join() === [...model(die.kind).shape.values].sort().join(), `${die.kind}: every number once`);
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
// (A rare throw runs to the limit; it still ends on its last frame, showing the right number.)
assert(still >= throws - 1, `throws come to rest within 6 s: ${still}/${throws}`);
console.log(`ok ${throws} throws: every die shows the host's number (${still} settled before the limit)`);
