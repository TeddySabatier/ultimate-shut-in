import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

// ---------------------------------------------------------------------------
// Mini-game boundaries (docs/design/games/CONTRACT.md, "Boundaries").
// A game under src/games/<id>/ talks to the app only through GameScreenProps:
// no store (nor hooks or components that read it), no screens, no router, no
// storage, no network, no other game, no registry, no Lab. Its .ts files
// (engine, strings, manifest, solvers, generators) are pure: no React, no
// randomness, no clock, no browser globals. Presentational components
// (SystemWindow, Meter, Icon, ConfirmDialog, ...) and pure helpers of src/game
// stay allowed. src/games/lint.test.ts proves each rule fires.
// ---------------------------------------------------------------------------
const GAMES_MESSAGE = 'mini games never touch the Haven store; talk through GameScreenProps';
const PURE_MESSAGE = 'the .ts files of a game are pure and seeded: no React, no randomness, no clock, no browser globals';

/** Components that read the store (directly or through a hook) or the router. Presentational ones stay allowed. */
const STORE_COMPONENTS = [
  '**/components/AppShell',
  '**/components/RingHeader',
  '**/components/MyQuestsSection',
  '**/components/Typewriter',
  '**/components/Chips',
  '**/components/TabBar',
  '**/components/OutpostsSection',
  '**/components/overlays/**',
  '!**/components/overlays/ModalFrame',
];

/** A game imports only its own folder, ../contract, ../ui/* and ../testing/* (fixtures, play, validate; tests: contract). */
const OTHER_GAMES = {
  regex: '^\\.\\./(?!(ui|testing)/|contract(\\.ts)?$)[^./]',
  message: 'a game imports only its own folder, ../contract, ../ui and ../testing: never another game, the Lab or the registry',
};

/** no-restricted-imports options for src/games, with the exceptions a folder needs. */
function gamesImports({ router = false, kit = false, react = true, isolate = false } = {}) {
  const paths = [{ name: 'zustand', message: GAMES_MESSAGE }];
  if (!router) paths.push({ name: 'react-router-dom', message: GAMES_MESSAGE }, { name: 'react-router', message: GAMES_MESSAGE });
  if (!react) paths.push({ name: 'react', message: PURE_MESSAGE }, { name: 'react-dom', message: PURE_MESSAGE }, { name: 'react/jsx-runtime', message: PURE_MESSAGE });
  const patterns = [
    { group: ['**/state', '**/state/**', '**/screens', '**/screens/**', '**/hooks', '**/hooks/**', 'zustand/*'], message: GAMES_MESSAGE },
    { group: STORE_COMPONENTS, message: `${GAMES_MESSAGE} (this component reads the store or the router; use presentational components such as SystemWindow, Meter, Icon)` },
  ];
  if (!kit) patterns.push({ group: ['**/testing/contract'], message: 'the contract kit imports vitest: test files only' });
  if (isolate) patterns.push(OTHER_GAMES);
  return ['error', { paths, patterns }];
}

const OFFLINE = 'mini games are offline and stateless: no network, no storage (the host persists outcomes)';
const NETWORK_AND_STORAGE = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'localStorage', 'sessionStorage', 'indexedDB'];

function gamesGlobals({ pure = false } = {}) {
  const list = NETWORK_AND_STORAGE.map((name) => ({ name, message: OFFLINE }));
  if (pure) {
    for (const name of ['window', 'globalThis', 'self', 'document', 'navigator', 'crypto', 'performance', 'setTimeout', 'setInterval', 'requestAnimationFrame']) {
      list.push({ name, message: `${PURE_MESSAGE} (the locale comes in through initial(); time is tick actions)` });
    }
  }
  return ['error', ...list];
}

