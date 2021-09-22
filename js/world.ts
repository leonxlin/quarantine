import * as d3 from "d3";
import {
  SNode,
  CursorNode,
  Wall,
  WallState,
  Creature,
  Party,
  isLiveCreature,
  squaredDistance,
  Point,
  RadiusObject,
  isQuadtreeLeafNode,
} from "./simulation-types";
import collideForce from "./collide";
import { getNextX, getNextY, collisionInteraction } from "./collide";
import { DebugInfo } from "./debug-info";
import { Level } from "./levels";

import {
  initTesselator,
  faceContainsPoint,
  getTrianglePoints,
  pointIsLeftOfEdge,
} from "./tessy";

import libtess from "libtess/libtess.cat.js";

export class World {
  simulation: d3.Simulation<Creature, undefined>;
  // TODO: figure out if storing the cursor as a node is worth it. Maybe it would be cleaner and fast enough to loop through all nodes to check cursor target.
  cursorNode: CursorNode;
  // TODO: Deduplicate these parameters with the equivalents in view.ts.
  width = 900;
  height = 600;

  score = 0;
  t = 0;

  paused = false;

  creatures: Array<Creature> = [];
  deadCreatures: Array<Creature> = [];
  walls: Set<Wall> = new Set();
  parties: Array<Party> = [];

  quadtree: d3.Quadtree<Creature | CursorNode>;

  victoryCheckEnabled = true;

  tessellator;
  computedTriangulationSinceLastWall = false;
  // TODO: consider using a wrapper for the mesh.
  mesh: libtess.GluMesh;
  needToLocateCreaturesFromScratch = false;

