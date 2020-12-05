# quarantine
A game. WIP.

To play, run

	npm run-script build

and then simply open `index.html` in your browser or run 

    python -m SimpleHTTPServer 8000

in the top-level directory and visit `localhost:8000`.

## TODO

* bugs
	* can't build walls where dead nodes are

* migrate to typescript
* clean up code
	* make global `game` variable
	* separate node lists into 
		* all
		* displayable
		* draggable
		* infectable
		* collidable
		* etc.

* next features
	* draw linear walls
	* deaths should dock points
	* make interaction bonuses more visually obvious
	* level modes