import * as d3 from 'd3';
import { SNode, Point } from './simulation-types.js'
import collideForce from './collide.js'
import {
    collisionInteraction
} from './collide.js'

// Needed to make typescript happy when defining properties on the global window object for easy debugging.
declare global {
    interface Window { 
        logRecentTickCount: any; 
        simulation: any;
    }
}

// Print ticks per second for the last 20 seconds.
var recentTicksPerSecond = new Array(20),
    recentTicksPerSecondIndex = 0;
window.logRecentTickCount = function() {
    console.log(recentTicksPerSecond
        .slice(recentTicksPerSecondIndex)
        .concat(recentTicksPerSecond.slice(0, recentTicksPerSecondIndex)));
}

window.onload = function() {
    var numTicksSinceLastRecord = 0;

    var canvas = document.querySelector("canvas"),
        context = canvas.getContext("2d"),
        width = canvas.width,
        height = canvas.height;

    var nodes = d3.range(200).map(function(i): SNode {
            return {
                r: Math.random() * 5 + 4,
                x: Math.random() * width,
                y: Math.random() * height,
                type: 'creature',
                infected: i == 1,
                health: 1,
                currentScore: 0, // Reset to 0 each tick.
            };
        });

    var gameScore = 0;
    var tempScoreIndicators = []; // Contains elements of the form {x: 0, y: 0, ticksRemaining: 0, text: "+2"}

    function squaredDistance(p1 : Point, p2 : Point) : number {
        var dx = p1.x - p2.x,
            dy = p1.y - p2.y;
        return dx * dx + dy * dy;
    }

    function agentForce(alpha) {
        nodes.forEach(function(n : SNode) {
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
        });
    }


    var simulation = d3.forceSimulation()
        .velocityDecay(0.2)
        .force("agent", agentForce)
        // .force("collide", d3.forceCollide().radius(function(d) {
        .force("interaction",
            collideForce(0 /* dummy radius */).radius(function(d) {
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
        .force("health", function(alpha) {
            nodes.forEach(function(n) {
                if (!n.infected) return;
                n.health -= 0.0003;
                if (n.health <= 0) {
                    n.type = "dead";
                    n.health = 0;
                }
            });
        })
        .nodes(nodes).on("tick", ticked);

    window.simulation = simulation;

    // Pausing and restarting by keypress.
    d3.select("body").on("keydown", function() {
        console.log(d3.event);
        if (d3.event.key == "p") {
            simulation.stop();
        } else if (d3.event.key == "s") {
            simulation.restart();
        }
    });

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

    function dragSubject(event) {
        var subject : SNode = simulation.find(d3.event.x, d3.event.y, 20);
        if (!subject) {
            subject = {
                r: 10,
                fx: d3.event.x,
                fy: d3.event.y,
                x: d3.event.x,
                y: d3.event.y,
                infected: false,
                type: 'wall',
            };
            nodes.push(subject);
            simulation.nodes(nodes);
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

    function ticked() {

        numTicksSinceLastRecord += 1;

        context.clearRect(0, 0, width, height);
        context.save();

        // Draw nodes.
        nodes.forEach(function(d) {
            if (d.type == 'dead') return;

            context.beginPath();
            context.moveTo(d.x + d.r, d.y);
            context.arc(d.x, d.y, d.r, 0, 2 * Math.PI);
            // A range from yellow (1 health) to purple (0 health).
            context.fillStyle = (d.type == 'wall') ? 'blue' : d3.interpolatePlasma(d.health * .8 + .2);
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
        context.fillText(String(gameScore), width - 10, 30);

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