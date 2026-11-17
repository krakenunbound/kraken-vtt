import { diceStore } from "../dice/diceStore";
import { sound } from "../sound/soundEngine";
import type { RollMode, Session } from "../session/useSession";
import type { WindowKind } from "./Windows";
import { manifestOf } from "../rulesets";
import { resolveTest } from "../../shared/text/actionLinks.mjs";

// The chat's slash commands, as Fantasy Grounds' (so its players know them),
// with Foundry's names too where it has its own (/gmroll, /me...) and a few of
// Kraken's. gm: the GM's alone (they are not offered to players, and the host
// refuses them from players anyway).

export type CommandContext = {
  session: Session;
  openWindow: (kind: WindowKind, title: string) => void;
  closeWindow: (kind: WindowKind) => void;
  // The modifier box (the host's): a slot added, as FG's /mod.
  addModifier: (value: number, label: string) => void;
  tower: boolean;
  // Who the GM speaks as (/id, /gmid).
  speakAs: string;
  // The language the chat bar speaks in (FG's chat language menu), "" for none.
  lang?: string;
  setSpeakAs: (name: string) => void;
  setGmName: (name: string) => void;
  lastWhisperFrom: string | null;
  showHelp: () => void;
};

export type Command = { names: string[]; args: string; help: string; group: "Dice" | "Talk" | "GM" | "Screen"; gm?: boolean; run: (rest: string, context: CommandContext) => void };

const WINDOWS: Record<string, { kind: WindowKind; title: string }> = {
  characters: { kind: "characters", title: "Characters" },
  character: { kind: "characters", title: "Characters" },
  party: { kind: "party", title: "Party Sheet" },
  combat: { kind: "combat", title: "Combat Tracker" },
  tracker: { kind: "combat", title: "Combat Tracker" },
  ct: { kind: "combat", title: "Combat Tracker" },
  players: { kind: "players", title: "Players" },
  settings: { kind: "settings", title: "Settings" },
  options: { kind: "settings", title: "Settings" },
  dice: { kind: "dice", title: "Dice" },
  sound: { kind: "sound", title: "Sound" },
  sounds: { kind: "sound", title: "Sound" },
  decal: { kind: "decals", title: "Background Decal" },
  wallpaper: { kind: "wallpapers", title: "Desktop Wallpaper" },
  gmicon: { kind: "gmicons", title: "GM Icon" },
};

// "/roll 4d6d1 Strength", "/r 1d20 + 5 Climb" or "/r 2d6 + 3 #Damage": the
// dice (spaces allowed between their parts) and what the roll is for (after #,
// or the words after the dice).
const DICE_WORD = /^([+-]|[+-]?(\d*d(\d+|%|f)[a-z0-9<>=!]*|\d+)([+-](\d*d(\d+|%|f)[a-z0-9<>=!]*|\d+))*[+-]?)$/i;
export function splitRoll(rest: string): { formula: string; label: string } {
  const text = rest.trim();
  const hash = text.indexOf("#");
  if (hash >= 0) return { formula: text.slice(0, hash).replace(/\s+/g, ""), label: text.slice(hash + 1).trim() };
  const words = text.split(/\s+/).filter(Boolean);
  let at = 0;
  while (at < words.length && DICE_WORD.test(words[at])) at += 1;
  // A sign left hanging at the end belongs to the label ("-" alone is not dice).
  while (at > 0 && /^[+-]$/.test(words[at - 1])) at -= 1;
  return { formula: words.slice(0, at).join(""), label: words.slice(at).join(" ") };
}

function rollWith(mode: RollMode) {
  return (rest: string, context: CommandContext) => {
    const { formula, label: said } = splitRoll(rest);
    const label = said ? [said] : [];
    if (!formula) return context.session.note("Give the dice, like /roll 1d20+3 Strength. 4d6d1 drops the lowest, 4d6k3 keeps the highest three, 3d6! explodes.");
    // The host adds the modifier box (and its keys) to the roll.
    context.session.roll(formula, label.join(" "), "", mode === "public" && context.tower, mode, context.speakAs);
  };
}

