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
import { getTrianglePoints } from "./tessy";
import libtess from "libtess/libtess.cat.js";

export class View {
  canvas: HTMLCanvasElement;
  wallCanvas: HTMLCanvasElement;
  mouseCanvas: HTMLCanvasElement;
  debugTrianglesCanvas: HTMLCanvasElement;
  debugTrianglesFixedCanvas: HTMLCanvasElement;
  CANVAS_ASPECT_RATIO = 3 / 2;
  WIDTH = 900;
  HEIGHT = 600;
  canvasClientScaleFactor: number;

  tempScoreIndicators: Set<TempScoreIndicator>;

  // View also maintains state related to the player's interactions with the game interface.
  // TODO: revisit whether these belong in View.
  toolbeltMode = "select-mode";
  selectedObject: Selectable = null;

  audioContext: AudioContext;

  // Assets
  blobBody: HTMLImageElement;
  blobOutline: HTMLImageElement;
  scoreSound: AudioBuffer;
  // Should only flip to true once and never change afterward.
  doneLoadingAssets = false;

  // Predrawn blobs in different sizes and colors. Indexed by size (0-59) and then health (0-10).
  blobCanvases: HTMLCanvasElement[][] = [];

  lastWallHash: number;
  lastMesh: libtess.GluMesh;

  fitCanvas(): void {
    const left_panel = document.querySelector(".left-panel") as HTMLElement;
    const right_panel = document.querySelector(".right-panel") as HTMLElement;
    const body = document.querySelector("body") as HTMLElement;
    const available_width = body.clientWidth - right_panel.offsetWidth;
    const available_height =
      window.innerHeight - 2 * body.getBoundingClientRect().top;

    const cssWidth =
      Math.min(available_width, available_height * this.CANVAS_ASPECT_RATIO) +
      "px";
    const cssHeight =
      Math.min(available_height, available_width / this.CANVAS_ASPECT_RATIO) +
      "px";

    const canvases = [
      this.canvas,
      this.wallCanvas,
      this.mouseCanvas,
      this.debugTrianglesCanvas,
      this.debugTrianglesFixedCanvas,
    ];

    [left_panel].concat(canvases).forEach((c) => {
      c.style.width = cssWidth;
      c.style.height = cssHeight;
    });
    canvases.forEach((c) => {
      c.width = this.WIDTH;
      c.height = this.HEIGHT;
    });

    this.canvasClientScaleFactor =
      this.canvas.height / this.canvas.clientHeight;
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
    this.wallCanvas = document.querySelector(
      ".wall-canvas"
    ) as HTMLCanvasElement;
    this.mouseCanvas = document.querySelector(
      ".mouse-canvas"
    ) as HTMLCanvasElement;
    this.debugTrianglesCanvas = document.querySelector(
      ".debug-triangles-canvas"
    ) as HTMLCanvasElement;
    this.debugTrianglesFixedCanvas = document.querySelector(
      ".debug-triangles-fixed-canvas"
    ) as HTMLCanvasElement;
    this.fitCanvas();

    // Load assets.
    this.blobBody = new Image();
    this.blobBody.onload = this.predrawBlobs.bind(this);
    this.blobBody.src = "./assets/blob1-body.svg";

    this.blobOutline = new Image();
    this.blobOutline.onload = this.predrawBlobs.bind(this);
    this.blobOutline.src = "./assets/blob1.svg";

    this.audioContext = new AudioContext();
    fetch(
      "./assets/zapsplat_multimedia_game_sound_building_blocks_bricks_collect_click_001_70219.mp3"
    )
      .then((response) => response.arrayBuffer())
      .then((arrayBuffer) => this.audioContext.decodeAudioData(arrayBuffer))
      .then((audioBuffer) => {
        this.scoreSound = audioBuffer;
        this.checkIfDoneLoading();
      });
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

    this.checkIfDoneLoading();
  }

