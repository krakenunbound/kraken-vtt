// Grid cells with their own width and height (the Grid tab's Width x Height,
// unlinked): snapping, distances by every diagonal rule, paths, token
// footprints, spell areas' squares, the draw tool's box and the GM's settings
// over a scene. A square grid measures as before.
import { gridDistance, gridFromSquare, gridSizeY, pathDistance, snapCenter, withGrid } from "../shared/map/geometry.mjs";
import { coveredSquares, footprint, place, toPixels } from "../shared/actions/areas.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// 66 px across, 50 px down, 5 ft a cell, from the picture's corner.
const scene = withGrid({ width: 1320, height: 1000, padding: 0, grid: { size: 100, type: 1, distance: 5 } }, { size: 66, sizeY: 50 });
assert(scene.grid.size === 66 && gridSizeY(scene) === 50, `the GM's width and height over the scene: ${JSON.stringify(scene.grid)}`);
assert(gridSizeY(withGrid(scene, { size: 70 })) === 70, "linked again (no sizeY): square cells");
assert(gridSizeY({ grid: { size: 100, sizeY: 60, type: 2 } }) === 100, "a hex grid stays regular");

assert(same(snapCenter(scene, 100, 80), { x: 99, y: 75 }), `a token snaps to its cell's centre: ${JSON.stringify(snapCenter(scene, 100, 80))}`);
assert(same(snapCenter(scene, 140, 110, 2), { x: 132, y: 100 }), `a 2x2 token on four cells: ${JSON.stringify(snapCenter(scene, 140, 110, 2))}`);

const a = { x: 33, y: 25 };
assert(gridDistance(scene, a, { x: 33 + 66 * 4, y: 25 }) === 20, "four cells across: 20 ft");
assert(gridDistance(scene, a, { x: 33, y: 25 + 50 * 4 }) === 20, "four cells down: 20 ft");
assert(gridDistance(scene, a, { x: 33 + 66 * 3, y: 25 + 50 * 4 }) === 20, "3 across and 4 down, every square one: 20 ft");
assert(gridDistance(scene, a, { x: 33 + 66 * 3, y: 25 + 50 * 4 }, 1.5) === 25, "5-10-5: 25 ft");
assert(gridDistance(scene, a, { x: 33 + 66 * 3, y: 25 + 50 * 4 }, "raw") === 25, "a straight line, 3-4-5 cells: 25 ft");
assert(pathDistance(scene, [33, 25, 33, 225, 297, 225], 1).total === 40, "a path down four, across four: 40 ft");

assert(same(footprint({ x: 132, y: 100, squares: 2 }, 66, 50), [{ x: 99, y: 75 }, { x: 99, y: 125 }, { x: 165, y: 75 }, { x: 165, y: 125 }]), "a 2x2 token's cells");
const grid = { gridPx: 66, gridPxY: 50, originX: 0, originY: 0, feetPerSquare: 5 };
const cube = place({ shape: "square", size: 10 }, null, 140, 130, grid);
const cells = coveredSquares(toPixels(cube, 66, 5), grid, 50);
assert(cells.length > 0 && cells.every((cell) => (cell.y - 25) % 50 === 0 && (cell.x - 33) % 66 === 0), `a cube's squares are the grid's cells: ${JSON.stringify(cells)}`);
assert(cube.y % 50 === 0, `a 2-cell cube lines up with the rows: ${cube.y}`);

assert(same(gridFromSquare({ x: 10, y: 20 }, { x: 76, y: 70 }, { x: 0, y: 0 }, false), { size: 66, sizeY: 50, offsetX: 10, offsetY: 20 }), "unlinked, the box is the cell");
assert(same(gridFromSquare({ x: 10, y: 20 }, { x: 76, y: 82 }), { size: 64, sizeY: null, offsetX: 10, offsetY: 20 }), "linked, a near-square box averages to a square");

// A square grid as before.
const square = { width: 1000, height: 1000, padding: 0, grid: { size: 100, type: 1, distance: 5 } };
assert(gridDistance(square, { x: 50, y: 50 }, { x: 450, y: 350 }, 1.5) === 25 && same(snapCenter(square, 130, 260), { x: 150, y: 250 }), "a square grid measures and snaps as before");
console.log("ok grid cells: width x height unlinked (66 x 50): snapping, distances by each rule, paths, footprints, spell areas' cells, the draw tool's box; linked and hex grids square as before");
