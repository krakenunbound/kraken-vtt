// The Brine Street Job: a short starter score for Kraken's Forged in the Dark,
// written for Kraken (its story, people, factions and map are Kraken's own;
// the rules it points to are the Blades in the Dark SRD's, CC BY 3.0). A
// fence hires the crew to lift a guild's ledger from a canal-side
// counting-house before dawn: story entries, the factions of Brackwater it
// touches, its people, three progress clocks the GM puts on the table, a
// battle map drawn with mapgen.py (walls and doors), and its payoffs.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ids, imageRecord, md } from "../lib/fg.mjs";
import { CITY } from "./content.mjs";
import { noticePage, RULESET } from "./scoundrels-handbook.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const NAME = "The Brine Street Job";
const entry = (name, text) => ({ name, text: md(text), __category: NAME });

// The factions this score touches (Kraken's own), for the crew sheet's faction status.
export const FACTIONS = [
  { name: "The Harbor Watch", tier: 3, hold: "strong", text: `${CITY}'s law on the docks and canals, for sale by the hour. Its night captains answer to whoever paid last.`, goal: "Clean Up Brine Street (8): a show of order before the new magistrate arrives." },
  { name: "The Tallow Guild", tier: 2, hold: "strong", text: "The lamp-oil and candle merchants who light the city. Rich, proud, and quietly cheating the city's lamp tax.", goal: "Corner the Lamp-oil Trade (8)." },
  { name: "The Widow's Hand", tier: 2, hold: "weak", text: "An old smuggling family turned brokers of secrets, led by Mother Corvane. They pay well and remember everything.", goal: "Leverage over the Guild (6)." },
  { name: "The Grey Lanterns", tier: 1, hold: "weak", text: "A young, hungry street gang that wants the Brine Street docks, and anyone's coin.", goal: "Take the Brine Street Docks (6)." },
];
// The clocks the GM puts on the table for this score (Clocks window > From the books).
export const CLOCKS = [
  { name: "Counting-house Alert", segments: 6, kind: "danger", text: "The guards' suspicion. Tick it for complications; when it fills, the alarm bell rings and the Watch comes running." },
  { name: "The Vault Door", segments: 4, kind: "progress", text: "The Guild's iron vault door: a lock of Tier II quality. Tinker, Wreck, or find the key." },
  { name: "First Light", segments: 8, kind: "mission", text: "The night is short. Tick it as time passes (a long action, a flashback that takes the crew away); at dawn the clerks arrive and the job is scrubbed." },
  { name: "The Grey Lanterns Strike", segments: 6, kind: "racing", text: "A racing clock against First Light, if the GM brings in the rival gang: when it fills, the Lanterns burst in the dock door." },
];

const STORY = [
  entry("00 About This Score", `*A short starter score of Kraken's own for Forged in the Dark, for a new crew of three to five scoundrels at Tier 0.* It plays in one session: free play to take the job, a plan and the engagement roll, the score itself, and the first downtime.\n\nIt uses the GM's Score panel (position, effect, the engagement roll) and the Clocks window (its clocks: Counting-house Alert, The Vault Door, First Light, and The Grey Lanterns Strike if the rival gang comes). Its map, Brine Street Counting-house, has its walls and doors.`),
  entry("01 The Job", `Mother Corvane of the Widow's Hand meets the crew in the back room of the Drowned Bell, a smoky canal tavern. She is old, round, and very polite.\n\n*"The Tallow Guild keeps two ledgers. One for the city's tax-men, and one for themselves. I want the second one. It sits in the vault of their counting-house on Brine Street, and tomorrow at dawn their auditors carry it away to the Upper Ward, where no one like us will ever reach it."*\n\nShe offers **6 coin** for the ledger, delivered to her before dawn, and **+1 status** with the Widow's Hand. She knows the counting-house has a night guard of four or five men under **Captain Merrow Haske**, a canal dock at the back, and an iron vault.\n\n**Questions to ask the players:** Who among you has crossed the Tallow Guild before? Which of you knows someone who works the Brine Street docks? Why do you trust Mother Corvane, or why don't you?`),
  entry("02 Brine Street Counting-house", `A two-story brick counting-house on the canal (the map: Brine Street Counting-house). At night the lamps on the dock burn low.\n\n- **The dock:** cobbles, barrels, a mooring for a barge. A single door into the loading hall. One guard walks the dock every quarter hour.\n- **The loading hall:** crates of lamp-oil and candles, barrels, a lantern on a hook. Two guards dice here.\n- **The guard room:** bunks, a brazier, the alarm bell's rope. Captain Haske sleeps here, badly.\n- **The clerks' office:** desks, ink, the day ledgers (the false ones). A secret door behind a bookcase leads to the counting room.\n- **The counting room:** the master's desk, the stairs up to the Guild's apartments, and a strongbox (4 coin).\n- **The vault:** behind an iron door off the corridor (a Tier II lock). Inside: the true ledger, bound in green leather, among crates of fine wax.`),
  entry("03 Planning and Engagement", `Let the players choose a **plan** and its **detail**: a stealth plan (the point of infiltration: the canal dock at the tide's turn?), a deception plan (the method: as the Guild's auditors, a day early?), a social plan (the connection: bribing Captain Haske?), an assault (the point of attack). The Score panel keeps the plan, the detail and the target (the Tallow Guild, Tier II).\n\n**Engagement roll:** 1d, plus a die for each major advantage (a bold plan; a detail that hits the counting-house where it is weak, like the secret door; help from a friend or contact who works the docks), minus a die for each disadvantage (a complex plan; the Grey Lanterns on the same job; a target two Tiers above the crew).\n\n**Clocks:** put **Counting-house Alert** (6) and **First Light** (8) on the table as the score begins; **The Vault Door** (4) when the crew reaches it. Cut to the action at the first obstacle.`),
  entry("04 Complications", `- **The night guards** (a small gang, quality 2): when the alert clock fills, the bell rings, the guards gather, and the Harbor Watch sends a patrol (a medium gang) within minutes.\n- **Captain Merrow Haske** sleeps badly and wakes easily. He can be bought (2 coin) if someone reaches him before the alarm, and he hates the Guild's master.\n- **The Grey Lanterns** have heard of the ledger too. If the engagement roll is a 1-3, or a consequence calls for it, start **The Grey Lanterns Strike** (6) racing against First Light: when it fills, three of them break in the dock door, wanting the ledger for themselves.\n- **The true ledger** is heavy (load 2), and its last pages name a Harbor Watch magistrate who takes the Guild's money. Who else would pay for that page?`),
  entry("05 Payoff and Downtime", `**Payoff:** 6 coin from Mother Corvane (the strongbox adds 4). A score against a Tier II target earns a Tier 0 crew **4 rep** (2, +2 for a target two Tiers above); a score kept completely quiet earns none.\n\n**Heat:** 0 if smooth and quiet, 2 if contained, 4 if loud, 6 if wild; +1 for a well-connected target (the Guild is); +2 if anyone was killed.\n\n**Faction status:** the Tallow Guild -2 if they learn who did it (-1 if they only suspect); the Widow's Hand +1 (+2 if the crew also brings the magistrate's page); the Grey Lanterns -1 if the crew beat them to it.\n\n**Entanglements** follow as usual. A fine follow-up: Mother Corvane asks for a second job, against the magistrate named in the ledger.`),
];
STORY.push({ name: "06 Credits and License", text: noticePage(NAME).text, __category: NAME });

