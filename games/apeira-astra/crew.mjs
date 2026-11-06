// Apeira Astra: Origins (where you grew up), Paths (what you did before), and
// gear. Records the crew wizard and the sheet read: an Origin is a "race"
// record (its skills: "Zero-G 1, Pilot 0"), a Path a "class" record (its
// signature skill, the skills it picks from, its kit and credits).
import { ids, md } from "../lib/fg.mjs";

const item = (name, type, subtype, cost, fields, text) => ({ name, type, subtype, cost: `${cost} cr`, ...fields, description: md(text), __category: type === "Weapon" ? "Weapons" : type === "Armour" ? "Armour" : "Gear" });
const weapon = (name, subtype, cost, damage, skill, range, text) => item(name, "Weapon", subtype, cost, { damage, skill, range }, text);
const armour = (name, cost, protection, text) => item(name, "Armour", "Armour", cost, { protection }, text);
const gear = (name, cost, text) => item(name, "Gear", "Equipment", cost, {}, text);

export const WEAPONS = [
  weapon("Knife", "Melee", 20, "1d6", "Melee", "Melee", "A utility blade. Everyone carries one; few admit they have used it."),
  weapon("Shock Baton", "Melee", 150, "2d6", "Melee", "Melee", "A security officer's stun stick. A target hit makes a Grit check (Standard) or loses its next turn."),
  weapon("Cutlass", "Melee", 200, "2d6", "Melee", "Melee", "The boarding blade of the old navies: no ricochets inside a hull."),
  weapon("Snub Pistol", "Pistol", 150, "2d6", "Firearms", "10 m", "Low-velocity rounds that will not hole a hull. The spacer's sidearm."),
  weapon("Service Pistol", "Pistol", 250, "3d6", "Firearms", "20 m", "A reliable slug-thrower. Do not fire it at the windows."),
  weapon("Laser Pistol", "Pistol", 1200, "3d6", "Firearms", "30 m", "A focused beam from a palm-sized power pack (20 shots)."),
  weapon("Scattergun", "Long Gun", 300, "4d6", "Firearms", "10 m", "A short shotgun for close corridors. Past 10 m, halve the damage."),
  weapon("Carbine", "Long Gun", 400, "3d6", "Firearms", "100 m", "A short rifle that fits through a hatch."),
  weapon("Rifle", "Long Gun", 500, "4d6", "Firearms", "300 m", "A frontier rifle: long range, heavy recoil, too much gun for a ship."),
  weapon("Laser Rifle", "Long Gun", 3500, "4d6", "Firearms", "500 m", "Silent, recoilless, and expensive to power."),
  weapon("Rotary Cannon", "Heavy", 6000, "5d6", "Heavy Weapons", "400 m", "A spinning-barrel heavy gun. Needs a Brawn of 9, or a mount."),
  weapon("Cutting Laser", "Tool", 600, "2d6", "Melee", "Melee", "A hull-cutting tool. As a weapon it is clumsy; through a bulkhead it is a door."),
];
export const ARMOUR = [
  armour("Flight Jacket", 100, 1, "Padded and lined: a little protection, a lot of pockets."),
  armour("Mesh Undersuit", 500, 3, "Woven ballistic fibre, worn under clothing."),
  armour("Flak Vest", 400, 5, "Heavy plates front and back. Obvious."),
  armour("Vac Suit", 1500, 4, "A sealed suit with 6 hours of air. In vacuum without one: 1d6 damage a turn."),
  armour("Combat Armour", 15000, 10, "Military plate with a sealed helmet and 6 hours of air. Not sold to just anyone."),
];
export const GEAR = [
  gear("Medkit", 300, "Dressings, stims and a diagnostic cuff: +2 to Medicine tasks. A Medicine task (Standard) with it restores 1d6 Stamina plus the Effect, once per wound."),
  gear("Toolkit", 400, "Spanners, drivers, a multimeter and a cutting torch: needed for most Mechanics and Engineering tasks."),
  gear("Hand Scanner", 900, "Reads radiation, atmosphere, life signs and power within 50 m: +2 to Recon in the dark or behind bulkheads."),
  gear("Comm Bead", 150, "An earpiece radio with a 10 km range, or ship-to-crew anywhere within a ship."),
  gear("Data Slate", 200, "A tablet for maps, records and hacking tools: needed for Electronics tasks on a system."),
  gear("Breather Mask", 100, "Filters a thin or tainted atmosphere for 12 hours."),
  gear("Mag Boots", 250, "Keep your feet on the deck in zero gravity: no Zero-G task to stand, fight or walk."),
  gear("Flashlight", 20, "A bright beam 30 m long. Dark ships are very dark."),
  gear("Emergency Beacon", 300, "Broadcasts a distress call on every band for 30 days."),
  gear("Ration Packs (5)", 25, "Five days of food that tastes of the packet."),
  gear("Grapple Line", 80, "50 m of line and a magnetic grapple, rated for zero-g work."),
  gear("Stim Patch", 60, "Shrugs off pain: ignore being Down for 3 turns, then take 1d6 damage. One use."),
];

