# Kraken VTT: source audit, 0.1.0-alpha.56

Audit only. Nothing in this list has been patched in the tree.

Reviewed on 2026-11-06 against commit [`41617678`](https://github.com/krakenunbound/kraken-vtt/commit/41617678e903a2cc758a67045bb23ada8e85982d) (`main`). This is a reading of the host, combat, the two included games, accounts, and the sheet paths. It is not a live Windows playtest, so installer, multi-monitor, and GPU bugs are out of scope.

[`BUGLIST.md`](BUGLIST.md) is the older playtest list. Every item there is marked fixed by alpha.28. This file is the later pass. There were no open GitHub issues at the time of the audit.

Severity: **high** (wrong rules in a normal click, or a player can rewrite the sheet), **medium** (wrong in a real case, or easy to miss), **low** (edge or only with a crafted client).

| # | Severity | Bug | Where |
|---|---|---|---|
| 1 | high | 5E and Descending Darkness damage still lands on a miss, and a crit sticks to the next swing | `electron/combat.cjs` `attack5e`, `damage5e` |
| 2 | medium | A player can skip the sheet whitelist and replace their character | `electron/tableServer.cjs` `op`, `electron/records.cjs` `canEdit` |
| 3 | medium | An Apeira Astra character at 0 Stamina is Down but still acts | `electron/combat.cjs` `health`, `skips` |
| 4 | medium | Descending Darkness Dread is stored and labeled, never rolled | `src/characters/Sheet5e.tsx`, `electron/dnd5e.cjs` `check5e` |
| 5 | medium | Advantage or disadvantage on an in-combat save skips tracker effects | `src/characters/Sheet5e.tsx` |
| 6 | medium | A spell critical sticks to that target's next damaging spell | `electron/combat.cjs` `cast5e` |
| 7 | medium | Temporary hit points never absorb damage | `electron/combat.cjs` `vitals`, `applyWounds` |
| 8 | low | A creature with 0 max Health is always Healthy | `shared/map/geometry.mjs` `healthStatus` |
| 9 | low | Descending Darkness still accepts a 5E death save | `electron/combat.cjs` `deathSave` |
| 10 | low | Untrained Tactics adds 0 to Apeira Astra initiative, not −3 | `shared/astra/rules.mjs` `derive` |
| 11 | low | 5E weapon damage is forced to at least 1 | `electron/combat.cjs` `damage5e` |

Suggested order: 1, then 6, then 3, then 4, then 2. Each fix wants a check next to the code it changes (`dnd5e`, `descending-ui`, `astra-ui`, `session`).

---

## 1. High. Damage ignores the attack, and a crit sticks

`attack5e` (D&D 5E and Descending Darkness, because both are d20 rulesets) records hit or miss, then sets `critNext` only when some die is a natural 20. It never clears that flag on a miss, a natural 1, or a later attack.

`damage5e` then wounds every creature still targeted, hit or miss, and doubles the dice if `critNext` is still set. The flag is cleared only after that damage roll.

```js
// electron/combat.cjs, attack5e / damage5e
if (source && crit) source.critNext = true;
// ...
const crit = Boolean(plan.entry?.critNext);
if (crit) formula = doubled(formula);
const amount = Math.max(1, roll.total);
for (const target of targets) await applyWounds(target, amount, ...);
```

One crit in a multi-target attack flags the whole next damage roll, so a miss in the same swing is doubled too.

Apeira Astra does not do this: it stores the Effect only on hits (`effectOn`). Castles & Crusades matches Fantasy Grounds here (attack and damage are separate buttons the table chooses to press), so that ruleset is a footgun, not a rules break. Descending Darkness's own book says a natural 1 always misses.

**Reproduce**

1. Descending Darkness or D&D 5E. Put a character and a foe on the tracker. Target the foe.
2. Attack and miss (or force a natural 1). Press Damage. The foe still takes damage.
3. Attack and crit. Attack again and miss, without rolling damage in between. Press Damage. The roll is still marked critical, and every creature still targeted takes the doubled dice.

**Suggested fix**

- At the start of `attack5e`, set `source.critNext = false`.
- Remember which target ids actually hit, and which of those were criticals (`source.hitOn = { [id]: "hit" | "crit" }`), the way Astra remembers `effectOn`.
- In `damage5e`, roll damage only for ids in `hitOn`. Double the dice only for the ids marked `crit`. A shared damage roll is fine when every remaining target has the same crit flag; otherwise roll per target.
- Clear `hitOn` when damage is rolled, and when a new attack starts.
- Do not change the C&C path unless you want the same "damage only on a hit" rule there too.
- Test: miss then damage deals 0 and says it missed; crit then a second miss does not crit; two targets, one crit and one miss, only the crit is doubled.

## 2. Medium. The record op bypasses the sheet whitelist

Sheet edits go through `editCharacter`, `edit5e`, and `editAstra`. Those allow a list of paths and then re-derive the sheet. Any joined player can skip that:

```js
// electron/tableServer.cjs
if (msg.type === "op") {
  if (msg.op === "update") record = records.update(msg.id, msg.patch, seat, { replace: msg.replace === true });
}
```

`canEdit` in `electron/records.cjs` allows the owner. A player can send `replace: true` and a full character JSON (Health, Defense, attacks, slots) and the host keeps it. They can also `create` records owned by themselves.

This is fine on a trusted table. It is not fine if the browser is treated as untrusted. The GM seat itself is in better shape: `decideRole` only grants DM on loopback with the host token, and a second seat cannot take DM.

**Suggested fix**

- For `type === "character"`, reject `op` `update` with `replace: true` unless the seat is the GM, and reject data patches that are not the whitelisted paths. Send players through `character-edit`.
- Or drop player use of `op` `update` / `create` for rules records and keep `op` for notes only.
- GM and the agent can keep full `op`.
- Test: a player `op` that sets `hp.total` is refused; the same change through `character-edit` still works; a note update still works.

## 3. Medium. Apeira Astra "Down" still acts

At 0 Stamina the tracker renames Dying to Down, which matches the Crew Handbook ("out of the fight"):

```js
// electron/combat.cjs
if (astraOn() && status.status === "Dying") return { ...status, status: "Down", color: "#6C2DC7" };
```

Thresholds are right: a character is dead at minus Grit, a creature is dead at 0.

`skips()` only skips status `"Unconscious"`. Down is not that, so a Down character stays in the turn order, and the sheet's attack buttons stay live. They can attack at 0 Stamina.

**Suggested fix**

- Treat `"Down"` like unconscious for turn order: skip the turn (do not skip a creature that is only wounded).
- In `attackAstra` and `weaponAstra`, refuse when `health(entry).status` is `"Down"` or `"Dead"`.
- Healing from Down already exists. Leave that.
- Test: at 0 Stamina the row says Down, Next skips them, Attack is refused, a heal brings them back into the order.

## 4. Medium. Dread never changes a roll

The Descending Darkness sheet says 3 or more Dread is disadvantage on Wisdom, and 6 is Broken (`src/characters/Sheet5e.tsx`, the Dread track). `check5e` in `electron/dnd5e.cjs` never reads `data.dread`. Wisdom checks, Wisdom saves, and the Wisdom 12 steady roll all ignore it unless someone sets the Advantage dropdown by hand. Broken is only a label. The value is stored (`edit5e` allows `dread`).

**Suggested fix**

- In `check5e`, when the campaign or the character is Descending Darkness, the roll is Wisdom (ability or a Wisdom skill), and `dread >= 3`, force disadvantage. If the player also chose advantage, they cancel (one die), same as 5E.
- Use the same rule in `stabilize` (the Wisdom 12 steady).
- Do not auto-apply Dread to attacks. The book says checks and saves.
- At 6, the roll can still be made; the GM already decides how Broken looks. Optional: put "Broken" on the tracker row so it is not only on the sheet.
- Test: Dread 2, a Wisdom check is one d20; Dread 3, it is `2d20kl1`; Dread 3 with advantage chosen, one d20.

## 5. Medium. Advantage on an in-combat save skips the tracker

```js
// src/characters/Sheet5e.tsx
if (kind === "save" && inFight && !advantage) session.ct("save", { id: inFight.id, attribute: key, cl: dc });
else session.siegeCheck(...);
```

The tracker path is the one that applies SAVE effects (Bless and the rest). Choosing advantage or disadvantage sends a plain chat check instead, so those effects are dropped. `combat.save` / `save5e` also has no advantage argument, so the sheet cannot ask for both.

**Suggested fix**

- Pass `advantage` on the `ct` `save` message.
- In `save5e` and the C&C `save`, roll `2d20kh1` or `2d20kl1` when asked, and still add `effectDice(entry, "SAVE")` and `effectBonus`.
- Always use the tracker when `inFight` is set.
- Test: a save with disadvantage in a fight still shows the effect bonus, and the dice are keep-lowest.

## 6. Medium. A spell critical sticks to the target

On a spell attack, a natural 20 sets `target.critNextIncoming`. That flag is cleared only when a later damage roll actually lands (`cast5e` in `electron/combat.cjs`). A crit that a save then negates, or any later miss, leaves the flag up. The next damaging spell against that creature is a critical even if that roll was not a 20.

**Suggested fix**

- Set the flag only for this cast, on a local map, not on the entry.
- Or clear `critNextIncoming` at the end of the target loop always, and do not read a flag left by an older cast.
- Double the dice only when this roll was a natural 20 and the damage lands.
- Test: spell attack crits, the save succeeds for no damage, the next spell attack is not a crit unless its own die is a 20.

## 7. Medium. Temporary hit points are cosmetic

The 5E sheet edits `hp.temp`. `vitals()` and `applyWounds()` only use `hp.total` and `hp.wounds`. Damage never spends temporary hit points first, and the tracker does not show them.

**Suggested fix**

- In `applyWounds`, when `delta > 0` and the character has `hp.temp`, subtract from temp first and only then add wounds.
- Healing should not fill temp HP (5E). Temp HP does not stack; the sheet can keep the current "type a number" behaviour.
- Show temp on the tracker row next to Health when it is not 0.
- Test: 5 temp and 3 damage leaves wounds unchanged and temp 2; 5 temp and 8 damage adds 3 wounds and clears temp.

## 8. Low. 0 max Health is always Healthy

`healthStatus` in `shared/map/geometry.mjs` returns Healthy when `hp <= 0`, before the dead check:

```js
if (hp <= 0 || hurt <= 0) status = "Healthy";
else if (hp - hurt <= dead) status = "Dead";
```

A tracker entry whose max HP was cleared never shows Dead, no matter the wounds. `hurt <= 0` meaning Healthy is right. `hp <= 0` is not, once wounds exist. An untouched 0 HP creature can stay Healthy; a wounded one should not.

**Suggested fix**

- If `hp <= 0` and `hurt > 0`, status is Dead.
- If `hp <= 0` and `hurt <= 0`, keep Healthy (nothing has happened) or Dead, and pick one in the test so it does not flap.
- Test: HP 0, wounds 0, Healthy; HP 0, wounds 1, Dead.

## 9. Low. Descending Darkness still accepts a 5E death save

The sheet hides the death-save button when `dying === "bleed"`. `deathSave` only checks that the status is Dying. A crafted `ct` message `{ action: "death-save" }` applies 5E rules on a Descending Darkness character: three failures kill, a natural 20 wakes them, instead of the bleed. Steady and the 1 Health bleed themselves look correct, and `verify-descending-ui` covers that happy path.

**Suggested fix**

- At the top of `deathSave`, if `bleeds()` throw "Descending Darkness does not use death saves."
- Test: the message is refused on a Descending Darkness table and still works on D&D 5E.

## 10. Low. Untrained Tactics on Apeira Astra initiative

The Crew Handbook's general rule is that a skill you do not have is −3. Initiative is "2d6 + Reflex modifier + Tactics". `derive()` does this:

```js
// shared/astra/rules.mjs
total: data.characteristics.reflex.dm + num(data.skills.tactics?.level, 0) + num(input.initiative?.misc, 0)
```

Missing Tactics adds 0, not −3. A Tactics roll from the sheet does apply −3 (`taskModifier`). Level 0 is trained (the improve rules say a new skill at 0 costs 1), so only a missing skill should be −3.

**Suggested fix**

- If this is meant to be a skill roll: use `taskModifier`'s untrained rule for Tactics inside `derive()`'s initiative total, and the same bonus in `rollInit` for characters (it already uses `initiative.total`).
- If initiative is deliberately "add Tactics if you have it": say that in the Handbook's Combat page so it does not contradict Untrained.
- Test whichever rule you pick, including a character with Tactics 0 (trained, +0, not −3).

## 11. Low. 5E damage is forced to at least 1

`damage5e` uses `Math.max(1, roll.total)`. A roll that totals 0 still deals 1. Apeira Astra correctly allows 0 when armour stops the hit. C&C does the same floor on purpose (CoreRPG: damage is at least 1 when dice were rolled), so leave that path alone.

**Suggested fix**

- In `damage5e` only, use `Math.max(0, roll.total)`.
- If the total is 0, say so in chat and do not call `applyWounds`.
- A critical still doubles the dice; it does not need a fake point.
- Test: a damage formula of `1d1-1` can total 0 and the target's wounds do not change. (Or force the die.)

---

## What looks solid

- The GM seat: DM requires loopback plus the host token (`decideRole` in `electron/tableServer.cjs`). A second seat with the token from another address stays a player.
- Accounts: scrypt password hashes, session tokens stored as SHA-256, timing-safe compare.
- Campaign ids are stripped to hex before they become a folder name (`electron/campaigns.cjs`).
- Book HTML keeps an allow-list of tags and escapes text (`toHtml` in `electron/books.cjs`). Chat is rendered as text, not HTML.
- Static files and sound ids are not an obvious path traversal. Sound files come from an index. On Windows, `serveWeb` rejects `..` after `path.win32.normalize`.
- The MCP agent listens on 127.0.0.1, rejects a browser `Origin`, and requires the bearer token in `~/.kraken-vtt/agent.json`. Arbitrary file read and write exist only as GM agent tools (`kraken_character_import` / `kraken_character_export`). That is local-assistant power, not a player hole, as long as that token stays on the GM's machine.
- Apeira Astra attack damage subtracts armour and only applies the Effect to creatures the attack hit.
- Descending Darkness bleed and the Wisdom 12 steady match the Player's Handbook, apart from Dread (bug 4) and the death-save back door (bug 9).

## Not in this list

- Everything already marked fixed in [`BUGLIST.md`](BUGLIST.md).
- Missing 5E systems that the code does not pretend to run (resistance, vulnerability, concentration checks). Those are gaps, not a wrong result from a button that exists.
- Names with no account. Anyone on the LAN can sit as a name that has no password and take characters owned by that name. That matches the current account rules. Make the account before handing out the character if the table is not fully trusted.
