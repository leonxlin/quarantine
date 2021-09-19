# quarantine

A game. WIP.

To play, run

    npm run-script build

and then run

    python -m SimpleHTTPServer 8000

in the top-level directory and visit `localhost:8000`. (If you simply open `index.html`, assets will not
load.)

## TODO

- point location algorithm for triangulations, with edge-walking: https://www.cl.cam.ac.uk/techreports/UCAM-CL-TR-728.pdf
- bug: creatures sometimes repeatedly set goals outside the world boundary and therefore get stuck along
  an edge of the world due to boundary enforcement
- bug: dragging may not work with minified js
- bug: single-point walls are not visible in Safari???
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
      - constrained Delauney triangulation
        - point location via cached jump-and-walk
    - https://gamedev.stackexchange.com/questions/183708/how-does-heavily-constrained-delaunay-triangulation-work
    - Efficient Triangulation-Based Pathfinding: https://www.aaai.org/Papers/AAAI/2006/AAAI06-148.pdf