  constructor(
    readonly level: Level,
    renderFunction: (world: World) => void,
    victoryCallback: () => void,
    debugInfo: DebugInfo
  ) {
    this.tessellator = initTesselator((mesh) => {
      this.mesh = mesh;
      this.needToLocateCreaturesFromScratch = true;
    });

    this.creatures = d3.range(level.numCreatures).map(
      () =>
        new Creature(
          level,
          Math.random() * this.width, // x
          Math.random() * this.height // y
        )
    );
    this.creatures[0].infected = true;

    this.cursorNode = new CursorNode();

    const width = this.width;
    const height = this.height;

    this.simulation = d3
      .forceSimulation<Creature, undefined>()
      .velocityDecay(0.2)
      .force("time", () => {
        debugInfo.startTimer("step");
        this.t += 1;
      })
      .force("victory", () => {
        if (this.score >= level.victoryScore && this.victoryCheckEnabled) {
          victoryCallback();
        }
      })
      .force("enforce-boundary", () => {
        // Forces may push creatures outside the boundary, but this step
        // ensures each creature can be assumed to be inside the boundary
        // at the beginning of each tick.
        this.creatures.forEach((c) => {
          c.x = Math.max(Math.min(c.x, this.width), 0);
          c.y = Math.max(Math.min(c.y, this.height), 0);
        });
      })
      .force("agent", (alpha) => {
        this.creatures.forEach((c: Creature) => {
          let stuck = false;
          if (this.t > c.previousLoggedTime + 20 && Math.random() < 0.8) {
            stuck = squaredDistance(c, c.previousLoggedLocation) < 5;
            c.previousLoggedTime = this.t;
            c.previousLoggedLocation = { x: c.x, y: c.y };
          }

          if (!("goal" in c)) {
            c.goal = {
              x: Math.random() * width,
              y: Math.random() * height,
            };
          } else if (squaredDistance(c, c.goal) < (c.r + 8) * (c.r + 8)) {
            if (c.goalStack.length > 0) {
              c.goal = c.goalStack.pop();
            } else {
              c.goal = {
                x: Math.random() * width,
                y: Math.random() * height,
              };
            }
          } else if (stuck) {
            if (c.goalStack.length > 15) {
              c.goal = c.goalStack[0];
              c.goalStack = [];
            } else {
              if (c.goalStack.length == 0) {
                c.turnSign = Math.random() < 0.5 ? -1 : 1;
              }
              c.goalStack.push(c.goal);
              let vec = {
                x: c.goal.x - c.x,
                y: c.goal.y - c.y,
              };
              vec = {
                x: vec.x * 0.6 - vec.y * 0.8 * c.turnSign,
                y: vec.x * 0.8 * c.turnSign + vec.y * 0.6,
              };
              const veclen = Math.sqrt(vec.x * vec.x + vec.y * vec.y);
              c.goal = {
                x: c.x + (100 * vec.x) / veclen,
                y: c.y + (100 * vec.y) / veclen,
              };

              if (
                c.goalStack.length > 4 &&
                squaredDistance(c, c.goal) >
                  10 * squaredDistance(c, c.goalStack[0])
              ) {
                c.goal = c.goalStack[0];
                c.goalStack = [];
              }
            }
          }

          const len = Math.sqrt(squaredDistance(c, c.goal));
          c.vx += (alpha * (c.goal.x - c.x)) / len;
          c.vy += (alpha * (c.goal.y - c.y)) / len;
        });
      })
      .force("quadtree", () => {
        debugInfo.startTimer("build-quadtree");
        this.rebuildQuadtree();
        debugInfo.stopTimer("build-quadtree");
      })
      .force(
        "interaction",
        collideForce(this, debugInfo)
          .interaction("collision", collisionInteraction.bind(null, level))
          .interaction("party", (creature, party) => {
            if (!(party instanceof Party && isLiveCreature(creature))) return;
            if (party.expired()) return;
            if (Math.random() < 0.02) {
              creature.goal = { x: party.x, y: party.y };
            }
          })
          .interaction("contagion", (node1, node2) => {
            if (
              Math.random() < 0.01 &&
              isLiveCreature(node1) &&
              isLiveCreature(node2)
            )
              node1.infected = node2.infected =
                node1.infected || node2.infected;
          })
          .interaction("score", (node1: SNode, node2: SNode) => {
            if (
              !isLiveCreature(node1) ||
              !isLiveCreature(node2) ||
              (node1.scoring && node2.scoring) ||
              Math.random() > 0.0002
            )
              return;

            this.score += 10;
            node1.fx = node1.x;
            node1.fy = node1.y;
            node2.fx = node2.x;
            node2.fy = node2.y;
            node1.scoring = true;
            node2.scoring = true;
            node1.scoringPartner = node2;
            node2.scoringPartner = node1;
            node1.scoringStateTicksSoFar = 0;
            node2.scoringStateTicksSoFar = 0;
          })
      )
      .force("health", () => {
        let newlyDead = 0;
        this.creatures.forEach((c) => {
          if (!c.infected) return;
          c.health -= 0.0003;
          if (c.health <= 0) {
            newlyDead++;
            c.dead = true;
            c.ticksSinceDeath = 0;
            c.health = 0;
            this.score -= 200;
          }
        });
        this.deadCreatures.forEach((c) => {
          c.ticksSinceDeath++;
        });

        // Move newly dead creatures from this.creatures to this.deadCreatures.
        // TODO: check if this should be made faster.
        if (newlyDead == 0) return;
        this.deadCreatures.push(
          ...this.creatures.filter((c: Creature) => {
            return c.dead;
          })
        );
        this.creatures = this.creatures.filter((c: Creature) => {
          return !c.dead;
        });
      })
      .force("scoring-state", () => {
        this.creatures.forEach((c) => {
          if (!c.scoring) return;

          c.scoringStateTicksSoFar++;
          if (c.scoringStateTicksSoFar >= level.scoringStateTicks) {
            c.scoring = false;
            c.fx = null;
            c.fy = null;
          }
        });
      })
      .force("party-expiration", () => {
        this.parties.forEach((p) => {
          p.age++;
        });
      })
      .force("face-direction", () => {
        this.creatures.forEach((c) => {
          c.updateFaceDirection(this.t);
        });
      })
      .force("triangles", () => {
        debugInfo.startTimer("triangulation");

        if (this.computedTriangulationSinceLastWall) {
          debugInfo.stopTimer("triangulation");
          return;
        }
        this.computedTriangulationSinceLastWall = true;

        const points: Array<Point> = [
          { x: 0, y: 0 },
          { x: this.width, y: 0 },
          { x: this.width, y: this.height },
          { x: 0, y: this.height },
        ];

        this.tessellator.gluTessNormal(0, 0, 1);

        const triangleVerts = [];
        this.tessellator.gluTessBeginPolygon(triangleVerts);

        // for (var i = 0; i < contours.length; i++) {
        this.tessellator.gluTessBeginContour();
        // var contour = contours[i];
        for (const p of points) {
          const coords = [p.x, p.y, 0];
          this.tessellator.gluTessVertex(coords, coords);
        }
        this.tessellator.gluTessEndContour();
        // }

        for (const wall of this.walls) {
          if (wall.state != WallState.BUILT || wall.points.length < 1) continue;
          this.tessellator.gluTessBeginContour();

          for (const p of wall.polygon) {
            const coords = [p[0], p[1]];
            this.tessellator.gluTessVertex(coords, coords);
          }

          this.tessellator.gluTessEndContour();
        }
        // The actual triangulation happens in this call. Which will invoke the
        // mesh callback set in initTesselator, setting this.mesh.
        this.tessellator.gluTessEndPolygon();
        debugInfo.stopTimer("triangulation");
      })
      .force("locate-creatures", () => {
        debugInfo.startTimer("locate-creatures");
        if (!this.needToLocateCreaturesFromScratch) {
          // Point location algorithm from
          // https://www.cl.cam.ac.uk/techreports/UCAM-CL-TR-728.pdf
          this.creatures.forEach((c) => {
            if (!c.meshFace) return;

            let e = c.meshFace.anEdge;
            if (!pointIsLeftOfEdge(c, e)) e = e.sym;
            for (let i = 0; i < 100; ++i) {
              if (
                (e.org.data[0] == c.x && e.org.data[1] == c.y) ||
                (e.dst().data[0] == c.x && e.dst().data[1] == c.y)
              ) {
                c.meshFace = e.lFace;
                return;
              }

              let whichop = 0;
              if (pointIsLeftOfEdge(c, e.oNext)) whichop += 1;
              if (pointIsLeftOfEdge(c, e.dPrev())) whichop += 2;

              switch (whichop) {
                case 0:
                  c.meshFace = e.lFace;
                  return;
                case 1:
                  e = e.oNext;
                  continue;
                case 2:
                  e = e.dPrev();
                  continue;
                case 3:
                  if (
                    (e.oNext.org.data[0] - e.oNext.dst().data[0]) *
                      (c.x - e.oNext.dst().data[0]) +
                      (e.oNext.org.data[1] - e.oNext.dst().data[1]) *
                        (c.y - e.oNext.dst().data[1]) <
                    0
                  ) {
                    e = e.dPrev();
                  } else {
                    e = e.oNext;
                  }
              }
            }
            console.log("No meshface found after 100 iterations");
            c.meshFace = null;
            return;
          });

          debugInfo.stopTimer("locate-creatures");
          return;
        }
        this.needToLocateCreaturesFromScratch = false;

        // TODO: make this faster.
        // Search for creatures within the bounding box of each triangle. Record
        // when a creature's center lies in a triangle.
        for (let f = this.mesh.fHead.prev; f !== this.mesh.fHead; f = f.prev) {
          const trianglePoints = getTrianglePoints(f);
          const xs = trianglePoints.map((p) => p.x);
          const ys = trianglePoints.map((p) => p.y);
          const xmin = Math.min(...xs),
            xmax = Math.max(...xs);
          const ymin = Math.min(...ys),
            ymax = Math.max(...ys);

          this.quadtree.visit((node, x0, y0, x1, y1) => {
            if (isQuadtreeLeafNode(node)) {
              do {
                const c = node.data;
                if (!isLiveCreature(c)) continue;
                const x = getNextX(c),
                  y = getNextY(c);
                if (
                  x >= xmin &&
                  x < xmax &&
                  y >= ymin &&
                  y < ymax &&
                  faceContainsPoint(f, c)
                ) {
                  c.meshFace = f;
                }
              } while ((node = node.next));
            }
            return x0 >= xmax || y0 >= ymax || x1 < xmin || y1 < ymin;
          });
        }

        debugInfo.stopTimer("locate-creatures");
      })
      // Only moving objects need to be registered as nodes in the d3 simulation.
      .nodes(this.creatures)
      .on("tick", () => {
        // Refresh d3 simulation nodes if any creatures have newly died.
        if (this.creatures.length != this.simulation.nodes().length) {
          this.simulation.nodes(this.creatures);
        }
        renderFunction(this);
      })
      // This is greater than alphaMin, so the simulation should run indefinitely (until paused).
      .alphaTarget(0.3)
      // Don't start the simulation yet.
      .stop();
  }

