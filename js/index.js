
var people = [];
var radius = 5;
var pause = false;
var faceSymbol;
var infectedFaceSymbol;
var frames = 0;
var collisionDetector;
var currentPersonId = 0;
var numGraphDataPoints = 1000;
var infectedGraph;
var infectedGraphRectangle;
var infectedGraphLine;
var infectedPeople = [];
var infectedGraphData = [];
var textItem;
var wallSymbol, greenSymbol;
var gameMap;

MAP_HEIGHT = 5;
MAP_WIDTH = 90;

/*
----5---10---15---20---25---30---35---40---45---50---55---60---65---70---75---80---85---90|
*/
var MAP_STRING = "\
                                                                                          \
    xxxxxxxxxxxxxxxxx                                                                     \
    x      x  x  x          ggggggggggg                                                   \
    x      x  x  x          ggggggggggg                                                   \
    x  xxxxx  x  xxxx                                                                     \
"

var FACE_TO_PERSON_SYMBOL = Symbol('FACE_TO_PERSON_SYMBOL');

function Cell(charCode, r, c) {
	this.charCode = charCode;
	this.r = r;
	this.c = c;
	this.path = null;
	this.center = new paper.Point([(2*c + 1)*radius, (2*r + 1)*radius]);
	switch(this.charCode) {
		case 'x':
			this.path = wallSymbol.place(this.center);
			break;
		case 'g':
			this.path = greenSymbol.place(this.center);
		default:
			break;
	} 
}

function GameMap(map_string, width, height) {
	this.map_string = map_string;
	this.width = width;
	this.height = height;
	this.cells = [];
	for (var r = 0; r < this.height; r++) {
		this.cells.push([]);
		for (var c = 0; c < this.width; c++) {
			this.cells[r].push(new Cell(this.map_string.charAt(r*this.width + c), r, c));
		}
	}

}

function drawMap() {
	wallSymbol = new paper.Symbol(new paper.Path.Rectangle({
		from: [0, 0],
		to: [2*radius, 2*radius],
		fillColor: 'brown'
	}));

	greenSymbol = new paper.Symbol(new paper.Path.Rectangle({
		from: [0, 0],
		to: [2*radius, 2*radius],
		fillColor: 'green'
	}));

	gameMap = GameMap(MAP_STRING, MAP_WIDTH, MAP_HEIGHT);
}

function generatePersonId() {
	currentPersonId++;
	return currentPersonId;
}

// Currently for Person objects only.
function CollisionDetector(resolution) {
	this.resolution = resolution;
	this.zones = {};  // Maps zone keys to objects that map person ids to persons.
	this.personIdToZoneKey = {};
	this.formatZoneKey = function(gridX, gridY) {
		return "z" + gridX + "," + gridY;
	};
	this.zoneKey = function(position) {
		return this.formatZoneKey(Math.floor(position.x/resolution), Math.floor(position.y/resolution));
	};
	this.nearbyZoneKeys = function(position) {
		var centerX = Math.floor(position.x/resolution);
		var centerY = Math.floor(position.y/resolution);
		var keys = [];
		for (var x = centerX - 1; x <= centerX + 1; x++) {
			for (var y = centerY - 1; y <= centerY + 1; y++) {
				keys.push(this.formatZoneKey(x, y));
			}
		}
		return keys;
	};
	this.registerPosition = function(person) {
		key = this.zoneKey(person.face.position);
		if (!(key in this.zones)) {
			this.zones[key] = {};
		}

		this.zones[key][person.id] = person;
		previousKey = this.personIdToZoneKey[person.id];
		if (previousKey != key) {
			if (previousKey != undefined) {
				delete this.zones[previousKey][person.id];
			}
			this.personIdToZoneKey[person.id] = key;
		}
	};
	this.findCollisions = function(person) {
		var ret = [];
		for (let key of this.nearbyZoneKeys(person.face.position)) {
			for (let personId in this.zones[key]) {
				if (personId == person.id) {
					continue;
				}
				let p = this.zones[key][personId];
				if (person.face.position.getDistance(p.face.position, true) < 4*radius*radius) {
					ret.push(p);
				}
			}
		}
		return ret;
	};
}

function MakeFaceSymbol(color) {
	// var path = new paper.Path.Circle(new paper.Point(20, 20), radius);
	
	var path = new paper.Path.Rectangle(new paper.Rectangle([0, 0], [2*radius, 2*radius]));
	
	path.fillColor = color;
	path.strokeColor = 'black';
	return new paper.Symbol(path);

	// return new paper.Symbol(new paper.Raster({
	//     source: color + '_circle.png'
	// }));
}