// The names at the front of "/w Ann, Bob hello": players at the table, the
// characters someone holds (it reaches whoever holds it), or GM; the longest
// name that fits, so "Sir Aldric" works.
function splitNames(rest: string, session: Session): { names: string[]; text: string } {
  const known = [...session.players.map((seat) => seat.name), ...session.roster.filter((entry) => entry.owner).map((entry) => entry.name), "GM", "DM"].sort((a, b) => b.length - a.length);
  const names: string[] = [];
  let left = rest.trim();
  for (;;) {
    const found = known.find((name) => left.toLowerCase().startsWith(name.toLowerCase()) && /^[\s,]|^$/.test(left.slice(name.length)));
    const word = found ?? /^\S+/.exec(left)?.[0].replace(/,$/, "");
    if (!word) break;
    names.push(word);
    left = left.slice(word.length).trim();
    if (!left.startsWith(",")) break;
    left = left.slice(1).trim();
  }
  return { names, text: left };
}

const onOff = (value: string) => (/^(on|yes|true|1)$/i.test(value.trim()) ? true : /^(off|no|false|0)$/i.test(value.trim()) ? false : null);

function percent(rest: string, low: number, high: number) {
  const value = Number(rest.trim().replace(/%$/, ""));
  return Number.isFinite(value) && value >= low && value <= high ? value / 100 : null;
}

// A check, save or skill against a DC (/check dex 15): the player's own character rolls it through its
// sheet; the GM's asks every player for theirs (the party sheet's Ask the players card).
function testRoll(kind: "check" | "save" | "skill", rest: string, context: CommandContext) {
  const words = rest.trim().split(/\s+/).filter(Boolean);
  const dc = Number(words.find((word) => /^(dc)?\d+$/i.test(word))?.replace(/\D/g, "") ?? 0) || 0;
  const word = words.filter((item) => !/^(dc)?\d+$/i.test(item)).join(" ");
  const session = context.session;
  const found = resolveTest((manifestOf(session.ruleset).party?.groupCheck || undefined)?.rolls ?? [], kind, word);
  if (!found) return session.note(word ? `This game has no ${kind} called '${word}'.` : `As /${kind} dex 15`);
  const which = found.kind === "skill" ? { skill: found.value } : { attribute: found.value };
  if (session.role === "dm") return session.partyRoll({ kind: found.kind, ...which, dc, mode: "ask" });
  const me = session.players.find((seat) => seat.id === session.selfId)?.name ?? "";
  const mine = Object.values(session.records).filter((record) => record.type === "character" && me !== "" && record.owner === me);
  if (!mine.length) return session.note("You have no character to roll for.");
  const label = `${found.name} ${found.kind === "save" ? "save" : "check"}`;
  session.siegeCheck(mine[0].id, found.kind === "skill" ? "" : found.value, dc, false, { kind: found.kind, ...(found.kind === "skill" ? { skill: found.value } : {}), dc, label });
}

