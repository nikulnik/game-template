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
  it('draws the world at the size it is written in on the screen it is written for', () => {
    // 1920x1080, where every sprite lands on the pixels it was drawn at. Unlike the 3D twin this
    // is one screen and not a shape: `ppm` is an absolute size, so a bigger screen draws bigger.
    const view = fitView(1920, 1080);
    assert.equal(view.ppm, PPM);
    assert.equal(view.scale, 1);
  });

  it('draws the world smaller as a window is narrowed rather than cutting the sides off it', () => {
    // The whole point of a contain fit, and the thing a fixed `ppm` gets wrong: dragging a window
    // in from the side has to change how big things look, not just how much is on screen.
    let previous = Infinity;
    for (const width of [1920, 1600, 1280, 1100, 960] as const) {
      const view = fitView(width, 1080);
      assert.ok(view.ppm < previous, `${width}x1080 draws a metre ${view.ppm.toFixed(1)}px`);
      previous = view.ppm;
    }
  });

  it('keeps all of the world the game is written for on screen wherever it can', () => {
    for (const [width, height] of SCREENS) {
      const view = fitView(width, height);
      // 38.4 by 21.6 metres, unless the window is small enough or odd enough that one of the two
      // bounds has stopped it shrinking any further — a phone held upright above all.
      const contain = Math.min(width / 38.4, height / 21.6);
      if (contain < Math.max(PPM * 0.5, width / 48)) continue;
      assert.ok(view.width >= 38.4 - 1e-9, `${width}x${height} sees ${view.width.toFixed(1)}m across`);
      assert.ok(view.height >= 21.6 - 1e-9, `${width}x${height} sees ${view.height.toFixed(1)}m down`);
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
      // And a brick, a quarter of a metre, still drawn big enough to aim a hammer at. Six pixels
      // rather than a comfortable ten because of the smallest phone on the list: the world is
      // fitted to the *whole* window now, so one that narrow sees the fort at half size. `WORLD`
      // is the knob if that is ever too little — everything is drawn against it, together.
      assert.ok(view.ppm / 4 >= 6, `${width}x${height} draws a brick ${(view.ppm / 4).toFixed(1)}px across`);
      // Never drawn below half the size it is written at, and never so much world with it that
      // the fort is a speck: `LEAST_SCALE` and `MOST_WIDTH` are what say so.
      assert.ok(view.scale >= 0.5, `${width}x${height} draws the world at ${view.scale.toFixed(2)}`);
      assert.ok(view.width <= 48 && view.height <= 43.2, `${width}x${height} shows ${view.width.toFixed(1)}x${view.height.toFixed(1)}m`);
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
  it('draws the buttons at their own size on the screen they are designed against', () => {
    assert.equal(fitHud(1920, 1080), 1);
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
    // The world is drawn big there because the window is wide; the buttons have only its height to
    // live in, and a row of them is about a hundred of the HUD's own pixels.
    for (const [width, height] of [
      [3840, 400],
      [2560, 480],
      [1600, 360],
    ] as const) {
      const row = 102 * fitHud(width, height);
      assert.ok(row <= height * 0.25, `${width}x${height} gives a row ${row.toFixed(0)}px of ${height}`);
    }
  });

  it('grows with the screen on one big enough to want it', () => {
    assert.ok(fitHud(3840, 2160) > 1.5);
    assert.ok(fitHud(2560, 1440) > 1);
  });
});
