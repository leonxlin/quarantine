import * as d3 from "d3";

export interface SNode extends d3.SimulationNodeDatum {
  r?: number;
  type?: string;
  infected?: boolean;
  health?: number;
  currentScore?: number;
  goal?: Point;

  // At each time tick, the node's current location is logged in `previousLoggedLocation` with some probability.
  previousLoggedLocation?: Point;
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
