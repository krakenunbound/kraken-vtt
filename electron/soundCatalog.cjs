// Kraken's own sound set: what to make (scripts/generate-sounds.mjs makes
// them with the GM's ElevenLabs account, into assets/sounds), and the chat
// triggers that play them. Each entry is a folder of sounds; a folder plays one
// of its sounds at random. `keys` are the words in a roll's name that mean it
// (a "Longsword" attack is a Sword); results are hit, miss, crit (a natural
// 20) and fumble (a natural 1).

const RESULTS = ["Hit", "Miss", "Crit", "Fumble"];

// Weapons: [folder, keys, what it sounds like].
const WEAPONS = [
  ["Sword", "sword|blade|scimitar|rapier|katana|falchion|sabre|saber|cutlass", "a steel sword"],
  ["Greatsword", "greatsword|two-handed sword|claymore|zweihander|bastard sword", "a huge two-handed greatsword"],
  ["Axe", "axe|hatchet|tomahawk", "a battle axe"],
  ["Mace", "mace|morning ?star|club|cudgel", "a heavy iron mace"],
  ["Warhammer", "hammer|maul", "a warhammer"],
  ["Flail", "flail", "a spiked chain flail"],
  ["Dagger", "dagger|knife|dirk|stiletto", "a small dagger"],
  ["Spear", "spear|pike|halberd|trident|lance|glaive|polearm|partisan|guisarme", "a long spear"],
  ["Staff", "staff|quarterstaff", "a wooden quarterstaff"],
  ["Whip", "whip", "a leather whip"],
  ["Bow", "(?<!cross)bow\\b|longbow|shortbow|arrow", "a bow and arrow"],
  ["Crossbow", "crossbow", "a crossbow bolt"],
  ["Sling", "sling", "a sling stone"],
  ["Thrown", "javelin|dart|throwing|thrown|hand ?axe", "a thrown javelin"],
  ["Unarmed", "unarmed|fist|punch|kick|brawl", "a bare-fisted punch"],
  ["Claws", "claw|talon|rake|slam|gore|tail", "a monster's claws"],
  ["Bite", "bite|fang|jaws", "a beast's bite"],
];
const WEAPON_SOUND = {
  Hit: (what) => `${what} striking an armoured opponent, a solid hit with a grunt of pain, fantasy combat sound effect`,
  Miss: (what) => `${what} swinging and missing, a fast whoosh through the air, fantasy combat sound effect`,
  Crit: (what) => `a devastating critical hit with ${what}, a brutal crunching impact and a cry of pain, fantasy combat sound effect`,
  Fumble: (what) => `a clumsy fumble with ${what}, the weapon clattering and slipping, an embarrassed grunt, fantasy combat sound effect`,
};
const RANGED = new Set(["Bow", "Crossbow", "Sling", "Thrown"]);
const RANGED_SOUND = {
  Hit: (what) => `${what} loosed, flying and thudding hard into a target, fantasy combat sound effect`,
  Miss: (what) => `${what} loosed, whistling past and clattering off stone, fantasy combat sound effect`,
  Crit: (what) => `${what} loosed, a perfect shot punching deep into its target with a scream, fantasy combat sound effect`,
  Fumble: (what) => `${what} misfired, the string snapping or the shot dropping to the ground, fantasy combat sound effect`,
};

// Spells by kind: [folder, keys, what the magic is].
const SPELLS = [
  ["Fire", "fire|flame|burn|scorch|inferno|blaze|fireball|ember|heat", "roaring fire magic"],
  ["Ice", "ice|frost|cold|freez|snow|chill|winter", "freezing ice magic"],
  ["Lightning", "lightning|shock|electric|storm|spark|thunderbolt", "crackling lightning magic"],
  ["Thunder", "thunder|sonic|shatter|boom|blast", "a booming thunderclap spell"],
  ["Acid", "acid|corrod|melt|caustic", "hissing acid magic"],
  ["Poison", "poison|venom|toxic|plague|stinking", "bubbling poison magic"],
  ["Holy", "holy|radiant|divine|sacred|bless|smite|light|sun", "radiant holy magic with a heavenly choir"],
  ["Necrotic", "necro|death|shadow|darkness|drain|wither|curse|unholy", "dark necrotic magic with ghostly whispers"],
  ["Psychic", "psychic|mind|charm|sleep|fear|confus|hold person|command", "eerie psychic magic"],
  ["Nature", "nature|thorn|vine|entangle|wind|earth|stone|plant", "rustling earthy nature magic"],
  ["Force", "force|missile|magic missile|arcane|eldritch", "glowing arcane force bolts"],
  ["Arcane", ".", "shimmering arcane magic"],
];
const SPELL_SOUND = {
  Cast: (what) => `a wizard casting ${what}, a rising magical charge, fantasy spell sound effect`,
  Hit: (what) => `${what} striking its target with a powerful impact, fantasy spell sound effect`,
  Miss: (what) => `${what} missing its target and fizzling away in the distance, fantasy spell sound effect`,
  Crit: (what) => `${what} exploding with overwhelming force on its target, fantasy spell sound effect`,
  Fumble: (what) => `${what} backfiring and sputtering out with a sad fizzle, fantasy spell sound effect`,
};

