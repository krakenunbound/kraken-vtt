import * as THREE from "three";
import * as CANNON from "cannon-es";
import type { ChatLine } from "../session/useSession";
import { FATE_FACES, SHAPED, SIX_SIDED, fateFace, type DiceThrow } from "./diceStore";
import { bottomFace, collider, model, topFace, type ShapeKind } from "./models";

// A throw worked out before it is shown: the dice of a roll, their flight in
// a physics world of their own, and the labels that put the host's number on
// the face each die comes to rest on. (No DOM here: the checks run it too.)

// faces: what each face shows when it is not the shape's own numbers (a d3 is a d6 with 1-3 twice).
export type Die = { kind: ShapeKind; label: string; faces?: string[] };
export type Hit = { frame: number; strength: number; onDie: boolean };
// Four physics steps a frame: a fast die moves under a quarter of its width a step, so it never slips through a rail.
const STEP = 1 / 240;
export const MAX_DICE = 24;

// The dice of a roll, as the host rolled them (d100 is a tens and a ones die).
export function diceOf(line: ChatLine): Die[] {
  const dice: Die[] = [];
  for (const term of line.roll?.terms ?? []) {
    if (term.kind !== "dice" || !SHAPED.has(term.sides)) continue;
    const fate = Boolean((term as { fate?: boolean }).fate);
    for (const value of term.rolls) {
      if (dice.length >= MAX_DICE) break;
      // A Fate die (4dF): a d6 of plus, minus and blank faces, its own face up.
      if (fate) dice.push({ kind: "d6", label: fateFace(value), faces: FATE_FACES });
      else if (term.sides === 100) {
        const tens = Math.floor((value % 100) / 10);
        dice.push({ kind: "d100tens", label: `${tens}0` }, { kind: "d100", label: `${value % 10}` });
      } else if (SIX_SIDED[term.sides]) dice.push({ kind: "d6", label: `${value}`, faces: SIX_SIDED[term.sides] });
      else if (term.sides === 10) dice.push({ kind: "d10", label: value === 10 ? "0" : `${value}` });
      else dice.push({ kind: `d${term.sides}` as ShapeKind, label: `${value}` });
    }
  }
  return dice;
}

// A roll nobody threw by hand comes from the chat corner toward the middle.
export function defaultThrow(): DiceThrow {
  const x = 0.16 + Math.random() * 0.08;
  const y = 0.78 + Math.random() * 0.08;
  return { x, y, vx: 0.55 + Math.random() * 0.15, vy: -0.42 - Math.random() * 0.12 };
}

// The part of the window the dice roll in (world units, x across, z down).
export type Area = { left: number; top: number; right: number; bottom: number };

// Dice already on the table (an earlier throw, rolling or at rest): their
// recorded flight, from frame `from` of it at this throw's first frame, until
// `until` (this throw's frame when they fade away).
export type OnTable = { kinds: ShapeKind[]; frames: Float32Array; count: number; from: number; until: number };

