// The extension is what lets `node --test` load this module and the one it needs straight from
// TypeScript, which is how the rule below is tested (see test/view.test.ts).
import { PPM, toMeters } from '../physics/Physics.ts';

/**
 * The world the game is written for, in metres: room enough either side of the core to build a
 * fort, and headroom enough over it that something coming down is seen coming. All of it is on
 * screen on every window that has the shape for it, and a window of another shape keeps whichever
 * side of it is tighter and gets the rest as spare world.
 *
 * This rectangle is the whole of how big things look. It is a *contain* fit — between the two
 * bounds below, `scale` is exactly `min(width / designWidth, height / designHeight)` — so a window
 * shrunk either way draws the world smaller rather than keeping the size and cutting the sides
 * off. It is written as the
 * screen it is drawn against rather than as two round numbers of metres, because that is the one
 * shape where every sprite lands on the pixels it was drawn at: 1920 by 1080 at `PPM` is
 * 38.4 by 21.6 metres, and there `scale` is 1. The 3D twin (src/core/View3d.ts) is written for
 * the same rectangle in its own units, and frames a screen the same way. Two differences to know
 * before comparing them: its `scale` is a world scale and this one is a pixel scale, so a 4K
 * monitor doubles this one and leaves that one alone (both still draw a metre over the same number
 * of screen pixels); and a perspective camera cannot tell a large tall window from a phone, since
 * it sees only shape, so it crops one as it would the other while this half, which can tell, keeps
 * showing all of `WORLD` wherever the pixels are there for it.
 */
const WORLD = { width: toMeters(1920), height: toMeters(1080) };
/**
 * The floor under the rule above, and the only place it gives up: the world is never drawn below
 * half the size it is written at. A window far off the shape the game is written in would
 * otherwise go on shrinking it until a brick was a few pixels across, so past half size it stops
 * and crops instead, and a phone held upright is played on the middle of the fort rather than on
 * all of it as specks. This is the bound that matters most on a phone, where it is pixels that are
 * short rather than shape.
 */
const LEAST_SCALE = 0.5;
/**
 * And the other end: how much world a very wide window is given across before it is drawn bigger
 * instead. A quarter more than the game is written for, past which the fort is adrift in an empty
 * field.
 */
const MOST_WIDTH = WORLD.width * 1.25;

/**
 * The HUD is drawn at its own size on a screen this wide and this tall — the one it is designed
 * against — and scaled with the screen either way from there. It is never drawn below this much of
 * itself, where a finger would have nothing left to hit, nor above this much, where a very large
 * screen stops making it bigger.
 */
const HUD_SCREEN = { width: 1920, height: 1080 };
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
 * The world is drawn smaller until all of `WORLD` is on screen, so a window made narrower or
 * shorter draws everything smaller instead of losing the sides of the fort, and a window made
 * bigger draws the same world bigger. The scale is one number for both axes and whatever room the
 * screen's shape leaves over is spare world — sky above a tall window, floor beside a wide one —
 * so nothing is letterboxed and nothing is stretched.
 *
 * The two bounds on it are `LEAST_SCALE`, which stops the world shrinking for ever on a window far
 * off the shape the game is written in — past it the fort is cropped rather than shrunk, because a
 * little less room to build beats a fort too small to see — and `MOST_WIDTH`, which draws it
 * bigger again on a very wide one.
 */
export function fitView(screenWidth: number, screenHeight: number): View {
  const width = Math.max(1, screenWidth);
  const height = Math.max(1, screenHeight);
  // In pixels per metre: what it takes to hold all of `WORLD`, what half size is, and what it
  // takes to keep a wide window down to `MOST_WIDTH` of world across.
  const contain = Math.min(width / WORLD.width, height / WORLD.height);
  const ppm = Math.max(contain, PPM * LEAST_SCALE, width / MOST_WIDTH);
  return { ppm, scale: ppm / PPM, width: width / ppm, height: height / ppm };
}

/**
 * What the HUD is drawn at on a screen of this size: its own size on the screen it is designed
 * against, smaller on a small one so that its buttons wrap into a row or two rather than a wall of
 * them, and bigger on a screen with the room to spare.
 *
 * It reads the screen and not the view, and that is deliberate: `view.scale` moves with the
 * window's *shape* now, and a HUD that grew as a window was narrowed would be a row of buttons
 * crowding a world that had just been drawn smaller to make room for them. Identical to the 3D
 * twin's, which is the point — a HUD is a HUD whatever is drawing behind it.
 */
export function fitHud(screenWidth: number, screenHeight: number): number {
  const room = Math.min(
    Math.max(1, screenWidth) / HUD_SCREEN.width,
    Math.max(1, screenHeight) / HUD_SCREEN.height,
  );
  return Math.max(HUD_LEAST, Math.min(HUD_MOST, room));
}
