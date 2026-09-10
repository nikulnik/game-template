/**
 * How much of the world a screen shows, and where the camera has to be to show it — the three.js
 * half of the template. The 2D twin is src/core/View.ts; a project keeps one of them.
 *
 * The rule is the same one, solved with a different lever. In 2D the world is drawn in pixels and
 * a `scale` decides how many; here the world is drawn in metres and the camera's *distance*
 * decides how much of it fits. Everything below still holds: no letterboxing, no stretching, and
 * whatever room the screen's shape leaves over is more world rather than bars.
 *
 * One thing is genuinely different and worth knowing before you tune the numbers: a perspective
 * camera does not care how many pixels a screen has, only what shape it is. A 4K monitor and a
 * 720p one of the same shape show exactly the same world, each metre of it drawn over twice the
 * pixels; a window shrunk *unevenly* is what pulls the camera, and it pulls it by the tighter of
 * the two sides. So the rule below is read against the *aspect ratio*, and the pixel count only
 * ever reaches the HUD (see `fitHud`).
 *
 * This module deliberately imports nothing from three.js. It is arithmetic, and arithmetic is
 * testable without a browser (see test/view3d.test.ts); `Scene3d` is what puts the answer on a
 * camera.
 */

/**
 * TEMPLATE: the camera's vertical field of view, in degrees. Forty-five is the usual compromise:
 * narrower flattens the scene towards an isometric look, wider bows straight edges at the corners
 * and makes anything near the camera lunge at it.
 */
export const FOV = 45;

/** Half the visible height at a distance, the whole of the perspective arithmetic in one line. */
const spread = (fovDegrees: number): number => Math.tan((fovDegrees * Math.PI) / 360);

/**
 * TEMPLATE: the world the game is written for, in metres, measured on the arena plane: room
 * enough either side of the middle to build, and headroom enough over it that something coming
 * down is seen coming. All of it is on screen on every window that has the shape for it, and a
 * window of another shape keeps whichever side of it is tighter and gets the rest as spare world.
 *
 * This rectangle is the whole of how big things look. It is a *contain* fit, the same rule a 2D
 * game writes as `scale = min(width / designWidth, height / designHeight)`: a window shrunk either
 * way pulls the camera back and draws the world smaller, rather than keeping the size and cutting
 * the sides off. Make the rectangle smaller and everything is drawn bigger, together.
 */
const WORLD = { width: 32, height: 18 };
/**
 * The floor under the rule above, and the only place it gives up: the world is never drawn below
 * half the size it is written at. A window far off the shape the game is written in would
 * otherwise go on pulling the camera back until a box was a few pixels across, so past half size
 * it stops and crops instead, and a phone held upright is played on the middle of the arena rather
 * than on all of it as specks.
 */
const LEAST_SCALE = 0.5;
/**
 * And the other end: how much world a very wide window is given across before it is brought back
 * in and drawn bigger instead. A quarter more than the game is written for, past which the arena
 * is adrift in an empty field.
 */
const MOST_WIDTH = WORLD.width * 1.25;

/**
 * TEMPLATE: how far the camera sits from the arena plane when the screen has exactly the shape
 * `WORLD` is written in — the size the game is written at, and the 3D counterpart of the 2D half's
 * `PPM`. Everything reads its own size against this, so it is derived from the rectangle rather
 * than typed in beside it: the two disagreeing is a game whose `scale` is never quite 1.
 */
export const DISTANCE = WORLD.height / (2 * spread(FOV));

/**
 * The HUD is a DOM overlay (three.js has no text, and a browser is very good at it). It is drawn at
 * its own size on a screen this wide and this tall — the one it is designed against — and scaled
 * with the screen either way from there. It is never drawn below this much of itself, where a
 * finger would have nothing left to hit, nor above this much, where a very large screen stops
 * making it bigger.
 */
const HUD_SCREEN = { width: 1920, height: 1080 };
const HUD_LEAST = 0.8;
const HUD_MOST = 2;

/** What a screen shows of the world, and where the camera has to be to show it. */
export interface View {
  /** The camera's vertical field of view, in degrees. Constant; carried here so one thing sets up a camera. */
  readonly fov: number;
  /** How far the camera is from the plane the game is played on, in metres. */
  readonly distance: number;
  /**
   * How big the world is drawn compared with the size it is written at: `DISTANCE / distance`. The
   * counterpart of the 2D half's `scale`, and the one number anything that wants to keep step with
   * the world should read.
   */
  readonly scale: number;
  /** How much of the arena plane the screen shows, in metres. */
  readonly width: number;
  readonly height: number;
}

/**
 * Where to put the camera for a screen of this shape.
 *
 * The camera is pulled back until all of `WORLD` is on screen, so a window made narrower or
 * shorter draws everything smaller instead of losing the sides of the arena, and a window made
 * bigger draws the same world bigger. Whatever room the screen's shape leaves over is spare
 * world — sky above a tall window, floor beside a wide one — so nothing is letterboxed and
 * nothing is stretched.
 *
 * The two bounds on it are `LEAST_SCALE`, which stops the camera backing off for ever on a window
 * far off the shape the game is written in — past it the arena is cropped rather than shrunk,
 * because a little less room to build beats an arena too small to see — and `MOST_WIDTH`, which
 * brings it in again on a very wide one.
 */
export function fitView(screenWidth: number, screenHeight: number): View {
  const aspect = Math.max(1, screenWidth) / Math.max(1, screenHeight);
  // All in metres of visible height, because that is what a field of view is in: what it takes to
  // hold `WORLD` at this shape, how far back half size is, and how far back `MOST_WIDTH` is.
  const contain = Math.max(WORLD.height, WORLD.width / aspect);
  const height = Math.min(contain, WORLD.height / LEAST_SCALE, MOST_WIDTH / aspect);
  const distance = height / (2 * spread(FOV));
  return { fov: FOV, distance, scale: DISTANCE / distance, width: height * aspect, height };
}

/**
 * What the HUD is drawn at on a screen of this size: its own size on the screen it is designed
 * against, smaller on a small one so that its buttons wrap into a row or two rather than a wall of
 * them, and bigger on a screen with the room to spare.
 *
 * Unlike the 2D half's, this does not take a `View`, and the difference is worth understanding
 * before either is changed. In 2D the scale is capped, so a huge monitor draws the world only a
 * little bigger and the HUD follows `view.scale` to keep step with it. Here the camera frames by
 * shape alone: the same world is spread over whatever pixels the screen has, so a screen twice the
 * height draws every metre twice the size all by itself, and the screen is the whole of the
 * measure. `view.scale` is deliberately left out of it: it moves with the window's *shape*, and a
 * HUD that grew as a window was narrowed would be a row of buttons crowding a world that had just
 * been drawn smaller to make room for them.
 */
export function fitHud(screenWidth: number, screenHeight: number): number {
  const room = Math.min(
    Math.max(1, screenWidth) / HUD_SCREEN.width,
    Math.max(1, screenHeight) / HUD_SCREEN.height,
  );
  return Math.max(HUD_LEAST, Math.min(HUD_MOST, room));
}
