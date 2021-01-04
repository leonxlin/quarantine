import * as d3 from "d3";
import { SNode, Point, TempScoreIndicator } from "./simulation-types.js";
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

function squaredDistance(p1: Point, p2: Point): number {
  const dx = p1.x - p2.x,
    dy = p1.y - p2.y;
  return dx * dx + dy * dy;
}

enum WallState {
  // Still being built. Should not cause collisions.
  PROVISIONAL,

  // Built. Impermeable.
  BUILT
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

  numTicksSinceLastRecord = 0;
  recentTicksPerSecond: number[] = new Array(20);
  recentTicksPerSecondIndex = 0;

  paused = false;
  toolbeltMode = "select-mode";

  walls: Array<Wall> = [];

  WALL_WIDTH = 5;

  constructor() {
    this.canvas = document.querySelector("canvas");
    this.nodes = d3.range(200).map(
      function (i): SNode {
        const x = Math.random() * this.canvas.width,
          y = Math.random() * this.canvas.height;
        return {
          r: Math.random() * 5 + 4,
          x: x,
          y: y,
          type: "creature",
          infected: i == 1,
          health: 1,
          currentScore: 0, // Reset to 0 each tick.
          previousLoggedLocation: { x: x, y: y },
        };
      }.bind(this)
    );

    const nodes = this.nodes;
    const canvas = this.canvas;

    this.simulation = d3
      .forceSimulation()
      .velocityDecay(0.2)
      .force("agent", function (alpha) {
        nodes.forEach(function (n: SNode) {
          if (n.type != "creature") return;

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
          .iterations(5)
          .interaction("collision", collisionInteraction)
          .interaction("contagion", (node1, node2) => {
            if (
              Math.random() < 0.002 &&
              node1.type == "creature" &&
              node2.type == "creature"
            )
              node1.infected = node2.infected =
                node1.infected || node2.infected;
          })
          .interaction("score", function (node1, node2) {
            if (
              Math.random() < 0.0005 &&
              node1.type == "creature" &&
              node2.type == "creature"
            ) {
              node1.currentScore += 1;
              node2.currentScore += 1;
              window.game.tempScoreIndicators.push({
                x: 0.5 * (node1.x + node2.x),
                y: 0.5 * (node1.y + node2.y),
                text: "+2",
                ticksRemaining: 60,
              });
            }
          })
      )
      .force("health", function () {
        nodes.forEach(function (n) {
          if (!n.infected) return;
          n.health -= 0.0003;
          if (n.health <= 0) {
            n.type = "dead";
            n.health = 0;
          }
        });
      })
      .nodes(nodes)
      .on("tick", this.tick.bind(this));

    // Record number of ticks per second.
    setInterval(
      function () {
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

    // Draw nodes.
    this.nodes.forEach(
      function (d) {
        if (d.type != "creature") return;

        context.beginPath();
        context.moveTo(d.x + d.r, d.y);
        context.arc(d.x, d.y, d.r, 0, 2 * Math.PI);
        // A range from yellow (1 health) to purple (0 health).
        context.fillStyle = d3.interpolatePlasma(d.health * 0.8 + 0.2);
        context.fill();
        context.strokeStyle = "#333";
        context.stroke();

        // Collect score.
        this.score += d.currentScore;
        d.currentScore = 0;
      }.bind(this)
    );

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
      context.lineWidth = 2 * this.WALL_WIDTH;
      context.strokeStyle = wall.state == WallState.PROVISIONAL ? "#e6757e" : "red";
      context.stroke();
    }

    // Print indicators when score increases.
    context.fillStyle = "#0a6b24";
    context.font = "bold 10px sans-serif";
    let numExpiring = 0;
    this.tempScoreIndicators.forEach(function (indicator) {
      context.fillText(indicator.text, indicator.x, indicator.y);
      indicator.ticksRemaining -= 1;
      if (indicator.ticksRemaining == 0) numExpiring++;
    });
    this.tempScoreIndicators.splice(0, numExpiring);

    // Print score in the top-right corner.
    context.fillStyle = "#000";
    context.font = "20px sans-serif";
    context.textAlign = "right";
    context.fillText(String(this.score), this.canvas.width - 10, 30);

    context.restore();
  }

  togglePause(): void {
    if (this.paused) {
      this.simulation.restart();
      this.paused = false;
    } else {
      this.simulation.stop();
      this.paused = true;
    }
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
    }

    const subject: SNode = game.simulation.find(d3.event.x, d3.event.y, 20);
    if (subject.type == "creature") {
      return subject;
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
        game.WALL_WIDTH * game.WALL_WIDTH
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
      for (let i = 1; i < d3.event.subject.points.length - 1; i++) {
        const point = d3.event.subject.points[i];
        game.nodes.push({
          r: game.WALL_WIDTH,
          fx: point.x,
          fy: point.y,
          x: point.x,
          y: point.y,
          infected: false,
          type: "wall2",
        });
      }
      game.simulation.nodes(game.nodes);
      d3.event.subject.state = WallState.BUILT;
    }
  }

  // Start simulation.
  game.simulation.alphaTarget(0.3).restart();
};
