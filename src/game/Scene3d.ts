/**
 * TEMPLATE: the game itself, three.js flavour, and the one file meant to be thrown away. It is
 * here so the skeleton is something you can run and see, and so every piece around it — the view,
 * the physics, the audio, the saves, the language — has one honest call site to copy. The 2D twin
 * is src/game/Scene.ts; a project keeps one of them.
 *
 * What it does: boxes fall onto a floor. Tapping drops another where you tapped and plays a cue.
 *
 * What is worth keeping from it:
 *
 * - `reframe` is the whole of how this game handles a screen. It is called once at startup and
 *   again on every resize (see src/core/Screen.ts), and it lays the game out from `fitView` alone,
 *   so a phone, a rotated phone and a desktop window differ only in where the camera ends up.
 * - The world is drawn in metres, because Rapier is written in them: a body's translation goes
 *   onto `mesh.position` and its rotation onto `mesh.quaternion`, with no conversion at all. The
 *   2D half's PPM does not exist here, and nothing below `reframe` knows what size the screen is.
 * - The world is y-**up**, as three.js is, so gravity points along -y and the floor's top face is
 *   at y = 0.
 * - The HUD is DOM, not three.js. three.js has no text worth the name, and a browser lays out,
 *   wraps, translates and reads out a line of it for nothing. `#hud` sits over the canvas and is
 *   scaled by one CSS variable (see `fitHud` and index.html).
 * - Geometries and materials are *shared and disposed by hand*. three.js does not free GPU memory
 *   when an object leaves the scene, so one geometry and one material are made here and every box
 *   borrows them; `destroy` is the only place either is disposed.
 */

import {
  BoxGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  Plane,
  Quaternion,
  Raycaster,
  Vector2,
  Vector3,
  type PerspectiveCamera,
} from 'three';
import { ColliderDesc, RigidBodyDesc, type RigidBody } from '@dimforge/rapier3d-compat';
import type { Audio } from '../audio/Audio.ts';
import { fitHud, fitView, type View } from '../core/View3d.ts';
import { t } from '../i18n.ts';
import { dynamicBody, Physics } from '../physics/Physics3d.ts';
import type { Progress, Saves } from './Progress.ts';

/** Half a box's side, in metres. Rapier is happiest with things between 0.1 m and 10 m. */
const BOX = 0.35;
/** How far below the floor a box counts as gone, in metres. */
const GONE = 3;
/** How much floor is left showing under the arena, in metres, so it does not sit on the screen's edge. */
const FLOOR_MARGIN = 1;
/**
 * How far above the middle of the view the camera sits, in metres. A small lift is what makes the
 * floor read as a floor rather than a line. Keep it small: `View3d` measures the world on the
 * plane the camera faces square on, and every metre of lift tilts the camera a little further off
 * that plane — at this height the framing is out by about a percent, at half the distance it would
 * be out by a fifth.
 */
const ELEVATION = 4;
/**
 * How far the floor reaches, in metres: right across the arena, and a good deal less toward the
 * camera and away from it. A floor as deep as it is wide runs off to a horizon and takes half the
 * screen with it; kept shallow it reads as the stage the game is played on, and anything knocked
 * off the front of it falls out of the world, which `GONE` is already there to clear up.
 */
const FLOOR = { across: 50, deep: 6 };
/** How big a patch of the world the one shadow-casting light covers. Every metre costs shadow map. */
const LIT = 24;

interface Box {
  body: RigidBody;
  view: Mesh;
}

/** Everything the game is handed to draw with — the counterpart of the Pixi half's `Application`. */
export interface Stage {
  readonly camera: PerspectiveCamera;
  /** What taps are read from. The canvas rather than the window: it is what the camera looks through. */
  readonly canvas: HTMLCanvasElement;
  /** The DOM overlay the HUD lives in. */
  readonly hud: HTMLElement;
}

export class Scene extends Group {
  private readonly stage: Stage;
  private readonly audio: Audio;
  private readonly saves: Saves;
  private readonly physics = new Physics();
  private readonly boxes: Box[] = [];
  /** One of each, borrowed by every box. See the note at the top about disposing them.  */
  private readonly boxGeometry = new BoxGeometry(BOX * 2, BOX * 2, BOX * 2);
  private readonly boxMaterial = new MeshStandardMaterial({ color: 0xc9a227, roughness: 0.6, metalness: 0.1 });
  private readonly floorGeometry = new BoxGeometry(FLOOR.across * 2, 1, FLOOR.deep * 2);
  private readonly floorMaterial = new MeshStandardMaterial({ color: 0x2f3b52, roughness: 0.95 });
  /** The plane the game is played on, and the one taps are read against. */
  private readonly arena = new Plane(new Vector3(0, 0, 1), 0);
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly hit = new Vector3();
  private view: View = fitView(1, 1);
  private best: number;
  private dropped = 0;

  constructor(stage: Stage, audio: Audio, saves: Saves, progress: Progress) {
    super();
    this.stage = stage;
    this.audio = audio;
    this.saves = saves;
    this.best = progress.best;
    this.dropped = progress.game?.score ?? 0;

    this.light();
    this.floor();
    this.stage.canvas.addEventListener('pointerdown', this.tap);
  }

