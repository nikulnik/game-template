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
 * 720p one of the same shape show exactly the same world; a phone shows less because it is narrow,
 * not because it is small. So these bounds are read against the *aspect ratio*, and the pixel
 * count only ever reaches the HUD (see `fitHud`).
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

/**
 * TEMPLATE: how far the camera sits from the plane the game is played on when nothing is forcing
 * it elsewhere — the size the game is written at, and the 3D counterpart of the 2D half's `PPM`.
 * Move this and everything gets bigger or smaller together.
 */
export const DISTANCE = 22;

/**
 * TEMPLATE: the least of the world a screen ever shows, in metres, measured on the arena plane:
 * room enough either side of the middle to build, and headroom enough over it that something
 * coming down is seen coming. A screen too narrow to show that much pulls the camera back until
 * it does, which is what a phone gets.
 */
const LEAST = { width: 11, height: 8 };
/**
 * And the most it ever shows. Past this the arena is a speck in an empty field, so a screen wider
 * than the game is drawn for is brought closer and given the same arena bigger rather than more of
 * the world.
 */
const MOST = { width: 40, height: 26 };

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

/** Half the visible height at a distance, the whole of the perspective arithmetic in one line. */
const spread = (fovDegrees: number): number => Math.tan((fovDegrees * Math.PI) / 360);

/**
 * Where to put the camera for a screen of this shape.
 *
 * The two bounds meet in a range of distances, and the camera sits at `DISTANCE` — the size the
 * game is written at — wherever that range allows it, which is every ordinary window. Outside the
 * range the nearer bound wins, so a narrow screen is pulled back until it can see the arena rather
 * than a slice of it, and a very wide one is brought in so the arena still fills the screen.
 *
 * A screen so long one way that it cannot have both bounds at once keeps the cap on how much it
 * shows and gives up the floor under it, which is the milder of the two: a little less room to
 * build beats an arena too small to see.
 */
export function fitView(screenWidth: number, screenHeight: number): View {
  const aspect = Math.max(1, screenWidth) / Math.max(1, screenHeight);
  const natural = 2 * DISTANCE * spread(FOV);
  // In metres of visible height: the least the bounds allow, the most they allow, and where the
  // camera would rather be. Written this way round because height is what a field of view is in.
  const least = Math.max(LEAST.height, LEAST.width / aspect);
  const most = Math.min(MOST.height, MOST.width / aspect);
  const height = Math.min(most, Math.max(natural, least));
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
 * shape alone: the same arena is spread over whatever pixels the screen has, so a screen twice the
 * height draws every metre twice the size all by itself. The screen is therefore the whole of the
 * measure, and a `scale` term would only add a wobble as the aspect ratio changed.
 */
export function fitHud(screenWidth: number, screenHeight: number): number {
  const room = Math.min(
    Math.max(1, screenWidth) / HUD_SCREEN.width,
    Math.max(1, screenHeight) / HUD_SCREEN.height,
  );
  return Math.max(HUD_LEAST, Math.min(HUD_MOST, room));
}
