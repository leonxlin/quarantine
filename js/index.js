var myCircle = new Path.Circle(new Point(100, 70), 50);
myCircle.fillColor = 'yellow';
myCircle.strokeColor = 'black';

var people = [];
var radius = 8;

function MakeFaceSymbol() {
	var path = new Path.Circle(new Point(20, 20), radius);
	path.fillColor = 'yellow';
	path.strokeColor = 'black';
	return new Symbol(path);
}
var faceSymbol = MakeFaceSymbol();


function Person(center) {
	this.face = faceSymbol.place(center);

	this.velocity = new Point();
	this.velocity.length = 1;
	this.velocity.angle = Math.random() * 360;
}

function createPeople() {
	var minx = radius;
	var maxx = view.size.width - radius;
	var miny = radius;
	var maxy = view.size.height - radius;
	var spacing = 50;

	for (var x = minx; x < maxx; x += spacing) {
		for (var y = miny; y < maxy; y += spacing) {
			people.push(new Person(new Point(x, y)));
		}
	}
}

createPeople();

function onMouseDown(event) {
	// Add a segment to the path at the position of the mouse:
	myCircle.position = new Point(event.point);
}

function onFrame(event) {
	for (var i = 0; i < people.length; i++) {
		var person = people[i];
		person.velocity.angle += (Math.random() - 0.5)*20;
		person.face.position += person.velocity;

		// Make people stay in bounds.
		if (person.face.position.x < radius || person.face.position.x > view.size.width - radius) {
			person.velocity.x *= -1;
		}
		if (person.face.position.y < radius || person.face.position.y > view.size.height - radius) {
			person.velocity.y *= -1;
		}
		person.face.position = Point.min(Point.max(person.face.position, radius), view.size);

	}
}