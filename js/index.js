
var people = [];
var radius = 8;
var pause = false;
var faceSymbol;
var infectedFaceSymbol;

var FACE_TO_PERSON_SYMBOL = Symbol('FACE_TO_PERSON_SYMBOL');


function MakeFaceSymbol(color) {
	var path = new paper.Path.Circle(new paper.Point(20, 20), radius);
	path.fillColor = color;
	path.strokeColor = 'black';
	return new paper.Symbol(path);
}

function Person(center) {
	this.face = faceSymbol.place(center);
	this.face[FACE_TO_PERSON_SYMBOL] = this;

	this.velocity = new paper.Point();
	this.velocity.length = 0.5;
	this.velocity.angle = Math.random() * 360;
	this.infected = false;

	this.iterate = function() {
		this.velocity.angle += (Math.random() - 0.5)*20;
		this.face.position = this.face.position.add(this.velocity);

		// Make people stay in bounds.
		if (this.face.position.x < radius || this.face.position.x > paper.view.size.width - radius) {
			this.velocity.x *= -1;
		}
		if (this.face.position.y < radius || this.face.position.y > paper.view.size.height - radius) {
			this.velocity.y *= -1;
		}
		this.face.position = paper.Point.min(paper.Point.max(this.face.position, radius), paper.view.size);

		this.face.fillColor = 'orange';
	};

	this.infect = function() {
		if (this.infected) return;
		this.infected = true;
		this.face.remove();
		this.face = infectedFaceSymbol.place(this.face.position);
		this.face[FACE_TO_PERSON_SYMBOL] = this;
	}
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
	if (pause) {
		return;
	}

	toBeInfected = [];
	for (var i = 0; i < people.length; i++) {
		people[i].iterate();
		if (!people[i].infected) {
			continue;
		}

		var hitResults = paper.project.hitTestAll(people[i].face.position, hitOptions);
		for (let hitResult of hitResults) {
			if (people[i].infected && (hitResult.item[FACE_TO_PERSON_SYMBOL] != undefined)) {
				hitResult.item[FACE_TO_PERSON_SYMBOL].infect();
			}
		}
	}
}

window.onload = function() {
	// Get a reference to the canvas object
	var canvas = document.getElementById('game-canvas');
	// Create an empty project and a view for the canvas:
	paper.setup(canvas);

	faceSymbol = MakeFaceSymbol('yellow');
	infectedFaceSymbol = MakeFaceSymbol('orange');
	createPeople();

	people[37].infect();

	paper.view.onFrame = onFrame;

	var tool = new paper.Tool();
	tool.onMouseDown = onMouseDown;

	paper.view.draw();
}