// What Kraken's Forged in the Dark books are made of. The rules text is the
// Blades in the Dark SRD's (CC BY 3.0): its special abilities, crew special
// abilities, crew upgrades and claims are read from it word for word. The SRD
// is a framework: it has no setting, and no named playbooks or crews, only
// how to make them and examples. So the seven playbooks and six crew types
// below are Kraken's own (their names, descriptions, starting dots, xp
// triggers, friends, contacts and items), each made of the SRD's example
// abilities in the order the SRD gives them; the heritages and backgrounds
// belong to Kraken's own city of Brackwater. Nothing here comes from the
// Blades in the Dark book itself.
import { between, boldEntries, chapterText, entries, plain } from "./markdown.mjs";

export const ATTRIBUTION =
  "This work is based on Blades in the Dark (found at http://www.bladesinthedark.com/), product of One Seven Design, developed and authored by John Harper, and licensed for our use under the Creative Commons Attribution 3.0 Unported license (http://creativecommons.org/licenses/by/3.0/).";

// --- The SRD's own lists, word for word ---------------------------------------------
const playbookPart = between(chapterText("Character playbook"), "Special abilities", "Character items");
// "Choose seven special abilities for you playbook. Here are several examples." comes before the first.
export const SPECIAL_ABILITIES = entries(playbookPart).filter((entry) => entry.text);
const crewPart = chapterText("Crew playbook");
export const CREW_ABILITIES = entries(between(crewPart, "Crew special abilities")).filter((entry) => entry.text);
export const CREW_SPECIFIC_UPGRADES = boldEntries(between(crewPart, "Crew upgrades", "Make a Claim Map for the Crew"));
export const CLAIMS = boldEntries(between(crewPart, "Make a Claim Map for the Crew", "Crew special abilities"));
export const GENERAL_UPGRADES = boldEntries(between(chapterText("Crew creation"), "Crew upgrade Examples", "Cohorts"));
const ability = (name) => {
  const found = SPECIAL_ABILITIES.find((entry) => entry.name.toLowerCase() === name.toLowerCase());
  if (!found) throw new Error(`The SRD has no special ability ${name}.`);
  return { name: found.name, text: found.text, ...(found.note ? { note: found.note } : {}) };
};
const crewAbility = (name) => {
  const found = CREW_ABILITIES.find((entry) => entry.name.toLowerCase() === name.toLowerCase());
  if (!found) throw new Error(`The SRD has no crew special ability ${name}.`);
  return { name: found.name, text: found.text, ...(found.note ? { note: found.note } : {}) };
};
const claim = (name) => {
  const found = CLAIMS.find((entry) => entry.name.toLowerCase() === name.toLowerCase());
  if (!found) throw new Error(`The SRD has no claim ${name}.`);
  return { name: found.name, text: found.text, ...(found.name === "Turf" ? { turf: 1 } : {}) };
};
const specificUpgrade = (name) => {
  const found = CREW_SPECIFIC_UPGRADES.find((entry) => entry.name.toLowerCase().startsWith(name.toLowerCase()));
  if (!found) throw new Error(`The SRD has no crew upgrade ${name}.`);
  return { name: found.name.replace(/\s*\(specify type\)/i, ""), text: found.text, boxes: /three upgrades/i.test(found.text) ? 3 : 1 };
};

// The general upgrades every crew may take: the SRD's examples, the Training
// and Quality upgrades by their kinds, a cohort, and Mastery.
export const UPGRADES = [
  ...GENERAL_UPGRADES.filter((entry) => !/^(training|quality|cohort|mastery)$/i.test(entry.name)).map((entry) => ({ name: entry.name.replace(/\*+$/, ""), text: entry.text, boxes: /second upgrade/i.test(entry.text) ? 2 : 1 })),
  ...["Insight", "Prowess", "Resolve", "Playbook"].map((kind) => ({ name: `${kind} Training`, text: `${kind === "Playbook" ? "Playbook" : kind} xp: you mark 2 xp (instead of 1) when you train it during downtime.`, boxes: 1 })),
  ...["Documents", "Gear", "Implements", "Supplies", "Tools", "Weapons"].map((kind) => ({ name: `Quality: ${kind}`, text: `Improves the quality rating of all the PCs' ${kind.toLowerCase()} by one, beyond the quality established by the crew's Tier and fine items.`, boxes: 1 })),
  { name: "Cohort", text: plain(GENERAL_UPGRADES.find((entry) => entry.name === "Cohort")?.text ?? "A gang or a single expert NPC who works for your crew."), boxes: 2 },
  { name: "Mastery", text: plain(GENERAL_UPGRADES.find((entry) => entry.name === "Mastery")?.text ?? ""), boxes: 4 },
];

