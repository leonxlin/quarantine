import * as d3 from "d3";
import {
  Wall,
  WallState,
  Creature,
  Point,
  Selectable,
  TempScoreIndicator,
} from "./simulation-types";
import { World } from "./world";
import { DebugInfo } from "./debug-info";

export class View {
  canvas: HTMLCanvasElement;
  CANVAS_ASPECT_RATIO = 3 / 2;
  canvasClientScaleFactor: number;
  width: number;
  height: number;

  tempScoreIndicators: Set<TempScoreIndicator>;

  // View also maintains state related to the player's interactions with the game interface.
  // TODO: revisit whether these belong in View.
  toolbeltMode = "select-mode";
  selectedObject: Selectable = null;

  // Assets
  blobBody: HTMLImageElement;
  blobOutline: HTMLImageElement;

  // Predrawn blobs in different sizes and colors. Indexed by size (0-59) and then health (0-10).
  blobCanvases: HTMLCanvasElement[][] = [];

  fitCanvas(): void {
    const canvas = this.canvas;
    const left_panel = document.querySelector(".left-panel") as HTMLElement;
    const right_panel = document.querySelector(".right-panel") as HTMLElement;
    const body = document.querySelector("body") as HTMLElement;
    const available_width = body.clientWidth - right_panel.offsetWidth;
    const available_height =
      window.innerHeight - 2 * body.getBoundingClientRect().top;

    canvas.style.width = left_panel.style.width =
      Math.min(available_width, available_height * this.CANVAS_ASPECT_RATIO) +
      "px";
    canvas.style.height = left_panel.style.height =
      Math.min(available_height, available_width / this.CANVAS_ASPECT_RATIO) +
      "px";

    canvas.width = 900;
    canvas.height = 600;

    this.canvasClientScaleFactor = canvas.height / canvas.clientHeight;
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

  constructor(public debugInfo: DebugInfo) {
    this.tempScoreIndicators = new Set<TempScoreIndicator>();
    this.canvas = document.querySelector(".game-canvas") as HTMLCanvasElement;
    this.fitCanvas();

    // Load assets.
    this.blobBody = new Image();
    this.blobBody.onload = this.predrawBlobs.bind(this);
    this.blobBody.src = "./assets/blob1-body.svg";

    this.blobOutline = new Image();
    this.blobOutline.onload = this.predrawBlobs.bind(this);
    this.blobOutline.src = "./assets/blob1.svg";
  }

  predrawBlobs(): void {
    if (this.blobCanvases.length > 0) return;
    if (!this.blobBody.complete || !this.blobOutline.complete) return;

    for (let s = 0; s < 60; ++s) {
      const row: HTMLCanvasElement[] = [];
      this.blobCanvases.push(row);
      for (let h = 0; h <= 10; ++h) {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = s;
        const c = canvas.getContext("2d");
        c.drawImage(this.blobBody, 0, 0, s, s);
        c.globalCompositeOperation = "source-in";
        c.fillStyle = d3.interpolatePlasma(h * 0.06 + 0.2);
        c.fillRect(0, 0, s, s);
        c.globalCompositeOperation = "source-over";
        c.drawImage(this.blobOutline, 0, 0, s, s);
        row.push(canvas);
      }
    }
  }

  drawCreature(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    health: number,
    facingLeft: boolean
  ): void {
    const s = Math.round(2 * r);
    const healthIndex = Math.min(Math.max(Math.round(health * 10), 0), 10);
    const image = this.blobCanvases[s][healthIndex];
    if (facingLeft) {
      context.drawImage(image, x - r, y - r, s, s);
    } else {
      context.scale(-1, 1);
      context.drawImage(image, -x - r, y - r, s, s);
      context.setTransform(1, 0, 0, 1, 0, 0);
    }
    return;
  }

  render(world: World): void {
    // TODO: The cursor style logic being here in `render`, which is only called
    // when the simulation is running, causes the cursor style to be stuck when the
    // game is paused. To repro: in select mode, hover over a wall to get the pointer
    // cursor; then, pause the game and move the mouse around the canvas. This should
    // be fixed.
    if (this.toolbeltMode != "select-mode") {
      this.canvas.style.cursor = "default";
    } else if (world.cursorNode.target != null) {
      this.canvas.style.cursor = "pointer";
    } else {
      this.canvas.style.cursor = "default";
    }

    const context = this.canvas.getContext("2d");
    this.debugInfo.numTicksSinceLastRecord += 1;

    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
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

    // Draw living creatures.
    const scoringCreatures: Creature[] = [];
    world.creatures.forEach((c) => {
      if (c.scoring) {
        scoringCreatures.push(c);
        return;
      }
      this.drawCreature(context, c.x, c.y, c.r, c.health, c.isFacingLeft);
    });

    // Draw walls.
    context.lineJoin = "round";
    context.lineCap = "round";
    function drawWall(wall: Wall, color: string) {
      context.lineWidth = 2 * wall.halfWidth;
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
    for (const c of world.deadCreatures) {
      if (c.ticksSinceDeath >= 60) continue; // Too old to draw.
      const t = c.ticksSinceDeath / 60;
      const y = d3.interpolateNumber(c.y, c.y - 15)(t);
      context.globalAlpha = d3.interpolateNumber(1, 0)(t);

      this.drawCreature(context, c.x, y, c.r, c.health, c.isFacingLeft);

      this.tempScoreIndicators.add({
        x: c.x,
        y: c.y - 15,
        text: "-200",
        color: "#900",
      });
    }
    context.globalAlpha = 1.0;

    // Draw scoring nodes.
    context.shadowBlur = 80;
    context.shadowColor = "#009933";
    for (const c of scoringCreatures) {
      const x = c.x + 4 * Math.sin(c.ticksLeftInScoringState);

      this.drawCreature(context, x, c.y, c.r, c.health, c.isFacingLeft);

      // Add temp score indicator. This ends up adding two scoring indicators for each pair, but that's OK; they're just printed on top of each other.
      this.tempScoreIndicators.add({
        text: "+10",
        x: 0.5 * (c.x + c.scoringPartner.x),
        y: 0.5 * (c.y + c.scoringPartner.y) - 15,
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

    this.debugInfo.stopTimer("step");
  }

  selectWall(wall: Wall, cursorLocation: Point): void {
    this.selectedObject = wall;
    const s = d3.select(".delete-wall");
    s.style("display", "inline");
    s.style("left", cursorLocation.x + "px");
    s.style("top", cursorLocation.y + "px");
  }

  selectCreature(creature: Creature): void {
    this.selectedObject = creature;
  }

  deselectAll(): void {
    this.selectedObject = null;
    d3.select(".delete-wall").style("display", "none");
  }

  hideModal(): void {
    d3.select(".modal").classed("modal-active", false);
  }

  showModal(modalName: string): void {
    d3.select(".modal").classed("modal-active", true);
    d3.selectAll(".modal-content").style("display", "none");
    d3.select("." + modalName).style("display", "flex");
  }
}