  /** A fill from the sky and one key light, which is the one that casts the shadows. */
  private light(): void {
    this.add(new HemisphereLight(0x9fb4d8, 0x2a2f3f, 1.6));
    const key = new DirectionalLight(0xffffff, 2.2);
    key.position.set(-8, 16, 10);
    key.castShadow = true;
    // A directional light's shadow is drawn through an orthographic camera that covers nothing by
    // default but a couple of metres. It has to be told how much of the world to cover, and every
    // metre of it costs resolution out of the same shadow map, so it covers the arena and no more.
    key.shadow.camera.left = -LIT;
    key.shadow.camera.right = LIT;
    key.shadow.camera.top = LIT;
    key.shadow.camera.bottom = -LIT;
    key.shadow.camera.far = 60;
    key.shadow.mapSize.set(1024, 1024);
    // Without a bias, a surface shadows itself in stripes wherever the map is coarser than it is.
    key.shadow.bias = -0.0005;
    this.add(key);
  }

  /** The static ground, a slab across the arena with its top face at y = 0. */
  private floor(): void {
    const body = this.physics.world.createRigidBody(RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
    this.physics.world.createCollider(ColliderDesc.cuboid(FLOOR.across, 0.5, FLOOR.deep).setFriction(0.9), body);
    const ground = new Mesh(this.floorGeometry, this.floorMaterial);
    ground.position.set(0, -0.5, 0);
    ground.receiveShadow = true;
    this.add(ground);
  }

  private readonly tap = (event: PointerEvent): void => {
    // three.js has no event system of its own: a tap is a point on a canvas, turned into a ray
    // through the camera and met with the plane the game is played on.
    const box = this.stage.canvas.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - box.left) / Math.max(1, box.width)) * 2 - 1,
      -((event.clientY - box.top) / Math.max(1, box.height)) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.stage.camera);
    // A ray parallel to the plane meets it nowhere, which is a null rather than a crash.
    if (!this.raycaster.ray.intersectPlane(this.arena, this.hit)) return;
    this.drop(this.hit.x, Math.max(this.hit.y, BOX));
  };

  private drop(x: number, y: number): void {
    const spin = new Quaternion().random();
    const body = this.physics.world.createRigidBody(dynamicBody(x, y, 0).setRotation(spin));
    this.physics.world.createCollider(ColliderDesc.cuboid(BOX, BOX, BOX).setRestitution(0.2).setFriction(0.8), body);
    const view = new Mesh(this.boxGeometry, this.boxMaterial);
    view.castShadow = true;
    view.receiveShadow = true;
    this.add(view);
    this.boxes.push({ body, view });
    this.dropped++;
    this.best = this.saves.record(this.best, this.dropped);
    this.saves.keep({ v: 1, score: this.dropped, time: 0 });
    // A cue that is not in the manifest simply does not play, so this is safe with no audio files.
    this.audio.playSfx('drop');
    this.draw();
  }

  /**
   * One frame. Driven by hand from `src/main3d.ts` rather than by a ticker of its own, which is
   * also what makes the game steppable from a script (see CLAUDE.md).
   */
  tick(deltaMs: number): void {
    this.physics.update(deltaMs);
    for (let i = this.boxes.length - 1; i >= 0; i--) {
      const box = this.boxes[i]!;
      const p = box.body.translation();
      const r = box.body.rotation();
      box.view.position.set(p.x, p.y, p.z);
      box.view.quaternion.set(r.x, r.y, r.z, r.w);
      // Anything that has fallen off the world is taken out of it, bodies and all: a physics world
      // that only ever grows is the first thing to cost a game its frame rate.
      if (p.y < -GONE) {
        this.physics.world.removeRigidBody(box.body);
        // Only the mesh goes: its geometry and material are the shared ones and outlive it.
        this.remove(box.view);
        this.boxes.splice(i, 1);
      }
    }
  }

  /**
   * Lay everything out for a screen of this size. Called once at startup and on every resize.
   *
   * The floor is pinned near the bottom of the view and the middle of the arena to the middle of
   * the screen, so a window made taller grows the sky rather than moving the game, and a phone
   * turned on its side keeps building where it was.
   */
  reframe(width: number, height: number): void {
    this.view = fitView(width, height);
    const middle = this.view.height / 2 - FLOOR_MARGIN;
    const camera = this.stage.camera;
    camera.fov = this.view.fov;
    camera.aspect = Math.max(1, width) / Math.max(1, height);
    camera.position.set(0, middle + ELEVATION, this.view.distance);
    camera.lookAt(0, middle, 0);
    // Nothing on a camera takes effect until this is called. It is the single most common reason a
    // three.js scene "ignores" a resize.
    camera.updateProjectionMatrix();
    this.stage.hud.style.setProperty('--hud', String(fitHud(width, height)));
    this.draw();
  }

  private draw(): void {
    this.stage.hud.textContent = `${t('Score: %d', this.dropped)}  ·  ${t('Tap to start')}  ·  ${this.best}`;
  }

  /** How much of the world is on screen just now, for anything that needs to know. */
  get bounds(): View {
    return this.view;
  }

  destroy(): void {
    this.stage.canvas.removeEventListener('pointerdown', this.tap);
    this.physics.destroy();
    // three.js frees nothing by itself: a geometry and a material each hold a buffer on the GPU
    // until they are told to let go, and a scene rebuilt a few times without this leaks the lot.
    this.boxGeometry.dispose();
    this.boxMaterial.dispose();
    this.floorGeometry.dispose();
    this.floorMaterial.dispose();
    this.clear();
    this.removeFromParent();
  }
}
