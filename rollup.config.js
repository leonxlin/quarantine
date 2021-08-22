import resolve from "@rollup/plugin-node-resolve";
import typescript from "rollup-plugin-typescript2";
import { terser } from "rollup-plugin-terser";
import commonjs from "@rollup/plugin-commonjs";

export default {
  input: "js/index.ts",
  output: [
    {
      file: "bundle.js",
      format: "iife",
      name: "quarantine",
    },
    {
      file: "bundle.min.js",
      format: "iife",
      name: "quarantine_min",
      plugins: [
        terser({
          mangle: {
            properties: true,
          },
        }),
      ],
    },
  ],
  plugins: [typescript(), commonjs(), resolve()],
};
