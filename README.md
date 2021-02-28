# quarantine

A game. WIP.

To play, run

    npm run-script build

and then simply open `index.html` in your browser or run

    python -m SimpleHTTPServer 8000

in the top-level directory and visit `localhost:8000`.

## TODO

- bugs

  - I suspect interactions are being run for multiple iterations per tick,
    which is not what we want except for collision handling...

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
  - try path planning with a potential function
