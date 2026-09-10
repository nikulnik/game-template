// The extension is what lets `node --test` load this module and the one it needs straight from
// TypeScript, which is how the rule below is tested (see test/view.test.ts).
import { PPM } from '../physics/Physics.ts';

/**
 * The least of the world a screen ever shows, in metres: room enough either side of the core to
 * build a fort, and headroom enough over it that something coming down is seen coming. A screen
 * too small to show that much at the size the game is drawn at is drawn smaller until it does,
 * which is what a phone gets.
 */
const LEAST = { width: 11, height: 8 };
/**
 * And the most it ever shows. Past this the fort is a speck at the bottom of an empty sky and a
 * brick is a few pixels across, so a screen bigger than the game is drawn for is given the same
 * arena drawn bigger rather than more of the world. Between the two the game is drawn at exactly
 * the size it is written in, which is every ordinary window on every ordinary monitor.
 */
const MOST = { width: 40, height: 26 };

/**
 * The HUD is drawn at its own size on a screen this wide and this tall, and shrunk with a smaller
 * one, so that its row of buttons never takes the whole of a small screen — the width is what its
 * buttons wrap against, and the height what a row of them is measured against, which is what a
 * long, shallow window is short of. It is never drawn below this much of itself, where a finger
 * would have nothing left to hit, nor above this much, which is where a very large screen stops
 * making it bigger.
 */
const HUD_WIDTH = 1000;
const HUD_HEIGHT = 500;
const HUD_LEAST = 0.8;
const HUD_MOST = 2;

/** What a screen shows of the world, and how big it is drawn. */
export interface View {
  /** How many pixels of the screen one metre of the world is drawn across. */
  readonly ppm: number;
  /**
   * What everything the game draws is scaled by: `ppm / PPM`. Views are drawn in the pixels the
   * physics is written in (see `toPixels`), and this is the one factor that carries them onto the
   * screen, so nothing anywhere else has to know what size the screen is.
   */
  readonly scale: number;
  /** How much of the world the screen shows, in metres. */
  readonly width: number;
  readonly height: number;
}

/**
 * How much of the world a screen of this size shows, and how big to draw it.
 *
 * Fewer metres on the screen means a bigger scale, so the most the world may be shown of is the
 * least it may be drawn at, and the least it may be shown of the most: the two bounds meet in a
 * range of scales, and the game is drawn at the size it is written in wherever that range allows
 * it, which is every window between about six hundred and two thousand pixels across. Outside the
 * range the nearer bound wins, so a small screen sees less of the world rather than a fort of
 * specks, and a huge one sees the same arena drawn twice the size rather than twice the arena.
 *
 * Nothing is letterboxed and nothing is stretched: the scale is one number for both axes, and
 * whatever room the screen's shape leaves over is more world — sky above a tall screen, floor
 * beside a wide one. A screen so long one way that it cannot have both bounds at once keeps the
 * cap on how much it shows and gives up the floor under it, which is the milder of the two: a
 * little less room to build beats a fort too small to see.
 */
export function fitView(screenWidth: number, screenHeight: number): View {
  const width = Math.max(1, screenWidth);
  const height = Math.max(1, screenHeight);
  const least = Math.max(width / MOST.width, height / MOST.height);
  const most = Math.min(width / LEAST.width, height / LEAST.height);
  const ppm = Math.max(least, Math.min(PPM, most));
  return { ppm, scale: ppm / PPM, width: width / ppm, height: height / ppm };
}

/**
 * What the HUD is drawn at on a screen of this size showing this view: its own size on any
 * ordinary window, smaller on a small one so that its buttons wrap into a row or two rather than a
 * wall of them, and bigger on a screen the world itself is drawn big on, so that the two keep
 * step — but never bigger than the screen has the height to spare for, since a window twice as
 * wide as the world is drawn for is still only as tall as it is.
 */
export function fitHud(screenWidth: number, screenHeight: number, view: View): number {
  const room = Math.min(Math.max(1, screenWidth) / HUD_WIDTH, Math.max(1, screenHeight) / HUD_HEIGHT);
  return Math.max(HUD_LEAST, Math.min(HUD_MOST, view.scale, room));
}