  private rebuildQuadtree(): void {
    this.quadtree = d3
      .quadtree<Creature | CursorNode>(this.creatures, getNextX, getNextY)
      .add(this.cursorNode);

    // Set radius on leaves and internal nodes, in postorder sequence.
    this.quadtree.visitAfter((quad) => {
      const rquad = (quad as unknown) as RadiusObject;
      if (isQuadtreeLeafNode(quad)) {
        rquad.r = quad.data.r;

        // Take the maximum radius of all items that are centered at the exact same (x, y).
        let q = quad;
        while (q.next) {
          q = q.next;
          rquad.r = Math.max(rquad.r, q.data.r);
        }
        return;
      }

      rquad.r = 0;
      for (let i = 0; i < 4; ++i) {
        if (!quad[i]) continue;
        const rquadi = (quad[i] as unknown) as RadiusObject;
        if (rquadi.r > rquad.r) {
          rquad.r = rquadi.r;
        }
      }
    });
  }

  startNewWall(p: Point): Wall {
    const wall = new Wall(this.level);
    wall.addPoint(p);
    this.walls.add(wall);
    return wall;
  }

  completeWall(wall: Wall): void {
    wall.complete();
    this.computedTriangulationSinceLastWall = false;
  }

  deleteWall(wall: Wall): void {
    this.walls.delete(wall);
    this.computedTriangulationSinceLastWall = false;
  }

  createParty(p: Point): Party {
    const party = new Party(p.x, p.y);
    this.parties.push(party);
    return party;
  }

  togglePause(): void {
    if (this.paused) {
      this.start();
    } else {
      this.stop();
    }
  }

  start(): void {
    this.simulation.restart();
    this.paused = false;
  }

  stop(): void {
    this.simulation.stop();
    this.paused = true;
  }
}
