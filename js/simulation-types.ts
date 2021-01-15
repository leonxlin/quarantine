import * as d3 from "d3";

export interface SNode extends d3.SimulationNodeDatum {
  r?: number;
  type?: string;
}

export interface SegmentNode extends SNode {
  // The two endpoints of the segment.
  left?: Point;
  right?: Point;

  // Precomuptations.
  // The vector from `left` to `right`, i.e., `right - left`.
  vec?: Point;
  length?: number;
  length2?: number;
}

export function isCreature(n: SNode): n is Creature {
  return n instanceof Creature;
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

export interface Point {
  x?: number;
  y?: number;
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
