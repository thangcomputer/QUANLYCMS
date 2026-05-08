const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    ignores: [
      'node_modules/**',
      'client/**',
      'uploads/**',
      'tests/**',
      'deploy_scripts/**',
      'scratch/**',
      'test_*.js',
      'scratch_test_*.js',
      'check_*.js',
      'migrate_*.js',
      'clean_*.js',
      'seed_*.js',
      'reset_*.js',
      'setup_*.js',
      'assign_*.js',
      'add_*.js',
      'fix_*.js',
      'create_*.js',
      '*.log',
    ],
  },
];
