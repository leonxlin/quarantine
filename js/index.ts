import * as d3 from "d3";
import {
  SNode,
  CursorNode,
  TempScoreIndicator,
  SegmentNode,
  Wall,
  WallState,
  WallJoint,
  isWallComponent,
  Creature,
  Party,
  Selectable,
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

// Not sure if a class is really the best way to organize this code...
// TODO: revisit code organization.
export class Game {
  canvas;
  nodes: SNode[];
  simulation: d3.Simulation<SNode, undefined>;
  cursorNode: CursorNode;

  score = 0;
  tempScoreIndicators: Set<TempScoreIndicator>;

  // Some crude performance monitoring.
  numTicksSinceLastRecord = 0;
  recentTicksPerSecond: number[] = new Array(20);
  recentTicksPerSecondIndex = 0;
  recentCollisionForceRuntime: number[] = [];

  paused = false;
  toolbeltMode = "select-mode";

  walls: Array<Wall> = [];
  parties: Array<Party> = [];

  selectedObject: Selectable = null;

  // Figure out a better place for this constant.
  pointCircleFactor = 0.5;

  WALL_HALF_WIDTH = 5;

  constructor() {
    this.tempScoreIndicators = new Set<TempScoreIndicator>();
    this.canvas = document.querySelector("canvas");
    this.nodes = d3.range(200).map(
      () =>
        new Creature(
          Math.random() * this.canvas.width, // x
          Math.random() * this.canvas.height // y
        )
    );
    (this.nodes[0] as Creature).infected = true;

    this.cursorNode = new CursorNode();
    this.nodes.push(this.cursorNode);

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
      .force("cursor", () => {
        if (this.toolbeltMode != "select-mode") {
          this.canvas.style.cursor = "default";
        } else if (this.cursorNode.target != null) {
          this.canvas.style.cursor = "pointer";
        } else {
          this.canvas.style.cursor = "default";
        }
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
        if (this.recentCollisionForceRuntime.length > 0) {
          d3.select(".collision-force-runtime").text(
            this.recentCollisionForceRuntime.reduce((a, b) => a + b) /
              this.recentCollisionForceRuntime.length
          );
        }

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
    const recentlyDeadNodes: Creature[] = [];
    this.nodes.forEach((n) => {
      if (!isCreature(n)) return;
      if (n.dead) {
        if (n.ticksSinceDeath < 60) recentlyDeadNodes.push(n);
        return;
      }

      if (n.scoring) {
        scoringNodes.push(n);
        return;
      }

      context.beginPath();
      context.moveTo(n.x + n.r, n.y);
      context.arc(n.x, n.y, n.r, 0, 2 * Math.PI);
      // A range from yellow (1 health) to purple (0 health).
      context.fillStyle = d3.interpolatePlasma(n.health * 0.6 + 0.2);
      context.fill();
      context.strokeStyle = "#333";
      context.stroke();
    });

    // Draw walls.
    context.lineJoin = "round";
    context.lineCap = "round";
    context.lineWidth = 2 * this.WALL_HALF_WIDTH;
    function drawWall(wall: Wall, color: string) {
      context.beginPath();
      const curve = d3.curveLinear(context);
      curve.lineStart();
      for (const point of wall.points) {
        curve.point(point.x, point.y);
      }
      if (wall.points.length === 1)
        curve.point(wall.points[0].x, wall.points[0].y);
      curve.lineEnd();
      context.strokeStyle = color;
      context.stroke();
    }
    for (const wall of this.walls) {
      // We want to draw the selected wall on top, so skip it here.
      if (wall === this.selectedObject) continue;
      drawWall(wall, wall.state == WallState.PROVISIONAL ? "#e6757e" : "red");
    }
    if (this.selectedObject instanceof Wall) {
      drawWall(this.selectedObject, "#999900");
    }
    context.lineWidth = 1;

    // Draw recently dead nodes.
    for (const n of recentlyDeadNodes) {
      const t = n.ticksSinceDeath / 60;
      const y = d3.interpolateNumber(n.y, n.y - 15)(t);
      context.globalAlpha = d3.interpolateNumber(1, 0)(t);

      context.beginPath();
      context.moveTo(n.x + n.r, y);
      context.arc(n.x, y, n.r, 0, 2 * Math.PI);
      // A range from yellow (1 health) to purple (0 health).
      context.fillStyle = d3.interpolatePlasma(n.health * 0.6 + 0.2);
      context.fill();
      context.strokeStyle = "#333";
      context.stroke();

      this.tempScoreIndicators.add({
        x: n.x,
        y: n.y - 15,
        text: "-200",
        color: "#900",
      });
    }
    context.globalAlpha = 1.0;

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

      // Add temp score indicator. This ends up adding two scoring indicators for each pair, but that's OK; they're just printed on top of each other.
      this.tempScoreIndicators.add({
        text: "+10",
        x: 0.5 * (node.x + node.scoringPartner.x),
        y: 0.5 * (node.y + node.scoringPartner.y) - 15,
        color: "#336633",
      });
    }
    context.shadowBlur = undefined;
    context.shadowColor = undefined;

    // Print indicators when score increases.
    context.font = "bold 20px sans-serif";
    this.tempScoreIndicators.forEach((indicator) => {
      context.fillStyle = indicator.color;
      context.fillText(indicator.text, indicator.x, indicator.y);
    });
    this.tempScoreIndicators.clear();

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

  deselectAll(): void {
    this.selectedObject = null;
    d3.select(".delete-wall").style("display", "none");
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
  d3.select(window.game.canvas)
    .call(
      d3
        .drag()
        .subject(dragSubject)
        .on("start", dragStarted)
        .on("drag", dragDragged)
        .on("end", dragEnded)
    )
    .on("mousemove", () => {
      if (game.toolbeltMode != "select-mode") return;
      // Apparently we have to correct for the canvas position in order to get
      // the correct mouse position. I'm not sure why this correct is not needed
      // for the drag use cases below.
      const rect = game.canvas.getBoundingClientRect();
      game.cursorNode.setLocation(
        d3.event.x - rect.left,
        d3.event.y - rect.top
      );
    });

  d3.selectAll<HTMLInputElement, undefined>("[name=toolbelt]").on(
    "click",
    function () {
      game.toolbeltMode = this.value;
      if (game.toolbeltMode != "select-mode") {
        game.deselectAll();
      }
    }
  );

  d3.select(".delete-wall").on("click", function () {
    // TODO: represent game.walls and game.nodes as Sets perhaps to make this less crappy.

    // Delete selected wall.
    let i = -1;
    for (i = 0; i < game.walls.length; i++) {
      if (game.walls[i] === game.selectedObject) {
        break;
      }
    }
    if (i >= 0) game.walls.splice(i, 1);

    // Delete wall components from game.nodes.
    let numNodesToRemove = 0;
    function swap(arr, a: number, b: number): void {
      const temp = arr[a];
      arr[a] = arr[b];
      arr[b] = temp;
    }
    for (i = 0; i < game.nodes.length; i++) {
      let n: SNode;
      while (
        isWallComponent((n = game.nodes[i])) &&
        n.wall === game.selectedObject &&
        i + numNodesToRemove < game.nodes.length
      ) {
        swap(game.nodes, i, game.nodes.length - numNodesToRemove - 1);
        numNodesToRemove++;
      }
    }
    if (numNodesToRemove > 0) {
      game.nodes.splice(-numNodesToRemove);
    }
    game.simulation.nodes(game.nodes);

    game.deselectAll();
  });

  function dragSubject() {
    if (game.toolbeltMode == "wall-mode") {
      const wall = new Wall();
      wall.points = [{ x: d3.event.x, y: d3.event.y }];
      wall.state = WallState.PROVISIONAL;
      game.walls.push(wall);
      return wall;
    } else if (game.toolbeltMode == "select-mode") {
      if (isWallComponent(game.cursorNode.target)) {
        game.selectedObject = game.cursorNode.target.wall;
        const s = d3.select(".delete-wall");
        s.style("display", "inline");
        s.style("left", d3.event.x + "px");
        s.style("top", d3.event.y + "px");
      } else if (isLiveCreature(game.cursorNode.target)) {
        game.selectedObject = game.cursorNode.target;
      } else {
        game.deselectAll();
      }
      return game.selectedObject;
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
      if (isLiveCreature(d3.event.subject)) {
        d3.event.subject.fx = d3.event.subject.x;
        d3.event.subject.fy = d3.event.subject.y;
        game.selectedObject = d3.event.subject;
      }
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
        game.nodes.push(
          new WallJoint(
            point.x,
            point.y,
            game.WALL_HALF_WIDTH,
            d3.event.subject
          )
        );

        if (i == 0) continue;
        const prevPoint = d3.event.subject.points[i - 1];
        game.nodes.push(
          new SegmentNode(
            prevPoint,
            point,
            game.WALL_HALF_WIDTH,
            d3.event.subject
          )
        );
      }
      game.simulation.nodes(game.nodes);
      d3.event.subject.state = WallState.BUILT;
    }
  }
};
