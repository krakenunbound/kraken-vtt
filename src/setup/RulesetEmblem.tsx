import type { ReactElement } from "react";

// A ruleset's emblem on the campaign screen: the GM's own picture for it, if
// they put one in their data folder (assets/rulesets, named as the ruleset:
// "D&D 3.5E.png"), else Kraken's own medallion. Kraken ships no game's
// official logo (they are their publishers' marks); a GM who owns the books
// may add them on their own computer.

// The ruleset's name as a file's: letters and digits only ("D&D 3.5E" -> "dd35e").
export const emblemKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

// Each glyph drawn in a 40 x 40 box, centred in the medallion.
const GLYPHS: Record<string, ReactElement> = {
  // Castles & Crusades: a keep's tower.
  castlescrusades: (
    <>
      <path d="M8.5 31.5V18.5h2.4v-2.2h2v2.2h2v-2.2h2V31.5zM23.1 31.5V18.5h2v-2.2h2v2.2h2v-2.2h2.4v15.2zM16.2 31.5V11.5h1.6V9h1.6v2.5h1.2V9h1.6v2.5h1.6v20z" />
      <path d="M18.2 31.5v-4.6a1.8 1.8 0 0 1 3.6 0v4.6" fill="rgba(4,7,11,0.9)" stroke="none" />
    </>
  ),
  // D&D 5E: a d20.
  dd5e: (
    <>
      <path d="M20 8.5 30.5 14.5v11L20 31.5 9.5 25.5v-11z" fill="none" />
      <path d="M20 8.5 14 19h12zM14 19l-4.5 6.5M26 19l4.5 6.5M14 19l6 12.5L26 19M9.5 14.5 14 19M30.5 14.5 26 19" fill="none" />
    </>
  ),
  // D&D 3.5E: a sword.
  dd35e: <path d="M20 6.5 22 10v14h-4V10zM13.5 24h13v2.4h-13zM18.6 26.4h2.8v5h-2.8zM20 31.4a2.2 2.2 0 1 1 0 .01z" />,
  // AD&D 2E: a knight's shield.
  add2e: (
    <>
      <path d="M20 8.5 29.5 12v7c0 6.4-4 10.6-9.5 12.5C14.5 29.6 10.5 25.4 10.5 19v-7z" fill="none" />
      <path d="M20 11.5v17M13.5 17.5h13" fill="none" />
    </>
  ),
  // Traveller: a ringed world.
  traveller: (
    <>
      <circle cx="20" cy="20" r="6.5" />
      <ellipse cx="20" cy="20.5" rx="12.5" ry="4" fill="none" transform="rotate(-18 20 20)" />
    </>
  ),
  // Descending Darkness: a lantern.
  descendingdarkness: (
    <>
      <path d="M16 13h8l1.5 3v11L24 30h-8l-1.5-3V16zM17.5 9.5h5V13h-5z" fill="none" />
      <path d="M20 17.5c2 2.2 2.4 4.2 0 7-2.4-2.8-2-4.8 0-7z" />
    </>
  ),
  // Apeira Astra: a four-pointed star.
  apeiraastra: <path d="M20 7.5 22.6 17.4 32.5 20 22.6 22.6 20 32.5 17.4 22.6 7.5 20 17.4 17.4z" />,
  // Basic Fantasy: a six-sided die (3d6 in order).
  basicfantasy: (
    <>
      <path d="M20 8.5 30.5 14v12L20 31.5 9.5 26V14z" fill="none" />
      <path d="M9.5 14 20 19.5 30.5 14M20 19.5v12" fill="none" />
      <circle cx="20" cy="13.8" r="1.6" />
      <circle cx="14" cy="21.5" r="1.4" />
      <circle cx="16.5" cy="26" r="1.4" />
      <circle cx="23.5" cy="22" r="1.4" />
      <circle cx="27" cy="25.5" r="1.4" />
    </>
  ),
  // Worldbuilding: a compass rose.
  worldbuilding: (
    <>
      <circle cx="20" cy="20" r="10.5" fill="none" />
      <path d="M20 10.5 22.2 20 20 29.5 17.8 20zM10.5 20 20 17.8 29.5 20 20 22.2z" />
    </>
  ),
};

export function RulesetEmblem({ name, picture, size = 44 }: { name: string; picture?: string; size?: number }) {
  if (picture) return <img className="ruleset-emblem own" src={picture} alt="" width={size} height={size} draggable={false} />;
  const glyph = GLYPHS[emblemKey(name)];
  const letters = name
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <svg className="ruleset-emblem" viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
      <circle cx="20" cy="20" r="18.5" className="emblem-ring" />
      <circle cx="20" cy="20" r="16" className="emblem-inner" />
      <g className="emblem-glyph">
        {glyph ?? (
          <text x="20" y="24.5" textAnchor="middle">
            {letters}
          </text>
        )}
      </g>
    </svg>
  );
}