// Creatures and monsters: [folder, keys, what it is].
const ANIMALS = [
  ["Wolf", "wolf|wolves|warg|hound|dog", "a snarling wolf"],
  ["Bear", "bear", "a huge angry bear"],
  ["Boar", "boar|pig|swine", "a wild boar"],
  ["Big Cat", "lion|tiger|panther|leopard|cat|jaguar", "a big wild cat"],
  ["Horse", "horse|pony|mule|steed", "a horse"],
  ["Snake", "snake|serpent|viper|python|cobra", "a hissing giant snake"],
  ["Spider", "spider", "a giant spider"],
  ["Rat", "rat|rodent", "a giant rat"],
  ["Bat", "bat", "a giant bat"],
  ["Bird of Prey", "hawk|eagle|owl|falcon|raptor|bird", "a screeching bird of prey"],
  ["Crocodile", "crocodile|alligator|lizard", "a crocodile"],
];
const MONSTERS = [
  ["Goblin", "goblin|kobold", "a small cackling goblin"],
  ["Orc", "orc|hobgoblin|gnoll", "a brutish orc warrior"],
  ["Ogre", "ogre|troll|hill giant", "a huge lumbering ogre"],
  ["Giant", "giant|cyclops|titan", "a towering giant"],
  ["Zombie", "zombie|ghoul|ghast|undead", "a rotting zombie"],
  ["Skeleton", "skeleton|bone", "a rattling skeleton warrior"],
  ["Ghost", "ghost|spirit|wraith|specter|spectre|banshee|shade", "a wailing ghost"],
  ["Vampire", "vampire|lich|death knight", "a sinister vampire lord"],
  ["Dragon", "dragon|wyrm|wyvern|drake", "a colossal dragon"],
  ["Demon", "demon|devil|fiend|imp|balor", "a roaring demon"],
  ["Werewolf", "werewolf|lycanthrope|werebear|wererat", "a howling werewolf"],
  ["Minotaur", "minotaur", "a bellowing minotaur"],
  ["Ooze", "ooze|slime|jelly|pudding|cube", "a gurgling slime"],
  ["Insect Swarm", "swarm|insect|beetle|wasp|ant", "a buzzing insect swarm"],
  ["Elemental", "elemental|golem", "a rumbling elemental"],
  ["Harpy", "harpy|siren", "a shrieking harpy"],
];
const CREATURE_SOUND = {
  Attack: (what) => `${what} attacking with a vicious roar, creature sound effect`,
  Hurt: (what) => `${what} getting hit and crying out in pain, creature sound effect`,
  Death: (what) => `${what} being killed, a final dying cry and collapse, creature sound effect`,
};

const BODY = [
  ["Injury", "a person getting badly wounded in battle, a sharp cry of pain"],
  ["Injury", "a woman hurt in battle, a pained gasp and groan"],
  ["Death", "a warrior dying, a last breath and armour collapsing to the ground"],
  ["Unconscious", "a person falling unconscious, a groan and a body slumping to the floor"],
  ["Heal", "warm healing magic, a soft glowing chime and a relieved breath"],
  ["Bandage", "cloth bandages being torn and wrapped tightly around a wound"],
  ["Potion", "uncorking a glass potion bottle, gulping it down and a satisfied sigh"],
  ["Resurrect", "a divine resurrection, a rising heavenly choir and a sudden gasp of breath"],
  ["Stabilised", "a dying person's breathing steadying, a calm sigh"],
];

