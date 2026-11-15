// A progress track (FG's and Foundry's ten-box track, as Ironsworn and
// Starforged keep their vows, journeys, fights, bonds and legacies): ten boxes
// of four ticks each, a box filling a tick at a time. The core's, so a sheet's
// part and the combat tracker (a foe's progress) draw the same track. Its
// classes are still iron-boxes / iron-box, the look the sheets have had.

const MAX_BOXES = 10;
// Full boxes in so many ticks.
const boxesOf = (ticks: number) => Math.max(0, Math.min(MAX_BOXES, Math.floor((Number.isFinite(Number(ticks)) ? Number(ticks) : 0) / 4)));

export function ProgressBoxes({ ticks, label }: { ticks: number; label?: string }) {
  return (
    <span className="iron-boxes" aria-label={label ?? `${boxesOf(ticks)} of 10 boxes`} data-ticks={ticks} title={`${ticks} ticks: ${boxesOf(ticks)} boxes`}>
      {Array.from({ length: MAX_BOXES }, (_, index) => {
        const fill = Math.max(0, Math.min(4, ticks - index * 4));
        return <span key={index} className={`iron-box fill-${fill}`} />;
      })}
    </span>
  );
}
