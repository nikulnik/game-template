import { EventQueue, init, RigidBodyDesc, World, type Vector } from '@dimforge/rapier2d-compat';

/**
 * Pixels per metre. Rapier is tuned for metric sizes (bodies roughly 0.1 to 10 m),
 * so game objects are described in metres and scaled to pixels for rendering.
 */
export const PPM = 50;
export const toPixels = (meters: number): number => meters * PPM;
export const toMeters = (pixels: number): number => pixels / PPM;

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

/** A body that falls under gravity and can be knocked around, at a position in metres and an angle in radians. */
export function dynamicBody(x: number, y: number, angle = 0, angularDamping = ANGULAR_DAMPING): RigidBodyDesc {
  return RigidBodyDesc.dynamic().setTranslation(x, y).setRotation(angle).setAngularDamping(angularDamping);
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
 * Coordinates are y-down, matching Pixi, so gravity points along +y and
 * a body's translation and rotation map onto a sprite with only the PPM scale.
 */
export class Physics {
  readonly world: World;
  private readonly events = new EventQueue(true);
  private accumulator = 0;
  private readonly stepMs: number;

  constructor(gravity: Vector = { x: 0, y: 9.81 }) {
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
