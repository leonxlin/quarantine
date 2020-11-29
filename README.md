# quarantine
A game. WIP.

To play, run

	npm run-script build

and

    python -m SimpleHTTPServer 8000

in the top-level directory and visit `localhost:8000`.

## TODO

* migrate to typescript
* clean up code
	* make global `game` variable
	* separate node lists into 
		* all
		* displayable
		* infectable
		* collidable
		* etc.