const ONESHOTS = [
  ["Doors/Wooden Door", "a heavy wooden door creaking open slowly"],
  ["Doors/Iron Door", "a heavy iron dungeon door grinding open"],
  ["Doors/Slam", "a door slamming shut with a boom"],
  ["Doors/Locked", "rattling a locked door handle"],
  ["Doors/Portcullis", "an iron portcullis being raised with chains"],
  ["Treasure/Chest", "a wooden treasure chest creaking open"],
  ["Treasure/Coins", "a handful of gold coins jingling"],
  ["Treasure/Gem", "a sparkling magical chime as a gem is found"],
  ["Traps/Click", "a pressure plate clicking underfoot"],
  ["Traps/Spikes", "a spike trap springing out of the floor"],
  ["Traps/Darts", "poison darts shooting from the wall"],
  ["Traps/Pit", "the floor giving way and rocks falling into a pit"],
  ["Traps/Boulder", "a huge boulder rolling and rumbling down a corridor"],
  ["Lever", "pulling a heavy stone lever with a clunk"],
  ["Secret Door", "a hidden stone wall sliding open with grinding"],
  ["Magic/Portal", "a magical portal swirling open"],
  ["Magic/Teleport", "a magical teleport whoosh"],
  ["Magic/Explosion", "a huge magical explosion"],
  ["Weather/Thunder", "a loud crack of thunder"],
  ["Bell", "a large church bell tolling once"],
  ["War Horn", "a war horn blowing a call to battle"],
  ["Crowd/Cheer", "a tavern crowd cheering"],
  ["Crowd/Gasp", "a crowd gasping in shock"],
  ["Scream", "a terrified scream in the distance"],
  ["Evil Laugh", "a villain's evil laugh echoing"],
  ["Glass Shatter", "a glass bottle shattering on stone"],
  ["Book", "turning the pages of an old book"],
  ["Torch", "lighting a torch, a whoosh of flame"],
  ["Footsteps", "heavy footsteps approaching in a stone corridor"],
  ["Level Up", "a triumphant short fantasy fanfare of achievement"],
];

// Loops: [folder, what it sounds like].
const AMBIENCE = [
  ["Gentle Meadow", "a gentle summer meadow, birdsong, buzzing insects and a soft breeze"],
  ["Forest by Day", "a forest in the daytime, birds, rustling leaves and a distant woodpecker"],
  ["Forest at Night", "a forest at night, crickets, an owl hooting and wind in the trees"],
  ["Jungle", "a dense tropical jungle, exotic birds, monkeys and insects"],
  ["Swamp", "a murky swamp, frogs croaking, bubbling water and buzzing flies"],
  ["Cave", "a damp cave, water dripping and a low echoing hum"],
  ["Dungeon", "a dark stone dungeon, distant dripping, chains rattling and a faint moan"],
  ["Crypt", "an ancient crypt, eerie wind and stone settling"],
  ["Underdark", "a vast underground cavern, deep rumbles and distant echoes"],
  ["Lava Cavern", "a volcanic cavern, bubbling lava and hissing steam"],
  ["Graveyard at Night", "a graveyard at night, wind, a crow and creaking branches"],
  ["Sewers", "city sewers, running water, rats squeaking and dripping"],
  ["Rural Village", "a quiet rural village, chickens, a dog barking and villagers chatting"],
  ["Tavern", "a busy medieval tavern, chatter, laughter and clinking mugs"],
  ["Busy City", "a busy medieval city street, crowds, carts and merchants calling"],
  ["Market", "a medieval market square, haggling merchants and livestock"],
  ["Docks", "a harbour dock, seagulls, creaking ropes and lapping water"],
  ["Ship at Sea", "a wooden sailing ship at sea, creaking hull, flapping sails and waves"],
  ["Ocean Shore", "waves breaking gently on a beach with seagulls"],
  ["River", "a flowing river over rocks"],
  ["Waterfall", "a roaring waterfall"],
  ["Mountain Wind", "strong wind howling across a mountain peak"],
  ["Desert", "hot desert wind blowing sand"],
  ["Rain", "steady rain falling on a forest"],
  ["Thunderstorm", "a heavy thunderstorm with rolling thunder"],
  ["Snow", "a quiet snowy landscape, soft wind and crunching snow"],
  ["Blizzard", "a fierce blizzard, howling icy wind"],
  ["Campfire", "a crackling campfire at night with crickets"],
  ["Blacksmith", "a blacksmith's forge, hammering metal and bellows"],
  ["Temple", "a quiet stone temple, soft chanting and echoes"],
  ["Throne Room", "a grand throne room, quiet murmuring courtiers and echoes"],
  ["Battlefield", "a distant battle, clashing swords, shouts and war cries"],
];

// Music (ElevenLabs Music, if the account has it): [folder, what it sounds like].
const MUSIC = [
  ["Exploration", "calm orchestral fantasy exploration music, strings and harp, peaceful adventure"],
  ["Tavern", "lively medieval tavern music with lute, fiddle and drum"],
  ["Battle", "epic orchestral fantasy battle music, drums and brass, intense"],
  ["Boss Battle", "dark epic boss battle music, choir and heavy percussion"],
  ["Dungeon", "tense dark ambient dungeon music, low drones and sparse percussion"],
  ["Mystery", "mysterious magical fantasy music, celesta and soft strings"],
  ["Sad", "a sad emotional fantasy piano and strings theme"],
  ["Victory", "a triumphant fantasy victory fanfare with brass"],
];

