import * as d3 from "d3";
import {
  SNode,
  SegmentNode,
  Wall,
  WallState,
  WallJoint,
  isWallComponent,
  Party,
  isCreature,
  isLiveCreature,
  squaredDistance,
} from "./simulation-types";
import { Level } from "./level";
import { DebugInfo } from "./debug-info";
import { View } from "./view";

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
  debugInfo: DebugInfo;
  view: View;
  currentLevel: Level;

  togglePause(): void {
    this.currentLevel.togglePause();
  }

  setUpInputListeners(): void {
    // Pausing and restarting by keypress.
    d3.select("body").on("keydown", () => {
      if (d3.event.key == "p" || d3.event.key == " ") {
        this.currentLevel.togglePause();
      }
    });

    // Start game button.
    d3.select(".start-game-button").on("click", () => {
      d3.select(".modal").classed("modal-active", false);
      this.currentLevel.start();
    });

    // Dragging. Note: dragging code may have to change when upgrading to d3v6.
    // See notes at https://observablehq.com/@d3/d3v6-migration-guide#event_drag

    // TODO: instead of conditional behavior in dragSubject, dragStarted, etc.,
    // abstract out toolbelt mode for handling drag events.
    const view = this.view;

    /* eslint-disable @typescript-eslint/no-this-alias */
    const game = this;
    /* eslint-enable @typescript-eslint/no-this-alias */

    d3.select(view.canvas)
      .call(
        d3
          .drag()
          .subject(dragSubject.bind(null, this))
          .on("start", dragStarted.bind(null, this))
          .on("drag", dragDragged.bind(null, this))
          .on("end", dragEnded.bind(null, this))
          .container(function () {
            // `this` is the canvas I *think*.
            return this as d3.DragContainerElement;
          })
      )
      .on("mousemove", () => {
        if (view.toolbeltMode != "select-mode") return;
        const p = view.shiftAndScaleMouseCoordsToCanvasCoords(d3.event);
        game.currentLevel.cursorNode.setLocation(p.x, p.y);
      });

    // Toolbelt mode toggling.
    d3.selectAll<HTMLInputElement, undefined>("[name=toolbelt]").on(
      "click",
      function () {
        view.toolbeltMode = this.value;
        if (view.toolbeltMode != "select-mode") {
          view.deselectAll();
        }
      }
    );

    d3.select(".delete-wall").on("click", function () {
      if (!(view.selectedObject instanceof Wall)) return;

      // Delete selected wall.
      game.currentLevel.walls.delete(view.selectedObject);

      // Delete wall components from game.nodes.
      // TODO: represent Level.nodes as a Set perhaps to make this less crappy.
      let numNodesToRemove = 0;
      function swap(arr, a: number, b: number): void {
        const temp = arr[a];
        arr[a] = arr[b];
        arr[b] = temp;
      }
      for (let i = 0; i < game.currentLevel.nodes.length; i++) {
        let n: SNode;
        while (
          isWallComponent((n = game.currentLevel.nodes[i])) &&
          n.wall === view.selectedObject &&
          i + numNodesToRemove < game.currentLevel.nodes.length
        ) {
          swap(
            game.currentLevel.nodes,
            i,
            game.currentLevel.nodes.length - numNodesToRemove - 1
          );
          numNodesToRemove++;
        }
      }
      if (numNodesToRemove > 0) {
        game.currentLevel.nodes.splice(-numNodesToRemove);
      }
      game.currentLevel.simulation.nodes(game.currentLevel.nodes);

      view.deselectAll();
    });
  }

  constructor() {
    this.debugInfo = new DebugInfo();
    this.view = new View(this.debugInfo);
    this.currentLevel = new Level(
      this.view.render.bind(this.view),
      this.debugInfo
    );
    this.setUpInputListeners();
  }
}

window.onload = function () {
  window.d3 = d3;
  window.game = new Game();
};

