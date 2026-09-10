/**
 * The canvas and the screen it is drawn on.
 *
 * Two separate things live here. `fitView` (src/core/View.ts) decides how much of the *world* a
 * screen shows and at what scale; this file decides how many *device pixels* the canvas is drawn
 * at. A game needs both: the first is what keeps a fort the same size on a phone and a monitor,
 * the second is what keeps it sharp on either.
 *
 * Nothing here knows what is drawing. Pixi and three.js both want the same three numbers — a width,
 * a height and a pixel ratio — so `followScreen` hands them over and the caller does whatever its
 * renderer calls resizing (see `src/main.ts` and `src/main3d.ts`).
 */

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
 * Follow the element the game is drawn in, and the screen's pixel ratio.
 *
 * `resize` is called once now and again whenever either changes, with the size of `host` in page
 * pixels and the ratio to draw it at. Everything the game draws is laid out from that each time,
 * so it can be played in any window on any screen and go on being played while the window changes
 * shape — a phone turned on its side, a desktop window dragged, a phone's address bar sliding in
 * and out. Test the layout rule itself against `fitView` (see test/view.test.ts) rather than
 * against a browser.
 *
 * Two things are watched, because they are two different events:
 *
 * - The **host's size**, with a `ResizeObserver` rather than `window.resize`. `#app` is fixed to
 *   the viewport, so the observer catches everything that changes how much room the game has,
 *   including the ones `window.resize` is late for or silent about on a phone.
 * - The **pixel ratio**, which changes when a browser is zoomed or a window is dragged onto a
 *   monitor of another density. A media query is the only word there is of it happening, and one
 *   only ever fires for the ratio it was made with, so the next is made as each goes off.
 *
 * Returns the way to stop listening, for a scene that is torn down.
 */
export function followScreen(
  host: HTMLElement,
  resize: (width: number, height: number, resolution: number) => void,
): () => void {
  let stopped = false;

  const apply = (): void => {
    if (stopped) return;
    const box = host.getBoundingClientRect();
    // A host with no size at all — display:none, or measured before layout — would otherwise hand
    // down a zero for everything below to divide by.
    resize(Math.max(1, Math.round(box.width)), Math.max(1, Math.round(box.height)), resolution());
  };

  const observer = new ResizeObserver(apply);
  observer.observe(host);

  const watchRatio = (): void => {
    if (stopped) return;
    matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener(
      'change',
      () => {
        apply();
        watchRatio();
      },
      { once: true },
    );
  };
  watchRatio();

  // The observer's own first call comes a frame later, and the game has to be laid out before the
  // first frame is drawn, not after it.
  apply();

  return () => {
    stopped = true;
    observer.disconnect();
  };
}