const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Everything to make: { group, prompt, seconds, loop, variants, music? }.
function catalog() {
  const out = [];
  for (const [folder, , what] of WEAPONS) {
    const sound = RANGED.has(folder) ? RANGED_SOUND : WEAPON_SOUND;
    for (const result of RESULTS) out.push({ group: `sfx/Weapons/${folder}/${result}`, prompt: sound[result](what), seconds: result === "Crit" ? 3 : 2, variants: 2 });
  }
  out.push({ group: "sfx/Weapons/Shield/Block", prompt: "a sword striking a raised wooden and steel shield, a heavy block, fantasy combat sound effect", seconds: 2, variants: 2 });
  out.push({ group: "sfx/Weapons/Shield/Bash", prompt: "a shield bash slamming into an opponent, fantasy combat sound effect", seconds: 2, variants: 2 });
  for (const [folder, , what] of SPELLS) for (const result of ["Cast", ...RESULTS]) out.push({ group: `sfx/Spells/${folder}/${result}`, prompt: SPELL_SOUND[result](what), seconds: result === "Cast" ? 3 : 2.5, variants: 2 });
  for (const [folder, prompt] of BODY) out.push({ group: `sfx/Body/${folder}`, prompt: `${prompt}, fantasy sound effect`, seconds: 3, variants: folder === "Injury" ? 1 : 2 });
  for (const [folder, , what] of ANIMALS) for (const result of Object.keys(CREATURE_SOUND)) out.push({ group: `sfx/Animals/${folder}/${result}`, prompt: CREATURE_SOUND[result](what), seconds: 2.5, variants: 2 });
  for (const [folder, , what] of MONSTERS) for (const result of Object.keys(CREATURE_SOUND)) out.push({ group: `sfx/Monsters/${folder}/${result}`, prompt: CREATURE_SOUND[result](what), seconds: 3, variants: 2 });
  for (const [folder, prompt] of ONESHOTS) out.push({ group: `oneshots/${folder}`, prompt: `${prompt}, fantasy sound effect`, seconds: 3, variants: 1 });
  for (const [folder, prompt] of AMBIENCE) out.push({ group: `ambience/${folder}`, prompt: `${prompt}, seamless loop, ambient background sound`, seconds: 22, loop: true, variants: 1 });
  for (const [folder, prompt] of MUSIC) out.push({ group: `music/${folder}`, prompt, seconds: 90, music: true, variants: 1 });
  return out.map((item) => ({ ...item, file: slug(item.group.split("/").slice(1).join(" ")) }));
}

// The chat's triggers, in order (the first that fits and has sounds plays):
// { id, name, on: attack | save | cast | heal | damage | text, match (words, a
// regular expression, "" for any), result: any | hit | miss | crit | fumble |
// success | failure, sound (a folder), on: true }.
function defaultTriggers() {
  const out = [];
  const add = (name, on, match, result, sound) => out.push({ id: slug(`${on} ${name} ${result}`), name, on, match, result, sound, enabled: true });
  for (const [folder, keys] of WEAPONS) for (const result of RESULTS) add(folder, "attack", keys, result.toLowerCase(), `sfx/Weapons/${folder}/${result}`);
  for (const [folder, keys] of [...MONSTERS, ...ANIMALS]) {
    const base = MONSTERS.some(([name]) => name === folder) ? "Monsters" : "Animals";
    add(`${folder} attacks`, "attack", keys, "any", `sfx/${base}/${folder}/Attack`);
  }
  for (const result of RESULTS) add("Any weapon", "attack", "", result.toLowerCase(), `sfx/Weapons/Sword/${result}`);
  for (const [folder, keys] of SPELLS) {
    add(folder, "cast", keys, "any", `sfx/Spells/${folder}/Cast`);
    for (const result of RESULTS) add(`${folder} spell`, "spellattack", keys, result.toLowerCase(), `sfx/Spells/${folder}/${result}`);
  }
  add("Healing", "heal", "", "any", "sfx/Body/Heal");
  add("Potion", "text", "potion|drinks|quaff", "any", "sfx/Body/Potion");
  add("Bandage", "text", "bandage|binds? (his|her|their) wounds|first aid", "any", "sfx/Body/Bandage");
  add("Death", "text", "\\b(dies|is dead|has died|slain|is killed|falls dead)\\b", "any", "sfx/Body/Death");
  add("Unconscious", "text", "unconscious|is dying|drops to 0|falls down", "any", "sfx/Body/Unconscious");
  add("Stabilised", "text", "stabili[sz]", "any", "sfx/Body/Stabilised");
  add("Resurrection", "text", "resurrect|raise dead|revive|brought back", "any", "sfx/Body/Resurrect");
  add("Level up", "text", "\\[LEVEL UP\\]", "any", "oneshots/Level Up");
  return out;
}

module.exports = { catalog, defaultTriggers, WEAPONS, SPELLS, ANIMALS, MONSTERS };
