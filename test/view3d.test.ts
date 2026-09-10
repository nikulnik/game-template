import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DISTANCE, fitHud, fitView } from '../src/core/View3d.ts';

/** The screens the game is meant to be playable on: every monitor of the desktop lists, and phones and tablets both ways up. */
const SCREENS: readonly [number, number][] = [
  [1280, 1024],
  [1366, 768],
  [1600, 900],
  [1680, 1050],
  [1920, 1080],
  [1920, 1200],
  [2560, 1080],
  [2560, 1440],
  [3840, 2160],
  // The same, shrunk by a fifth each way, which is how a moderator looks at them.
  [1024, 819],
  [1093, 614],
  [1280, 720],
  [1344, 840],
  [1536, 864],
  [2048, 1152],
  [320, 568],
  [360, 640],
  [390, 844],
  [568, 320],
  [640, 360],
  [844, 390],
  [768, 1024],
  [1024, 768],
];

/** What the view says is on screen, checked back against the perspective arithmetic that put it there. */
function visible(distance: number, fov: number): number {
  return 2 * distance * Math.tan((fov * Math.PI) / 360);
}

describe('fitView', () => {
  it('leaves the camera where the game is written for it on a window of the shape it is written in', () => {
    // Sixteen by nine, which is what `WORLD` is: the whole of it fits exactly, and the camera has
    // no reason to move. Wider than that and the height is still what is tight, so it stays put.
    for (const [width, height] of [
      [1920, 1080],
      [1600, 900],
      [1366, 768],
      [1280, 720],
    ] as const) {
      assert.equal(fitView(width, height).distance, DISTANCE, `${width}x${height} is drawn as written`);
      assert.equal(fitView(width, height).scale, 1);
    }
  });

  it('draws the world smaller as a window is narrowed rather than cutting the sides off it', () => {
    // The whole point of a contain fit, and the thing a fixed camera distance gets wrong: dragging
    // a window in from the side has to change how big things look, not just how much is on screen.
    let previous = Infinity;
    for (const width of [1920, 1600, 1280, 1100, 960] as const) {
      const view = fitView(width, 1080);
      const pixelsPerMetre = 1080 / view.height;
      assert.ok(pixelsPerMetre < previous, `${width}x1080 draws a metre ${pixelsPerMetre.toFixed(1)}px`);
      previous = pixelsPerMetre;
    }
    // And a window shrunk evenly is the same world at fewer pixels, which is the other half of it.
    assert.ok(Math.abs(fitView(1920, 1080).width - fitView(960, 540).width) < 1e-9);
  });

  it('keeps all of the world the game is written for on screen wherever it can', () => {
    for (const [width, height] of SCREENS) {
      const view = fitView(width, height);
      // 32x18 metres, unless `MOST` has stopped the camera backing off any further — which is the
      // shapes furthest from the one the game is written in, and a phone held upright above all.
      const shape = Math.max(1, width) / Math.max(1, height);
      if (Math.min(36, 40 / shape) < Math.max(18, 32 / shape)) continue;
      assert.ok(view.width >= 32 - 1e-9, `${width}x${height} sees ${view.width.toFixed(1)}m across`);
      assert.ok(view.height >= 18 - 1e-9, `${width}x${height} sees ${view.height.toFixed(1)}m down`);
    }
  });

  it('shows the screen and nothing but the screen: no bars, either way', () => {
    for (const [width, height] of SCREENS) {
      const view = fitView(width, height);
      // What the camera actually sees at that distance is what the view claims is on screen...
      assert.ok(Math.abs(visible(view.distance, view.fov) - view.height) < 1e-9, `${width}x${height} down`);
      // ...and the screen's own shape is what decides the other axis, so nothing is stretched.
      assert.ok(Math.abs(view.width / view.height - width / height) < 1e-9, `${width}x${height} across`);
      assert.ok(Math.abs(view.scale - DISTANCE / view.distance) < 1e-9);
    }
  });

  it('keeps an arena worth of room and a box worth of pixels on every one of them', () => {
    for (const [width, height] of SCREENS) {
      const view = fitView(width, height);
      // Room enough either side of the middle to build, and over it to see something coming.
      assert.ok(view.width >= 8, `${width}x${height} shows ${view.width.toFixed(1)}m across`);
      assert.ok(view.height >= 6, `${width}x${height} shows ${view.height.toFixed(1)}m down`);
      // And a box, seven tenths of a metre, still drawn big enough to aim at. Ten pixels rather
      // than a comfortable twenty because of the smallest phone on the list: the world is fitted
      // to the *whole* window now, so one that narrow sees all of the arena at half size. `WORLD`
      // is the knob if that is ever too little — everything is drawn against it, together.
      const pixelsPerMetre = height / view.height;
      assert.ok(pixelsPerMetre * 0.7 >= 10, `${width}x${height} draws a box ${(pixelsPerMetre * 0.7).toFixed(0)}px across`);
      // Never so much of the world that the arena is a speck in it: `MOST` is what says so.
      assert.ok(view.width <= 41 && view.height <= 37, `${width}x${height} shows ${view.width.toFixed(1)}x${view.height.toFixed(1)}m`);
      assert.ok(view.scale >= 0.5, `${width}x${height} draws the world at ${view.scale.toFixed(2)}`);
    }
  });

  it('pulls back for a narrow screen rather than showing it a slice of the arena', () => {
    const desktop = fitView(1920, 1080);
    const phone = fitView(390, 844);
    assert.ok(phone.distance > desktop.distance, 'the camera backs off');
    assert.ok(phone.width >= 11, `a phone still sees ${phone.width.toFixed(1)}m across`);
    assert.ok(phone.width < 32, 'though not all of the arena: past `MOST` it is cropped, not shrunk');
    assert.equal(phone.scale, 0.5, 'and never drawn below half the size it is written at');
    assert.ok(phone.scale < 1, 'which is to say the world is drawn smaller');
  });

  it('gives a very wide screen the same arena, not more and more of the world', () => {
    const wide = fitView(2560, 1080);
    assert.ok(wide.width <= 40 + 1e-9, `an ultrawide sees ${wide.width.toFixed(1)}m across`);
    assert.ok(wide.distance < DISTANCE, 'the camera comes in to keep the arena filling the screen');
    assert.ok(wide.scale > 1, 'which is to say the world is drawn a little bigger');
  });

  it('does not care how many pixels a screen has, only what shape it is', () => {
    // The one thing that is different from the 2D half, and the thing most likely to surprise:
    // a perspective camera frames by aspect ratio alone.
    const small = fitView(1280, 720);
    const huge = fitView(3840, 2160);
    assert.ok(Math.abs(small.distance - huge.distance) < 1e-9);
    assert.ok(Math.abs(small.width - huge.width) < 1e-9);
  });

  it('spends the odd shape of a screen on world rather than on bars', () => {
    const wide = fitView(2560, 1080);
    const square = fitView(1080, 1080);
    const tall = fitView(1080, 2560);
    assert.ok(wide.width > square.width, 'a wide screen sees further either side');
    assert.ok(tall.height > square.height, 'and a tall one further up');
    // A square window is narrower than the game is written for, so it holds all of `WORLD` and
    // spends the shape on sky; a window taller still is held at `MOST` and crops rather than
    // backing off for ever. Neither is letterboxed for it — the world keeps the screen's own
    // shape, which the no-bars test above checks on every screen in the list.
    assert.ok(square.width >= 32 - 1e-9, 'a square window still sees all of the arena');
    assert.ok(tall.width < 32, 'a window taller still is the arena cropped, not shrunk to nothing');
  });

  it('minds a screen with no size at all rather than dividing by it', () => {
    for (const [width, height] of [
      [0, 0],
      [0, 800],
      [1200, 0],
    ] as const) {
      const view = fitView(width, height);
      assert.ok(Number.isFinite(view.distance) && view.distance > 0, `${width}x${height} has a camera`);
      assert.ok(Number.isFinite(view.width) && Number.isFinite(view.height));
    }
  });
});

