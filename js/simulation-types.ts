import * as d3 from "d3";
import { Level } from "./levels";

export function squaredDistance(p1: Point, p2: Point): number {
  const dx = p1.x - p2.x,
    dy = p1.y - p2.y;
  return dx * dx + dy * dy;
}

export type Selectable = Wall | Creature;

export interface Point {
  x: number;
  y: number;
}

// Objects that can participate in collision/proximity detection.
export interface SNode extends Point {
  // An upper bound on the distance from the center to any part of the node.
  // Used for collision detection.
  r: number;
}

export class CursorNode implements SNode {
  r: number;
  x: number;
  y: number;

  // The SNode that would be interacted with if the user clicked.
  target: SNode | null;
  // Squared distance to the target.
  targetDistanceSq?: number;

  constructor() {
    this.r = 4;
    this.x = this.y = 0;
    this.target = null;
  }

  setLocation(p: Point): void {
    this.x = p.x;
    this.y = p.y;
  }

  reportPotentialTarget(n: SNode, distanceSq: number): void {
    if (this.target == null || distanceSq < this.targetDistanceSq) {
      this.target = n;
      this.targetDistanceSq = distanceSq;
    }
  }
}

export function isCursorNode(n: SNode): n is CursorNode {
  return n instanceof CursorNode;
}

export class Creature implements SNode, d3.SimulationNodeDatum {
  r: number;
  fx?: number;
  fy?: number;
  vx?: number;
  vy?: number;
  // Used by d3 simulation code.
  index?: number;

  infected = false;
  health = 1;
  goal?: Point;
  dead: boolean;
  ticksSinceDeath?: number;
  goalStack: Point[];
  turnSign: number; // 1 or -1, used for picking a side to turn toward when stuck.

  // Whether the creature is currently in a scoring "state".
  scoring: boolean;
  scoringPartner: SNode | null;
  scoringStateTicksSoFar: number;

  // At each time tick, the node's current location is logged in `previousLoggedLocation` with some probability.
  previousLoggedLocation: Point;
  previousLoggedTime: number;

  isFacingLeft = true;
  lastFlipT = -100; // Allow flipping immediately at t=0.

  constructor(level: Level, public x: number, public y: number) {
    this.r = level.creatureRadius();
    this.previousLoggedLocation = { x: x, y: y };
    this.previousLoggedTime = 0;
    this.dead = false;

    this.scoring = false;
    this.scoringPartner = null;
    this.scoringStateTicksSoFar = 0;

    this.goalStack = [];
    this.turnSign = 1;
  }

  fixPosition(p?: Point): void {
    if (!p) p = this;
    this.fx = this.x = p.x;
    this.fy = this.y = p.y;
    this.vx = this.vy = 0;
  }

  unfixPosition(): void {
    this.fx = null;
    this.fy = null;
  }

  updateFaceDirection(t: number): void {
    // Don't update direction too often.
    if (this.lastFlipT + 30 > t) return;
    if (this.vx < 0 && !this.isFacingLeft) {
      this.isFacingLeft = true;
      this.lastFlipT = t;
    } else if (this.vx > 0 && this.isFacingLeft) {
      this.isFacingLeft = false;
      this.lastFlipT = t;
    }
  }
}

export function isCreature(n: unknown): n is Creature {
  return n instanceof Creature;
}

export function isLiveCreature(n: unknown): n is Creature {
  return isCreature(n) && !n.dead;
}

export enum WallState {
  // Still being built. Should not cause collisions.
  PROVISIONAL,

  // Built. Impermeable.
  BUILT,
}

export class Wall {
  points: Array<Point> = [];
  state: WallState = WallState.PROVISIONAL;
  halfWidth: number;

  joints: Array<WallJoint> = [];
  segments: Array<SegmentNode> = [];

  constructor(level: Level) {
    this.halfWidth = level.wallHalfWidth;
  }

  // Add a point to the wall. This should only be called if the wall is still in
  // state PROVISIONAL.
  addPoint(p: Point): void {
    this.points.push({ x: p.x, y: p.y });
  }

  // Add a point to the wall if it is farther than minSquaredDist away from
  // the current last point in the wall. This should only be called if the wall
  // is still in state PROVISIONAL.
  maybeAddPoint(p: Point, minSquaredDist: number): void {
    if (
      squaredDistance(p, this.points[this.points.length - 1]) > minSquaredDist
    ) {
      this.addPoint(p);
    }
  }

  // Construct joint and segment nodes based on the wall's points, and change the
  // wall state to BUILT.
  complete(): void {
    for (let i = 0; i < this.points.length; i++) {
      const point = this.points[i];
      this.joints.push(new WallJoint(point.x, point.y, this));

      if (i == 0) continue;
      const prevPoint = this.points[i - 1];
      this.segments.push(new SegmentNode(prevPoint, point, this));
    }
    this.state = WallState.BUILT;
  }
}

export interface WallComponent extends SNode {
  wall: Wall;
}

export function isWallComponent(n: SNode): n is WallComponent {
  return n instanceof WallJoint || n instanceof SegmentNode;
}

export class WallJoint implements WallComponent {
  r: number;

  constructor(public x: number, public y: number, public wall: Wall) {
    this.r = wall.halfWidth;
  }
}

export function isImpassableCircle(n: SNode): boolean {
  return isLiveCreature(n) || n instanceof WallJoint;
}

export function isImpassableSegment(n: SNode): n is SegmentNode {
  return n instanceof SegmentNode;
}

// TODO: distinguish wall segments from general SegmentNodes, perhaps using inheritance.
export class SegmentNode implements WallComponent {
  r: number;
  x: number;
  y: number;

  // Precomuptations.
  // The vector from `left` to `right`, i.e., `right - left`.
  vec: Point;
  length: number;
  length2: number;

  constructor(public left: Point, public right: Point, public wall: Wall) {
    this.length2 = squaredDistance(left, right);
    this.x = 0.5 * (left.x + right.x);
    this.y = 0.5 * (left.y + right.y);
    // The minimum berth from the line between `left` and `right` within which we need to check for collisions.
    this.r = Math.sqrt(this.length2 / 4 + wall.halfWidth * wall.halfWidth);
    this.length = Math.sqrt(this.length2);
    this.vec = {
      x: right.x - left.x,
      y: right.y - left.y,
    };
  }
}

export class Party implements SNode {
  r: number;
  age: number;
  visibleR: number;

  constructor(public x: number, public y: number) {
    this.age = 0;
    this.r = 80;
    this.visibleR = 50;
  }

  expired(): boolean {
    return this.age > 1000;
  }
}

export function isParty(n: SNode): n is Party {
  return n instanceof Party;
}

export type Interaction = (
  node1: SNode,
  node2: SNode,
  ...args: unknown[]
) => void;

export interface SForceCollide extends d3.Force<SNode, undefined> {
  interaction(name: string): Interaction;
  interaction(name: string, f: Interaction): SForceCollide;
}

export interface TempScoreIndicator {
  x?: number;
  y?: number;
  text?: string;
  color: string;
}
