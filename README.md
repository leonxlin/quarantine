# quarantine

A game. WIP.

To play, run

    npm run-script build

and then simply open `index.html` in your browser or run

    python -m SimpleHTTPServer 8000

in the top-level directory and visit `localhost:8000`.

## TODO

- bug: dragging may not work with minified js
- make creatures give up on goal after some amount of time
- make initial speed uniform (currently creatures move faster at start)

- clean up code

  - separate node lists into
    - all
    - displayable
    - draggable
    - infectable
    - collidable
    - etc.
  - break index.ts into smaller files
  - delete expired parties
  - make game.nodes a Set perhaps
  - factor out toolbelt mode to avoid conditional logic in dragStarted etc.
  - redo pathing and collision handling
    - try using potential function

- next features
  - make interaction bonuses more visually obvious
  - level modes
  - pathing
    - research keywords: navmesh
    - AI Navigation: It's not a solved problem: https://gdcvault.com/play/1014514/AI-Navigation-It-s-Not
    - https://gamedev.stackexchange.com/questions/183708/how-does-heavily-constrained-delaunay-triangulation-work
    - Efficient Triangulation-Based Pathfinding: https://www.aaai.org/Papers/AAAI/2006/AAAI06-148.pdf