// --- Kraken's own: the heritages and backgrounds of Brackwater -------------------------
export const CITY = "Brackwater";
export const HERITAGES = [
  { name: "Canal-born", text: "Your family has lived on Brackwater's canals for generations: barge folk, lock-keepers, net-menders." },
  { name: "Marshland", text: "From the reed villages of the salt marshes beyond the sea wall, where the old ways are still kept." },
  { name: "Highlands", text: "Hill and mine country to the north: hard winters, hard people, long memories." },
  { name: "Far Isles", text: "The scattered islands across the grey sea, whose ships still bring spice, silk and refugees." },
  { name: "Eastern Provinces", text: "The heart of the old empire, far inland: an accent the city's nobles both envy and mock." },
  { name: "Mixed", text: "A family from more than one place, at home in none of them. Write the two lands." },
];
export const BACKGROUNDS = [
  { name: "Scholar", text: "A student, tutor, archivist or apprentice of some learned house." },
  { name: "Labor", text: "Docker, factory hand, barge-puller, servant, miner: work that breaks the body." },
  { name: "Law", text: "Watch constable, bailiff, clerk of the courts, informant, prison guard." },
  { name: "Trade", text: "Shopkeeper, merchant's runner, artisan, peddler, moneylender." },
  { name: "Military", text: "Soldier, marine, quartermaster, deserter or veteran of some war abroad." },
  { name: "Gentry", text: "Minor nobility or old money fallen on hard times, or the servant who knew their secrets." },
  { name: "Underworld", text: "Born to it: pickpocket, lookout, runner for a gang, a fence's errand child." },
];

// The standard items every scoundrel has access to (load in brackets: 0 counts nothing).
export const ITEMS = [
  { name: "A blade or two", load: 1, text: "A knife, a short sword, a cutlass: whatever fits your style." },
  { name: "Throwing knives", load: 1, text: "A bandolier or a wrist sheath of small, balanced blades." },
  { name: "A pistol", load: 1, text: "A single-shot flintlock: loud, slow to reload, deadly up close." },
  { name: "A second pistol", load: 1, text: "Because the first one is already empty." },
  { name: "A large weapon", load: 2, text: "A musket, a hammer, a two-handed sword, a boarding axe." },
  { name: "An unusual weapon", load: 1, text: "A garrote, a whip, a hook-chain, a sword-cane." },
  { name: "Armor", load: 2, armor: "armor", text: "A thick coat, a leather jerkin, a mail shirt under the cloak. Mark its box to reduce or avoid a consequence." },
  { name: "Heavy armor", load: 2, armor: "heavy", text: "Plates and padding over Armor: a second box. You look like you mean trouble." },
  { name: "Burglary gear", load: 1, text: "Lock picks, a small pry bar, a dark lantern, a glass cutter." },
  { name: "Climbing gear", load: 2, text: "Rope, a grapnel, pitons, a harness." },
  { name: "Arcane implements", load: 1, text: "Chalk, salt, bells, a bone charm, a vial of something that glows." },
  { name: "Documents", load: 1, text: "Forged papers, a map, a letter of introduction, a ledger page." },
  { name: "Subterfuge supplies", load: 1, text: "A disguise, face paint, a uniform, a forged seal." },
  { name: "Demolition tools", load: 2, text: "A sledge, a crowbar, a keg of black powder, fuses." },
  { name: "Tinkering tools", load: 1, text: "A roll of fine tools, wire, oil, springs, a jeweler's loupe." },
  { name: "Lantern", load: 1, text: "A hooded lantern and oil for a long night." },
];

