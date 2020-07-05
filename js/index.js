import sayHi from './d3test.js';
import * as d3 from 'd3';
import collideForce from './collide.js'

window.onload = function() {
    sayHi();

    // Copied in part
    // from https://stackoverflow.com/questions/44055869/converting-collision-detection-example-to-from-v3-to-v4-d3

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
                infected: i == 1,
            };
        }),
        root = nodes[0];

    root.radius = 0;

    const forceX = d3.forceX(width / 2).strength(0.015);
    const forceY = d3.forceY(height / 2).strength(0.015);

    function squaredDistance(p1, p2) {
        var dx = p1.x - p2.x,
            dy = p1.y - p2.y;
        return dx * dx + dy * dy;
    }

    function agentForce(alpha) {
        nodes.forEach(function(n) {
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


    var force = d3.forceSimulation()
        .velocityDecay(0.2)
        // .force("x", forceX)
        // .force("y", forceY)
        .force("agent", agentForce)
        // .force("collide", d3.forceCollide().radius(function(d) {
        .force("collide", collideForce().radius(function(d) {
            if (d === root) {
                return Math.random() * 50 + 100;
            }
            return d.r + 0.5;
        }).iterations(5))
        .nodes(nodes).on("tick", ticked);


    function ticked(e) {

        context.clearRect(0, 0, width, height);
        context.save();

        nodes.forEach(function(d) {
            if (d === root) return;

            context.beginPath();
            context.moveTo(d.x + d.r, d.y);
            context.arc(d.x, d.y, d.r, 0, 2 * Math.PI);
            // context.fillStyle = d.fillColor;
            context.fillStyle = d.infected ? 'orange' : 'yellow';
            context.fill();
            context.strokeStyle = "#333";
            context.stroke();
        });

        context.restore();
    };

    d3.select("canvas").on("mousemove", function() {
        var p1 = d3.mouse(this);
        root.fx = p1[0];
        root.fy = p1[1];
        force.alphaTarget(0.3).restart(); //reheat the simulation
    });
};