function gamesProperties({ pure = false } = {}) {
  const list = [];
  for (const object of ['window', 'globalThis', 'self']) {
    for (const property of [...NETWORK_AND_STORAGE, 'navigator']) list.push({ object, property, message: OFFLINE });
  }
  list.push({ object: 'navigator', property: 'sendBeacon', message: OFFLINE });
  if (pure) {
    list.push(
      { object: 'Math', property: 'random', message: 'engines are seeded: use turnRng(seed, step) or mulberry32 from src/game/rng' },
      { object: 'Date', property: 'now', message: 'engines never read a clock: model time as tick actions' },
      { object: 'performance', property: 'now', message: 'engines never read a clock: model time as tick actions' },
      { object: 'crypto', property: 'getRandomValues', message: 'engines are seeded: use src/game/rng' },
      { object: 'crypto', property: 'randomUUID', message: 'engines are seeded: use src/game/rng' },
    );
  }
  return ['error', ...list];
}

function gamesSyntax({ glob = false, pure = false } = {}) {
  const list = [
    {
      selector: "ImportExpression[source.value=/(^|\\/)(state|screens|hooks)(\\/|$)|^(react-router|zustand)/]",
      message: GAMES_MESSAGE,
    },
  ];
  if (glob) list.push({ selector: "CallExpression[callee.object.type='MetaProperty'][callee.property.name=/^glob/]", message: 'only src/games/registry.ts discovers games; a game never uses import.meta.glob' });
  if (pure) {
    list.push(
      { selector: "NewExpression[callee.name='Date']", message: 'engines never read a clock: model time as tick actions' },
      { selector: "CallExpression[callee.name='Date']", message: 'engines never read a clock: model time as tick actions' },
    );
  }
  return ['error', ...list];
}

// The registry imports every manifest, engine and strings object, so it must
// stay out of the main bundle: only the lazily loaded Arena host
// (src/components/arena/host/) and the Lab (inside src/games/) may import it.
// scripts/check-main-chunk.mjs proves it on the built bundle.
const LAZY_REGISTRY_MESSAGE = 'the registry is lazy: import it only from a lazily loaded route';

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
      'no-restricted-globals': gamesGlobals(),
      'no-restricted-properties': gamesProperties(),
      'no-restricted-syntax': gamesSyntax(),
    },
  },
  {
    // The Games Lab is a dev tool with its own routes; it still never touches the store.
    files: ['src/games/lab/**/*.{ts,tsx}'],
    ignores: ['src/games/lab/**/*.test.{ts,tsx}'],
    rules: { 'no-restricted-imports': gamesImports({ router: true }) },
  },
  {
    // Game folders: no other game, no Lab, no registry, no import.meta.glob.
    files: ['src/games/*/**/*.{ts,tsx}'],
    ignores: ['src/games/{lab,testing,ui}/**'],
    rules: {
      'no-restricted-imports': gamesImports({ isolate: true }),
      'no-restricted-syntax': gamesSyntax({ glob: true }),
    },
  },
  {
    // Every .ts file of a game (engine, strings, manifest, solvers, generators) is pure.
    files: ['src/games/*/**/*.ts'],
    ignores: ['src/games/{lab,testing,ui}/**', 'src/games/**/*.test.ts'],
    rules: {
      'no-restricted-imports': gamesImports({ isolate: true, react: false }),
      'no-restricted-globals': gamesGlobals({ pure: true }),
      'no-restricted-properties': gamesProperties({ pure: true }),
      'no-restricted-syntax': gamesSyntax({ glob: true, pure: true }),
    },
  },
  {
    files: ['src/games/**/*.test.{ts,tsx}'],
    rules: { 'no-restricted-imports': gamesImports({ kit: true, isolate: true }), 'no-restricted-globals': 'off', 'no-restricted-properties': 'off' },
  },
  {
    // The registry stays lazy: nothing outside src/games and the Arena host imports it or globs the games.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/games/**', 'src/components/arena/host/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['**/games/registry', '**/games/registry.*', '@/games/registry', '@/games/registry.*'], message: LAZY_REGISTRY_MESSAGE }] },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: "CallExpression[callee.object.type='MetaProperty'][callee.property.name=/^glob/][arguments.0.value=/games\\//]", message: LAZY_REGISTRY_MESSAGE },
        { selector: "CallExpression[callee.object.type='MetaProperty'][callee.property.name=/^glob/] > ArrayExpression > Literal[value=/games\\//]", message: LAZY_REGISTRY_MESSAGE },
      ],
    },
  },
  {
    files: ['scripts/**/*.{js,mjs}', '*.config.{js,mjs,ts}'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
);
