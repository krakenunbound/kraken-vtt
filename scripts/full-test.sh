#!/bin/bash
# The full pre-release run: books, host checks, UI tests, the D&D sheet press
# tests and the 16-game end-to-end run. Run from Git Bash:  bash scripts/full-test.sh
# Logs go to $TEMP/full-test/<name>.log. The UI tests and the e2e open the GM's
# app and test players' Chrome on the left monitor (KRAKEN_WINDOW_AT) and take
# focus while they run, so run it when nobody needs the computer.
# --window-less runs only the build, coverage and the checks that open no windows.
cd "$(dirname "$0")/.." || exit 1
export KRAKEN_WINDOW_AT="${KRAKEN_WINDOW_AT:--2500,40}"
LOG="$TEMP/full-test"
mkdir -p "$LOG"
pass=0; fail=0; failed=""
run() {
  local name="$1"; shift
  if timeout "${T:-1500}" "$@" > "$LOG/$name.log" 2>&1; then pass=$((pass+1)); echo "ok   $name"; else fail=$((fail+1)); failed="$failed $name"; echo "FAIL $name: $(grep -m2 -i 'error\|fail\|problem' "$LOG/$name.log" | cut -c1-200 | tr '\n' ' ')"; fi
}

if [ "$1" = "--window-less" ]; then
  gui=$(grep -l -E "electron\.launch|chromium\.launch|startKraken|_electron|playwright" scripts/check-*.mjs | xargs -n1 basename | sed 's/\.mjs//' | tr '\n' ' ')
  run build npm run build
  run coverage npm run coverage
  for f in scripts/check-*.mjs; do
    n=$(basename "$f" .mjs)
    case " $gui check-tiles " in *" $n "*) continue;; esac
    run "$n" node "$f"
  done
  run check-tiles npx tsx scripts/check-tiles.mjs
  echo "TOTAL: $pass passed, $fail failed:$failed (skipped, they open windows: $gui)"
  exit 0
fi

run build-games npm run build-games
run build-packs npm run build-packs
run tsc npx tsc --noEmit -p .
run coverage npm run coverage
run build npm run build
for s in check-astra check-ironsworn check-forged check-fate check-bfrpg check-cairn check-srd5e check-dnd5e check-dnd35 check-adnd2e check-mgt2 check-combat check-combat-fixes check-audit check-party check-books check-packs check-dice check-setup check-starships check-code-mode check-assistant check-open-art check-studio-server check-studio-bridge check-studio-fg check-studio-tools check-map-play check-map check-walls check-content check-session-tools check-port-mapping check-campaign-files check-targeting check-templates check-cards check-effects check-cast-text check-spell-parse check-action-links check-modifiers check-chat-flow check-bookkeeping; do
  [ -f "scripts/$s.mjs" ] && run "$s" node "scripts/$s.mjs"
done
run check-tiles npx tsx scripts/check-tiles.mjs
for t in verify-settings-ui verify-prefs-ui check-agent-ui verify-tower-ui verify-table-play-ui verify-calendar-notes-ui verify-dicepacks-ui verify-natural-sound-ui verify-studio-ui verify-open-art-ui verify-dnd5e-ui verify-bfrpg-ui verify-cairn-ui verify-fate-ui verify-forged-ui verify-ironsworn-ui verify-astra-ui verify-mgt2-ui verify-charselect-ui verify-core-parts-ui verify-core-wizard-ui verify-bfrpg-sheet-ui verify-dnd35-ui verify-adnd2e-ui verify-descending-ui verify-map-play-ui verify-content-ui verify-session-ui verify-invite-ui verify-campaigns-ui verify-targeting-ui verify-dicechat-ui verify-bookkeeping-ui; do
  [ -f "scripts/$t.mjs" ] && run "$t" node "scripts/$t.mjs"
done
for g in dnd5e descending dnd35 adnd2e mgt2 astra ironsworn starforged fate fae forged; do run "d20-sheet-$g" node scripts/verify-d20-sheet-ui.mjs "$g" "$LOG/d20-$g"; done
T=7200 run e2e node scripts/e2e-ruleset.mjs "Descending Darkness,Apeira Astra,D&D 5E (SRD),Basic Fantasy,Cairn,Ironsworn,Starforged,Fate Core,Fate Accelerated,Forged in the Dark,Castles & Crusades,D&D 5E,D&D 3.5E,AD&D 2E,Traveller,Worldbuilding"
grep -E "^(PASS|FAIL) [^·]*:" "$LOG/e2e.log"
echo "TOTAL: $pass passed, $fail failed:$failed"
git status --short | head -5
