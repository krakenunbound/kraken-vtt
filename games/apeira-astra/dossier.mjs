// Apeira Astra Threat Dossier: the people and things a crew meets. NPC
// records the engine reads: characteristics, Stamina (hp), Armour, and
// actions whose text says "Attack +2 (3d6)" so the tracker rolls them.
import { ids, md } from "../lib/fg.mjs";
import { RULESET } from "./crew-handbook.mjs";

const STATS = ["brawn", "reflex", "grit", "intellect", "training", "presence"];
const attack = (name, bonus, dice, more = "") => ({ name, desc: `Attack ${bonus >= 0 ? "+" : ""}${bonus} (${dice})${more ? `, ${more}` : ""}.` });
const threat = ({ name, kind, scores, armour = 0, stamina, skills, actions, text, traits = [], category = "People" }) => {
  const characteristics = Object.fromEntries(STATS.map((stat, index) => [stat, { score: scores[index] }]));
  return {
    name,
    type: kind,
    characteristics,
    hp: stamina ?? scores[0] + scores[1] + scores[2],
    armour,
    ac: armour,
    skills,
    actions: ids(actions),
    traits: ids(traits.map(([trait, body]) => ({ name: trait, desc: body }))),
    text: md(text),
    __category: category,
  };
};

export const THREATS = [
  threat({ name: "Dock Tough", kind: "Human", scores: [8, 7, 8, 6, 5, 6], armour: 1, skills: "Melee 1, Streetwise 0", actions: [attack("Pipe", 1, "2d6", "melee")], text: "Muscle for hire on any station, paid in drink." }),
  threat({ name: "Combine Security", kind: "Human", scores: [8, 8, 8, 7, 7, 6], armour: 5, skills: "Firearms 1, Melee 1, Tactics 0", actions: [attack("Service Pistol", 1, "3d6", "20 m"), attack("Shock Baton", 1, "2d6", "melee; a target hit makes a Grit check or loses its next turn")], text: "The Halvard Combine's guards: well paid, badly briefed, and never alone." }),
  threat({ name: "Pirate Raider", kind: "Human", scores: [8, 8, 7, 6, 5, 5], armour: 3, skills: "Firearms 1, Melee 1, Zero-G 1", actions: [attack("Carbine", 1, "3d6", "100 m"), attack("Cutlass", 1, "2d6", "melee")], text: "Reach pirates rarely kill a crew that surrenders: dead crews make bad customers." }),
  threat({ name: "Mags Orrin", kind: "Human", scores: [7, 10, 9, 9, 7, 10], armour: 3, skills: "Firearms 2, Pilot 2, Deceive 2, Leadership 1, Zero-G 1", actions: [attack("Laser Pistol", 3, "3d6", "30 m"), attack("Knife", 1, "1d6", "melee")], text: "Captain of the salvage tug *Pale Gull*: charming, ruthless and always fifteen minutes behind you. She would rather deal than shoot, if the deal is good.", category: "Salvage Rights" }),
  threat({ name: "Gull Crewman", kind: "Human", scores: [8, 8, 8, 6, 6, 5], armour: 4, skills: "Firearms 1, Zero-G 1, Mechanics 1", actions: [attack("Snub Pistol", 1, "2d6", "10 m"), attack("Cutting Laser", 0, "2d6", "melee")], text: "Mags Orrin's salvagers, in patched vac suits.", category: "Salvage Rights" }),
  threat({ name: "Salvage Drone", kind: "Robot", scores: [9, 7, 10, 4, 4, 1], stamina: 18, armour: 6, skills: "Melee 1, Recon 1", actions: [attack("Cutting Arm", 1, "2d6", "melee")], traits: [["Machine", "Does not breathe; immune to vacuum, poison and fear."]], text: "A boxy drone with magnetic treads and a cutting arm, built to strip wrecks. A damaged control core makes it treat everything as scrap.", category: "Machines" }),
  threat({ name: "Sentry Turret", kind: "Robot", scores: [6, 8, 12, 3, 3, 1], stamina: 16, armour: 8, skills: "Firearms 2", actions: [attack("Twin Guns", 2, "3d6", "50 m")], traits: [["Fixed", "It cannot move. Electronics (Hard) at its panel shuts it down."]], text: "A ceiling-mounted defence gun, guarding a ship's bridge or vault.", category: "Machines" }),
  threat({ name: "Rust Crawler", kind: "Creature", scores: [5, 9, 6, 1, 6, 1], stamina: 12, armour: 2, skills: "Stealth 2, Athletics 1", actions: [attack("Mandibles", 1, "1d6", "melee; a vac suit hit springs a slow leak")], traits: [["Swarm", "Usually 2d6 of them, in the ducts."]], text: "Spiny metal-eaters from the asteroid belts that get into hulls and chew through cabling. Annoying alone; dangerous in a swarm.", category: "Creatures" }),
  threat({ name: "Void Lamprey", kind: "Creature", scores: [11, 8, 10, 2, 8, 1], stamina: 26, armour: 3, skills: "Athletics 2, Stealth 1", actions: [attack("Rasping Maw", 2, "3d6", "melee; it holds on: 1d6 each turn until pulled off (Brawn, Hard)")], traits: [["Vacuum-born", "It lives in vacuum and lurks on hulls, drawn to warmth and light."]], text: "Three metres of muscle and teeth that drift between asteroids and latch on to anything warm.", category: "Creatures" }),
  threat({ name: "Hollow-Eyed Survivor", kind: "Human", scores: [6, 6, 5, 8, 8, 6], stamina: 17, skills: "Engineering 1, Electronics 1", actions: [attack("Wrench", -1, "1d6", "melee")], text: "Someone who has been alone on a dead ship too long. Scared, starving, and armed with whatever was to hand.", category: "Salvage Rights" }),
];

export const DOSSIER = {
  name: "Apeira Astra Threat Dossier",
  displayName: "Apeira Astra Threat Dossier",
  category: "Apeira Astra",
  ruleset: RULESET,
  author: "Kraken VTT",
  gm: { npc: THREATS },
  reference: [
    {
      name: "The Dossier",
      sections: [
        {
          name: "Threats",
          pages: THREATS.map((record) => ({
            name: record.name,
            text: md(`*${record.type}.* ${String(record.text.__rich).replace(/<[^>]+>/g, "")}\n\n**Stamina** ${record.hp}. **Armour** ${record.armour}. **Skills** ${record.skills}.\n\n${Object.values(record.actions).map((action) => `**${action.name}.** ${action.desc}`).join("\n\n")}`),
          })),
        },
      ],
    },
  ],
};