const npc = (name, faction, quality, text) => ({ name, faction, quality, type: "NPC", text, description: md(`**${faction}.** ${text}\n\n*Quality ${quality}.* Kraken's own character for The Brine Street Job.`), __category: NAME });
const NPCS = [
  npc("Mother Corvane", "The Widow's Hand", 2, "A round, polite old fence and broker of secrets, who never raises her voice and never forgets a debt. The crew's client."),
  npc("Captain Merrow Haske", "The Harbor Watch (hired by the Tallow Guild)", 2, "The counting-house's night captain: tired, bitter, underpaid, and fond of the bottle. Can be bribed (2 coin) before the alarm; after it, he fights."),
  npc("Master Aldous Fenwick", "The Tallow Guild", 2, "The Guild's ledger-master, who sleeps upstairs over the counting room. Vain, frightened, and the only one with the vault key (on a chain at his neck)."),
  { ...npc("Night Guards", "The Tallow Guild", 2, "Four or five hired guards with cudgels, pistols and a bell. A small gang: quality 2, scale 1."), kind: "gang", scale: 1 },
  { ...npc("Grey Lanterns Toughs", "The Grey Lanterns", 1, "Three young toughs with knives and lanterns, led by a girl called Wick. A small gang: quality 1, scale 1."), kind: "gang", scale: 1 },
];
const table = (name, group, rows) => ({ name, group, rows: ids(rows), __category: "Tables" });
const walls = JSON.parse(fs.readFileSync(path.join(here, "maps", "counting-house.walls.json"), "utf8"));
const parcel = (name, coin) => ({ name, coinlist: ids([{ description: "Coin", amount: coin }]), itemlist: ids([]), __category: "Payoff" });

export const BRINE_STREET = {
  name: NAME,
  displayName: "The Brine Street Job (Forged in the Dark)",
  category: "Forged in the Dark Adventures",
  ruleset: RULESET,
  author: "Kraken VTT",
  gm: {
    encounter: STORY,
    npc: NPCS,
    forgedtable: [table("Factions of Brine Street", "factions", FACTIONS), table("The Brine Street Job: Clocks", "clocks", CLOCKS)],
    treasureparcels: [parcel("Mother Corvane's Payment", 6), parcel("The Strongbox in the Counting Room", 4)],
    image: [imageRecord({ name: "Brine Street Counting-house", file: "images/brine-street-counting-house.webp", width: walls.width, height: walls.height, grid: walls.grid, walls: walls.walls, category: "Maps" })],
  },
  pictures: { "images/brine-street-counting-house.webp": path.join(here, "art", "brine-street-counting-house.webp") },
};
export const SCORE_COUNTS = () => ({ story: STORY.length, npcs: NPCS.length, factions: FACTIONS.length, clocks: CLOCKS.length });
