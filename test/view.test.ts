import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fitHud, fitView } from '../src/core/View.ts';
import { PPM } from '../src/physics/Physics.ts';

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

describe('fitView', () => {
  it('draws the world at the size it is written in on every ordinary window', () => {
    for (const [width, height] of [
      [1920, 1080],
      [1600, 900],
      [1366, 768],
      [1280, 1024],
      [1024, 768],
      [800, 600],
      [640, 480],
    ] as const) {
      assert.equal(fitView(width, height).ppm, PPM, `${width}x${height} is drawn as written`);
    }
  });

  it('shows the screen and nothing but the screen: one scale, both axes, no bars', () => {
    for (const [width, height] of SCREENS) {
      const view = fitView(width, height);
      assert.ok(Math.abs(view.width * view.ppm - width) < 1e-9, `${width}x${height} across`);
      assert.ok(Math.abs(view.height * view.ppm - height) < 1e-9, `${width}x${height} down`);
      assert.equal(view.scale, view.ppm / PPM);
    }
  });

  it('keeps a fort worth of room and a brick worth of pixels on every one of them', () => {
    for (const [width, height] of SCREENS) {
      const view = fitView(width, height);
      // Room enough either side of the core to build, and over it to see something coming.
      assert.ok(view.width >= 8, `${width}x${height} shows ${view.width.toFixed(1)}m across`);
      assert.ok(view.height >= 6, `${width}x${height} shows ${view.height.toFixed(1)}m down`);
      // And a brick, a quarter of a metre, still drawn big enough to aim a hammer at.
      assert.ok(view.ppm / 4 >= 7, `${width}x${height} draws a brick ${(view.ppm / 4).toFixed(1)}px across`);
      // Never so much of the world that the fort is a speck in it.
      assert.ok(view.width <= 41 && view.height <= 27, `${width}x${height} shows ${view.width.toFixed(1)}x${view.height.toFixed(1)}m`);
    }
  });

  it('gives a bigger screen the same arena drawn bigger, not more of the world', () => {
    const small = fitView(1920, 1080);
    for (const factor of [1.25, 2]) {
      const big = fitView(1920 * factor, 1080 * factor);
      assert.ok(big.ppm > small.ppm, `${factor}x is drawn bigger`);
      assert.ok(big.width <= small.width * 1.1, `${factor}x shows no more of the world`);
    }
  });

  it('spends the odd shape of a screen on world rather than on bars', () => {
    const wide = fitView(2560, 1080);
    const square = fitView(1080, 1080);
    const tall = fitView(1080, 2560);
    assert.ok(wide.width > square.width, 'a wide screen sees further either side');
    assert.ok(tall.height > square.height, 'a tall screen sees further up');
  });

  it('minds a screen with no size at all rather than dividing by it', () => {
    for (const [width, height] of [
      [0, 0],
      [0, 800],
      [1200, 0],
    ] as const) {
      const view = fitView(width, height);
      assert.ok(Number.isFinite(view.ppm) && view.ppm > 0, `${width}x${height} has a scale`);
      assert.ok(Number.isFinite(view.width) && Number.isFinite(view.height));
    }
  });
});

describe('fitHud', () => {
  it('draws the buttons at their own size on any ordinary window', () => {
    for (const [width, height] of [
      [1920, 1080],
      [1600, 900],
      [1366, 768],
      [1280, 1024],
      [1024, 768],
    ] as const) {
      assert.equal(fitHud(width, height, fitView(width, height)), 1, `${width}x${height}`);
    }
  });

  it('never draws them so small that a finger has nothing to hit', () => {
    for (const [width, height] of SCREENS) {
      const scale = fitHud(width, height, fitView(width, height));
      // A button is 56 pixels of the HUD's own; a finger wants a little over forty of the screen's.
      assert.ok(56 * scale >= 44, `${width}x${height} draws a button ${(56 * scale).toFixed(0)}px`);
      assert.ok(scale <= 2);
    }
  });

  it('gives them no more of a long, shallow window than of any other', () => {
    // The world is drawn big there because the window is wide; the buttons have only its height to
    // live in, and a row of them is about a hundred of the HUD's own pixels.
    for (const [width, height] of [
      [3840, 400],
      [2560, 480],
      [1600, 360],
    ] as const) {
      const row = 102 * fitHud(width, height, fitView(width, height));
      assert.ok(row <= height * 0.25, `${width}x${height} gives a row ${row.toFixed(0)}px of ${height}`);
    }
  });

  it('grows with the world on a screen big enough to want it', () => {
    assert.ok(fitHud(3840, 2160, fitView(3840, 2160)) > 1.5);
    assert.ok(fitHud(2560, 1440, fitView(2560, 1440)) > 1);
  });
});
