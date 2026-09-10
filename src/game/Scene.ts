/**
 * TEMPLATE: the game itself, and the one file meant to be thrown away. It is here so the skeleton
 * is something you can run and see, and so every piece around it — the view, the physics, the
 * audio, the saves, the language — has one honest call site to copy.
 *
 * What it does: boxes fall onto a floor. Tapping drops another where you tapped and plays a cue.
 *
 * What is worth keeping from it:
 *
 * - `reframe` is the whole of how this game handles a screen. It is called once at startup and
 *   again on every resize (see src/core/Screen.ts), and it lays the game out from `fitView` alone,
 *   so a phone, a rotated phone and a desktop window differ only in what `fitView` returns.
 * - Everything is drawn in the pixels the physics is written in — metres times PPM — and one
 *   `scale` on one container carries that onto the screen. Nothing below this line knows what size
 *   the screen is.
 * - The world is y-down, as Pixi is: gravity points along +y, and a body's translation and
 *   rotation go onto a display object with no conversion but that scale.
 */

import { Container, Graphics, Rectangle, Text, type Application, type FederatedPointerEvent } from 'pixi.js';
import type { Audio } from '../audio/Audio.ts';
import { fitHud, fitView, type View } from '../core/View.ts';
import { t } from '../i18n.ts';
import { dynamicBody, Physics, PPM, toPixels } from '../physics/Physics.ts';
import type { Progress, Saves } from './Progress.ts';
import { ColliderDesc, RigidBodyDesc, type RigidBody } from '@dimforge/rapier2d-compat';

/** Half a box's side, in metres. Rapier is happiest with things between 0.1 m and 10 m. */
const BOX = 0.35;
/** How far below the floor a box counts as gone, in metres. */
const GONE = 3;

interface Box {
  body: RigidBody;
  view: Graphics;
}

export class Scene extends Container {
  private readonly app: Application;
  private readonly audio: Audio;
  private readonly saves: Saves;
  private readonly physics = new Physics();
  /** Everything of the world, drawn in metres times PPM and scaled onto the screen as one. */
  private readonly world = new Container();
  private readonly hud = new Container();
  private readonly score = new Text({ text: '', style: { fill: 0xffffff, fontSize: 24, fontFamily: 'sans-serif' } });
  private readonly boxes: Box[] = [];
  private view: View = fitView(1, 1);
  private best: number;
  private dropped = 0;

  constructor(app: Application, audio: Audio, saves: Saves, progress: Progress) {
    super();
    this.app = app;
    this.audio = audio;
    this.saves = saves;
    this.best = progress.best;
    this.dropped = progress.game?.score ?? 0;

    this.addChild(this.world, this.hud);
    this.hud.addChild(this.score);

    this.floor();
    // A container is only hit where its children are, so the sky above the floor would swallow
    // nothing. The whole screen is the target instead, set again in `reframe`.
    this.eventMode = 'static';
    this.hitArea = new Rectangle(0, 0, 1, 1);
    this.on('pointerdown', this.tap);
    this.app.ticker.add(this.tick);
  }

  /** The static ground, a strip across the arena with its top face at y = 0. */
  private floor(): void {
    const body = this.physics.world.createRigidBody(RigidBodyDesc.fixed().setTranslation(0, 0.5));
    this.physics.world.createCollider(ColliderDesc.cuboid(50, 0.5).setFriction(0.9), body);
    const ground = new Graphics().rect(toPixels(-50), 0, toPixels(100), toPixels(1)).fill(0x2f3b52);
    this.world.addChild(ground);
  }

  private readonly tap = (event: FederatedPointerEvent): void => {
    const point = this.world.toLocal(event.global);
    this.drop(point.x / PPM, Math.min(point.y / PPM, -BOX));
  };

  private drop(x: number, y: number): void {
    const body = this.physics.world.createRigidBody(dynamicBody(x, y, (Math.random() - 0.5) * 0.6));
    this.physics.world.createCollider(ColliderDesc.cuboid(BOX, BOX).setRestitution(0.2).setFriction(0.8), body);
    const view = new Graphics().roundRect(toPixels(-BOX), toPixels(-BOX), toPixels(BOX * 2), toPixels(BOX * 2), 4).fill(0xc9a227);
    this.world.addChild(view);
    this.boxes.push({ body, view });
    this.dropped++;
    this.best = this.saves.record(this.best, this.dropped);
    this.saves.keep({ v: 1, score: this.dropped, time: 0 });
    // A cue that is not in the manifest simply does not play, so this is safe with no audio files.
    this.audio.playSfx('drop');
    this.draw();
  }

  private readonly tick = (): void => {
    this.physics.update(this.app.ticker.deltaMS);
    for (let i = this.boxes.length - 1; i >= 0; i--) {
      const box = this.boxes[i]!;
      const { x, y } = box.body.translation();
      box.view.position.set(toPixels(x), toPixels(y));
      box.view.rotation = box.body.rotation();
      // Anything that has fallen off the world is taken out of it, bodies and all: a physics world
      // that only ever grows is the first thing to cost a game its frame rate.
      if (y > GONE) {
        this.physics.world.removeRigidBody(box.body);
        box.view.destroy();
        this.boxes.splice(i, 1);
      }
    }
  };

  /**
   * Lay everything out for a screen of this size. Called once at startup and on every resize.
   *
   * The floor is pinned to the bottom of the view and the middle of the world to the middle of the
   * screen, so a window made taller grows the sky rather than moving the game, and a phone turned
   * on its side keeps building where it was.
   */
  reframe(width: number, height: number): void {
    this.view = fitView(width, height);
    this.hitArea = new Rectangle(0, 0, width, height);
    this.world.scale.set(this.view.scale);
    this.world.position.set(width / 2, height - toPixels(1) * this.view.scale);
    this.hud.scale.set(fitHud(width, height, this.view));
    this.score.position.set(16, 16);
    this.draw();
  }

  private draw(): void {
    this.score.text = `${t('Score: %d', this.dropped)}  ·  ${t('Tap to start')}  ·  ${this.best}`;
  }

  /** How much of the world is on screen just now, for anything that needs to know. */
  get bounds(): View {
    return this.view;
  }

  override destroy(): void {
    this.app.ticker.remove(this.tick);
    this.physics.destroy();
    super.destroy({ children: true });
  }
}
