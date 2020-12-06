import * as d3 from 'd3';

export interface SNode extends d3.SimulationNodeDatum {
	r?: number;
	type?: string;
	infected?: boolean;
	health?: number;
	currentScore?: number;
	goal?: Point;
}

export interface Point {
	x?: number;
	y?: number;
}