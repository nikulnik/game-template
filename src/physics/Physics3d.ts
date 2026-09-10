import { EventQueue, init, RigidBodyDesc, World, type Vector } from '@dimforge/rapier3d-compat';

/**
 * Rapier in three dimensions, for the three.js half of the template. The 2D twin is
 * src/physics/Physics.ts; a project keeps one of them.
 *
 * **There is no PPM here, and that is the whole difference.** The 2D half draws in pixels, so it
 * carries a pixels-per-metre constant and multiplies by it everywhere. three.js draws in whatever
 * unit you say it does, so the unit is the metre: one world unit is one metre, a body's
 * translation goes straight onto an `Object3D.position` and its rotation straight onto a
 * `.quaternion`, with no conversion at all. Keep bodies roughly between 0.1 m and 10 m, which is
 * what Rapier's solver is tuned for — a 500-unit "room" simulates badly for no reason.
 *
 * Coordinates are y-**up**, as three.js is, so gravity points along -y. (The 2D half is y-down,
 * because Pixi is. Do not carry a sign over between them.)
 */

/** Ordinary gravity, in metres per second squared, pointing down a y-up world. */
export const GRAVITY: Vector = { x: 0, y: -9.81, z: 0 };

/**
 * Rapier has no rolling resistance, so a ball would roll along the floor forever. It is kept low:
 * anything more and heavy things sink through the air as if it were syrup, which reads as wrong.
 */
const ANGULAR_DAMPING = 0.05;
/**
 * Solver sweeps per step. The default four is enough for a few boxes; a wall of a hundred and
 * forty-four bricks resting on each other needs more, or it sags and springs under its own weight.
 */
const SOLVER_ITERATIONS = 8;

/**
 * A body that falls under gravity and can be knocked around, at a position in metres. Angle it
 * afterwards with `.setRotation(quaternion)` — a rotation in three dimensions is a quaternion, not
 * a number, so it is not worth a positional argument.
 */
export function dynamicBody(x: number, y: number, z: number, angularDamping = ANGULAR_DAMPING): RigidBodyDesc {
  return RigidBodyDesc.dynamic().setTranslation(x, y, z).setAngularDamping(angularDamping);
}

let ready: Promise<void> | null = null;

/** Loads the Rapier WASM module. Await once at startup, before creating any `Physics`. */
export function initPhysics(): Promise<void> {
  ready ??= init();
  return ready;
}

/**
 * A Rapier world stepped on a fixed timestep.
 *
 * Fixed, rather than stepped by whatever the last frame took, because a physics world stepped by a
 * varying dt is a different game on a 60 Hz screen and a 144 Hz one, and the same throw lands
 * somewhere else on each.
 */
export class Physics {
  readonly world: World;
  private readonly events = new EventQueue(true);
  private accumulator = 0;
  private readonly stepMs: number;

  constructor(gravity: Vector = GRAVITY) {
    this.world = new World(gravity);
    this.world.integrationParameters.numSolverIterations = SOLVER_ITERATIONS;
    this.stepMs = this.world.timestep * 1000;
  }

  /**
   * Call once per rendered frame with the elapsed milliseconds. `beforeStep` runs just before
   * each simulation step, the place to move bodies about by hand; `onStep` runs after each with
   * the events from that step, which is the only chance to read them: the queue empties itself
   * at the start of the next one.
   */
  update(deltaMs: number, beforeStep?: () => void, onStep?: (events: EventQueue) => void): void {
    // Clamp so a background tab or a long hitch doesn't trigger hundreds of catch-up steps.
    this.accumulator += Math.min(deltaMs, 250);
    while (this.accumulator >= this.stepMs) {
      beforeStep?.();
      this.world.step(this.events);
      this.accumulator -= this.stepMs;
      onStep?.(this.events);
    }
  }

  destroy(): void {
    this.events.free();
    this.world.free();
  }
}
