import sayHi from './d3test.js';
import * as d3 from 'd3';
import collideForce from './collide.js'
import {
    collisionInteraction
} from './collide.js'

// Print ticks per second for the last 20 seconds.
var recentTicksPerSecond = new Array(20),
    recentTicksPerSecondIndex = 0;
window.logRecentTickCount = function() {
    console.log(recentTicksPerSecond
        .slice(recentTicksPerSecondIndex)
        .concat(recentTicksPerSecond.slice(0, recentTicksPerSecondIndex)));
}

window.onload = function() {
    sayHi();

    // Copied in part
    // from https://stackoverflow.com/questions/44055869/converting-collision-detection-example-to-from-v3-to-v4-d3

    var numTicksSinceLastRecord = 0;

    var canvas = document.querySelector("canvas"),
        context = canvas.getContext("2d"),
        width = canvas.width,
        height = canvas.height;

    var color = d3.scaleOrdinal().range(d3.schemeCategory10);
    var nodes = d3.range(200).map(function(i) {
            return {
                r: Math.random() * 5 + 4,
                x: Math.random() * width,
                y: Math.random() * height,
                // fillColor: 'color(i % 10)'
                // fillColor: 'yellow',
                type: 'creature',
                infected: i == 1,
                health: 1,
                currentScore: 0, // Reset to 0 each tick.
            };
        }),
        root = nodes[0];

    var gameScore = 0;
    var tempScoreIndicators = []; // Contains elements of the form {x: 0, y: 0, ticksRemaining: 0, text: "+2"}

    function squaredDistance(p1, p2) {
        var dx = p1.x - p2.x,
            dy = p1.y - p2.y;
        return dx * dx + dy * dy;
    }

    function agentForce(alpha) {
        nodes.forEach(function(n) {
            if (n.type != 'creature') return;

            if (!("goal" in n) || squaredDistance(n, n.goal) < 10) {
                n.goal = {
                    x: Math.random() * width,
                    y: Math.random() * height
                };
            }
            var len = Math.sqrt(squaredDistance(n, n.goal));
            n.vx += alpha * (n.goal.x - n.x) / len;
            n.vy += alpha * (n.goal.y - n.y) / len;
        })
    }


    var simulation = d3.forceSimulation()
        .velocityDecay(0.2)
        .force("agent", agentForce)
        // .force("collide", d3.forceCollide().radius(function(d) {
        .force("interaction",
            collideForce().radius(function(d) {
                // if (d === root) {
                //     return Math.random() * 50 + 100;
                // }
                return d.r;
            }).iterations(5)
            .interaction('collision', collisionInteraction)
            .interaction('contagion', function(node1, node2) {
                if (Math.random() < 0.002 && node1.type == 'creature' && node2.type == 'creature')
                    node1.infected = node2.infected = node1.infected || node2.infected;
            })
            .interaction('score', function(node1, node2) {
                if (Math.random() < 0.0005 && node1.type == 'creature' && node2.type == 'creature') {
                    node1.curentScore += 1;
                    node2.currentScore += 1;
                    tempScoreIndicators.push({
                        x: 0.5 * (node1.x + node2.x),
                        y: 0.5 * (node1.y + node2.y),
                        text: "+2",
                        ticksRemaining: 60
                    });
                }
            }))
        .nodes(nodes).on("tick", ticked);

    window.simulation = simulation;

    // Dragging. Note: dragging code may have to change when upgrading to d3v6.
    // See notes at https://observablehq.com/@d3/d3v6-migration-guide#event_drag

    d3.select(canvas).call(
        d3
        .drag()
        .subject(dragSubject)
        .on("start", dragStarted)
        .on("drag", dragDragged)
        .on("end", dragEnded)
    );

    function dragSubject() {
        var subject = simulation.find(d3.event.x, d3.event.y, 20);
        if (!subject) {
            subject = {
                r: 10,
                fx: d3.event.x,
                fy: d3.event.y,
                x: d3.event.x,
                y: d3.event.y,
                // fillColor: 'color(i % 10)'
                // fillColor: 'yellow',
                infected: false,
                type: 'wall',
            };
            nodes.push(subject);
            simulation.nodes(nodes);
            console.log(nodes[nodes.length - 1]);
            return null;
        } else if (subject.type != 'creature') {
            return null;
        }
        return subject;
    }

    function dragStarted() {
        //if (!d3.event.active) simulation.alphaTarget(0.3).restart();
        d3.event.subject.fx = d3.event.subject.x;
        d3.event.subject.fy = d3.event.subject.y;
    }

    function dragDragged() {
        d3.event.subject.fx = d3.event.x;
        d3.event.subject.fy = d3.event.y;
    }

    function dragEnded() {
        d3.event.subject.fx = null;
        d3.event.subject.fy = null;
    }


    // Draw canvas at each tick.

    function ticked(e) {

        numTicksSinceLastRecord += 1;

        context.clearRect(0, 0, width, height);
        context.save();

        // Draw nodes.
        nodes.forEach(function(d) {
            // if (d === root) return;

            context.beginPath();
            context.moveTo(d.x + d.r, d.y);
            context.arc(d.x, d.y, d.r, 0, 2 * Math.PI);
            // context.fillStyle = d.fillColor;
            context.fillStyle = (d.type == 'wall') ? 'blue' : (d.infected ? 'orange' : 'yellow');
            context.fill();
            context.strokeStyle = "#333";
            context.stroke();

            // Collect score.
            if (d.type == 'creature') {
                gameScore += d.currentScore;
                d.currentScore = 0;
            }
        });

        // Print indicators when score increases.
        context.fillStyle = "#0a6b24";
        context.font = 'bold 10px sans-serif';
        var numExpiring = 0;
        tempScoreIndicators.forEach(function(indicator, index) {
            context.fillText(indicator.text, indicator.x, indicator.y);
            indicator.ticksRemaining -= 1;
            if (indicator.ticksRemaining == 0) numExpiring++;
        });
        tempScoreIndicators.splice(0, numExpiring);

        // Print score in the top-right corner.
        context.fillStyle = "#000";
        context.font = '20px sans-serif';
        context.textAlign = 'right';
        context.fillText(gameScore, width - 10, 30);

        context.restore();
    };

    // Record number of ticks per second.
    setInterval(function() {
        recentTicksPerSecond[recentTicksPerSecondIndex] = numTicksSinceLastRecord;
        recentTicksPerSecondIndex += 1;
        recentTicksPerSecondIndex %= recentTicksPerSecond.length;
        numTicksSinceLastRecord = 0;

    }, 1000);

    // Start simulation.
    simulation.alphaTarget(0.3).restart();

    // Old avoid-the-mouse thingy.

    d3.select("canvas").on("mousemove", function() {
        // var p1 = d3.mouse(this);
        // root.fx = p1[0];
        // root.fy = p1[1];
        // simulation.alphaTarget(0.3).restart(); //reheat the simulation
    });
};