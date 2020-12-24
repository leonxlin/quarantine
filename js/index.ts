import * as d3 from "d3";
import { SNode, Point, TempScoreIndicator } from "./simulation-types.js";
import collideForce from "./collide.js";
import { collisionInteraction } from "./collide.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
// Needed to make typescript happy when defining properties on the global window object for easy debugging.
declare global {
  interface Window {
    logRecentTickCount: any;
    simulation: any;
    game: Game;
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function squaredDistance(p1: Point, p2: Point): number {
  const dx = p1.x - p2.x,
    dy = p1.y - p2.y;
  return dx * dx + dy * dy;
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

  constructor() {
    this.canvas = document.querySelector("canvas");
    this.nodes = d3.range(200).map(
      function (i): SNode {
        return {
          r: Math.random() * 5 + 4,
          x: Math.random() * this.canvas.width,
          y: Math.random() * this.canvas.height,
          type: "creature",
          infected: i == 1,
          health: 1,
          currentScore: 0, // Reset to 0 each tick.
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

          if (!("goal" in n) || squaredDistance(n, n.goal) < 10) {
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
          .interaction("contagion", function (node1, node2) {
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
        if (d.type == "dead") return;

        context.beginPath();
        context.moveTo(d.x + d.r, d.y);
        context.arc(d.x, d.y, d.r, 0, 2 * Math.PI);
        // A range from yellow (1 health) to purple (0 health).
        context.fillStyle =
          d.type == "wall"
            ? "blue"
            : d3.interpolatePlasma(d.health * 0.8 + 0.2);
        context.fill();
        context.strokeStyle = "#333";
        context.stroke();

        // Collect score.
        if (d.type == "creature") {
          this.score += d.currentScore;
          d.currentScore = 0;
        }
      }.bind(this)
    );

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
}

window.onload = function () {
  window.game = new Game();
  const game = window.game;

  // Pausing and restarting by keypress.
  d3.select("body").on("keydown", function () {
    console.log(d3.event);
    if (d3.event.key == "p") {
      game.simulation.stop();
    } else if (d3.event.key == "s") {
      game.simulation.restart();
    }
  });

  // Dragging. Note: dragging code may have to change when upgrading to d3v6.
  // See notes at https://observablehq.com/@d3/d3v6-migration-guide#event_drag

  d3.select(window.game.canvas).call(
    d3
      .drag()
      .subject(dragSubject)
      .on("start", dragStarted)
      .on("drag", dragDragged)
      .on("end", dragEnded)
  );

  function dragSubject() {
    let subject: SNode = game.simulation.find(d3.event.x, d3.event.y, 20);
    if (!subject) {
      subject = {
        r: 10,
        fx: d3.event.x,
        fy: d3.event.y,
        x: d3.event.x,
        y: d3.event.y,
        infected: false,
        type: "wall",
      };
      game.nodes.push(subject);
      game.simulation.nodes(game.nodes);
      return null;
    } else if (subject.type != "creature") {
      return null;
    }
    return subject;
  }

  function dragStarted() {
    d3.event.subject.fx = d3.event.subject.x;
    d3.event.subject.fy = d3.event.subject.y;
  }

  function dragDragged() {
    d3.event.subject.fx = d3.event.x;
    d3.event.subject.fy = d3.event.y;
  }

  function dragEnded() {
    d3.event.subject.fx = null;
    d3.event.subject.fy = null;
  }

  // Start simulation.
  game.simulation.alphaTarget(0.3).restart();
};
