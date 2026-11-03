# Kraken's own sounds

These ship with Kraken VTT and may be handed out with it.

- `sfx/`, `ambience/`, `oneshots/` (voices): made with ElevenLabs (sound effects and text to speech) on the project's own account, from the prompts in `electron/soundCatalog.cjs`. `generated.json` records the words each was made from.
- `music/`: made locally with YuE2 Studio (the YuE model, Apache-2.0).

No Syrinscape sounds are here: those are licensed and may not be handed out.

Remake any of them with `npm run sounds -- --only <folder> --force` (needs `.env.local`; see PLAN.md). A GM's own sounds go in their app data (`assets/sounds`); a file there with the same path wins.