function dragSubject(game: Game) {
  const p = game.view.scaleMouseCoordsToCanvasCoords(d3.event);
  if (game.view.toolbeltMode == "wall-mode") {
    const wall = new Wall();
    wall.points = [p];
    wall.state = WallState.PROVISIONAL;
    game.currentLevel.walls.add(wall);
    return wall;
  } else if (game.view.toolbeltMode == "select-mode") {
    if (isWallComponent(game.currentLevel.cursorNode.target)) {
      game.view.selectedObject = game.currentLevel.cursorNode.target.wall;
      const s = d3.select(".delete-wall");
      s.style("display", "inline");
      s.style("left", d3.event.x + "px");
      s.style("top", d3.event.y + "px");
    } else if (isLiveCreature(game.currentLevel.cursorNode.target)) {
      game.view.selectedObject = game.currentLevel.cursorNode.target;
      // Hack: return an empty object without x or y properties. This is the only way
      // I've found to make d3-drag's event object have usable x and y coordinates. Somehow
      // using different coords for the canvas makes things very confusing.
      // TODO: revisit
      return {};
    } else {
      game.view.deselectAll();
    }
    // Note: for walls, this returns an object without `x` or `y` properties, which is
    // not how d3.subject is meant to be used. But it works for now.
    // TODO: revisit
    return game.view.selectedObject;
  } else if (game.view.toolbeltMode == "party-mode") {
    const party = new Party(p.x, p.y);
    game.currentLevel.parties.push(party);
    game.currentLevel.nodes.push(party);
    game.currentLevel.simulation.nodes(game.currentLevel.nodes);
  }
  return null;
}

function dragStarted(game: Game) {
  if (game.view.toolbeltMode == "select-mode") {
    if (isLiveCreature(game.view.selectedObject)) {
      // Manipulating game.selectedObject instead of `d3.event.subject` because I had trouble
      // getting the coords to be right in d3.event when using `d3.event.subject`.
      // See notes in dragSubject.
      game.view.selectedObject.fx = game.view.selectedObject.x;
      game.view.selectedObject.fy = game.view.selectedObject.y;
    }
  }
}

function dragDragged(game: Game) {
  const p = game.view.scaleMouseCoordsToCanvasCoords(d3.event);
  if (game.view.toolbeltMode == "select-mode") {
    if (isCreature(game.view.selectedObject)) {
      game.view.selectedObject.fx = p.x;
      game.view.selectedObject.fy = p.y;
    }
  } else if (game.view.toolbeltMode == "wall-mode") {
    const points = d3.event.subject.points;
    if (
      squaredDistance(p, points[points.length - 1]) >
      5 * game.currentLevel.WALL_HALF_WIDTH * game.currentLevel.WALL_HALF_WIDTH
    ) {
      points.push({ x: p.x, y: p.y });
    }
  }
}

function dragEnded(game: Game) {
  if (game.view.toolbeltMode == "select-mode") {
    if (isLiveCreature(game.view.selectedObject)) {
      game.view.selectedObject.fx = null;
      game.view.selectedObject.fy = null;
      game.view.selectedObject = null;
    }
  } else if (game.view.toolbeltMode == "wall-mode") {
    for (let i = 0; i < d3.event.subject.points.length; i++) {
      const point = d3.event.subject.points[i];
      game.currentLevel.nodes.push(
        new WallJoint(
          point.x,
          point.y,
          game.currentLevel.WALL_HALF_WIDTH,
          d3.event.subject
        )
      );

      if (i == 0) continue;
      const prevPoint = d3.event.subject.points[i - 1];
      game.currentLevel.nodes.push(
        new SegmentNode(
          prevPoint,
          point,
          game.currentLevel.WALL_HALF_WIDTH,
          d3.event.subject
        )
      );
    }
    game.currentLevel.simulation.nodes(game.currentLevel.nodes);
    d3.event.subject.state = WallState.BUILT;
  }
}
