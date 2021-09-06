import * as d3 from "d3";
import {
  Wall,
  isWallComponent,
  isCreature,
  isLiveCreature,
} from "./simulation-types";
import { World } from "./world";
import { DebugInfo } from "./debug-info";
import { View } from "./view";
import * as levels from "./levels";

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

  setUpInputListeners(): void {
    // Pausing and restarting by keypress.
    d3.select("body").on("keydown", () => {
      if (d3.event.key == "p" || d3.event.key == " ") {
        this.world.togglePause();
      }
    });

    // Buttons.
    d3.select(".start-level1-button").on("click", () => {
      this.startLevel(new levels.Level1());
    });
    d3.select(".start-level2-button").on("click", () => {
      this.startLevel(new levels.Level2());
    });
    d3.select(".choose-level-button").on("click", () => {
      this.view.showModal("start-game-modal");
    });
    d3.select(".continue-level-button").on("click", () => {
      this.view.hideModal();
      this.world.victoryCheckEnabled = false;
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
        game.world.cursorNode.setLocation(
          view.shiftAndScaleMouseCoordsToCanvasCoords(d3.event)
        );
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
      game.world.walls.delete(view.selectedObject);
      view.deselectAll();
    });
  }

  startLevel(level: levels.Level): void {
    this.view.hideModal();
    this.world = new World(
      level,
      this.view.render.bind(this.view),
      this.levelVictory.bind(this),
      this.debugInfo
    );
    this.world.start();
  }

  levelVictory(): void {
    this.world.stop();
    this.view.showModal("victory-modal");
  }

  constructor() {
    this.debugInfo = new DebugInfo();
    this.view = new View(this.debugInfo);
    this.setUpInputListeners();
  }
}

window.onload = function () {
  window.d3 = d3;
  window.game = new Game();
};

// In d3-drag, the drag subject function should return the object being dragged, which
// is then accessible as event.subject later. If null is returned, then the drag event
// is suppressed.
//
// Here we are essentially using dragSubject both for its intended purpose and as a
// mousedown handler for non-draggable objects. TODO: think about whether that's good
// or not.
function dragSubject(game: Game) {
  const p = game.view.scaleMouseCoordsToCanvasCoords(d3.event);
  if (game.view.toolbeltMode == "wall-mode") {
    return game.world.startNewWall(p);
  } else if (game.view.toolbeltMode == "select-mode") {
    if (isWallComponent(game.world.cursorNode.target)) {
      game.view.selectWall(game.world.cursorNode.target.wall, d3.event);
      return null;
    } else if (isLiveCreature(game.world.cursorNode.target)) {
      game.view.selectCreature(game.world.cursorNode.target);
      // Hack: return an empty object without x or y properties. Later, in further drag
      // handling, the selected creature is accessed via game.view.selectedObject rather
      // than event.subject. This is the only way I've found to make d3-drag's event
      // object have usable x and y coordinates. Somehow using different coords for the
      // canvas makes things very confusing.
      // TODO: revisit
      return {};
    } else {
      game.view.deselectAll();
      return null;
    }
  } else if (game.view.toolbeltMode == "party-mode") {
    game.world.createParty(p);
    return null;
  }
  return null;
}

function dragStarted(game: Game) {
  if (game.view.toolbeltMode == "select-mode") {
    if (isLiveCreature(game.view.selectedObject)) {
      // Note: this has the effect of snapping the creature's position to be centered at
      // the cursor.
      const p = game.view.scaleMouseCoordsToCanvasCoords(d3.event);
      game.view.selectedObject.fixPosition(p);
    }
  }
}

function dragDragged(game: Game) {
  const p = game.view.scaleMouseCoordsToCanvasCoords(d3.event);
  if (game.view.toolbeltMode == "select-mode") {
    if (isCreature(game.view.selectedObject)) {
      game.view.selectedObject.fixPosition(p);
    }
    // Needed here because the mousemove listener above is not triggered while the drag event
    // is in progress.
    game.world.cursorNode.setLocation(p);
  } else if (game.view.toolbeltMode == "wall-mode") {
    const wall = d3.event.subject as Wall;
    wall.maybeAddPoint(p, 5 * wall.halfWidth * wall.halfWidth);
  }
}

function dragEnded(game: Game) {
  if (game.view.toolbeltMode == "select-mode") {
    if (isLiveCreature(game.view.selectedObject)) {
      game.view.selectedObject.unfixPosition();
    }
    game.view.deselectAll();
  } else if (game.view.toolbeltMode == "wall-mode") {
    const wall = d3.event.subject as Wall;
    game.world.completeWall(wall);
  }
}
