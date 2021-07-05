import resolve from "@rollup/plugin-node-resolve";
import typescript from "rollup-plugin-typescript2";
import { terser } from "rollup-plugin-terser";

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
  plugins: [resolve(), typescript()],
};
