import {
  Dual,
  square,
  add,
  subtract,
  neg,
  mult,
  div,
  inv,
  sqrt,
  pow,
  val,
  ddx,
  ddy,
} from "./ad";
import * as ad from "./ad";

test("differentiates (4x + y + 23)^2", () => {
  function f(x: number, y: number): Dual {
    return square(add(add(mult(ad.x(x), 4), ad.y(y)), 23));
  }
  function dfdx(x: number, y: number): number {
    return 2 * (4 * x + y + 23) * 4;
  }
  function dfdy(x: number, y: number): number {
    return 2 * (4 * x + y + 23);
  }

  expect(f(3, 8)).toEqual([1849, dfdx(3, 8), dfdy(3, 8)]);
});

test("differentiates 72 / sqrt(xy)", () => {
  function f(x: number, y: number): Dual {
    return div(72, sqrt(mult(ad.x(x), ad.y(y))));
  }
  function dfdx(x: number, y: number): number {
    return (-72 / 2) * Math.pow(x * y, -3 / 2) * y;
  }
  function dfdy(x: number, y: number): number {
    return (-72 / 2) * Math.pow(x * y, -3 / 2) * x;
  }

  expect(f(4, 9)).toEqual([12, dfdx(4, 9), dfdy(4, 9)]);
});

test("differentiates - x^6 - 1/y", () => {
  function f(x: number, y: number): Dual {
    return subtract(neg(pow(ad.x(x), 6)), inv(ad.y(y)));
  }
  function dfdx(x: number, y: number): number {
    return -6 * Math.pow(x, 5);
  }
  function dfdy(x: number, y: number): number {
    return 1 / y / y;
  }

  const result = f(2, 10);
  expect(val(result)).toBeCloseTo(-64.1);
  expect(ddx(result)).toBeCloseTo(dfdx(2, 10));
  expect(ddy(result)).toBeCloseTo(dfdy(2, 10));
});

test("differentiates 4+2", () => {
  expect(add(4, 2)).toEqual([6, 0, 0]);
});
