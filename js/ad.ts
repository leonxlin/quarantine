// A simple utility for automatic differentiation by two variables x and y.

// This type contains the value of a function, the derivative of the function with respect to x, and the derivative with respect to y.
export type Dual = [number, number, number];

// Access components of Dual.

export function val(a: Dual): number {
  return a[0];
}

export function ddx(a: Dual): number {
  return a[1];
}

export function ddy(a: Dual): number {
  return a[2];
}

// Create basic dual numbers.

// c for constant.
export function c(c: number): Dual {
  return [c, 0, 0];
}
export function x(c: number): Dual {
  return [c, 1, 0];
}
export function y(c: number): Dual {
  return [c, 0, 1];
}
export function copy(a: Dual): Dual {
  return a.slice() as Dual;
}

// Operations.

export function add(a: Dual | number, b: Dual | number): Dual {
  if (typeof a === "number") a = c(a);
  if (typeof b === "number") b = c(b);
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function subtract(a: Dual | number, b: Dual | number): Dual {
  if (typeof a === "number") a = c(a);
  if (typeof b === "number") b = c(b);
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function neg(a: Dual): Dual {
  return [-a[0], -a[1], -a[2]];
}

export function mult(a: Dual | number, b: Dual | number): Dual {
  if (typeof a === "number") a = c(a);
  if (typeof b === "number") b = c(b);
  return [a[0] * b[0], a[1] * b[0] + a[0] * b[1], a[2] * b[0] + a[0] * b[2]];
}

export function div(a: Dual | number, b: Dual | number): Dual {
  if (typeof a === "number") a = c(a);
  if (typeof b === "number") b = c(b);
  const denom = b[0] * b[0];
  return [
    a[0] / b[0],
    (a[1] * b[0] - a[0] * b[1]) / denom,
    (a[2] * b[0] - a[0] * b[2]) / denom,
  ];
}

export function inv(a: Dual): Dual {
  const invsq = -1 / (a[0] * a[0]);
  return [1 / a[0], invsq * a[1], invsq * a[2]];
}

export function pow(a: Dual, n: number): Dual {
  const p = n * Math.pow(a[0], n - 1);
  return [Math.pow(a[0], n), p * a[1], p * a[2]];
}

export function square(a: Dual): Dual {
  return mult(a, a);
}

export function sqrt(a: Dual): Dual {
  const s = Math.sqrt(a[0]);
  const r = 0.5 / s;
  return [s, a[1] * r, a[2] * r];
}

export function max(a: Dual | number, b: Dual | number): Dual {
  // Picks `b` if equal.
  if (typeof a === "number") a = c(a);
  if (typeof b === "number") b = c(b);
  if (a[0] > b[0]) return copy(a);
  return copy(b);
}

export function min(a: Dual | number, b: Dual | number): Dual {
  // Picks `b` if equal.
  if (typeof a === "number") a = c(a);
  if (typeof b === "number") b = c(b);
  if (a[0] < b[0]) return copy(a);
  return copy(b);
}