// --- Kraken's seven playbooks ----------------------------------------------------------------
const friends = (list) => list.map(([name, text]) => ({ name, text }));
const items = (list) => list.map(([name, load, text]) => ({ name, load, ...(load === 0 ? { free: 1 } : {}), text }));
export const PLAYBOOKS = [
  {
    name: "Enforcer",
    short: "Muscle for hire",
    description: "You settle things up close: with a blade, a fist, or the quiet promise of both. When the job turns ugly, the crew looks to you to hold the door, break the line, and make sure the other side remembers who won.",
    xptrigger: "You addressed a challenge with violence or intimidation.",
    actions: { skirmish: 2, command: 1 },
    abilities: ["Battleborn", "Bodyguard", "Arcane fighter", "Leader", "Mule", "Not to be trifled with", "Savage", "Vigorous"],
    friends: friends([["Garrick Holt", "a pit-fighter who still owes you a rematch"], ["Ysolde Marr", "a debt collector for the counting-houses"], ["Old Pell", "the bouncer at the Drowned Bell"], ["Sergeant Danna Vey", "a Harbor Watch officer who looks the other way, for now"], ["Tamsin Rook", "a bare-knuckle trainer by the tanneries"]]),
    items: items([["Fine brawling gloves", 1, "Weighted knuckles, soft leather: fine quality."], ["A heavy cudgel", 1, "Iron-shod oak, good for doors and knees."], ["Scale-plate vest", 2, "Fine armor that fits under a coat."], ["A dented war horn", 1, "Loud enough to be heard across the docks."], ["Smelling salts", 0, "For you, or for whoever you just knocked down."]]),
  },
  {
    name: "Tracker",
    short: "A hunter and a marksman",
    description: "You find people who do not want to be found, and when you find them you rarely miss. Patient, watchful, deadly at a distance: the crew's eyes on the rooftops and its answer to anyone who runs.",
    xptrigger: "You addressed a challenge with tracking or precise violence.",
    actions: { hunt: 2, survey: 1 },
    abilities: ["Sharpshooter", "Focused", "Scout", "Tough as nails", "Vengeful"],
    friends: friends([["Corin Vask", "a bounty hunter with a wall of wanted posters"], ["Mother Hesk", "who rents rooms with a view of every bridge"], ["Lieutenant Aubrin Shale", "a Watch marksman"], ["Fen", "a mudlark child who sees everything on the tideflats"], ["Iselle Danth", "a gunsmith in the Copperworks"]]),
    items: items([["Fine long rifle", 2, "Rifled barrel, a sight of ground glass: fine quality."], ["A spyglass", 1, "Brass, scratched, true."], ["A trained hound", 1, "Answers to whistles; tracks by scent."], ["Hunting cloak", 1, "Oiled canvas the color of wet stone."], ["Snares and wire", 1, "For the ones who run."]]),
  },
  {
    name: "Tinker",
    short: "An alchemist and a saboteur",
    description: "Locks, powders, springs and acids: you understand how things are put together, so you know exactly how they come apart. You make what the crew needs, and you break what stands in its way, quietly or otherwise.",
    xptrigger: "You addressed a challenge with technical skill or mayhem.",
    actions: { tinker: 2, wreck: 1 },
    abilities: ["Alchemist", "Analyst", "Artificer", "Fortitude", "Supernatural ward", "Saboteur"],
    friends: friends([["Doctor Imre Kolb", "a physicker who asks no questions"], ["Wenna Tallis", "a lamp-oil chemist at the Tallow Guild"], ["Brother Osk", "a scholar of the old engines"], ["Hollin Drey", "a powder-merchant on the wharves"], ["Magister Ruel", "a rival inventor who stole your first design"]]),
    items: items([["Fine tinkering tools", 1, "A roll of tools no one else could afford: fine quality."], ["Bandolier of vials", 1, "Acids, smokes, a stinking oil (three uses)."], ["A clockwork gadget", 1, "Whatever you last made: describe it."], ["Gas mask", 1, "Glass eyes, leather snout, charcoal filters."], ["Blast charges", 2, "Black powder in waxed paper, with fuses."]]),
  },
  {
    name: "Burglar",
    short: "An infiltrator and a thief",
    description: "Walls, windows, guards and locks are only suggestions. You go where you are not wanted, take what is not yours, and leave before anyone knows you were there.",
    xptrigger: "You addressed a challenge with stealth or evasion.",
    actions: { prowl: 2, finesse: 1 },
    abilities: ["Infiltrator", "Ambush", "Daredevil", "The devil's footsteps", "Expertise", "Reflexes", "Shadow"],
    friends: friends([["Silke Ambry", "a fence who pays fair and forgets faces"], ["Toller", "a rooftop runner who taught you the high roads"], ["Lady Anwen Corse", "a noble with a taste for stolen jewels"], ["Captain Ires Dole", "a Watch captain who has sworn to catch you"], ["Mags Penner", "a locksmith who sells copies of her keys"]]),
    items: items([["Fine lockpicks", 1, "Thin as hairs and twice as strong: fine quality."], ["Silent soft boots", 0, "You make no sound on stone."], ["A grappling bow", 2, "Fires a hook and line across a canal."], ["Dark hooded coat", 1, "Many pockets, no shine."], ["A fine short blade", 1, "Balanced, quiet, easy to hide."]]),
  },
  {
    name: "Grifter",
    short: "A charmer and a liar",
    description: "A smile, a story, a name that is never yours. You talk your way past doors that would stop an army, and you can sell a man his own coat. The crew's face, its voice, and its best lie.",
    xptrigger: "You addressed a challenge with deception or influence.",
    actions: { sway: 2, consort: 1 },
    abilities: ["Rook's gambit", "Like looking into a mirror", "A little something on the side", "Mesmerism", "Subterfuge", "Trust in me"],
    friends: friends([["Madame Orla Fenn", "who keeps the most fashionable salon in the Upper Ward"], ["Jory Kett", "a forger of seals and signatures"], ["Councilor Abelard Thrane", "who thinks you are his late cousin's heir"], ["Pim", "a street preacher who draws a crowd"], ["Viveka Sorn", "a con artist you once betrayed"]]),
    items: items([["Fine clothes and jewelry", 1, "You look like you belong anywhere: fine quality."], ["A fine disguise kit", 1, "Wigs, paints, spectacles, accents."], ["A forged signet ring", 0, "Of a family that will not ask."], ["Trick dice and cards", 0, "For a quick game you always win."], ["A hidden pistol", 1, "Small, ivory-handled, one shot."]]),
  },
  {
    name: "Schemer",
    short: "A mastermind and a broker",
    description: "You know who owes whom, who is sleeping with whom, and what each of them would pay to keep it quiet. You plan the job, find the client, and see the trap coming three moves ahead.",
    xptrigger: "You addressed a challenge with calculation or conspiracy.",
    actions: { consort: 2, study: 1 },
    abilities: ["Foresight", "Calculating", "Connected", "Mastermind", "Weaving the web"],
    friends: friends([["Mother Corvane", "a fence and broker of the Widow's Hand"], ["Edwyn Lark", "a clerk at the city records office"], ["Sister Malva", "who hears confessions and sells some of them"], ["Hargreave", "a moneylender with very long arms"], ["Delphine Ost", "a rival broker who wants your network"]]),
    items: items([["Fine cover identity", 1, "Papers, a name, a past: fine quality."], ["A cipher book", 1, "Your own code, and a few of other people's."], ["A ledger of favors", 0, "Who owes you, and how much."], ["Spyglass and signal mirror", 1, "For watching, and for being seen."], ["A fine walking cane", 1, "Silver-topped; it hides a blade."]]),
  },
  {
    name: "Occultist",
    short: "A channeler of strange powers",
    description: "The world is thin in places, and you know where. Spirits talk to you, wards bend for you, and rituals other people fear are only careful work. The crew's answer to what cannot be stabbed or bribed.",
    xptrigger: "You addressed a challenge with knowledge or arcane power.",
    actions: { attune: 2, study: 1 },
    abilities: ["Arcane mind", "Iron will", "Ritual", "Strange methods", "Warded"],
    friends: friends([["Nana Ilse", "a marsh witch who taught you your first words of binding"], ["Father Tobin Crale", "a priest who knows what is in the crypts"], ["Vesna", "an apothecary who sells grave-salt"], ["Professor Hadrian Volk", "a collector of forbidden books"], ["The Pale Lady", "a spirit who visits you in mirrors"]]),
    items: items([["Fine arcane implements", 1, "Silver bells, a bone wand, inks that drink the light: fine quality."], ["A spirit mirror", 1, "A hand mirror that shows what is not there."], ["Warding salt", 0, "A pouch, enough for one door."], ["An old grimoire", 1, "Half of it is in no language you know."], ["Smoke and candles", 1, "For a ritual, or for a seance."]]),
  },
].map((playbook) => ({ ...playbook, abilities: playbook.abilities.map(ability) }));

