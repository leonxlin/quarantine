import * as d3 from "d3";


export function squaredDistance(p1: Point, p2: Point): number {
  const dx = p1.x - p2.x,
    dy = p1.y - p2.y;
  return dx * dx + dy * dy;
}

export interface SNode extends d3.SimulationNodeDatum {
  r?: number;
  type?: string;
}


export interface Point {
  x?: number;
  y?: number;
}

export class Creature implements SNode {
  r: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  type = "creature";
  infected = false;
  health = 1;
  currentScore = 0;
  goal?: Point;
  // At each time tick, the node's current location is logged in `previousLoggedLocation` with some probability.
  previousLoggedLocation: Point;

  // Used by d3 simulation code.
  index?: number;

  constructor(x: number, y: number) {
    this.r = Math.random() * 5 + 4;
    this.x = x;
    this.y = y;
    this.previousLoggedLocation = { x: x, y: y };
  }
}

export function isCreature(n: SNode): n is Creature {
  return n instanceof Creature;
}

export class SegmentNode implements SNode {
  type: "wallsegment";

  // Fields required for d3.SimulationNodeDatum.
  r: number;
  x?: number;
  y?: number;
  fx?: number;
  fy?: number;
  vx?: number;
  vy?: number;
  index?: number;

  // The two endpoints of the segment.
  left?: Point;
  right?: Point;

  // Precomuptations.
  // The vector from `left` to `right`, i.e., `right - left`.
  vec?: Point;
  length?: number;
  length2?: number;

  constructor(left:Point, right:Point, half_width:number) {

    this.left = left;
    this.right = right;
        this.length2 = squaredDistance(left, right);
          this.fx = this.x = 0.5 * (left.x + right.x);
          this.fy = this.y = 0.5 * (left.y + right.y);
          // The minimum berth from the line between `left` and `right` within which we need to check for collisions.
          this.r = Math.sqrt(
            this.length2 / 4 + half_width * half_width
          );
          this.length = Math.sqrt(this.length2);
          this.vec = {
            x: right.x - left.x,
            y: right.y - left.y,
          };
  }
}

export type Interaction = (
  node1: SNode,
  node2: SNode,
  ...args: unknown[]
) => void;

export interface SForceCollide extends d3.ForceCollide<SNode> {
  interaction(name: string): Interaction;
  interaction(name: string, f: Interaction): SForceCollide;
}

export interface TempScoreIndicator {
  x?: number;
  y?: number;
  ticksRemaining?: number;
  text?: string;
}
