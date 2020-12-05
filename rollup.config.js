import resolve from '@rollup/plugin-node-resolve';
import typescript from 'rollup-plugin-typescript2';

export default {
  input: 'js/index.js',
  output: {
    file: 'bundle.js',
    format: 'iife',
    name: 'quarantine',
  },
  plugins: [ resolve(), typescript() ]
};