  checkIfDoneLoading(): void {
    if (
      this.blobCanvases.length > 0 &&
      this.scoreSound &&
      !this.doneLoadingAssets
    ) {
      this.doneLoadingAssets = true;
      this.showModal("start-game-modal");
    }
  }

  playAudioBuffer(audioBuffer: AudioBuffer): void {
    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);
    source.start();
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
  }

  outlineTriangle(
    triangle: Array<Point>,
    context: CanvasRenderingContext2D
  ): void {
    if (triangle.length != 3) return;
    context.moveTo(triangle[0].x, triangle[0].y);
    context.lineTo(triangle[1].x, triangle[1].y);
    context.lineTo(triangle[2].x, triangle[2].y);
    context.lineTo(triangle[0].x, triangle[0].y);
  }

  renderWalls(world: World): void {
    // TODO: this is not a real hash. Rename or fix.
    let newHash = 0;
    for (const wall of world.walls) {
      newHash += wall.points.length + 1;
      newHash += wall.state;
    }
    newHash += this.selectedObject instanceof Wall ? 3235 : 0;
    if (newHash == this.lastWallHash) return;
    this.lastWallHash = newHash;

    const context = this.wallCanvas.getContext("2d");
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    context.save();

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

    context.restore();
  }

  renderDebugTriangles(world: World): void {
    const context = this.debugTrianglesCanvas.getContext("2d");
    context.clearRect(0, 0, this.WIDTH, this.HEIGHT);
    context.save();

    // Highlight mesh triangles that contain a creature.
    world.creatures.forEach((c) => {
      // Highlight the triangle that the creature is in.
      context.beginPath();
      this.outlineTriangle(getTrianglePoints(c.meshFace), context);
      context.fillStyle = "lightgreen";
      context.fill();
    });

    context.restore();
  }

  renderDebugTrianglesFixed(world: World): void {
    if (this.lastMesh === world.mesh) return;
    this.lastMesh = world.mesh;

    const context = this.debugTrianglesFixedCanvas.getContext("2d");
    context.clearRect(0, 0, this.WIDTH, this.HEIGHT);
    context.save();

    if (world.mesh) {
      context.strokeStyle = "green";
      context.beginPath();
      // Iterate over the faces of the mesh. Note that fHead is apparently a
      // dummy face and should be skipped.
      for (let f = world.mesh.fHead.prev; f !== world.mesh.fHead; f = f.prev) {
        this.outlineTriangle(getTrianglePoints(f), context);
      }
      context.stroke();
    }
    context.restore();
  }

  render(world: World): void {
    this.debugInfo.numTicksSinceLastRecord += 1;
    this.debugInfo.startTimer("render");

    // TODO: The cursor style logic being here in `render`, which is only called
    // when the simulation is running, causes the cursor style to be stuck when the
    // game is paused. To repro: in select mode, hover over a wall to get the pointer
    // cursor; then, pause the game and move the mouse around the canvas. This should
    // be fixed.
    if (this.toolbeltMode != "select-mode") {
      this.mouseCanvas.style.cursor = "default";
    } else if (world.cursorNode.target != null) {
      this.mouseCanvas.style.cursor = "pointer";
    } else {
      this.mouseCanvas.style.cursor = "default";
    }

    const context = this.canvas.getContext("2d");

    this.renderWalls(world);
    this.renderDebugTriangles(world);
    this.renderDebugTrianglesFixed(world);

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
    let shouldPlayScoreSound = false;
    for (const c of scoringCreatures) {
      if (c.scoringStateTicksSoFar == 1) shouldPlayScoreSound = true;

      const x = c.x + 4 * Math.sin(c.scoringStateTicksSoFar);

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
    // if (shouldPlayScoreSound) this.scoreSound.play();
    if (shouldPlayScoreSound) this.playAudioBuffer(this.scoreSound);

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

    this.debugInfo.stopTimer("render");
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
