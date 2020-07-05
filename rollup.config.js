import resolve from '@rollup/plugin-node-resolve';

export default {
  input: 'js/index.js',
  output: {
    file: 'bundle.js',
    format: 'iife',
    name: 'quarantine',
  },
  plugins: [ resolve() ]
};