describe('fitHud', () => {
  it('draws the buttons at their own size on the screen they are designed against', () => {
    assert.equal(fitHud(1920, 1080), 1);
  });

  it('keeps step with the screen, which is what the world does here too', () => {
    let previous = 0;
    for (const [width, height] of [
      [1024, 768],
      [1366, 768],
      [1600, 900],
      [1920, 1080],
      [2560, 1440],
      [3840, 2160],
    ] as const) {
      const scale = fitHud(width, height);
      assert.ok(scale >= previous, `${width}x${height} is no smaller than the screen below it`);
      previous = scale;
    }
  });

  it('never draws them so small that a finger has nothing to hit', () => {
    for (const [width, height] of SCREENS) {
      const scale = fitHud(width, height);
      // A button is 56 pixels of the HUD's own; a finger wants a little over forty of the screen's.
      assert.ok(56 * scale >= 44, `${width}x${height} draws a button ${(56 * scale).toFixed(0)}px`);
      assert.ok(scale <= 2);
    }
  });

  it('gives them no more of a long, shallow window than of any other', () => {
    for (const [width, height] of [
      [3840, 400],
      [2560, 480],
      [1600, 360],
    ] as const) {
      const row = 102 * fitHud(width, height);
      assert.ok(row <= height * 0.25, `${width}x${height} gives a row ${row.toFixed(0)}px of ${height}`);
    }
  });

  it('grows with a screen big enough to want it', () => {
    assert.ok(fitHud(3840, 2160) > 1.5);
    assert.ok(fitHud(2560, 1440) > 1);
  });
});