// --- Kraken's six crew types ---------------------------------------------------------------
const contacts = (list) => list.map(([name, text]) => ({ name, text }));
const TURF = ["Turf", "Turf", "Turf", "Turf"];
export const CREWS = [
  {
    name: "Assassins",
    // The SRD's own example of a crew's short description.
    description: "You're professional murderers—death is your business. Clients come to you when someone must stop breathing, quietly or as a message.",
    xptrigger: "Execute a successful accident, disappearance, murder, or ransom operation.",
    startingUpgrades: ["Insight Training", "Quarters"],
    operations: ["Accident", "Disappearance", "Murder", "Ransom"],
    contacts: contacts([["Arden Vos", "a mortician who keeps good records"], ["Kessa Thorn", "a courtier who whispers names"], ["Old Grist", "a poisoner retired to his garden"], ["Captain Halloway", "a smuggler who moves bodies"], ["Ilka Mor", "a magistrate's secretary"]]),
    abilities: ["Deadly", "Death veil", "No traces", "Patron", "Predators"],
    upgrades: ["Rigging", "Elite Cohorts", "Hardened", "Composed", "Underground Maps and Passkeys"],
    claims: [...TURF, "Informants", "City Records", "Cover Identities", "Cover Operation", "Victim Trophies", "Secret Pathways", "Interrogation Chamber", "Infirmary", "Envoy", "Fixer"],
  },
  {
    name: "Bravos",
    description: "Mercenaries, thugs and killers: you take what you want by force and rent your fists to whoever pays. The streets fear your colors.",
    xptrigger: "Execute a successful battle, extortion, sabotage, or show of force operation.",
    // The SRD names these two for the Bravos crew.
    startingUpgrades: ["Prowess Training", "Cohort"],
    startingCohort: { kind: "gang", type: "Thugs" },
    operations: ["Battle", "Extortion", "Sabotage", "Show of force"],
    contacts: contacts([["Brannoc", "a retired champion of the fighting pits"], ["Sel Varga", "a weapons dealer in the Copperworks"], ["Lady Imogen Drake", "a noble who hires muscle"], ["Gully", "a tavern keeper who hears every rumor"], ["Doctor Ansel Pike", "a physicker for the wounded"]]),
    abilities: ["Fiends", "Forged in the fire", "War dogs", "Deadly"],
    upgrades: ["Elite Cohorts", "Hardened", "Composed", "Rigging", "Prison Contacts"],
    claims: [...TURF, "Fighting Pits", "Terrorized Citizens", "Protection Racket", "Warehouses", "Training Rooms", "Lookouts", "Local Graft", "Infirmary", "Tavern", "Street Fence"],
  },
  {
    name: "Cult",
    description: "Acolytes of a forgotten power, you do its work in the shadows of the city. The faithful are few, but your god is patient, and its gifts are strange.",
    xptrigger: "Execute a successful acquisition, consecration, or sacrifice operation, or advance the agenda of your power.",
    startingUpgrades: ["Resolve Training", "Workshop"],
    operations: ["Acquisition", "Consecration", "Sacrifice"],
    contacts: contacts([["Mother Ashe", "a keeper of a hidden shrine"], ["Doran Fisk", "an antiquities dealer"], ["Lysa Moor", "a grave digger"], ["Professor Quill", "a lecturer on dead languages"], ["Brother Eamon", "a priest of the city's church, and a doubter"]]),
    abilities: ["Anointed", "Death veil", "Synchronized", "Patron"],
    upgrades: ["Elite Cohorts", "Composed", "Hardened", "Underground Maps and Passkeys", "Rigging"],
    claims: [...TURF, "Ancient Altar", "Ancient Tower", "Offertory", "Informants", "Secret Pathways", "Cover Operation", "Infirmary", "Vice Den", "Luxury Venue", "Warehouses"],
  },
  {
    name: "Hawkers",
    description: "You sell what the city craves and the law forbids: drink, dreams, smoke, and secrets. Supply, demand, and the muscle to keep both flowing.",
    xptrigger: "Acquire product supply, execute a clandestine sale, or secure new territory.",
    startingUpgrades: ["Resolve Training", "Secure Lair"],
    operations: ["Sale", "Supply", "Show of force", "Socialize"],
    contacts: contacts([["Rusk", "a dealer who works the night markets"], ["Lady Celia Vane", "a socialite who throws the best parties"], ["Tobias Mint", "a chemist who cooks your product"], ["Inspector Fawn", "a Watch inspector on your payroll"], ["Nell Gorse", "who runs the river barges"]]),
    abilities: ["Accord", "High society", "Pack rats", "Just passing through"],
    upgrades: ["Elite Cohorts", "Composed", "Camouflage", "Underground Maps and Passkeys", "Hardened"],
    claims: [...TURF, "Vice Den", "Luxury Venue", "Surplus Cache", "Tavern", "Informants", "Lookouts", "Local Graft", "Cover Operation", "Side Business", "Warehouses"],
  },
  {
    name: "Shadows",
    description: "Thieves, spies and saboteurs: you go where you should not, take what is guarded, and learn what is hidden. No one sees you coming, and if you are good, no one ever knows.",
    xptrigger: "Execute a successful espionage, sabotage, or theft operation.",
    startingUpgrades: ["Hidden Lair", "Prowess Training"],
    operations: ["Burglary", "Espionage", "Robbery", "Sabotage"],
    contacts: contacts([["Dowling", "a fence with a pawnshop by the Iron Bridge"], ["Verity Lane", "a maid in three noble houses"], ["Sparrow", "a rooftop courier"], ["Sergeant Brask", "a Watch officer who sells patrol routes"], ["Elsabet Grey", "a cartographer of the old sewers"]]),
    abilities: ["Pack rats", "Second story", "Synchronized", "No traces"],
    upgrades: ["Underground Maps and Passkeys", "Rigging", "Elite Cohorts", "Composed", "Camouflage"],
    claims: [...TURF, "Loyal Fence", "Secret Pathways", "Covert Drop", "City Records", "Informants", "Lookouts", "Street Fence", "Warehouses", "Cover Identities", "Interrogation Chamber"],
  },
  {
    name: "Smugglers",
    description: "Contraband, passengers, secrets and weapons: whatever needs to go where the law says it cannot, you carry it, by canal, by cart, or by the old tunnels.",
    // The SRD quotes this crew's trigger.
    xptrigger: "Execute a smuggling operation or acquire new clients or contraband sources.",
    startingUpgrades: ["Boat house", "Carriage House"],
    operations: ["Smuggling arms", "Smuggling contraband", "Smuggling passengers"],
    contacts: contacts([["Captain Rhea Salt", "a barge captain who knows every lock"], ["Ulf", "a customs inspector with expensive habits"], ["Madame Pell", "a merchant who needs things moved"], ["Jessamy", "a tunnel rat who maps the undercity"], ["Oskar Brine", "a dock boss on the wharves"]]),
    abilities: ["All hands", "Just passing through", "High society", "Pack rats"],
    upgrades: ["Camouflage", "Underground Maps and Passkeys", "Rigging", "Composed", "Elite Cohorts"],
    claims: [...TURF, "Secret Pathways", "Warehouses", "Surplus Cache", "Covert Drop", "Fixer", "Envoy", "Side Business", "Lookouts", "Tavern", "Cover Operation"],
  },
].map((crew) => ({ ...crew, abilities: crew.abilities.map(crewAbility), upgrades: crew.upgrades.map(specificUpgrade), claims: crew.claims.map(claim) }));
