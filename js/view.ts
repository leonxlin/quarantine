import * as d3 from "d3";
import {
  Wall,
  WallState,
  Creature,
  Point,
  Selectable,
  isCreature,
  TempScoreIndicator,
} from "./simulation-types";
import { World } from "./world";
import { DebugInfo } from "./debug-info";

export class View {
  canvas: HTMLCanvasElement;
  CANVAS_ASPECT_RATIO = 3 / 2;
  canvasClientScaleFactor: number;
  debugInfo: DebugInfo;
  // TODO: revisit whether toolbeltMode belongs in View.
  toolbeltMode = "select-mode";
  width: number;
  height: number;

  tempScoreIndicators: Set<TempScoreIndicator>;

  selectedObject: Selectable = null;

  fitCanvas(): void {
    const canvas = this.canvas;
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

  constructor(debugInfo: DebugInfo) {
    this.debugInfo = debugInfo;
    this.tempScoreIndicators = new Set<TempScoreIndicator>();
    this.canvas = document.querySelector("canvas") as HTMLCanvasElement;
    this.fitCanvas();
  }

  render(world: World): void {
    if (this.toolbeltMode != "select-mode") {
      this.canvas.style.cursor = "default";
    } else if (world.cursorNode.target != null) {
      this.canvas.style.cursor = "pointer";
    } else {
      this.canvas.style.cursor = "default";
    }

    const context = this.canvas.getContext("2d");
    this.debugInfo.numTicksSinceLastRecord += 1;

    context.clearRect(0, 0, this.width, this.height);
    context.save();

    // Draw parties.
    world.parties.forEach(function (d) {
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
    world.nodes.forEach((n) => {
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
    context.lineWidth = 2 * world.WALL_HALF_WIDTH;
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
    for (const wall of world.walls) {
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
    context.fillText(String(world.score), this.canvas.width - 10, 30);

    context.restore();
  }

  deselectAll(): void {
    this.selectedObject = null;
    d3.select(".delete-wall").style("display", "none");
  }
}
