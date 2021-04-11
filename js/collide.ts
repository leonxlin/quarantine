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
  squaredDistance,
  Point,
} from "./simulation-types.js";

function constant(x) {
  return function () {
    return x;
  };
}

function x(d) {
  return d.x + d.vx;
}

function y(d) {
  return d.y + d.vy;
}

// Handles collision between two nodes.

// TODO: make the arguments better.
//
// x is the delta x (node1 - node2)
// y is the delta y (node1 - node2)
// l is the squared distance between node1 and node2
// r is the sum of the radii of node1 and node2
// ri2 is the square of node1's radius
// rj is the radius of node2
// strength is 1
export function collisionInteraction(
  node1: SNode,
  node2: SNode,
  x: number,
  y: number,
  l: number,
  r: number,
  ri2: number,
  rj: number,
  strength: number
): void {
  if (isImpassableCircle(node1)) {
    if (isImpassableCircle(node2)) {
      circleCircleCollisionInteraction(
        node1,
        node2,
        x,
        y,
        l,
        r,
        ri2,
        rj,
        strength
      );
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

function collidePotential(overlap: number): number {
  return (
    100 * Math.max(0, overlap) + Math.max(Math.min(overlap + 3, 3), 0) * 10
  );
}

function computeOverlap(p1: Point, p2: Point, rSum: number): number {
  return rSum - Math.sqrt(squaredDistance(p1, p2));
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
  rj: number,
  strength: number
): void {
  if (!isLiveCreature(node1) || !isLiveCreature(node2)) return;

  let dp = collidePotential(
    computeOverlap({ x: node1.x + 1, y: node1.y }, node2, r)
  );
  node1.potentialXHi += dp;
  node2.potentialXLo += dp;

  dp = collidePotential(
    computeOverlap({ x: node1.x - 1, y: node1.y }, node2, r)
  );
  node1.potentialXLo += dp;
  node2.potentialXHi += dp;

  dp = collidePotential(
    computeOverlap({ x: node1.x, y: node1.y + 1 }, node2, r)
  );
  node1.potentialYHi += dp;
  node2.potentialYLo += dp;

  dp = collidePotential(
    computeOverlap({ x: node1.x, y: node1.y - 1 }, node2, r)
  );
  node1.potentialYLo += dp;
  node2.potentialYHi += dp;
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
    ((sign * discrepancy) / segmentNode.length) * window.game.pointCircleFactor;
  circleNode.vx += -b * commonFactor;
  circleNode.vy += a * commonFactor;
}

// Returns the collide force.
//
// `radius` is a function that takes a node and returns a number.
export default function (radius: (SNode) => number): SForceCollide {
  let nodes,
    radii,
    strength = 1,
    iterations = 1;
  // Named interactions between pairs of nodes.
  const interactions = new Map<string, Interaction>();

  function force() {
    const startTime = Date.now();

    const n = nodes.length;
    let i, tree, node, xi, yi, ri, ri2;

    for (let k = 0; k < iterations; ++k) {
      tree = quadtree(nodes, x, y).visitAfter(prepare);

      // For each node, visit other nodes that could collide.
      for (i = 0; i < n; ++i) {
        node = nodes[i];
        // Only loop through nodes that might need to respond to a collision.
        if (!(isLiveCreature(node) || isCursorNode(node))) continue;
        if (isCursorNode(node)) node.target = null;

        (ri = radii[node.index]), (ri2 = ri * ri);
        xi = node.x + node.vx;
        yi = node.y + node.vy;
        tree.visit(apply);
      }
    }

    function apply(quad, x0, y0, x1, y1) {
      const data = quad.data,
        rj = quad.r;
      let r = ri + rj;
      if (data) {
        // Only process pairs of creatures with the smaller index first.
        // Non-creature |data| nodes should always be processed since |node|
        // is a creature.
        if (isCursorNode(data)) return;
        if (
          !isLiveCreature(data) ||
          data.index > node.index ||
          isCursorNode(node)
        ) {
          const x = xi - data.x - data.vx,
            y = yi - data.y - data.vy,
            l = x * x + y * y;
          if (l < r * r + 2) {
            // Execute registered interactions for (node, data).
            interactions.forEach(function (interaction) {
              interaction(node, data, x, y, l, r, ri2, rj, strength);
            });
          }
        }
        return;
      }

      r += 2;
      // Return true if there is no need to visit the children of `quad`.
      return x0 > xi + r || x1 < xi - r || y0 > yi + r || y1 < yi - r;
    }

    window.game.recentCollisionForceRuntime.push(Date.now() - startTime);
  }

  function prepare(quad) {
    if (quad.data) return (quad.r = radii[quad.data.index]);
    for (let i = (quad.r = 0); i < 4; ++i) {
      if (quad[i] && quad[i].r > quad.r) {
        quad.r = quad[i].r;
      }
    }
  }

  function initialize() {
    if (!nodes) return;
    let i, node;
    const n = nodes.length;
    radii = new Array(n);
    for (i = 0; i < n; ++i)
      (node = nodes[i]), (radii[node.index] = +radius(node));
  }

  force.initialize = function (_) {
    nodes = _;
    initialize();
  };

  /* eslint-disable @typescript-eslint/no-explicit-any -- 
    I can't figure out how to get function overloads to work with typescript without `any`. */
  // Set a named interaction, or get the interaction with the given name.
  force.interaction = function (name: string, _?: Interaction): any {
    return arguments.length > 1
      ? (_ == null ? interactions.delete(name) : interactions.set(name, _),
        force)
      : interactions.get(name);
  };

  force.iterations = function (_?): any {
    return arguments.length ? ((iterations = +_), force) : iterations;
  };

  force.strength = function (_?: any): any {
    return arguments.length ? ((strength = +_), force) : strength;
  };

  force.radius = function (_?): any {
    return arguments.length
      ? ((radius = typeof _ === "function" ? _ : constant(+_)),
        initialize(),
        force)
      : radius;
  };

  return force;
}
