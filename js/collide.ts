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

import { quadtree } from "d3-quadtree";
import {
  SNode,
  SegmentNode,
  SForceCollide,
  Interaction,
  isImpassableCircle,
  isCursorNode,
  isImpassableSegment,
  isLiveCreature,
  isWallComponent,
  isParty,
} from "./simulation-types";
import { DebugInfo } from "./debug-info";
import { World } from "./world";

function jiggle(): number {
  return (Math.random() - 0.5) * 1e-6;
}

function getX(d: SNode): number {
  return d.fx || d.x + d.vx;
}

function getY(d: SNode): number {
  return d.fy || d.y + d.vy;
}

// Handles collision between two nodes.
// TODO: document arguments.
export function collisionInteraction(
  node1: SNode,
  node2: SNode,
  x: number,
  y: number,
  l: number,
  r: number,
  ri2: number,
  rj: number
): void {
  if (isImpassableCircle(node1)) {
    if (isImpassableCircle(node2)) {
      circleCircleCollisionInteraction(node1, node2, x, y, l, r, ri2, rj);
    } else if (isImpassableSegment(node2)) {
      circleLineCollisionInteraction(node1, node2);
    }
  } else if (isImpassableSegment(node1)) {
    if (isImpassableCircle(node2)) {
      circleLineCollisionInteraction(node2, node1);
    }
  } else if (isCursorNode(node1)) {
    if (isImpassableCircle(node2)) {
      node1.reportPotentialTarget(node2, l);
    } else if (isImpassableSegment(node2)) {
      circleLineCollisionInteraction(node1, node2);
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
  node1.vx += (x *= l) * (r = (rj *= rj) / (ri2 + rj));
  node1.vy += (y *= l) * r;
  node2.vx -= x * (r = 1 - r);
  node2.vy -= y * r;
}

// Handles collision between a circle and line segment with a certain width.
// The segment is assumed to be immovable.
function circleLineCollisionInteraction(
  circleNode: SNode,
  segmentNode: SegmentNode
): void {
  // TODO: figure out best way to pass WALL_HALF_WIDTH into this function.
  const WALL_HALF_WIDTH = 5;

  const a = segmentNode.vec.x,
    b = segmentNode.vec.y;
  const nx = circleNode.x - segmentNode.left.x,
    ny = circleNode.y - segmentNode.left.y;
  const nxpc = a * nx + b * ny;
  // If creature is off to the "side" of the segment, we ignore.
  if (nxpc < 0 || nxpc > segmentNode.length2) return;

  const nyp = (a * ny - b * nx) / segmentNode.length;

  // Min distance we need to move the creature in order to not be overlapping with this wall segment.
  const discrepancy = WALL_HALF_WIDTH + circleNode.r - Math.abs(nyp);
  if (discrepancy <= 0) return;

  if (isCursorNode(circleNode)) {
    circleNode.reportPotentialTarget(segmentNode, 0);
    return;
  }

  const sign = nyp > 0 ? 1 : -1;
  // Without the scaling by pointCircleFactor, the movement of creatures near walls is too jittery.
  const commonFactor =
    ((sign * discrepancy) / segmentNode.length) *
    window.game.world.pointCircleFactor;
  circleNode.vx += -b * commonFactor;
  circleNode.vy += a * commonFactor;
}

// Returns the collide force.
export default function (world: World, debugInfo: DebugInfo): SForceCollide {
  // Named interactions between pairs of nodes.
  const interactions = new Map<string, Interaction>();

  function force() {
    const startTime = Date.now();

    let node, xi, yi, ri, ri2;

    // Add all collidable nodes to quadtree.
    const tree = quadtree(world.creatures, getX, getY)
      .addAll(world.parties)
      .add(world.cursorNode);
    for (const wall of world.walls) {
      tree.addAll(wall.joints).addAll(wall.segments);
    }
    tree.visitAfter(prepare);

    // For each node, visit other nodes that could collide.
    for (node of (world.creatures as SNode[]).concat([world.cursorNode])) {
      // Only loop through nodes that might need to respond to a collision.
      if (!(isLiveCreature(node) || isCursorNode(node))) continue;
      if (isCursorNode(node)) node.target = null;

      ri = node.r;
      ri2 = ri * ri;
      xi = node.x + node.vx;
      yi = node.y + node.vy;
      tree.visit(apply);
    }

    function apply(quad, x0, y0, x1, y1) {
      if (!quad.data) {
        const r = quad.r;
        // Return true if there is no need to visit the children of `quad`.
        return x0 > xi + r || x1 < xi - r || y0 > yi + r || y1 < yi - r;
      }

      let q = quad;
      do {
        const data = q.data,
          rj = data.r,
          r = ri + rj;
        if (
          isWallComponent(data) ||
          isParty(data) ||
          data.index > node.index ||
          isCursorNode(node)
        ) {
          const x = xi - getX(data),
            y = yi - getY(data),
            l = x * x + y * y;
          if (l < r * r) {
            // Execute registered interactions for (node, data).
            interactions.forEach(function (interaction) {
              interaction(node, data, x, y, l, r, ri2, rj);
            });
          }
        }

        q = q.next;
      } while (q);
    }

    debugInfo.recentCollisionForceRuntime.push(Date.now() - startTime);
  }

  // Sets the radii of each quad, both leaves and internal nodes. Should be invoked in postorder
  // sequence.
  function prepare(quad) {
    if (quad.data) {
      quad.r = quad.data.r;

      // Take the maximum radius of all items that are centered at the exact same (x, y).
      let q = quad;
      while (q.next) {
        q = q.next;
        quad.r = Math.max(quad.r, q.data.r);
      }
      return;
    }
    for (let i = (quad.r = 0); i < 4; ++i) {
      if (quad[i] && quad[i].r > quad.r) {
        quad.r = quad[i].r;
      }
    }
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