// The throw in its own physics world, recorded frame by frame. width, depth:
// the whole window (the throw is in fractions of it); area: the table's rails;
// onTable: the dice already there, which the new dice knock against and
// cannot pass through or come to rest inside (they move as they were recorded).
export function simulate(dice: Die[], thrown: DiceThrow, width: number, depth: number, area: Area = { left: 0, top: 0, right: width, bottom: depth }, onTable: OnTable[] = []) {
  // A die is a little over a unit across, so gravity this strong makes it fall
  // as a real one does, not drift down as through water. The felt takes some
  // of a bounce, the rails throw the dice back, and the dice clack off each other.
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -58, 0), allowSleep: true });
  const diceStuff = new CANNON.Material("dice");
  const felt = new CANNON.Material("felt");
  const wood = new CANNON.Material("rail");
  world.addContactMaterial(new CANNON.ContactMaterial(diceStuff, felt, { friction: 0.3, restitution: 0.4 }));
  world.addContactMaterial(new CANNON.ContactMaterial(diceStuff, wood, { friction: 0.08, restitution: 0.68 }));
  world.addContactMaterial(new CANNON.ContactMaterial(diceStuff, diceStuff, { friction: 0.18, restitution: 0.5 }));
  const floor = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane(), material: felt });
  floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(floor);
  // The edges of the table are its rails.
  const rail = (x: number, z: number, hx: number, hz: number) => {
    const body = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Box(new CANNON.Vec3(hx, 20, hz)), material: wood });
    body.position.set(x, 20, z);
    world.addBody(body);
  };
  const across = area.right - area.left;
  const down = area.bottom - area.top;
  // Thick, and overlapping at the corners, so nothing gets through them.
  const thick = 6;
  rail(area.left - thick, area.top + down / 2, thick, down / 2 + thick * 2);
  rail(area.right + thick, area.top + down / 2, thick, down / 2 + thick * 2);
  rail(area.left + across / 2, area.top - thick, across / 2 + thick * 2, thick);
  rail(area.left + across / 2, area.bottom + thick, across / 2 + thick * 2, thick);

  // The dice leave the hand as fast as it moved (world units a second), from
  // a gentle toss to a hard flick across the table.
  const speed = Math.hypot(thrown.vx * width, thrown.vy * depth);
  const scale = speed < 1e-3 ? 0 : Math.min(90, Math.max(5, speed)) / speed;
  const heading = Math.atan2(thrown.vy * depth, thrown.vx * width);
  // The dice leave the hand in a small group, spaced so none touch; the whole
  // group starts inside the rails (a die started in a rail is thrown out of it
  // hard, as if off something that is not there).
  const columns = Math.ceil(Math.sqrt(dice.length));
  const spacing = 1.6;
  const reach = ((columns - 1) / 2) * spacing + 1;
  const startX = Math.min(area.right - reach, Math.max(area.left + reach, thrown.x * width));
  const startZ = Math.min(area.bottom - reach, Math.max(area.top + reach, thrown.y * depth));
  const bodies = dice.map((die, index) => {
    const body = new CANNON.Body({ mass: 1, shape: collider(die.kind), material: diceStuff, linearDamping: 0.03, angularDamping: 0.06, sleepSpeedLimit: 0.3, sleepTimeLimit: 0.3 });
    const column = index % columns;
    const row = Math.floor(index / columns);
    body.position.set(startX + (column - (columns - 1) / 2) * spacing, 1.8 + Math.random() * 0.3, startZ + (row - (columns - 1) / 2) * spacing);
    body.quaternion.setFromEuler(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2);
    const turn = heading + (Math.random() - 0.5) * 0.35;
    const push = speed * scale * (0.85 + Math.random() * 0.3);
    body.velocity.set(Math.cos(turn) * push, 3 + Math.random() * 3 + push * 0.08, Math.sin(turn) * push);
    // A thrown die tumbles end over end the way it travels, harder the harder
    // it is thrown, with a little wobble. (Spin in any direction made a corner
    // landing on the felt flick it sideways, as if off something not there.)
    const roll = push + Math.random() * 4;
    const along = { x: Math.cos(turn), z: Math.sin(turn) };
    const wobble = () => (Math.random() - 0.5) * 8;
    body.angularVelocity.set(along.z * roll + wobble(), wobble(), -along.x * roll + wobble());
    world.addBody(body);
    return body;
  });

  // The dice already on the table: bodies that follow their recorded flight.
  const others = onTable.flatMap((item) =>
    item.kinds.map((kind, die) => {
      const body = new CANNON.Body({ type: CANNON.Body.KINEMATIC, shape: collider(kind), material: diceStuff });
      world.addBody(body);
      return { body, item, die };
    }),
  );
  const gone = -500;
  const placeOthers = (count: number) => {
    for (const { body, item, die } of others) {
      if (count >= item.until) {
        body.position.set(0, gone, 0);
        body.velocity.set(0, 0, 0);
        continue;
      }
      const at = Math.min(item.count - 1, item.from + count);
      const next = Math.min(item.count - 1, at + 1);
      const n = item.kinds.length;
      const a = (at * n + die) * 7;
      const b = (next * n + die) * 7;
      body.position.set(item.frames[a], item.frames[a + 1], item.frames[a + 2]);
      body.quaternion.set(item.frames[a + 3], item.frames[a + 4], item.frames[a + 5], item.frames[a + 6]);
      // Moving as it was recorded, so a knock from it carries its speed.
      body.velocity.set((item.frames[b] - item.frames[a]) * 60, (item.frames[b + 1] - item.frames[a + 1]) * 60, (item.frames[b + 2] - item.frames[a + 2]) * 60);
    }
  };

  const hits: Hit[] = [];
  let frame = 0;
  bodies.forEach((body) =>
    body.addEventListener("collide", (event: { body: CANNON.Body; contact: CANNON.ContactEquation }) => {
      const onDie = bodies.includes(event.body) || others.some((other) => other.body === event.body);
      if (bodies.includes(event.body) && event.body.id < body.id) return; // each knock between two dice once
      hits.push({ frame, strength: Math.abs(event.contact.getImpactVelocityAlongNormal()), onDie });
    }),
  );

  const limit = 6 * 60;
  const frames = new Float32Array(limit * bodies.length * 7);
  let count = 0;
  for (; count < limit; count++) {
    frame = count;
    // Past 2.5 s a die still rocking settles quickly, as a real one stops wobbling.
    if (count === 150) bodies.forEach((body) => ((body.linearDamping = 0.7), (body.angularDamping = 0.8)));
    // No die spins wildly: a tumbling die keeps its spin in hand.
    bodies.forEach((body) => {
      const spin = body.angularVelocity.length();
      if (spin > 24) body.angularVelocity.scale(24 / spin, body.angularVelocity);
    });
    if (others.length) placeOthers(count);
    for (let step = 0; step < 4; step++) world.step(STEP);
    bodies.forEach((body, index) => {
      const at = (count * bodies.length + index) * 7;
      frames[at] = body.position.x;
      frames[at + 1] = body.position.y;
      frames[at + 2] = body.position.z;
      frames[at + 3] = body.quaternion.x;
      frames[at + 4] = body.quaternion.y;
      frames[at + 5] = body.quaternion.z;
      frames[at + 6] = body.quaternion.w;
    });
    if (count > 20 && bodies.every((body) => body.sleepState === CANNON.Body.SLEEPING)) {
      // A die left lying on another (of this throw or one already there) is
      // knocked off it, so every die is read flat on the table.
      const perched = bodies.filter((body) => body.position.y > 1);
      const under = [...bodies, ...others.filter((other) => other.body.position.y > gone / 2).map((other) => other.body)];
      if (perched.length === 0 || count > limit - 40) {
        count += 1;
        break;
      }
      perched.forEach((body) => {
        // It slides off the die it rests on, away from that die's middle.
        const below = under.filter((other) => other !== body).sort((a, b) => a.position.distanceTo(body.position) - b.position.distanceTo(body.position))[0];
        let dx = below ? body.position.x - below.position.x : 1;
        let dz = below ? body.position.z - below.position.z : 0;
        const length = Math.hypot(dx, dz);
        if (length < 0.05) {
          const angle = Math.random() * Math.PI * 2;
          [dx, dz] = [Math.cos(angle), Math.sin(angle)];
        } else [dx, dz] = [dx / length, dz / length];
        // ...and toward open table, so a die beside a rail is not pushed into it.
        const cx = (area.left + area.right) / 2 - body.position.x;
        const cz = (area.top + area.bottom) / 2 - body.position.z;
        const toMiddle = Math.hypot(cx, cz) || 1;
        dx += (cx / toMiddle) * 0.8;
        dz += (cz / toMiddle) * 0.8;
        const both = Math.hypot(dx, dz) || 1;
        [dx, dz] = [dx / both, dz / both];
        body.linearDamping = 0.45;
        body.angularDamping = 0.6;
        body.velocity.set(dx * 4, 1.5, dz * 4);
        body.angularVelocity.set((Math.random() - 0.5) * 8, 0, (Math.random() - 0.5) * 8);
        body.wakeUp();
      });
    }
  }
  const rest = bodies.map((body) => new THREE.Quaternion(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w));
  return { frames, count: Math.min(count, limit), hits, rest };
}

// The labels a die is made with so that its own number is on the face it rests on.
export function labelsFor(die: Die, rest: THREE.Quaternion) {
  const values = (die.faces ?? model(die.kind).shape.values).slice();
  // A d4 is read at its top, as a real one: the three faces that can be seen
  // all show its number, and the face it rests on another.
  if (die.kind === "d4") {
    const bottom = bottomFace(die.kind, rest);
    return values.map((_, index) => (index === bottom ? values.find((value) => value !== die.label)! : die.label));
  }
  const top = topFace(die.kind, rest);
  const wanted = values.indexOf(die.label);
  if (wanted >= 0 && wanted !== top) [values[top], values[wanted]] = [values[wanted], values[top]];
  return values;
}

