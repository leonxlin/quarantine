import * as d3 from "d3";
import {
  SNode,
  Point,
  TempScoreIndicator,
  SegmentNode,
  WallJoint,
  Creature,
  Party,
  isCreature,
  isLiveCreature,
  squaredDistance,
} from "./simulation-types.js";
import collideForce from "./collide.js";
import { collisionInteraction } from "./collide.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
// Needed to make typescript happy when defining properties on the global window object for easy debugging.
declare global {
  interface Window {
    game: Game;
    d3: any;
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

enum WallState {
  // Still being built. Should not cause collisions.
  PROVISIONAL,

  // Built. Impermeable.
  BUILT,
}

class Wall {
  points: Array<Point> = [];
  state: WallState.PROVISIONAL;
}

// Not sure if a class is really the best way to organize this code...
// TODO: revisit code organization.
export class Game {
  canvas;
  nodes: SNode[];
  simulation: d3.Simulation<SNode, undefined>;

  score = 0;
  tempScoreIndicators: TempScoreIndicator[] = [];

  // Some crude performance monitoring.
  numTicksSinceLastRecord = 0;
  recentTicksPerSecond: number[] = new Array(20);
  recentTicksPerSecondIndex = 0;
  recentCollisionForceRuntime: number[] = [];

  paused = false;
  toolbeltMode = "select-mode";

  walls: Array<Wall> = [];
  parties: Array<Party> = [];

  // Figure out a better place for this constant.
  pointCircleFactor = 0.5;

  WALL_HALF_WIDTH = 5;

  constructor() {
    this.canvas = document.querySelector("canvas");
    this.nodes = d3.range(200).map(
      () =>
        new Creature(
          Math.random() * this.canvas.width, // x
          Math.random() * this.canvas.height // y
        )
    );
    (this.nodes[0] as Creature).infected = true;

    const nodes = this.nodes;
    const canvas = this.canvas;

    this.simulation = d3
      .forceSimulation<SNode, undefined>()
      .velocityDecay(0.2)
      .force("agent", function (alpha) {
        nodes.forEach(function (n: SNode) {
          if (!isLiveCreature(n)) return;

          let stuck = false;
          if (Math.random() < 0.05) {
            stuck = squaredDistance(n, n.previousLoggedLocation) < 5;
            n.previousLoggedLocation = { x: n.x, y: n.y };
          }

          if (!("goal" in n) || squaredDistance(n, n.goal) < 10 || stuck) {
            n.goal = {
              x: Math.random() * canvas.width,
              y: Math.random() * canvas.height,
            };
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
          }
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
            if (Math.random() < 0.01 && isCreature(node1) && isCreature(node2))
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
      .force("health", function () {
        nodes.forEach(function (n) {
          if (!isCreature(n) || !n.infected) return;
          n.health -= 0.0003;
          if (n.health <= 0) {
            n.dead = true;
            n.health = 0;
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
      .on("tick", this.tick.bind(this))
      // This is greater than alphaMin, so the simulation should run indefinitely (until paused).
      .alphaTarget(0.3)
      // Don't start the simulation yet.
      .stop();

    // Record number of ticks per second.
    setInterval(
      function () {
        d3.select(".frames-per-second").text(this.numTicksSinceLastRecord);
        d3.select(".num-nodes").text(this.nodes.length);
        // Print the average.
        d3.select(".collision-force-runtime").text(
          this.recentCollisionForceRuntime.reduce((a, b) => a + b) /
            this.recentCollisionForceRuntime.length
        );

        this.recentCollisionForceRuntime = [];

        this.recentTicksPerSecond[
          this.recentTicksPerSecondIndex
        ] = this.numTicksSinceLastRecord;
        this.recentTicksPerSecondIndex += 1;
        this.recentTicksPerSecondIndex %= this.recentTicksPerSecond.length;
        this.numTicksSinceLastRecord = 0;
      }.bind(this),
      1000
    );
  }

  // Print ticks per second for the last 20 seconds.
  logRecentTickCount(): void {
    console.log(
      this.recentTicksPerSecond
        .slice(this.recentTicksPerSecondIndex)
        .concat(
          this.recentTicksPerSecond.slice(0, this.recentTicksPerSecondIndex)
        )
    );
  }

  tick(): void {
    const context = this.canvas.getContext("2d");
    this.numTicksSinceLastRecord += 1;

    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    context.save();

    // Draw parties.
    this.parties.forEach(function (d) {
      if (d.expired()) return;
      context.beginPath();
      context.moveTo(d.x + d.visibleR, d.y);
      context.arc(d.x, d.y, d.visibleR, 0, 2 * Math.PI);
      context.fillStyle = "pink";
      context.fill();
    });

    // Draw nodes.
    const scoringNodes: Creature[] = [];
    this.nodes.forEach((d) => {
      if (!isLiveCreature(d)) return;
      if (d.scoring) {
        scoringNodes.push(d);
        return;
      }

      context.beginPath();
      context.moveTo(d.x + d.r, d.y);
      context.arc(d.x, d.y, d.r, 0, 2 * Math.PI);
      // A range from yellow (1 health) to purple (0 health).
      context.fillStyle = d3.interpolatePlasma(d.health * 0.6 + 0.2);
      context.fill();
      context.strokeStyle = "#333";
      context.stroke();
    });

    // Draw walls.
    context.lineJoin = "round";
    context.lineCap = "round";
    context.lineWidth = 2 * this.WALL_HALF_WIDTH;
    for (const wall of this.walls) {
      context.beginPath();
      const curve = d3.curveLinear(context);
      curve.lineStart();
      for (const point of wall.points) {
        curve.point(point.x, point.y);
      }
      if (wall.points.length === 1)
        curve.point(wall.points[0].x, wall.points[0].y);
      curve.lineEnd();
      context.strokeStyle =
        wall.state == WallState.PROVISIONAL ? "#e6757e" : "red";
      context.stroke();
    }
    context.lineWidth = 1;

    // Draw scoring nodes.
    context.shadowBlur = 80;
    context.shadowColor = "#009933";
    for (const node of scoringNodes) {
      const x = node.x + 4 * Math.sin(node.ticksLeftInScoringState);

      context.beginPath();
      context.moveTo(x + node.r, node.y);
      context.arc(x, node.y, node.r, 0, 2 * Math.PI);
      // A range from yellow (1 health) to purple (0 health).
      context.fillStyle = d3.interpolatePlasma(node.health * 0.6 + 0.2);
      context.fill();
      context.strokeStyle = "#333";
      context.stroke();

      // Add temp score indicator. This ends up
      this.tempScoreIndicators.push({
        text: "+10",
        x: 0.5 * (node.x + node.scoringPartner.x),
        y: 0.5 * (node.y + node.scoringPartner.y),
      });
    }
    context.shadowBlur = undefined;
    context.shadowColor = undefined;

    // Print indicators when score increases.
    context.fillStyle = "#0a6b24";
    context.font = "bold 20px sans-serif";
    this.tempScoreIndicators.forEach(function (indicator) {
      context.fillText(indicator.text, indicator.x, indicator.y);
    });
    this.tempScoreIndicators = [];

    // Print score in the top-right corner.
    context.fillStyle = "#000";
    context.font = "20px sans-serif";
    context.textAlign = "right";
    context.fillText(String(this.score), this.canvas.width - 10, 30);

    context.restore();
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

window.onload = function () {
  window.d3 = d3;
  window.game = new Game();
  const game = window.game;

  // Pausing and restarting by keypress.
  d3.select("body").on("keydown", function () {
    if (d3.event.key == "p" || d3.event.key == " ") {
      game.togglePause();
    }
  });

  // Start game button.
  d3.select(".start-game-button").on("click", function () {
    d3.select(".modal").classed("modal-active", false);
    game.start();
  });

  // Dragging. Note: dragging code may have to change when upgrading to d3v6.
  // See notes at https://observablehq.com/@d3/d3v6-migration-guide#event_drag

  // TODO: instead of conditional behavior in dragSubject, dragStarted, etc.,
  // abstract out toolbelt mode for handling drag events.
  d3.select(window.game.canvas).call(
    d3
      .drag()
      .subject(dragSubject)
      .on("start", dragStarted)
      .on("drag", dragDragged)
      .on("end", dragEnded)
  );

  d3.selectAll<HTMLInputElement, undefined>("[name=toolbelt]").on(
    "click",
    function () {
      game.toolbeltMode = this.value;
    }
  );

  function dragSubject() {
    if (game.toolbeltMode == "wall-mode") {
      game.walls.push({
        points: [{ x: d3.event.x, y: d3.event.y }],
        state: WallState.PROVISIONAL,
      });
      return game.walls[game.walls.length - 1];
    } else if (game.toolbeltMode == "select-mode") {
      const subject: SNode = game.simulation.find(d3.event.x, d3.event.y, 20);
      if (isLiveCreature(subject)) {
        return subject;
      }
    } else if (game.toolbeltMode == "party-mode") {
      const party = new Party(d3.event.x, d3.event.y);
      game.parties.push(party);
      game.nodes.push(party);
      game.simulation.nodes(game.nodes);
    }
    return null;
  }

  function dragStarted() {
    if (game.toolbeltMode == "select-mode") {
      d3.event.subject.fx = d3.event.subject.x;
      d3.event.subject.fy = d3.event.subject.y;
    }
  }

  function dragDragged() {
    if (game.toolbeltMode == "select-mode") {
      d3.event.subject.fx = d3.event.x;
      d3.event.subject.fy = d3.event.y;
    } else if (game.toolbeltMode == "wall-mode") {
      const points = d3.event.subject.points;
      if (
        squaredDistance(d3.event, points[points.length - 1]) >
        5 * game.WALL_HALF_WIDTH * game.WALL_HALF_WIDTH
      ) {
        points.push({ x: d3.event.x, y: d3.event.y });
      }
    }
  }

  function dragEnded() {
    if (game.toolbeltMode == "select-mode") {
      d3.event.subject.fx = null;
      d3.event.subject.fy = null;
    } else if (game.toolbeltMode == "wall-mode") {
      for (let i = 0; i < d3.event.subject.points.length; i++) {
        const point = d3.event.subject.points[i];
        game.nodes.push(new WallJoint(point.x, point.y, game.WALL_HALF_WIDTH));

        if (i == 0) continue;
        const prevPoint = d3.event.subject.points[i - 1];
        game.nodes.push(
          new SegmentNode(prevPoint, point, game.WALL_HALF_WIDTH)
        );
      }
      game.simulation.nodes(game.nodes);
      d3.event.subject.state = WallState.BUILT;
    }
  }
};
