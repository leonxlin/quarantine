import * as d3 from "d3";

export class DebugInfo {
  // Some crude performance monitoring.
  numTicksSinceLastRecord = 0;
  recentTicksPerSecond: number[] = new Array(20);
  recentTicksPerSecondIndex = 0;
  recentCollisionForceRuntime: number[] = [];
  numNodes = 0;

  constructor() {
    setInterval(
      function () {
        d3.select(".frames-per-second").text(this.numTicksSinceLastRecord);
        d3.select(".num-nodes").text(this.numNodes);
        // Print the average.
        if (this.recentCollisionForceRuntime.length > 0) {
          d3.select(".collision-force-runtime").text(
            this.recentCollisionForceRuntime.reduce((a, b) => a + b) /
              this.recentCollisionForceRuntime.length
          );
        }

        this.recentCollisionForceRuntime = [];

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
}
