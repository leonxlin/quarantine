import * as ad from "./ad";

export interface Point {
  x?: number;
  y?: number;
}

export function squaredDistance(p1: Point, p2: Point): number {
  const dx = p1.x - p2.x,
    dy = p1.y - p2.y;
  return dx * dx + dy * dy;
}

// Squared distance between `p` and `target` with derivatives with respect to `p`.
export function squaredDistanceDual(p: Point, target: Point): ad.Dual {
  const dx = ad.subtract(ad.x(p.x), target.x);
  const dy = ad.subtract(ad.y(p.y), target.y);
  return ad.add(ad.square(dx), ad.square(dy));
}

// Distance between `p` and `target` with derivatives with respect to `p`.
export function distanceDual(p: Point, target: Point): ad.Dual {
  return ad.sqrt(squaredDistanceDual(p, target));
}
