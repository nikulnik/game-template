/**
 * The canvas and the screen it is drawn on.
 *
 * Two separate things live here. `fitView` (src/core/View.ts) decides how much of the *world* a
 * screen shows and at what scale; this file decides how many *device pixels* the canvas is drawn
 * at. A game needs both: the first is what keeps a fort the same size on a phone and a monitor,
 * the second is what keeps it sharp on either.
 */

import type { Application } from 'pixi.js';

/**
 * The most device pixels the game is ever drawn at per pixel of the page. Past two there is
 * nothing left to see on any screen and a great deal more to draw, and a phone at three would be
 * spending it on a fort of specks.
 */
export const MAX_RESOLUTION = 2;

/** How many device pixels a pixel of the page is worth just now, as far as the game will go. */
export function resolution(): number {
  return Math.min(window.devicePixelRatio, MAX_RESOLUTION);
}

/**
 * Follow the page's pixel ratio. A browser zoomed in or out, or a window dragged onto a monitor of
 * another density, changes how many device pixels a page pixel is worth; a canvas left at the old
 * ratio is blurred by the difference, or draws pixels nobody can see. A media query is the only
 * word there is of it happening, and one only ever fires for the ratio it was made with, so the
 * next is made as each goes off.
 */
export function followPixelRatio(app: Application): void {
  const watch = (): void => {
    matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener(
      'change',
      () => {
        app.renderer.resize(app.screen.width, app.screen.height, resolution());
        watch();
      },
      { once: true },
    );
  };
  watch();
}

/**
 * Lay the game out again whenever the canvas changes size, and once now.
 *
 * `resizeTo: window` makes Pixi follow the window; this makes the game follow Pixi. Everything the
 * game draws is laid out from `fitView` each time, so it can be played in any window on any screen
 * and go on being played while the window changes shape — a phone turned on its side, a desktop
 * window dragged, a phone's address bar sliding in and out. Test the rule itself against
 * `fitView` (see test/view.test.ts) rather than against a browser.
 *
 * Returns the way to stop listening, for a scene that is torn down.
 */
export function onResize(app: Application, reframe: (width: number, height: number) => void): () => void {
  const handle = (): void => reframe(app.screen.width, app.screen.height);
  app.renderer.on('resize', handle);
  handle();
  return () => app.renderer.off('resize', handle);
}
