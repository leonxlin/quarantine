// The code in this file is adapted
// from https://github.com/d3/d3-force/blob/master/src/collide.js, which carries
// the following license (BSD 3-Clause "New" or "Revised" License):

// Copyright 2010-2016 Mike Bostock
// All rights reserved.

// Redistribution and use in source and binary forms, with or without modification,
// are permitted provided that the following conditions are met:

// * Redistributions of source code must retain the above copyright notice, this
//   list of conditions and the following disclaimer.

// * Redistributions in binary form must reproduce the above copyright notice,
//   this list of conditions and the following disclaimer in the documentation
//   and/or other materials provided with the distribution.

// * Neither the name of the author nor the names of contributors may be used to
//   endorse or promote products derived from this software without specific prior
//   written permission.

// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
// ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
// WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
// DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
// ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
// (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
// LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
// ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
// (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
// SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

// This file defines a d3 force (see https://github.com/d3/d3-force#forces) that
// detects nearby objects on the map and handles interactions between them.

import {
  Creature,
  CursorNode,
  SNode,
  SegmentNode,
  SForceCollide,
  Interaction,
  isImpassableCircle,
  isCursorNode,
  isImpassableSegment,
  isQuadtreeLeafNode,
  RadiusObject,
  isLiveCreature,
  isCreature,
} from "./simulation-types";
import { DebugInfo } from "./debug-info";
import { World } from "./world";
import { Level } from "./levels";

function jiggle(): number {
  return (Math.random() - 0.5) * 1e-6;
}

// Guesses for the next coordinates of `d`; used for collision handling to avoid
// jitteriness.
export function getNextX(d: SNode): number {
  return isLiveCreature(d) ? d.x + d.vx : d.x;
}
export function getNextY(d: SNode): number {
  return isLiveCreature(d) ? d.y + d.vy : d.y;
}

// Handles collision between two nodes.
// TODO: document arguments.
export function collisionInteraction(
  level: Level,
  c: Creature | CursorNode,
  n: SNode,
  x: number,
  y: number,
  l: number,
  r: number,
  ri2: number,
  rj: number
): void {
  if (isCreature(c)) {
    if (isImpassableCircle(n)) {
      // Note the reversal of `n` and `c`!
      // TODO: this is confusing as hell.
      circleCircleCollisionInteraction(n, c, x, y, l, r, ri2, rj);
    } else if (isImpassableSegment(n)) {
      circleLineCollisionInteraction(level, c, n);
    }
  } else if (isCursorNode(c)) {
    if (isImpassableCircle(n)) {
      c.reportPotentialTarget(n, l);
    } else if (isImpassableSegment(n)) {
      circleLineCollisionInteraction(level, c, n);
    }
  }
}

// Handles collision between two circles.
// TODO: document arguments.
function circleCircleCollisionInteraction(
  node1: SNode,
  node2: SNode,
  x: number,
  y: number,
  l: number,
  r: number,
  ri2: number,
  rj: number
): void {
  if (x === 0) (x = jiggle()), (l += x * x);
  if (y === 0) (y = jiggle()), (l += y * y);
  l = (r - (l = Math.sqrt(l))) / l;
  x *= l;
  y *= l;
  const rj2 = rj * rj;
  const fi = rj2 / (ri2 + rj2);
  const fj = 1 - fi;
  if (isLiveCreature(node1)) {
    node1.vx += x * fi;
    node1.vy += y * fi;
  }
  if (isLiveCreature(node2)) {
    node2.vx -= x * fj;
    node2.vy -= y * fj;
  }
}

// Handles collision between a circle and line segment with a certain width.
// The segment is assumed to be immovable.
function circleLineCollisionInteraction(
  level: Level,
  circleNode: SNode,
  segmentNode: SegmentNode
): void {
  const a = segmentNode.vec.x,
    b = segmentNode.vec.y;
  const nx = circleNode.x - segmentNode.left.x,
    ny = circleNode.y - segmentNode.left.y;
  const nxpc = a * nx + b * ny;
  // If creature is off to the "side" of the segment, we ignore.
  if (nxpc < 0 || nxpc > segmentNode.length2) return;

  const nyp = (a * ny - b * nx) / segmentNode.length;

  // Min distance we need to move the creature in order to not be overlapping with this wall segment.
  const discrepancy = segmentNode.wall.halfWidth + circleNode.r - Math.abs(nyp);
  if (discrepancy <= 0) return;

  if (isCursorNode(circleNode)) {
    circleNode.reportPotentialTarget(segmentNode, 0);
    return;
  }
  if (!isLiveCreature(circleNode)) return;

  const sign = nyp > 0 ? 1 : -1;
  // Without the scaling by pointCircleFactor, the movement of creatures near walls is too jittery.
  const commonFactor =
    ((sign * discrepancy) / segmentNode.length) * level.wallCollisionFactor;
  circleNode.vx += -b * commonFactor;
  circleNode.vy += a * commonFactor;
}

// Returns the collide force.
export default function (world: World, debugInfo: DebugInfo): SForceCollide {
  // Named interactions between pairs of nodes.
  const interactions = new Map<string, Interaction>();

  function force() {
    debugInfo.startTimer("collision");

    let node, xi, yi, ri, ri2;

    const tree = world.quadtree;

    const nodesToCollide = (world.creatures as SNode[]).concat(
      ...[...world.walls].map((w) => w.joints),
      ...[...world.walls].map((w) => w.segments),
      world.parties
    );
    world.cursorNode.target = null;

    // For each node, visit other nodes that could collide.
    for (node of nodesToCollide) {
      ri = node.r;
      ri2 = ri * ri;
      xi = getNextX(node);
      yi = getNextY(node);

      tree.visit((quad, x0, y0, x1, y1) => {
        if (!isQuadtreeLeafNode(quad)) {
          const r = ((quad as unknown) as RadiusObject).r + ri;
          // Return true if there is no need to visit the children of `quad`.
          return x0 > xi + r || x1 < xi - r || y0 > yi + r || y1 < yi - r;
        }

        let q = quad;
        do {
          const data = q.data,
            rj = data.r,
            r = ri + rj;

          // Avoid duplicate interaction between pairs of creatures.
          if (
            isLiveCreature(node) &&
            isLiveCreature(data) &&
            node.index >= data.index
          ) {
            continue;
          }

          const x = xi - getNextX(data),
            y = yi - getNextY(data),
            l = x * x + y * y;
          if (l < r * r) {
            // Execute registered interactions for (data, node).
            interactions.forEach((interaction) => {
              interaction(data, node, x, y, l, r, ri2, rj);
            });
          }
        } while ((q = q.next));
      });
    }

    debugInfo.stopTimer("collision");
  }

  /* eslint-disable @typescript-eslint/no-explicit-any -- 
    I can't figure out how to get function overloads to work with typescript without `any`. */
  // Set a named interaction, or get the interaction with the given name.
  force.interaction = function (name: string, _?: Interaction): any {
    return arguments.length > 1
      ? (_ == null ? interactions.delete(name) : interactions.set(name, _),
        force)
      : interactions.get(name);
  };

  return force;
}
