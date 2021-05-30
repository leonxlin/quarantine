import * as d3 from "d3";
import {
  SNode,
  CursorNode,
  Wall,
  Creature,
  Party,
  isCreature,
  isLiveCreature,
  squaredDistance,
} from "./simulation-types";
import collideForce from "./collide";
import { collisionInteraction } from "./collide";
import { DebugInfo } from "./debug-info";

export class World {
  nodes: SNode[];
  simulation: d3.Simulation<SNode, undefined>;
  // TODO: figure out if storing the cursor as a node is worth it. Maybe it would be cleaner and fast enough to loop through all nodes to check cursor target.
  cursorNode: CursorNode;
  // TODO: Deduplicate these parameters with the equivalents in view.ts.
  width = 900;
  height = 600;

  score = 0;
  t = 0;

  paused = false;

  walls: Set<Wall> = new Set();
  parties: Array<Party> = [];

  // Figure out a better place for this constant.
  pointCircleFactor = 0.5;

  WALL_HALF_WIDTH = 5;

  constructor(render_function: (world: World) => void, debugInfo: DebugInfo) {
    this.nodes = d3.range(200).map(
      () =>
        new Creature(
          Math.random() * this.width, // x
          Math.random() * this.height // y
        )
    );
    (this.nodes[0] as Creature).infected = true;

    this.cursorNode = new CursorNode();
    this.nodes.push(this.cursorNode);

    const nodes = this.nodes;
    const width = this.width;
    const height = this.height;

    this.simulation = d3
      .forceSimulation<SNode, undefined>()
      .velocityDecay(0.2)
      .force("time", () => {
        this.t += 1;
        debugInfo.numNodes = nodes.length;
      })
      .force("agent", (alpha) => {
        nodes.forEach((n: SNode) => {
          if (!isLiveCreature(n)) return;

          let stuck = false;
          if (this.t > n.previousLoggedTime + 20 && Math.random() < 0.8) {
            stuck = squaredDistance(n, n.previousLoggedLocation) < 5;
            n.previousLoggedTime = this.t;
            n.previousLoggedLocation = { x: n.x, y: n.y };
          }

          if (!("goal" in n)) {
            n.goal = {
              x: Math.random() * width,
              y: Math.random() * height,
            };
          } else if (squaredDistance(n, n.goal) < (n.r + 8) * (n.r + 8)) {
            if (n.goalStack.length > 0) {
              n.goal = n.goalStack.pop();
            } else {
              n.goal = {
                x: Math.random() * width,
                y: Math.random() * height,
              };
            }
          } else if (stuck) {
            if (n.goalStack.length > 15) {
              n.goal = n.goalStack[0];
              n.goalStack = [];
            } else {
              if (n.goalStack.length == 0) {
                n.turnSign = Math.random() < 0.5 ? -1 : 1;
              }
              n.goalStack.push(n.goal);
              let vec = {
                x: n.goal.x - n.x,
                y: n.goal.y - n.y,
              };
              vec = {
                x: vec.x * 0.6 - vec.y * 0.8 * n.turnSign,
                y: vec.x * 0.8 * n.turnSign + vec.y * 0.6,
              };
              const veclen = Math.sqrt(vec.x * vec.x + vec.y * vec.y);
              n.goal = {
                x: n.x + (100 * vec.x) / veclen,
                y: n.y + (100 * vec.y) / veclen,
              };

              if (
                n.goalStack.length > 4 &&
                squaredDistance(n, n.goal) >
                  10 * squaredDistance(n, n.goalStack[0])
              ) {
                n.goal = n.goalStack[0];
                n.goalStack = [];
              }
            }
          }

          const len = Math.sqrt(squaredDistance(n, n.goal));
          n.vx += (alpha * (n.goal.x - n.x)) / len;
          n.vy += (alpha * (n.goal.y - n.y)) / len;
        });
      })
      .force(
        "interaction",
        collideForce(
          /* radius */ function (d) {
            return d.r;
          },
          debugInfo
        )
          .interaction("collision", collisionInteraction)
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
            node1.ticksLeftInScoringState = 60;
            node2.ticksLeftInScoringState = 60;
          })
      )
      .force("health", () => {
        nodes.forEach((n) => {
          if (!isCreature(n) || !n.infected) return;
          if (!n.dead) {
            n.health -= 0.0003;
            if (n.health <= 0) {
              n.dead = true;
              n.ticksSinceDeath = 0;
              n.health = 0;
              this.score -= 200;
            }
          } else {
            n.ticksSinceDeath++;
          }
        });
      })
      .force("scoring-state", () => {
        nodes.forEach((n) => {
          if (!isLiveCreature(n) || !n.scoring) return;

          n.ticksLeftInScoringState--;
          if (n.ticksLeftInScoringState <= 0) {
            n.scoring = false;
            n.fx = null;
            n.fy = null;
          }
        });
      })
      .force("party-expiration", () => {
        this.parties.forEach((p) => {
          p.age++;
        });
      })
      .nodes(nodes)
      .on("tick", () => {
        render_function(this);
      })
      // This is greater than alphaMin, so the simulation should run indefinitely (until paused).
      .alphaTarget(0.3)
      // Don't start the simulation yet.
      .stop();
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
