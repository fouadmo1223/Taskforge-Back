import base from './base.js';
import globals from 'globals';

/**
 * React/browser preset. Consumers add the react-specific plugins they need
 * (react-hooks, react-refresh) in their own config; this layer just widens
 * globals and relaxes the Node-only return-type rule for components.
 */
export default [
  ...base,
  {
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
    },
  },
];
