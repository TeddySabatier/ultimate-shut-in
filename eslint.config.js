import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

// ---------------------------------------------------------------------------
// Mini-game boundary (docs/design/games/CONTRACT.md, "Boundaries").
// A game under src/games/ talks to the app only through GameScreenProps: no
// store, no screens, no router, no storage, no network. Shared presentational
// components (src/components) and pure helpers (src/game rng, types, content)
// stay allowed. src/games/lint.test.ts proves each rule fires.
// ---------------------------------------------------------------------------
const GAMES_MESSAGE = 'mini games never touch the Haven store; talk through GameScreenProps';

/** no-restricted-imports options for src/games, with the exceptions a folder needs. */
function gamesImports({ router = false, kit = false, react = true } = {}) {
  const paths = [{ name: 'zustand', message: GAMES_MESSAGE }];
  if (!router) paths.push({ name: 'react-router-dom', message: GAMES_MESSAGE }, { name: 'react-router', message: GAMES_MESSAGE });
  if (!react) {
    const pure = 'engine.ts, manifest.ts and strings.ts are pure: no React (the registry loads them eagerly)';
    paths.push({ name: 'react', message: pure }, { name: 'react-dom', message: pure }, { name: 'react/jsx-runtime', message: pure });
  }
  const patterns = [{ group: ['**/state', '**/state/**', '**/screens', '**/screens/**', 'zustand/*'], message: GAMES_MESSAGE }];
  if (!kit) patterns.push({ group: ['**/testing/contract'], message: 'the contract kit imports vitest: test files only' });
  return ['error', { paths, patterns }];
}

const GAMES_GLOBALS = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'localStorage', 'sessionStorage', 'indexedDB'].map((name) => ({
  name,
  message: 'mini games are offline and stateless: no network, no storage (the host persists outcomes)',
}));

const PURE_PROPERTIES = [
  { object: 'Math', property: 'random', message: 'engines are seeded: use turnRng(seed, step) or mulberry32 from src/game/rng' },
  { object: 'Date', property: 'now', message: 'engines never read a clock: model time as tick actions' },
  { object: 'performance', property: 'now', message: 'engines never read a clock: model time as tick actions' },
];

// The registry imports every manifest, engine and strings object eagerly, so it
// must stay out of the main bundle: only lazily loaded routes may import it
// (the Games Lab now, the Arena host under src/components/arena/ later).
const LAZY_REGISTRY = [
  'error',
  {
    patterns: [{ group: ['**/games/registry', '**/games/registry.ts'], message: 'the registry is lazy: import it only from a lazily loaded route' }],
  },
];

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'node_modules', 'coverage'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/games/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': gamesImports(),
      'no-restricted-globals': ['error', ...GAMES_GLOBALS],
    },
  },
  {
    files: ['src/games/**/*.test.{ts,tsx}'],
    rules: { 'no-restricted-imports': gamesImports({ kit: true }), 'no-restricted-globals': 'off' },
  },
  {
    // The Games Lab is a dev tool with its own routes; it still never touches the store.
    files: ['src/games/lab/**/*.{ts,tsx}'],
    ignores: ['src/games/lab/**/*.test.{ts,tsx}'],
    rules: { 'no-restricted-imports': gamesImports({ router: true }) },
  },
  {
    files: ['src/games/*/engine.ts', 'src/games/*/manifest.ts', 'src/games/*/strings.ts'],
    rules: {
      'no-restricted-imports': gamesImports({ react: false }),
      'no-restricted-properties': ['error', ...PURE_PROPERTIES],
      'no-restricted-syntax': ['error', { selector: "NewExpression[callee.name='Date']", message: 'engines never read a clock: model time as tick actions' }],
    },
  },
  {
    files: ['src/App.tsx', 'src/main.tsx', 'src/state/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}'],
    ignores: ['src/components/arena/**'],
    rules: { 'no-restricted-imports': LAZY_REGISTRY },
  },
  {
    files: ['scripts/**/*.{js,mjs}', '*.config.{js,mjs,ts}'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
);
