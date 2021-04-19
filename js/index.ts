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
} from "./simulation-types";
import collideForce from "./collide";
import { collisionInteraction } from "./collide";
import * as ad from "./ad";
import { Point, squaredDistance, distanceDual, directionTo } from "./geometry";

/* eslint-disable @typescript-eslint/no-explicit-any */
// Needed to make typescript happy when defining properties on the global window object for easy debugging.
declare global {
  interface Window {
    game: Game;
    d3: any;
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function jiggle() {
  return (Math.random() - 0.5) * 1e-2;
}

// Not sure if a class is really the best way to organize this code...
// TODO: revisit code organization.
export class Game {
  canvas;
  nodes: SNode[];
  simulation: d3.Simulation<SNode, undefined>;
  cursorNode: CursorNode;
  width: number;
  height: number;

  score = 0;
  tempScoreIndicators: Set<TempScoreIndicator>;

  // Some crude performance monitoring.
  numTicksSinceLastRecord = 0;
  recentTicksPerSecond: number[] = new Array(20);
  recentTicksPerSecondIndex = 0;
  recentCollisionForceRuntime: number[] = [];

  paused = false;
  toolbeltMode = "select-mode";

  walls: Set<Wall> = new Set();
  parties: Array<Party> = [];

  selectedObject: Selectable = null;

  // Figure out a better place for this constant.
  pointCircleFactor = 0.5;

  WALL_HALF_WIDTH = 5;

  CANVAS_ASPECT_RATIO = 3 / 2;
  canvasClientScaleFactor: number;

  fitCanvas(): void {
    const canvas = document.querySelector("canvas") as HTMLCanvasElement;
    const left_panel = document.querySelector(".left-panel") as HTMLElement;
    const right_panel = document.querySelector(".right-panel") as HTMLElement;
    const body = document.querySelector("body") as HTMLElement;
    const available_width = body.clientWidth - right_panel.offsetWidth;
    const available_height =
      window.innerHeight - 2 * body.getBoundingClientRect().top;

    canvas.width = this.width = Math.min(
      available_width,
      available_height * this.CANVAS_ASPECT_RATIO
    );
    canvas.style.width = left_panel.style.width = this.width + "px";

    canvas.height = this.height = Math.min(
      available_height,
      available_width / this.CANVAS_ASPECT_RATIO
    );
    canvas.style.height = left_panel.style.height = this.height + "px";

    canvas.width = this.width = 900;
    canvas.height = this.height = 600;

    this.canvasClientScaleFactor = this.height / canvas.clientHeight;
  }

  // The following functions convert the coordinates from mouse events to canvas
  // coordinates. Note that d3-drag will already do the shifting for you. Thus when
  // working with coords from d3-drag, only the scaling is needed.
  shiftAndScaleMouseCoordsToCanvasCoords(p: Point): Point {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (p.x - rect.left) * this.canvasClientScaleFactor,
      y: (p.y - rect.top) * this.canvasClientScaleFactor,
    };
  }
  scaleMouseCoordsToCanvasCoords(p: Point): Point {
    return {
      x: p.x * this.canvasClientScaleFactor,
      y: p.y * this.canvasClientScaleFactor,
    };
  }

  constructor() {
    this.tempScoreIndicators = new Set<TempScoreIndicator>();
    this.fitCanvas();
    this.canvas = document.querySelector("canvas");
    this.nodes = d3.range(1).map(
      () =>
        new Creature(
          Math.random() * this.width, // x
          Math.random() * this.height // y
        )
    );
    // (this.nodes[0] as Creature).infected = true;

    this.cursorNode = new CursorNode();
    this.nodes.push(this.cursorNode);

    const nodes = this.nodes;
    const width = this.width;
    const height = this.height;

    // Note: forces are applied in the order they appear here. Currently the potential calculation depends on this assumption.
    this.simulation = d3
      .forceSimulation<SNode, undefined>()
      .velocityDecay(0.2)
      .force("agent", (alpha) => {
        nodes.forEach((n: SNode) => {
          if (!isLiveCreature(n)) return;

          let stuck = false;
          if (Math.random() < 0.02) {
            stuck = squaredDistance(n, n.previousLoggedLocation) < 5;
            n.previousLoggedLocation = { x: n.x, y: n.y };
          }

          // if (!("goal" in n) || squaredDistance(n, n.goal) < 10 || stuck) {
          if (!("goal" in n) || squaredDistance(n, n.goal) < 10) {
            n.goal = {
              x: Math.random() * width,
              y: Math.random() * height,
            };

            n.avoidanceZones = [];
          }

          if (stuck) {
            const heading = directionTo(n, n.goal);
            const r = 10 * n.avoidanceZones.length;
            n.avoidanceZones.push({
              x: n.x + heading.x + jiggle() * r,
              y: n.y + heading.y + jiggle() * r,
              r: r,
            });
          }

          n.potential = ad.mult(distanceDual(n, n.goal), alpha);
          for (const zone of n.avoidanceZones) {
            const dist = distanceDual(n, zone);
            if (ad.val(dist) > zone.r) continue;
            n.addToPotential(
              ad.mult(ad.square(ad.subtract(zone.r, dist)), 0.1)
            );
          }
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
      .force("cursor", () => {
        if (this.toolbeltMode != "select-mode") {
          this.canvas.style.cursor = "default";
        } else if (this.cursorNode.target != null) {
          this.canvas.style.cursor = "pointer";
        } else {
          this.canvas.style.cursor = "default";
        }
      })
      .force("movement", () => {
        nodes.forEach((n) => {
          if (!isLiveCreature(n)) return;
          n.vx -= ad.ddx(n.potential);
          n.vy -= ad.ddy(n.potential);
          const mag2 = n.vx * n.vx + n.vy * n.vy;
          if (mag2 > 10) {
            const mag = Math.sqrt(mag2);
            n.vx /= mag;
            n.vy /= mag;
          }
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

    context.clearRect(0, 0, this.width, this.height);
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

      for (const zone of n.avoidanceZones) {
        context.beginPath();
        context.moveTo(zone.x + zone.r, zone.y);
        context.arc(zone.x, zone.y, zone.r, 0, 2 * Math.PI);
        context.fillStyle = "pink";
        context.fill();
      }
      if ("goal" in n) {
        context.beginPath();
        context.moveTo(n.goal.x + 5, n.goal.y);
        context.arc(n.goal.x, n.goal.y, 5, 0, 2 * Math.PI);
        context.fillStyle = "green";
        context.fill();
        context.strokeStyle = "#333";
        context.stroke();
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
        .container(function () {
          return this as d3.DragContainerElement;
        })
    )
    .on("mousemove", () => {
      if (game.toolbeltMode != "select-mode") return;
      const p = game.shiftAndScaleMouseCoordsToCanvasCoords(d3.event);
      game.cursorNode.setLocation(p.x, p.y);
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
    if (!(game.selectedObject instanceof Wall)) return;

    // Delete selected wall.
    game.walls.delete(game.selectedObject);

    // Delete wall components from game.nodes.
    // TODO: represent game.nodes as a Set perhaps to make this less crappy.
    let numNodesToRemove = 0;
    function swap(arr, a: number, b: number): void {
      const temp = arr[a];
      arr[a] = arr[b];
      arr[b] = temp;
    }
    for (let i = 0; i < game.nodes.length; i++) {
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
    const p = game.scaleMouseCoordsToCanvasCoords(d3.event);
    if (game.toolbeltMode == "wall-mode") {
      const wall = new Wall();
      wall.points = [p];
      wall.state = WallState.PROVISIONAL;
      game.walls.add(wall);
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
        // Hack: return an empty object without x or y properties. This is the only way
        // I've found to make d3-drag's event object have usable x and y coordinates. Somehow
        // using different coords for the canvas makes things very confusing.
        // TODO: revisit
        return {};
      } else {
        game.deselectAll();
      }
      // Note: for walls, this returns an object without `x` or `y` properties, which is
      // not how d3.subject is meant to be used. But it works for now.
      // TODO: revisit
      return game.selectedObject;
    } else if (game.toolbeltMode == "party-mode") {
      const party = new Party(p.x, p.y);
      game.parties.push(party);
      game.nodes.push(party);
      game.simulation.nodes(game.nodes);
    }
    return null;
  }

  function dragStarted() {
    if (game.toolbeltMode == "select-mode") {
      if (isLiveCreature(game.selectedObject)) {
        // Manipulating game.selectedObject instead of `d3.event.subject` because I had trouble
        // getting the coords to be right in d3.event when using `d3.event.subject`.
        // See notes in dragSubject.
        game.selectedObject.fx = game.selectedObject.x;
        game.selectedObject.fy = game.selectedObject.y;
      }
    }
  }

  function dragDragged() {
    const p = game.scaleMouseCoordsToCanvasCoords(d3.event);
    if (game.toolbeltMode == "select-mode") {
      if (isCreature(game.selectedObject)) {
        game.selectedObject.fx = p.x;
        game.selectedObject.fy = p.y;
      }
    } else if (game.toolbeltMode == "wall-mode") {
      const points = d3.event.subject.points;
      if (
        squaredDistance(p, points[points.length - 1]) >
        5 * game.WALL_HALF_WIDTH * game.WALL_HALF_WIDTH
      ) {
        points.push({ x: p.x, y: p.y });
      }
    }
  }

  function dragEnded() {
    if (game.toolbeltMode == "select-mode") {
      if (isLiveCreature(game.selectedObject)) {
        game.selectedObject.fx = null;
        game.selectedObject.fy = null;
        game.selectedObject = null;
      }
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
