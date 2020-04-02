var myCircle = new Path.Circle(new Point(100, 70), 50);
myCircle.fillColor = 'yellow';
myCircle.strokeColor = 'black';

var people = [];

function Person(center) {
	this.face = new Path.Circle(center, 10);
	this.face.fillColor = 'yellow';
	this.face.strokeColor = 'black';

	this.velocity = new Point();
	this.velocity.length = 1;
	this.velocity.angle = Math.random() * 360;
}

function createPeople() {
	var minx = 10;
	var maxx = 890;
	var miny = 10;
	var maxy = 590;
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
	}
}