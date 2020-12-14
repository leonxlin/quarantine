# quarantine

A game. WIP.

To play, run

    npm run-script build

and then simply open `index.html` in your browser or run

    python -m SimpleHTTPServer 8000

in the top-level directory and visit `localhost:8000`.

## TODO

- bugs

  - can't build walls where dead nodes are
  - I suspect interactions are being run for multiple iterations per tick,
    which is not what we want except for collision handling...

- migrate to typescript
- clean up code

  - make global `game` variable
  - separate node lists into
    - all
    - displayable
    - draggable
    - infectable
    - collidable
    - etc.
  - why are there carriage returns ^M in bundle.js?

- next features
  - draw linear walls
  - deaths should dock points
  - make interaction bonuses more visually obvious
  - level modes