function Person(center) {
	this.id = generatePersonId();

	this.face = faceSymbol.place(center);
	this.face[FACE_TO_PERSON_SYMBOL] = this;
	this.infectedFace = infectedFaceSymbol.place([-10, -10]);

	this.velocity = new paper.Point();
	this.velocity.length = 1;
	this.velocity.angle = Math.random() * 360;
	this.infected = false;

	this.iterate = function() {
		this.velocity.angle += (Math.random() - 0.5)*20;
		pos = this.face.position.add(this.velocity);

		// Make people stay in bounds.
		if (pos.x < radius || pos.x > paper.view.size.width - radius) {
			this.velocity.x *= -1;
		}
		if (pos.y < radius || pos.y > paper.view.size.height - radius) {
			this.velocity.y *= -1;
		}
		this.setPosition(paper.Point.min(paper.Point.max(pos, radius), paper.view.size));
		//this.face.rotation = this.velocity.angle + 45;
	};

	this.infect = function() {
		if (this.infected) return;
		this.infected = true;
		this.infectedFace.position = this.face.position;
		this.face.remove();
		this.face = this.infectedFace;
		this.face[FACE_TO_PERSON_SYMBOL] = this;

		infectedPeople.push(this);
	};

	this.setPosition = function(point) {
		this.face.position = point;
		collisionDetector.registerPosition(this);
	};

	this.setPosition(center);
}

function createPeople() {
	var minx = radius;
	var maxx = paper.view.size.width - radius;
	var miny = radius;
	var maxy = paper.view.size.height - radius;
	var spacing = 50;

	for (var x = minx; x < maxx; x += spacing) {
		for (var y = miny; y < maxy; y += spacing) {
			people.push(new Person(new paper.Point(x, y)));
		}
	}
}

function drawInfectedGraph() {
	infectedGraph = new paper.Group();
	infectedGraph.name = 'infected_graph';

	infectedGraphRectangle = new paper.Rectangle(paper.view.bounds.bottomLeft.add([0, -100]), paper.view.bounds.bottomCenter);
	var path = new paper.Path.Rectangle(infectedGraphRectangle);
	path.fillColor = '#cccccc';
	path.opacity = 0.9;
	path.addTo(infectedGraph);


	textItem = new paper.PointText([20, paper.view.size.height - 20]);
	textItem.addTo(infectedGraph);

	for (let i = 0; i < numGraphDataPoints; i++) {
		infectedGraphData.push(0);
	}


	infectedGraphLine = new paper.Path();
	infectedGraphLine.addTo(infectedGraph);
}

function updateInfectedGraph() {
	infectedGraphData.push(infectedPeople.length);
	if (infectedGraphData.length > 100000) {
		console.log('discarding old graph data');
		infectedGraphData.splice(0, infectedGraphData.length - numGraphDataPoints);
	}

	infectedGraphLine.remove();
	infectedGraphLine = new paper.Path();
	infectedGraphLine.addTo(infectedGraph);
	infectedGraphLine.strokeColor = 'black';

	offset = infectedGraphData.length - numGraphDataPoints;
	for (let i = 0; i < numGraphDataPoints; i++) {
		let x = infectedGraphRectangle.left + i/numGraphDataPoints * infectedGraphRectangle.width;
		let y = infectedGraphRectangle.bottom - infectedGraphData[offset + i] / people.length * infectedGraphRectangle.height;
		infectedGraphLine.add([x, y]);
	}

	infectedGraph.bringToFront();
}

hitOptions = {
	stroke: false,
	segments: false,
	fill: true,
	bounds: true
}

function onMouseDown(event) {
	var hitResult = paper.project.hitTest(event.point, hitOptions);
	console.log(hitResult.item);
	hitResult.item.position = [0, 0];
	console.log(hitResult.item);
}

function onFrame(event) {
	frames += 1;
	if (pause) {
		return;
	}

	toBeInfected = [];
	for (var i = 0; i < people.length; i++) {
		people[i].iterate();
		if (!people[i].infected) {
			continue;
		}

		var collideds = collisionDetector.findCollisions(people[i]);
		for (let p of collideds) {
			p.infect();
		}
	}
	textItem.content = infectedPeople.length;

	updateInfectedGraph();
}

window.onload = function() {
	// Get a reference to the canvas object
	var canvas = document.getElementById('game-canvas');
	// Create an empty project and a view for the canvas:
	paper.setup(canvas);

	drawInfectedGraph();
	drawMap();

	collisionDetector = new CollisionDetector(radius*2);


	faceSymbol = MakeFaceSymbol('yellow');
	infectedFaceSymbol = MakeFaceSymbol('orange');
	createPeople();

	people[37].infect();


	paper.view.onFrame = onFrame;

	var tool = new paper.Tool();
	tool.onMouseDown = onMouseDown;

	paper.view.draw();

	setInterval(function() {
		console.log("Frames per second: " + frames + " at " + Date.now()/1000);
		//console.log("infected graph data: " + infectedGraphData.length);
		frames = 0;
	}, 1000);
}