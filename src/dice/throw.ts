import * as THREE from "three";
import * as CANNON from "cannon-es";
import type { ChatLine } from "../session/useSession";
import { SHAPED, type DiceThrow } from "./diceStore";
import { bottomFace, collider, model, topFace, type ShapeKind } from "./models";

// A throw worked out before it is shown: the dice of a roll, their flight in
// a physics world of their own, and the labels that put the host's number on
// the face each die comes to rest on. (No DOM here: the checks run it too.)

export type Die = { kind: ShapeKind; label: string };
export type Hit = { frame: number; strength: number; onDie: boolean };
const STEP = 1 / 120;
export const MAX_DICE = 24;

// The dice of a roll, as the host rolled them (d100 is a tens and a ones die).
export function diceOf(line: ChatLine): Die[] {
  const dice: Die[] = [];
  for (const term of line.roll?.terms ?? []) {
    if (term.kind !== "dice" || !SHAPED.has(term.sides)) continue;
    for (const value of term.rolls) {
      if (dice.length >= MAX_DICE) break;
      if (term.sides === 100) {
        const tens = Math.floor((value % 100) / 10);
        dice.push({ kind: "d100tens", label: `${tens}0` }, { kind: "d100", label: `${value % 10}` });
      } else if (term.sides === 10) dice.push({ kind: "d10", label: value === 10 ? "0" : `${value}` });
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

// The throw in its own physics world, recorded frame by frame. width, depth:
// the whole window (the throw is in fractions of it); area: the table's rails.
export function simulate(dice: Die[], thrown: DiceThrow, width: number, depth: number, area: Area = { left: 0, top: 0, right: width, bottom: depth }) {
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
    const body = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Box(new CANNON.Vec3(hx, 4, hz)), material: wood });
    body.position.set(x, 4, z);
    world.addBody(body);
  };
  const across = area.right - area.left;
  const down = area.bottom - area.top;
  rail(area.left - 1, area.top + down / 2, 1, down);
  rail(area.right + 1, area.top + down / 2, 1, down);
  rail(area.left + across / 2, area.top - 1, across, 1);
  rail(area.left + across / 2, area.bottom + 1, across, 1);

  // The dice leave the hand as fast as it moved (world units a second), from
  // a gentle toss to a hard flick across the table.
  const speed = Math.hypot(thrown.vx * width, thrown.vy * depth);
  const scale = speed < 1e-3 ? 0 : Math.min(56, Math.max(5, speed)) / speed;
  const heading = Math.atan2(thrown.vy * depth, thrown.vx * width);
  const startX = Math.min(area.right - 1.2, Math.max(area.left + 1.2, thrown.x * width));
  const startZ = Math.min(area.bottom - 1.2, Math.max(area.top + 1.2, thrown.y * depth));
  const columns = Math.ceil(Math.sqrt(dice.length));
  const bodies = dice.map((die, index) => {
    const body = new CANNON.Body({ mass: 1, shape: collider(die.kind), material: diceStuff, linearDamping: 0.03, angularDamping: 0.06, sleepSpeedLimit: 0.3, sleepTimeLimit: 0.3 });
    const column = index % columns;
    const row = Math.floor(index / columns);
    body.position.set(startX + (column - (columns - 1) / 2) * 1.05, 1.8 + row * 0.6 + Math.random() * 0.3, startZ + (row - (columns - 1) / 2) * 1.05);
    body.quaternion.setFromEuler(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2);
    const turn = heading + (Math.random() - 0.5) * 0.35;
    const push = speed * scale * (0.85 + Math.random() * 0.3);
    body.velocity.set(Math.cos(turn) * push, 3 + Math.random() * 3 + push * 0.08, Math.sin(turn) * push);
    // A harder throw spins the dice harder.
    const spin = 18 + push * 1.1;
    body.angularVelocity.set((Math.random() - 0.5) * spin, (Math.random() - 0.5) * spin, (Math.random() - 0.5) * spin);
    world.addBody(body);
    return body;
  });

  const hits: Hit[] = [];
  let frame = 0;
  bodies.forEach((body) =>
    body.addEventListener("collide", (event: { body: CANNON.Body; contact: CANNON.ContactEquation }) => {
      const onDie = bodies.includes(event.body);
      if (onDie && event.body.id < body.id) return; // each knock between two dice once
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
    world.step(STEP);
    world.step(STEP);
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
      // A die left lying on another is knocked off it, so every die is read flat on the table.
      const perched = bodies.filter((body) => body.position.y > 1);
      if (perched.length === 0 || count > limit - 90) {
        count += 1;
        break;
      }
      perched.forEach((body) => {
        const angle = Math.random() * Math.PI * 2;
        body.linearDamping = 0.45;
        body.angularDamping = 0.6;
        body.velocity.set(Math.cos(angle) * 3.5, 1.5, Math.sin(angle) * 3.5);
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
  const values = model(die.kind).shape.values.slice();
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

