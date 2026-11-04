---
name: ruleset-conversion
description: Convert user-owned game books (PDF, HTML, or other VTT exports) into fully playable, searchable Kraken VTT campaigns for private home use. Produces journals, tables, items, NPCs, character templates, and rules summaries without embedding any third-party rules text in the skill itself.
---

# Kraken VTT: Ruleset Conversion Skill

You convert game books the user owns into a playable campaign inside Kraken VTT. This is for private home use only. You work exclusively from material the user supplies. You do not distribute, republish, or include large blocks of protected text in any public output.

The goal is game-night ready: searchable journals, tables, items, NPCs, character building support, and enough structure that the GM can run the game with the tools already in Kraken.

## Boundaries

- Use only the files, PDFs, HTML, or exports the user gives you.
- Extract mechanics, tables, item stats, NPC stats, and rules text into Kraken records so the user can search and reference them at the table.
- Do not invent rules. If something is ambiguous or missing, flag it and ask.
- Prefer short, accurate extracts over copying entire chapters. Journals can hold longer reference text the user needs.
- The skill itself stays system-agnostic. No specific game formulas, class lists, or protected content live in this document.

## What "game-night ready" means

A successful conversion produces:

1. **Searchable journals** — chapters, rules summaries, spell/ability descriptions, monster entries, and adventure text the GM can search and quote.
2. **Tables** — random encounter tables, treasure tables, reaction tables, etc., as Kraken tables that can be rolled.
3. **Items** — weapons, armor, gear, magic items with stats, weight, and descriptions.
4. **NPCs / Monsters** — stat blocks that can be added to the combat tracker.
5. **Character support** — race/class/ability templates or notes so `kraken_build_character` or manual creation works, plus any house rules.
6. **Encounters and parcels** — prepared encounters and treasure parcels where the source provides them.
7. **A short conversion report** — what was created, what was approximated, and what still needs the GM's eyes.

## Neutral record types to produce

Kraken stores everything as records. Prefer these types:

- `note` or `journal` — searchable text (rules chapters, spell lists, monster descriptions, adventure text).
- `item` — equipment, weapons, armor, consumables, magic items.
- `npc` — monsters and named NPCs with hit points, attacks, abilities.
- `table` — any random table.
- `encounter` or `battle` — prepared fights.
- `parcel` — treasure.
- `character` — pregens or templates when useful.

Use the existing MCP tools to create them (`kraken_record_create`, `kraken_library` where appropriate, etc.). Always list first if you need an id.

## Conversion process

1. **Inventory the source**
   - List every PDF, HTML file, or export the user provided.
   - Identify major sections: core rules, character creation, equipment, spells/powers, monsters, adventures, tables.

2. **Extract structure first**
   - Create high-level journals that serve as a table of contents and rules index.
   - Note the game's core resolution mechanic in a short journal entry (attribute + skill, dice pool, d20 + modifier, etc.) so the GM and you can refer to it.

3. **Build the mechanical pieces**
   - **Items**: Create an `item` record for each significant piece of gear. Include name, weight, cost (if given), damage or armor value, and a short description. Link to a journal for longer flavor if needed.
   - **Tables**: Convert every useful random table into a Kraken table record. Preserve the dice and results.
   - **NPCs / Monsters**: Create `npc` records with the key numbers (hit points or hit dice, armor/AC, attacks, special abilities). Put the full description in a linked journal or in the NPC's notes field.
   - **Spells / Abilities**: Create journal entries or power-like records. Include level, casting time, range, duration, and effect. Make them searchable.

4. **Character creation support**
   - Create journal entries that walk through character creation for this system.
   - If the system maps cleanly to attributes, skills, or packages, document the mapping so the GM (or a later agent) can use `kraken_build_character` or manual editing.
   - Produce a few sample pregenerated characters if the source includes them.

5. **Adventures and encounters**
   - Turn adventure modules into journals (keyed by location or scene).
   - Convert prepared encounters into encounter/battle records.
   - Convert treasure into parcels.

6. **Validate and iterate**
   - After a batch of records, use `kraken_records_list` and spot-check a few with `kraken_record_get`.
   - Roll a couple of tables to confirm they work.
   - Add an NPC to the combat tracker and verify the important numbers appear.
   - Fix anything that is broken or incomplete before moving on.

7. **Final report**
   - List every major category created (number of items, NPCs, tables, journals).
   - Note any approximations or gaps.
   - Tell the GM which journals to open first and how to start a session.

## Using the tools

- Start with `kraken_status` and `kraken_campaigns` so you know which campaign you are writing into.
- Use `kraken_record_create` for new journals, items, NPCs, tables, etc.
- Use `kraken_records_list` and `kraken_record_get` to avoid duplicates and to verify.
- For books already imported as Fantasy Grounds modules, prefer `kraken_books` and `kraken_library` instead of re-creating everything.
- When the source is raw PDF or HTML, extract the text yourself and write the records.

## Iteration rules

- Work in batches. Do not try to convert an entire 300-page book in one pass if it risks errors.
- After each major section, validate a sample and fix problems before continuing.
- If a mechanic cannot be cleanly represented with existing tools, document it clearly in a journal and note it in the final report rather than forcing a broken implementation.
- Keep a running conversion log (as a journal or in chat) so the GM can see progress and you can resume later.

## Example journal structure (neutral)

A rules journal might contain:

```
# Core Resolution
The system uses [dice pool / d20 + modifier / etc.].
Success is [condition].

# Character Creation Summary
1. Choose [concept / ancestry / etc.]
2. Assign [attributes / skills / etc.]
3. ...

# Important Tables
See the following table records: [list]
```

An item journal or the item record itself should hold the mechanical stats. Longer lore can live in a separate note.

## What to flag for the GM

- Any rule that required interpretation.
- Tables or lists that were incomplete in the source.
- Mechanics that still need a custom roll formula or effect.
- Suggested next steps (import more books, build a few characters, run a test combat).

## Final notes

This skill produces a private, personal conversion. The records live in the user's campaign. The skill document itself contains no protected rules content and can be shared freely.

When you finish, tell the GM the conversion is ready, point them at the main journals, and offer to run a short test session or fix anything they spot.
