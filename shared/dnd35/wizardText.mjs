// The words of Kraken's D&D 3.5E character wizard (the GM's own
// KrakenCharWizard35E for Fantasy Grounds): each page's instructions and
// warning, and the descriptions of the races, classes and alignments it
// shows when one is chosen. Kraken's own text, not a book's.

export const ABILITY_PROSE = "Strength is the might to break chains, bear burdens, and meet the world head-on.\n\nDexterity is grace in motion—the arrow loosed true, the blade turned aside, the footfall unheard.\n\nConstitution is endurance against hunger, sickness, pain, and the long darkness beyond exhaustion.\n\nIntelligence is knowledge gathered, patterns discerned, and mysteries unraveled by reason and study.\n\nWisdom is judgment tempered by experience—the voice that knows when to act, when to wait, and when to listen.\n\nCharisma is presence made manifest—the spark that inspires loyalty, kindles fear, wins affection, or commands obedience.";
export const ALIGNMENT_PROSE = "Good alignments\nLawful Good keeps oath and mercy together. Neutral Good follows the kind road even when law or rebellion would stray from it. Chaotic Good is the free blade raised for the helpless.\n\nNeutral alignments\nLawful Neutral trusts order, rank, and code before sentiment. True Neutral seeks balance, survival, or clear-eyed distance. Chaotic Neutral follows instinct, liberty, and sudden inspiration.\n\nEvil alignments\nLawful Evil makes cruelty official, binding ambition in contracts, crowns, and commands. Neutral Evil takes what it wants without romance or restraint. Chaotic Evil is ruin unbridled.";
export const RACE_PROSE = {
  "dwarf": "Dwarves are children of stone halls, oath-rings, and ancient grudges. A dwarf brings endurance, craft, and a memory longer than most kingdoms.",
  "drow": "Drow are shaped by beauty, danger, and the deep places beneath the world. A drow character carries grace and old magic, but also the weight of a feared name.",
  "elf": "Elves walk with one foot in song and one in moonlit peril. Grace, perception, and old magic cling to them like starlight on a blade.",
  "gnome": "Gnomes carry clever hands, quick laughter, and secrets hidden in plain sight. Their lives are small only to those who mistake size for consequence.",
  "half-elf": "Half-elves stand between hearths, welcomed everywhere and fully claimed nowhere. They learn faces, roads, and tongues, turning belonging into a skill.",
  "halfling": "Halflings survive by nerve, luck, and a practical eye for danger. The wide world underestimates them until it is too late.",
  "half-orc": "Half-orcs carry hard strength and harder expectations. Some answer with fury, some with discipline, but few pass through the world unnoticed.",
  "human": "Humans burn brief and bright, filling short years with ambition, faith, folly, and invention. They adapt quickly because they must.",
  "tiefling": "Tieflings bear a visible hint of the planes in blood, eyes, shadow, or temper. They make sharp-edged wanderers, feared before they speak and remembered after.",
  "goblin": "Goblins are fast, wary survivors who turn small size, quick feet, and sharp instincts into an advantage."
};
export const CLASS_PROSE = {
  "barbarian": "A barbarian is wrath given purpose: a warrior of wild places, sudden violence, and fierce loyalty. When the battle turns ugly, the barbarian becomes uglier still.",
  "bard": "A bard carries lore, music, and nerve into places where a sword alone would fail. They win doors with a smile and battles with a song.",
  "cleric": "A cleric is the hand of a power beyond mortal walls. Prayer becomes shield, judgment, healing, and fire.",
  "druid": "A druid serves the old green law beneath roads and crowns. Beasts, storms, roots, and seasons answer the patient voice.",
  "fighter": "A fighter is discipline made visible: stance, steel, armor, and practiced courage. Where others rely on gifts, the fighter has trained.",
  "monk": "A monk turns body and spirit into a single weapon. Empty hands strike like iron when the mind is still.",
  "paladin": "A paladin bears virtue as a blade and burden. Their strength is not only arms, but the oath that refuses to bend.",
  "ranger": "A ranger reads trail, weather, spoor, and silence. On the borderlands, survival and justice often wear the same cloak.",
  "rogue": "A rogue lives by timing, nerve, and the soft click of a lock giving way. Shadows are tools, not hiding places.",
  "sorcerer": "A sorcerer does not study magic so much as survive it. Power wakes in the blood and answers emotion, instinct, and will.",
  "wizard": "A wizard binds wonder through ink, memory, and relentless study. Every spell prepared is a door opened with a sharpened mind.",
  "warlock": "A warlock is an at-will occult striker whose magic is narrow, reliable, and difficult to exhaust.",
  "mesmer": "A mesmer survives through misdirection, duplicates, and illusion-laced melee pressure.",
  "necromancer": "A necromancer is a focused death-magic caster and undead handler whose strength depends on preparation and table limits."
};
export const RACE_DETAILS = {
  "dwarf": {
    "top": "Dwarves are sturdy, disciplined, and difficult to move once they have chosen a side. The usual 3.5E profile favors Constitution and resilience over easy charm.",
    "bottom": "Play a dwarf if you want a character who can endure punishment, respect craft and lineage, and treat promises as stonework. They make excellent front-line warriors, divine casters, and stubborn experts. The tradeoff is social friction: a dwarf may need to work harder when tact, speed, or open-mindedness matters."
  },
  "drow": {
    "top": "Drow bring Dexterity, Intelligence, and Charisma with a Constitution penalty, plus the baggage of an infamous subterranean culture. Use the level adjustment and source rules from the record you selected.",
    "bottom": "Play a drow if you want danger, elegance, suspicion, and social pressure built into the character from the first scene. They fit rogues, arcane casters, bards, and political survivors. The tradeoff is trust: many surface folk will assume the worst, and the character needs a reason to stand with the party."
  },
  "elf": {
    "top": "Elves are graceful, perceptive, and lightly built. The usual 3.5E profile favors Dexterity while making Constitution the cost.",
    "bottom": "Play an elf if you want alertness, old-world confidence, archery, finesse, or arcane tradition. Elves suit wizards, rangers, rogues, and precise warriors. The tradeoff is durability: a low Constitution can make early levels unforgiving, so positioning and preparation matter."
  },
  "gnome": {
    "top": "Gnomes are small, durable, and sly. The usual 3.5E profile favors Constitution while reducing Strength.",
    "bottom": "Play a gnome if you want curiosity, humor, illusions, practical courage, and a character underestimated by larger folk. Gnomes work well as bards, illusionists, druids, and clever support characters. The tradeoff is direct physical force: heavy weapons and brute tactics are rarely their best answer."
  },
  "half-elf": {
    "top": "Half-elves are flexible social wanderers without the sharp ability-score tradeoffs of some ancestries. Their strength is belonging to more than one world.",
    "bottom": "Play a half-elf if you want a diplomatic outsider, a bridge between cultures, or a character who learned to listen before choosing a home. They fit bards, rangers, rogues, clerics, and adaptable party faces. The tradeoff is specialization: their advantages are subtle, so the class choice carries more of the build."
  },
  "halfling": {
    "top": "Halflings are quick, lucky, and harder to pin down than they look. The usual 3.5E profile favors Dexterity while reducing Strength.",
    "bottom": "Play a halfling if you want nerve, stealth, thrown weapons, practical optimism, or a survivor who keeps moving. Halflings make strong rogues, scouts, bards, and light-footed warriors. The tradeoff is raw power: small size and lower Strength make heavy melee plans harder."
  },
  "half-orc": {
    "top": "Half-orcs are physically forceful and socially burdened. The usual 3.5E profile favors Strength while reducing Intelligence and Charisma.",
    "bottom": "Play a half-orc if you want the world to judge the character before knowing them. They shine as barbarians, fighters, rangers, and any build where strength solves immediate problems. The tradeoff is breadth: fewer skill points and weaker social presence make planning and party role clarity important."
  },
  "human": {
    "top": "Humans are the flexible 3.5E baseline: no ability-score shift, an extra feat, and extra skill points. They can become almost anything quickly.",
    "bottom": "Play a human if you want build freedom, ambition, cultural variety, or a character defined more by choices than ancestry. Humans suit every class, especially feat-hungry concepts. The tradeoff is flavor pressure: because they do not push a niche mechanically, the personality and background need to carry the identity."
  },
  "tiefling": {
    "top": "Tieflings usually lean toward Dexterity and Intelligence with a Charisma penalty, plus planar traits from the selected source. Use the level adjustment and exact traits from your loaded record.",
    "bottom": "Play a tiefling if you want a character marked by ancestry they did not choose: clever, wary, and hard to read. They work well as rogues, wizards, scouts, and occult-leaning outsiders. The tradeoff is prejudice and isolation; decide whether the character hides, defies, or weaponizes that reputation."
  },
  "goblin": {
    "top": "Goblins are Small, quick, and stealth-friendly. The compendium profile favors Dexterity while reducing Strength and Charisma.",
    "bottom": "Play a goblin if you want a fast skirmisher, scout, sneak, or underdog survivor. The tradeoff is direct force and social trust: a goblin often wins by mobility, timing, and not being where the counterattack lands."
  }
};
export const CLASS_DETAILS = {
  "barbarian": {
    "top": "Barbarians are fast, tough front-line combatants built around rage, instinct, and decisive violence.",
    "bottom": "Play a barbarian if you want simple tactical momentum: close distance, hit hard, and survive the counterblow. The roleplay lives in what the rage means - sacred fury, survival reflex, grief, joy, or battle trance. The tradeoff is control: social scenes, delicate plans, and limited daily resources can test the character."
  },
  "bard": {
    "top": "Bards are flexible support characters: skills, lore, social leverage, music, and a light spell list.",
    "bottom": "Play a bard if you want to talk, improvise, know strange facts, and make everyone else better. A bard can be face, scout, buffer, backup caster, and troublemaker. The tradeoff is focus: you rarely outfight the fighter or outcast the wizard, so success comes from timing and versatility."
  },
  "cleric": {
    "top": "Clerics are durable divine casters who bring healing, protection, judgment, and domain identity.",
    "bottom": "Play a cleric if you want faith to shape action rather than sit in the background. Clerics can anchor the party, stand in armor, and answer many threats with prepared magic. The tradeoff is obligation: deity, doctrine, community, or philosophy should create real expectations."
  },
  "druid": {
    "top": "Druids are nature-bound divine casters with survival tools, animal allies, and strong battlefield control.",
    "bottom": "Play a druid if you want the old world to answer when roads and crowns fail. They are excellent in wilderness play and grow into very broad problem solvers. The tradeoff is worldview: a druid should care about balance, territory, seasons, beasts, or the cost of civilization."
  },
  "fighter": {
    "top": "Fighters are trained weapon specialists with a deep feat progression and straightforward battlefield reliability.",
    "bottom": "Play a fighter if you want technique, equipment, and discipline to define the character. Fighters can become archers, duelists, shield walls, chargers, trip builds, or tactical veterans. The tradeoff is noncombat reach: skills and magic are limited, so background and feat planning matter."
  },
  "monk": {
    "top": "Monks are disciplined martial ascetics who turn movement, defense, and unarmed strikes into a fighting style.",
    "bottom": "Play a monk if you want restraint, training, vows, or inner conflict to matter at the table. Monks reward mobility and unusual problem solving. The tradeoff is ability dependence: Strength, Dexterity, Constitution, and Wisdom all compete for attention."
  },
  "paladin": {
    "top": "Paladins are oath-bound champions with martial ability, divine grace, healing, and a strict moral center.",
    "bottom": "Play a paladin if you want conviction under pressure. A paladin is strongest when mercy, justice, law, and danger all pull in different directions. The tradeoff is constraint: the code is not decoration, and the campaign needs room for honorable choices to matter."
  },
  "ranger": {
    "top": "Rangers are scouts and hunters built for trails, favored enemies, practical combat, and the edge of settled lands.",
    "bottom": "Play a ranger if you want competence outdoors, quiet observation, and a personal reason to protect or pursue. They fit archery, two-weapon fighting, tracking, and borderland stories. The tradeoff is terrain and target dependence: talk with the campaign's premise in mind."
  },
  "rogue": {
    "top": "Rogues are skill-heavy specialists built around stealth, traps, social angles, and precision damage.",
    "bottom": "Play a rogue if you want to solve problems before initiative, exploit openings during combat, and always have a tool ready. Rogues thrive on scouting, locks, lies, and timing. The tradeoff is fragility: direct stand-up fights punish bad positioning."
  },
  "sorcerer": {
    "top": "Sorcerers are spontaneous arcane casters whose magic comes from blood, will, omen, or inheritance.",
    "bottom": "Play a sorcerer if you want magic to feel personal and dangerous. Fewer spells known means each choice becomes part of the character's identity. The tradeoff is planning: the spell list is narrow, so the character must solve many problems with a small, reliable kit."
  },
  "wizard": {
    "top": "Wizards are prepared arcane casters built around study, spellbooks, and the right answer chosen before danger arrives.",
    "bottom": "Play a wizard if you want knowledge, preparation, and curiosity to drive the character. Wizards can grow into unmatched toolboxes, but they must protect their spellbook and plan ahead. The tradeoff is vulnerability: early mistakes, surprise, and poor preparation can hurt."
  },
  "warlock": {
    "top": "Warlocks are durable arcane skirmishers built around eldritch blast, invocations, and at-will utility.",
    "bottom": "Play a warlock if you want reliable magical pressure without daily spell bookkeeping. The tradeoff is breadth: the warlock has fewer answers than a wizard, so invocation choices matter."
  },
  "mesmer": {
    "top": "Mesmers are deceptive melee illusionists who use duplicates, positioning, and precision openings.",
    "bottom": "Play a mesmer if you want trickery to be tactical instead of only social. The tradeoff is risk: light armor and a d6 Hit Die punish bad positioning once the deception breaks."
  },
  "necromancer": {
    "top": "Necromancers are fragile, focused Intelligence casters with undead control and death-magic identity.",
    "bottom": "Play a necromancer if you want preparation, minion pressure, and dark specialization. The tradeoff is narrowness: when death magic is the wrong tool, the character needs planning and allies."
  }
};
export const ALIGNMENT_DETAILS = {
  "lawful-good": {
    "top": "Lawful Good tries to make mercy durable by binding it to duty, honor, and institutions.",
    "bottom": "This character keeps promises even when convenience begs them not to. The roleplay tension is choosing between the law as written and the good the law was meant to protect."
  },
  "neutral-good": {
    "top": "Neutral Good puts compassion first and treats law, rebellion, custom, and status as tools rather than masters.",
    "bottom": "This character helps because help is needed. The tension is deciding when compromise preserves more good than purity, and when a rule deserves to be broken."
  },
  "chaotic-good": {
    "top": "Chaotic Good fights for freedom, mercy, and the dignity of people over systems.",
    "bottom": "This character distrusts chains, tyrants, and excuses. The tension is learning when discipline protects the innocent better than impulse."
  },
  "lawful-neutral": {
    "top": "Lawful Neutral trusts order, precedent, rank, or code more than sentiment.",
    "bottom": "This character can be honorable without being kind. The tension is deciding whether the code still deserves loyalty when it causes suffering."
  },
  "true-neutral": {
    "top": "True Neutral seeks balance, survival, distance, or practical clarity between loud extremes.",
    "bottom": "This character may avoid banners, preserve equilibrium, or simply refuse other people's crusades. The tension is knowing when neutrality becomes cowardice."
  },
  "chaotic-neutral": {
    "top": "Chaotic Neutral follows liberty, instinct, appetite, or inspiration before outside order.",
    "bottom": "This character can be unpredictable without being random. The tension is letting freedom matter while still giving the party reasons to trust them."
  },
  "lawful-evil": {
    "top": "Lawful Evil turns ambition and cruelty into policy, hierarchy, contract, or command.",
    "bottom": "This character believes power should have rules because rules make power last. The tension is whether loyalty, reputation, or fear is the better leash."
  },
  "neutral-evil": {
    "top": "Neutral Evil wants what it wants and does not need ideology to excuse the cost.",
    "bottom": "This character may be cold, practical, or selfish rather than theatrical. The tension is keeping the party useful allies instead of future victims."
  },
  "chaotic-evil": {
    "top": "Chaotic Evil is appetite, spite, ruin, or domination without patience for restraint.",
    "bottom": "This character is hard to sustain in party play unless the table agrees on boundaries. The tension is finding a reason they do not burn the campaign down from within."
  }
};
export const INSTRUCTIONS = {
  "basics": "Roll or set your six ability scores. Your race adjusts them, and every 4th level adds one point you place here.\n1. Choose a method (the GM decides which are allowed) and roll, or type the scores for manual entry.\n2. Drag a score onto another to swap them.\n3. For a character above 1st level, set the Target Level and place the ability increases due at 4th, 8th, 12th, 16th and 20th level.",
  "race": "Choose your race. It changes ability scores, size, speed, languages and favored class; a race with a level adjustment counts it toward the 20-level cap.\n1. Review a race by clicking its link or name.\n2. Click + beside the race you want.\n3. Read its traits below. Change Race starts the choice again.",
  "class": "Choose your class, and more classes for a multiclass character.\n1. Click + beside a class.\n2. Set its levels; Add Another Class adds a second class to the plan.\n3. Every class feature the plan reaches is listed below.\nClass alignment rules apply to the whole plan: a paladin is lawful good, a monk lawful, a barbarian or bard not lawful, a druid neutral on at least one axis. Levels outside your favored class can cost experience.",
  "languages": "Choose bonus languages: one for each point of Intelligence bonus, from your race's bonus list (humans and half-elves may choose any language). The languages you know automatically are listed.",
  "alignment": "Choose an alignment. Only the alignments every class in your plan allows are offered.",
  "skills": "Spend your skill points: (class points + Intelligence modifier) per level, four times that at 1st level, plus one a level for humans. A class skill costs 1 point a rank, a cross-class skill 2. Ranks are capped at level + 3 for class skills and half that for cross-class skills.",
  "feats": "Choose your feats: one at 1st level and at every third level, a human's bonus feat, and your classes' bonus feats. A feat whose prerequisites the build does not meet shows what it needs and cannot be taken. Feats with a target (Weapon Focus, Spell Focus, Skill Focus...) open a list of the targets that qualify.",
  "equipment": "Roll starting gold for your class (above 1st level: wealth by level, DMG Table 5-1), then buy your gear. What you carry counts toward your load.",
  "spells": "Choose spells and class options: spells known for bards and sorcerers, a wizard's spellbook, and the choices your classes make at these levels (deity and domains, school, familiar, animal companion, favored enemy, combat style...).",
  "details": "Name your character and fill in the details: deity, gender, age, height, weight and appearance.",
  "commit": "Clear every warning (click one to go to its step), then press the button. The character is created with everything chosen; hit points, saves and class features are added level by level."
};
export const WARNINGS = {
  "basics": "Abilities: roll or set the scores and place any ability increases",
  "race": "Race: choose a race",
  "class": "Class: choose a class",
  "languages": "Languages: choose your bonus languages",
  "alignment": "Alignment: choose an alignment your classes allow",
  "skills": "Skills: spend all your skill points",
  "feats": "Feats: choose all your feats",
  "equipment": "Gear: roll starting gold (and spend no more than you have)",
  "spells": "Spells: choose your spells and class options",
  "details": "Details: enter a name"
};
export const RACE_MANUAL_NOTES = {
  "drow": "Racial reminders: darkvision 120 ft.; spell resistance 11 + class level; dancing lights, darkness, and faerie fire 1/day; light blindness; weapon familiarity; +2 Listen/Search/Spot; confirm Drow Sign Language and bonus languages.",
  "tiefling": "Racial reminders: darkvision 60 ft.; resistance 5 cold/electricity/fire; darkness 1/day; +2 Bluff/Hide; native outsider rules; confirm Infernal and bonus languages.",
  "goblin": "Racial reminders: Small size modifiers (+1 AC, +1 attack, +4 Hide, -4 grapple); darkvision 60 ft.; +4 Move Silently/Ride; confirm Goblin and bonus languages."
};