const ALL = [...WEAPONS, ...ARMOUR, ...GEAR];
const kitOf = (list) => ({
  "id-00001": {
    items: ids(
      list.map(([name, count = 1]) => {
        const found = ALL.find((entry) => entry.name === name);
        if (!found) throw new Error(`No item ${name}.`);
        const { __category, ...fields } = found;
        return { ...fields, count };
      }),
    ),
  },
});

const origin = (name, skills, text, trait) => ({ name, skills, text: md(text), traits: ids([{ name: trait[0], text: md(trait[1]) }]) });
export const ORIGINS = [
  origin("Coreborn", "Persuade 0, Electronics 0, Science 0", "Raised on one of the old, crowded worlds of the Core: schools, networks and manners.", ["Credentials", "You have a citizen's papers that open doors, and a family name someone recognises."]),
  origin("Spacer", "Zero-G 1, Pilot 0", "Born aboard a ship or a station, you learned to walk in a corridor and swim in the air.", ["Hull Sense", "You feel when a ship is wrong: a Boon on tasks to notice a failing system or a breach."]),
  origin("Frontier", "Survival 1, Drive 0, Recon 0", "From a hard world at the edge of the Reach, where help is a long way off.", ["Hardened", "Once per session, ignore being Down for one turn."]),
  origin("Undercity", "Streetwise 1, Stealth 0, Melee 0", "From the levels beneath a city, where the light is borrowed and everything is for sale.", ["Know a Guy", "On any station or city, a Streetwise task (Standard) finds someone who can get what you need, for a price."]),
  origin("Belter", "Mechanics 1, Zero-G 0, Engineering 0", "Raised in the asteroid habitats, where everything breaks and you fix it or die.", ["Make Do", "No Bane for working without the right tools."]),
];

const path = ({ name, signature, skills, credits, kit, text, ranks }) => ({
  name,
  signature,
  skills,
  credits,
  startingequipmentlist: kitOf(kit),
  startingequipment: kit.map(([item, count = 1]) => (count > 1 ? `${item} (${count})` : item)).join(", "),
  text: md(`${text}\n\n**Signature skill:** ${signature} 1. **Choose from:** ${skills}. **Starting credits:** ${credits}.\n\n${ranks}`),
  hp: { hitdice: { text: "" } },
  proficiencies: {},
});
export const PATHS = [
  path({ name: "Fleet", signature: "Pilot", skills: "Pilot, Astrogation, Gunnery, Electronics, Leadership, Tactics, Zero-G", credits: 1500, kit: [["Flight Jacket"], ["Snub Pistol"], ["Comm Bead"], ["Data Slate"]], text: "You served aboard a warship or a patrol cutter: watch rotations, drills, and the long silence of a skein transit.", ranks: "*Former ranks:* rating, ensign, lieutenant." }),
  path({ name: "Marine", signature: "Firearms", skills: "Firearms, Melee, Athletics, Heavy Weapons, Tactics, Recon, Zero-G, Leadership", credits: 1000, kit: [["Flak Vest"], ["Carbine"], ["Knife"], ["Medkit"]], text: "You were the one sent through the airlock first. Boarding actions, station security, and things you do not talk about.", ranks: "*Former ranks:* trooper, corporal, sergeant." }),
  path({ name: "Scout", signature: "Recon", skills: "Recon, Pilot, Survival, Astrogation, Stealth, Drive, Science, Mechanics", credits: 1200, kit: [["Flight Jacket"], ["Service Pistol"], ["Hand Scanner"], ["Breather Mask"]], text: "You charted the empty places: survey runs, first landings, months alone with the ship's voice.", ranks: "*Former ranks:* surveyor, pathfinder." }),
  path({ name: "Merchant", signature: "Trade", skills: "Trade, Persuade, Deceive, Streetwise, Pilot, Electronics, Leadership", credits: 3000, kit: [["Mesh Undersuit"], ["Snub Pistol"], ["Comm Bead"], ["Data Slate"]], text: "You bought low and sold far away: cargo manifests, port fees and handshakes in bad bars.", ranks: "*Former ranks:* purser, factor, master." }),
  path({ name: "Engineer", signature: "Engineering", skills: "Engineering, Mechanics, Electronics, Zero-G, Science, Pilot, Gunnery", credits: 1200, kit: [["Vac Suit"], ["Toolkit"], ["Cutting Laser"], ["Mag Boots"]], text: "You kept the drive lit and the air flowing. You know what every noise a ship makes means.", ranks: "*Former ranks:* mate, chief." }),
  path({ name: "Medic", signature: "Medicine", skills: "Medicine, Science, Electronics, Persuade, Survival, Recon", credits: 1500, kit: [["Flight Jacket"], ["Snub Pistol"], ["Medkit"], ["Stim Patch", 3]], text: "Ship's doctor, field medic or clinic worker: you have kept people alive with less than you needed.", ranks: "*Former ranks:* orderly, doctor." }),
  path({ name: "Drifter", signature: "Streetwise", skills: "Streetwise, Stealth, Deceive, Melee, Firearms, Drive, Athletics, Persuade", credits: 600, kit: [["Flight Jacket"], ["Service Pistol"], ["Knife"], ["Grapple Line"]], text: "You moved on whenever it got complicated: odd jobs, borrowed names and quick exits.", ranks: "*Former ranks:* none worth mentioning." }),
];