export const COMMANDS: Command[] = [
  // --- Dice ---------------------------------------------------------------
  { names: ["roll", "r", "die"], args: "[dice] <for>", help: "Roll for everyone: 1d20+3 (spaces allowed: 1d20 + 3; #label: /r 2d6 + 3 #Damage), 4d6d1 (drop lowest), 4d6k3 (keep highest 3), 2d20kh1, 3d6! (explode), 3d6xo (once), 4d6r1 (reroll 1s once), 4d6rr1 (until not 1), 4d6min2, 4d6max5, 6d10cs>=7 (successes), 6d10cf<3 (failures), 1d20ms>=15 (margin), 4dF, d%. The modifier box and its keys are added by the host", group: "Dice", run: rollWith("public") },
  { names: ["gmroll", "gr"], args: "[dice] <for>", help: "Roll so only the GM and you see it", group: "Dice", run: rollWith("gm") },
  { names: ["blindroll", "br", "tower"], args: "[dice] <for>", help: "Roll for the GM's eyes only (the dice tower): you see only that you rolled", group: "Dice", run: rollWith("blind") },
  { names: ["selfroll", "sr"], args: "[dice] <for>", help: "Roll so only you see it", group: "Dice", run: rollWith("self") },
  { names: ["publicroll", "pr"], args: "[dice] <for>", help: "Roll for everyone (as /roll)", group: "Dice", run: rollWith("public") },
  {
    names: ["random"],
    args: "[number] <for>",
    help: "A random number from 1 to that number",
    group: "Dice",
    run: (rest, context) => {
      const [top = "", ...label] = rest.trim().split(/\s+/);
      const n = Math.floor(Number(top));
      if (!(n >= 2 && n <= 1000)) return context.session.note("Give a number from 2 to 1000, like /random 6.");
      context.session.roll(`1d${n}`, label.join(" ") || "Random", "", false, "public", context.speakAs);
    },
  },
  {
    names: ["mod"],
    args: "[number] <for>",
    help: "Add a number to the modifier box for the next roll (FG's /mod): /mod 2 Flanking",
    group: "Dice",
    run: (rest, context) => {
      const [first = "", ...words] = rest.trim().split(/\s+/);
      const n = Math.round(Number(first));
      if (!first || !Number.isFinite(n)) return context.session.note("Give a number, like /mod 2 Flanking or /mod -1.");
      context.addModifier(n, words.join(" "));
    },
  },
  // --- Talk ----------------------------------------------------------------
  { names: ["emote", "em", "me"], args: "[what you do]", help: "Say what you do: /me draws her sword", group: "Talk", run: (rest, context) => context.session.sendChat(rest, { kind: "emote", as: context.speakAs }) },
  { names: ["action", "act"], args: "[action]", help: "An action, set apart from speech", group: "Talk", run: (rest, context) => context.session.sendChat(rest, { kind: "action", as: context.speakAs }) },
  { names: ["ooc"], args: "[message]", help: "Out of character", group: "Talk", run: (rest, context) => context.session.sendChat(rest, { kind: "ooc" }) },
  { names: ["ic", "say"], args: "[message]", help: "In character (as a plain message)", group: "Talk", run: (rest, context) => context.session.sendChat(rest, { as: context.speakAs, ...(context.lang ? { lang: context.lang } : {}) }) },
  {
    names: ["mood"],
    args: "[mood] [message]",
    help: "Say it with a mood: /mood angry Get out!  or  /mood (sad) Farewell",
    group: "Talk",
    run: (rest, context) => {
      const match = /^\(([^)]+)\)\s*(.*)$/.exec(rest.trim()) ?? /^(\S+)\s+(.*)$/.exec(rest.trim());
      if (!match || !match[2]) return context.session.note("As /mood angry Get out!");
      context.session.sendChat(match[2], { kind: "mood", mood: match[1], as: context.speakAs });
    },
  },
  {
    names: ["w", "whisper"],
    args: "[name, name] [message]",
    help: "Whisper to players (or GM); the GM sees every whisper, as in FG",
    group: "Talk",
    run: (rest, context) => {
      const { names, text } = splitNames(rest, context.session);
      if (names.length === 0 || !text) return context.session.note("As /w Ann Meet me by the well.  or  /w GM I search the chest.");
      context.session.sendChat(text, { to: names, as: context.speakAs });
    },
  },
  {
    // Foundry's /gm: a whisper to the GM.
    names: ["gm"],
    args: "[message]",
    help: "Whisper to the GM (as /w GM)",
    group: "Talk",
    run: (rest, context) => (rest.trim() ? context.session.sendChat(rest.trim(), { to: ["GM"], as: context.speakAs }) : context.session.note("As /gm I pick the lock quietly.")),
  },
  {
    names: ["reply"],
    args: "[message]",
    help: "Whisper back to whoever last whispered to you",
    group: "Talk",
    run: (rest, context) => {
      if (!context.lastWhisperFrom) return context.session.note("Nobody has whispered to you yet.");
      context.session.sendChat(rest, { to: [context.lastWhisperFrom], as: context.speakAs });
    },
  },
  {
    names: ["vote"],
    args: "[question]",
    help: "Ask the table yes or no; everyone answers in chat",
    group: "Talk",
    run: (rest, context) => (rest.trim() ? context.session.tableCommand({ type: "vote", question: rest.trim() }) : context.session.note("As /vote Do we rest here tonight?")),
  },
  {
    // FG's /rollon: a random table by its name, on the host's dice; -c a column, -d other dice, -hide the GM's eyes only.
    names: ["rollon"],
    args: "[table] <-c column> <-d dice> <-hide>",
    help: "Roll on a random table: /rollon Rumours -d 2d6 -hide",
    group: "Dice",
    run: (rest, context) => {
      let words = ` ${rest.trim()}`;
      const hide = / -hide\b/.test(words);
      words = words.replace(/ -hide\b/g, "");
      const dice = / -d(.+)$/.exec(words)?.[1]?.trim();
      words = words.replace(/ -d.+$/, "");
      const column = / -c(.+)$/.exec(words)?.[1]?.trim();
      words = words.replace(/ -c.+$/, "");
      const name = words.trim();
      if (!name) return context.session.note("As /rollon tablename -c [column name] [-d dice] [-hide]");
      void context.session.content("table-roll", { action: "roll", name, ...(column ? { column } : {}), ...(dice ? { dice } : {}), ...(hide ? { hide: true } : {}) }).catch((error: unknown) => context.session.note(error instanceof Error ? error.message : "Could not roll that."));
    },
  },
  // --- GM ------------------------------------------------------------------
  { names: ["story"], args: "[text]", help: "Story text for the table, without a name", group: "GM", gm: true, run: (rest, context) => context.session.sendChat(rest, { kind: "story" }) },
  {
    names: ["id"],
    args: "<name>",
    help: "Speak as someone (an NPC) until /id on its own",
    group: "GM",
    gm: true,
    run: (rest, context) => {
      context.setSpeakAs(rest.trim().slice(0, 24));
      context.session.note(rest.trim() ? `You speak as ${rest.trim()}. /id on its own to stop.` : "You speak as yourself again.");
    },
  },
  {
    names: ["gmid"],
    args: "<name>",
    help: "The name the GM is shown by (instead of DM)",
    group: "GM",
    gm: true,
    run: (rest, context) => {
      context.setGmName(rest.trim().slice(0, 24));
      context.session.note(rest.trim() ? `You are shown as ${rest.trim()}.` : "You are shown by your seat name again.");
    },
  },
  {
    names: ["kick"],
    args: "[player]",
    help: "Send a player away from the table",
    group: "GM",
    gm: true,
    run: (rest, context) => (rest.trim() ? context.session.tableCommand({ type: "kick", name: rest.trim() }) : context.session.note("As /kick Bob")),
  },
  // Action links' rolls (shared/text/actionLinks.mjs): a player rolls their character's, the GM asks the players.
  { names: ["check"], args: "[ability or skill] <DC>", help: "A check: /check dex 15 (the GM asks every player for theirs)", group: "Dice", run: (rest, context) => testRoll("check", rest, context) },
  { names: ["skill"], args: "[skill] <DC>", help: "A skill check: /skill perception 12", group: "Dice", run: (rest, context) => testRoll("skill", rest, context) },
  {
    names: ["save"],
    args: "<ability> <DC>",
    help: "A saving throw: /save wis 13 (the GM asks the players); alone, the GM saves the campaign",
    group: "Dice",
    run: (rest, context) => {
      if (rest.trim()) return testRoll("save", rest, context);
      if (context.session.role === "dm") return context.session.tableCommand({ type: "save" });
      context.session.note("As /save wis 13");
    },
  },
  {
    names: ["award"],
    args: "[xp]",
    help: "Award XP to the party: /award 50",
    group: "GM",
    gm: true,
    run: (rest, context) => {
      const xp = Math.round(Number(rest.replace(/xp/i, "").trim()));
      if (!Number.isFinite(xp) || xp <= 0) return context.session.note("As /award 50");
      context.session.partyAwardXP(xp);
    },
  },
  {
    names: ["pause"],
    args: "[on|off]",
    help: "Pause the game (the players see a veil; their moves and rolls wait), or go on",
    group: "GM",
    gm: true,
    run: (rest, context) => context.session.setPaused(onOff(rest.trim()) ?? !context.session.options.paused),
  },
  {
    names: ["afk"],
    args: "",
    help: "Away from the keyboard: your portrait dims for everyone (again to come back)",
    group: "Talk",
    run: (_rest, context) => {
      const me = context.session.players.find((seat) => seat.id === context.session.selfId);
      if (context.session.role === "dm") return context.session.note("The GM is never away: /pause the game instead.");
      context.session.setPresence({ afk: !me?.afk });
      context.session.note(me?.afk ? "You are back." : "You are away (/afk again to come back).");
    },
  },
  {
    names: ["option"],
    args: "[name] [value]",
    help: "Set a table option: /option towerreveal on|off",
    group: "GM",
    gm: true,
    run: (rest, context) => {
      const [name = "", value = ""] = rest.trim().split(/\s+/);
      if (name.toLowerCase() === "towerreveal" && onOff(value) !== null) return context.session.setTableOptions({ towerReveal: onOff(value)! });
      context.session.note("Options: towerreveal on|off (players see their own dice-tower rolls).");
    },
  },
  // --- This screen -------------------------------------------------------------
  { names: ["clear"], args: "", help: "Clear the chat on this screen", group: "Screen", run: (_rest, context) => context.session.clearChat() },
  { names: ["help", "?", "commands"], args: "", help: "Every command (/r rolls dice: /r 1d20+3 Climb)", group: "Screen", run: (_rest, context) => context.showHelp() },
  { names: ["dice"], args: "", help: "Your dice: sets, colours, effects", group: "Screen", run: (_rest, context) => context.openWindow("dice", "Dice") },
  { names: ["settings"], args: "", help: "Settings", group: "Screen", run: (_rest, context) => context.openWindow("settings", "Settings") },
  { names: ["sound", "sounds"], args: "", help: "Sound: your volumes (and the GM's one-shots, ambience, music and triggers)", group: "Screen", run: (_rest, context) => context.openWindow("sound", "Sound") },
  {
    names: ["play", "sfx"],
    args: "[folder or sound]",
    help: "Play a sound for the table: /play oneshots/Doors/Wooden Door",
    group: "GM",
    gm: true,
    run: (rest, context) => (rest.trim() ? context.session.soundCommand({ type: "sound-play", id: rest.trim() }) : context.openWindow("sound", "Sound")),
  },
  {
    names: ["volume"],
    args: "[0-100] <kind>",
    help: "This screen's volume (everything, or: oneshots, sfx, ambience, music)",
    group: "Screen",
    run: (rest, context) => {
      const [level = "", kind = "master"] = rest.trim().split(/\s+/);
      const value = percent(level, 0, 100);
      const key = ["master", "oneshots", "sfx", "ambience", "music"].includes(kind.toLowerCase()) ? (kind.toLowerCase() as "master") : "master";
      if (value === null) return context.session.note("As /volume 60, or /volume 30 music.");
      sound.setVolumes({ [key]: value });
    },
  },
  {
    names: ["openwindow"],
    args: "[window]",
    help: `Open a window: ${Object.keys(WINDOWS).join(", ")}`,
    group: "Screen",
    run: (rest, context) => {
      const found = WINDOWS[rest.trim().toLowerCase()];
      if (!found) return context.session.note(`Windows: ${Object.keys(WINDOWS).join(", ")}.`);
      context.openWindow(found.kind, found.title);
    },
  },
  {
    names: ["closewindow"],
    args: "[window]",
    help: "Close a window",
    group: "Screen",
    run: (rest, context) => {
      const found = WINDOWS[rest.trim().toLowerCase()];
      if (!found) return context.session.note(`Windows: ${Object.keys(WINDOWS).join(", ")}.`);
      context.closeWindow(found.kind);
    },
  },
  {
    names: ["diceeffect", "dice3d"],
    args: "[on|off]",
    help: "3D dice rolling across the table, on this screen",
    group: "Screen",
    run: (rest, context) => {
      const on = onOff(rest);
      diceStore.update({ show: on ?? !diceStore.settings().show });
      context.session.note(`3D dice ${diceStore.settings().show ? "on" : "off"}.`);
    },
  },
  {
    names: ["dicevolume"],
    args: "[0-100|on|off]",
    help: "The dice sounds' volume",
    group: "Screen",
    run: (rest, context) => {
      const on = onOff(rest);
      const level = percent(rest, 0, 100);
      if (on !== null) diceStore.update({ sound: on });
      else if (level !== null) diceStore.update({ sound: level > 0, volume: level });
      else return context.session.note("As /dicevolume 60, /dicevolume off.");
      context.session.note(`Dice sounds ${diceStore.settings().sound ? `at ${Math.round(diceStore.settings().volume * 100)}%` : "off"}.`);
    },
  },
  {
    names: ["scaledice"],
    args: "[60-160]",
    help: "The tray's dice size, in %",
    group: "Screen",
    run: (rest, context) => {
      const value = percent(rest, 60, 160);
      if (value === null) return context.session.note("As /scaledice 120 (60 to 160).");
      diceStore.update({ tray: value });
    },
  },
  {
    names: ["scaleroll"],
    args: "[50-250]",
    help: "The rolled dice's size on the table, in %",
    group: "Screen",
    run: (rest, context) => {
      const value = percent(rest, 50, 250);
      if (value === null) return context.session.note("As /scaleroll 150 (50 to 250).");
      diceStore.update({ roll: value });
    },
  },
  {
    names: ["scaleui", "resizeui", "zoom"],
    args: "[50-200]",
    help: "Make everything on this screen bigger or smaller, in %",
    group: "Screen",
    run: (rest, context) => {
      const value = percent(rest, 50, 200);
      if (value === null) return context.session.note("As /scaleui 125 (50 to 200; 100 is normal).");
      setUiScale(value);
    },
  },
  {
    names: ["info", "version"],
    args: "",
    help: "About Maelstrom VTT and this table",
    group: "Screen",
    run: (_rest, context) => {
      const at = context.session.role === "dm" ? `hosting, ${context.session.players.length} at the table` : `at ${context.session.remoteLabel}`;
      context.session.note(`Kraken VTT ${__KRAKEN_VERSION__}: a free virtual tabletop (PolyForm Shield License 1.0.0). You are ${at}. /help lists the commands.`);
    },
  },
  { names: ["reload"], args: "", help: "Reload this screen", group: "Screen", run: () => window.location.reload() },
];


