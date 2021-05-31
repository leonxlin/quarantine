import * as d3 from "d3";
import {
  SNode,
  Wall,
  isWallComponent,
  Party,
  isCreature,
  isLiveCreature,
} from "./simulation-types";
import { World } from "./world";
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
  world: World;

  togglePause(): void {
    this.world.togglePause();
  }

  setUpInputListeners(): void {
    // Pausing and restarting by keypress.
    d3.select("body").on("keydown", () => {
      if (d3.event.key == "p" || d3.event.key == " ") {
        this.world.togglePause();
      }
    });

    // Start game button.
    d3.select(".start-game-button").on("click", () => {
      d3.select(".modal").classed("modal-active", false);
      this.world.start();
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
        game.world.cursorNode.setLocation(p.x, p.y);
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
      game.world.walls.delete(view.selectedObject);

      // Delete wall components from game.nodes.
      // TODO: represent World.nodes as a Set perhaps to make this less crappy.
      let numNodesToRemove = 0;
      function swap(arr, a: number, b: number): void {
        const temp = arr[a];
        arr[a] = arr[b];
        arr[b] = temp;
      }
      for (let i = 0; i < game.world.nodes.length; i++) {
        let n: SNode;
        while (
          isWallComponent((n = game.world.nodes[i])) &&
          n.wall === view.selectedObject &&
          i + numNodesToRemove < game.world.nodes.length
        ) {
          swap(
            game.world.nodes,
            i,
            game.world.nodes.length - numNodesToRemove - 1
          );
          numNodesToRemove++;
        }
      }
      if (numNodesToRemove > 0) {
        game.world.nodes.splice(-numNodesToRemove);
      }
      game.world.simulation.nodes(game.world.nodes);

      view.deselectAll();
    });
  }

  constructor() {
    this.debugInfo = new DebugInfo();
    this.view = new View(this.debugInfo);
    this.world = new World(this.view.render.bind(this.view), this.debugInfo);
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
    wall.addPoint(p);
    game.world.walls.add(wall);
    return wall;
  } else if (game.view.toolbeltMode == "select-mode") {
    if (isWallComponent(game.world.cursorNode.target)) {
      game.view.selectedObject = game.world.cursorNode.target.wall;
      const s = d3.select(".delete-wall");
      s.style("display", "inline");
      s.style("left", d3.event.x + "px");
      s.style("top", d3.event.y + "px");
    } else if (isLiveCreature(game.world.cursorNode.target)) {
      game.view.selectedObject = game.world.cursorNode.target;
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
    game.world.parties.push(party);
    game.world.nodes.push(party);
    game.world.simulation.nodes(game.world.nodes);
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
    const wall = d3.event.subject as Wall;
    wall.maybeAddPoint(
      p,
      5 * game.world.WALL_HALF_WIDTH * game.world.WALL_HALF_WIDTH
    );
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
    const wall = d3.event.subject as Wall;
    wall.complete();
    game.world.nodes.push(...wall.joints, ...wall.segments);
    game.world.simulation.nodes(game.world.nodes);
  }
}
