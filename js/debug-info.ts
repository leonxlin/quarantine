import * as d3 from "d3";

function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b) / arr.length;
}

export class DebugInfo {
  // Some crude performance monitoring.
  numTicksSinceLastRecord = 0;
  recentTicksPerSecond: number[] = new Array(20);
  recentTicksPerSecondIndex = 0;

  // Timer data.
  timerStartTimes = new Map<string, number>();
  recentTimerValues = new Map<string, number[]>();

  constructor() {
    this.initTimer("step");
    this.initTimer("collision");
    this.initTimer("triangulation");
    this.initTimer("render");
    this.initTimer("locate-creatures");
    this.initTimer("build-quadtree");

    setInterval(
      function () {
        this.displayAndClearRecentTimerValues("step", ".step-runtime");
        this.displayAndClearRecentTimerValues(
          "collision",
          ".collision-force-runtime"
        );
        this.displayAndClearRecentTimerValues(
          "triangulation",
          ".triangulation-runtime"
        );
        this.displayAndClearRecentTimerValues("render", ".render-runtime");
        this.displayAndClearRecentTimerValues(
          "locate-creatures",
          ".locate-creatures-runtime"
        );
        this.displayAndClearRecentTimerValues(
          "build-quadtree",
          ".build-quadtree-runtime"
        );

        d3.select(".frames-per-second").text(this.numTicksSinceLastRecord);
        this.recentTicksPerSecond[
          this.recentTicksPerSecondIndex
        ] = this.numTicksSinceLastRecord;
        this.recentTicksPerSecondIndex += 1;
        this.recentTicksPerSecondIndex %= this.recentTicksPerSecond.length;
        this.numTicksSinceLastRecord = 0;
      }.bind(this),
      1000
    );
  }

  // Print ticks per second for the last 20 seconds.
  logRecentTickCount(): void {
    console.log(
      this.recentTicksPerSecond
        .slice(this.recentTicksPerSecondIndex)
        .concat(
          this.recentTicksPerSecond.slice(0, this.recentTicksPerSecondIndex)
        )
    );
  }

  // Timer-related methods.

  displayAndClearRecentTimerValues(name: string, selector: string): void {
    const values = this.recentTimerValues[name];
    if (values.length > 0) {
      d3.select(selector).text(mean(values));
    }
    this.recentTimerValues[name] = [];
  }

  initTimer(name: string): void {
    this.recentTimerValues[name] = [];
  }

  startTimer(name: string): void {
    this.timerStartTimes[name] = Date.now();
  }

  stopTimer(name: string): void {
    this.recentTimerValues[name].push(Date.now() - this.timerStartTimes[name]);
  }
}