// The whole screen's size (FG's /scaleui), kept in this browser.
export function setUiScale(value: number) {
  document.documentElement.style.setProperty("zoom", String(value));
  try {
    window.localStorage.setItem("kraken-ui-scale", String(value));
  } catch {
    /* only this screen forgets */
  }
}
export function restoreUiScale() {
  try {
    const saved = Number(window.localStorage.getItem("kraken-ui-scale"));
    if (saved >= 0.5 && saved <= 2) document.documentElement.style.setProperty("zoom", String(saved));
  } catch {
    /* normal size */
  }
}

export function findCommand(name: string) {
  const wanted = name.toLowerCase();
  return COMMANDS.find((command) => command.names.includes(wanted));
}

// The commands this seat may use, for the list as you type.
export function commandsFor(gm: boolean) {
  return COMMANDS.filter((command) => gm || !command.gm);
}

// Runs a line typed in chat: a command, or speech. Says whether it was understood.
export function runChat(draft: string, context: CommandContext) {
  const text = draft.trim();
  const command = /^\/(\S+)\s*([\s\S]*)$/.exec(text);
  if (!command) {
    context.session.sendChat(text, { ...(context.speakAs ? { as: context.speakAs } : {}), ...(context.lang ? { lang: context.lang } : {}) });
    return true;
  }
  const found = findCommand(command[1]);
  if (!found) {
    context.session.note(`There is no /${command[1]}. /help lists the commands.`);
    return false;
  }
  if (found.gm && context.session.role !== "dm") {
    context.session.note(`/${found.names[0]} is the GM's.`);
    return false;
  }
  found.run(command[2], context);
  return true;
}
