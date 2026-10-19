/**
 * The games registry: discovers every `src/games/<id>/manifest.ts` at build
 * time, so adding a game never edits a shared file.
 *
 * - Manifests (with their engines and strings) are imported eagerly: they
 *   are small and the Arena needs them to list games and play bots.
 * - Screens are imported lazily, one chunk per game, through `loadScreen`.
 */
import type { ComponentType } from 'react';
import { GAME_CATEGORIES, GAME_ID_PATTERN, RESERVED_FOLDERS, type GameId, type GameModule, type GameScreenProps } from './contract';

const manifestFiles = import.meta.glob<{ default?: unknown }>('./*/manifest.ts', { eager: true });
const screenFiles = import.meta.glob<{ default: ComponentType<GameScreenProps> }>('./*/Screen.tsx');

/** `./coin-duel/manifest.ts` -> `coin-duel`. */
export function folderFromPath(path: string): string {
  return path.split('/')[1] ?? '';
}

function asModule(value: unknown): GameModule | null {
  if (value === null || typeof value !== 'object') return null;
  const m = value as Partial<GameModule>;
  if (!m.manifest || typeof m.manifest.id !== 'string' || !m.engine || !m.strings) return null;
  return m as GameModule;
}

/** Modules by folder name; folders whose default export is not a module are left out (validateRegistry reports them). */
const modulesByFolder = new Map<string, GameModule>();
for (const [path, file] of Object.entries(manifestFiles)) {
  const mod = asModule(file.default);
  if (mod) modulesByFolder.set(folderFromPath(path), mod);
}

const screensByFolder = new Map<string, () => Promise<{ default: ComponentType<GameScreenProps> }>>();
for (const [path, load] of Object.entries(screenFiles)) screensByFolder.set(folderFromPath(path), load);

function compareGames(a: GameModule, b: GameModule): number {
  const ca = GAME_CATEGORIES.indexOf(a.manifest.category);
  const cb = GAME_CATEGORIES.indexOf(b.manifest.category);
  if (ca !== cb) return ca - cb;
  return a.manifest.name.en.localeCompare(b.manifest.name.en, 'en') || a.manifest.id.localeCompare(b.manifest.id, 'en');
}

/** Every game, sorted by category (in `GAME_CATEGORIES` order) then English name. `devOnly` games only with `includeDev`. */
export function listGames(options: { includeDev?: boolean } = {}): GameModule[] {
  const all = [...modulesByFolder.entries()].filter(([folder, m]) => folder === m.manifest.id).map(([, m]) => m);
  return all.filter((m) => options.includeDev === true || m.manifest.devOnly !== true).sort(compareGames);
}

/** One game by id (dev-only games included), or `undefined`. */
export function getGame(id: GameId): GameModule | undefined {
  const m = modulesByFolder.get(id);
  return m && m.manifest.id === id ? m : undefined;
}

/** The game's Screen component, loaded on demand (its own chunk). Rejects for an unknown id. */
export async function loadScreen(id: GameId): Promise<ComponentType<GameScreenProps>> {
  const load = getGame(id) ? screensByFolder.get(id) : undefined;
  if (!load) throw new Error(`No game "${id}" with a Screen.tsx in src/games/`);
  const file = await load();
  if (typeof file.default !== 'function' && typeof file.default !== 'object') throw new Error(`src/games/${id}/Screen.tsx has no default export`);
  return file.default;
}

/**
 * Problems in a set of discovered files, for `validateRegistry` and its tests.
 * `manifests` maps `./<folder>/manifest.ts` to the imported file; `screenPaths`
 * lists the `./<folder>/Screen.tsx` paths.
 */
export function checkRegistry(manifests: Record<string, { default?: unknown }>, screenPaths: readonly string[]): string[] {
  const problems: string[] = [];
  const screens = new Set(screenPaths.map(folderFromPath));
  const ids = new Map<string, string>();
  const folders = new Set<string>();
  for (const [path, file] of Object.entries(manifests)) {
    const folder = folderFromPath(path);
    folders.add(folder);
    if (RESERVED_FOLDERS.includes(folder)) problems.push(`src/games/${folder}/ is a reserved folder and cannot hold a game`);
    const mod = asModule(file.default);
    if (!mod) {
      problems.push(`src/games/${folder}/manifest.ts must default-export defineGame({ manifest, engine, strings })`);
      continue;
    }
    const id = mod.manifest.id;
    if (!GAME_ID_PATTERN.test(id)) problems.push(`src/games/${folder}: id "${id}" is not kebab-case`);
    if (id !== folder) problems.push(`src/games/${folder}: id "${id}" must equal the folder name`);
    const other = ids.get(id);
    if (other !== undefined) problems.push(`id "${id}" is used by src/games/${other} and src/games/${folder}`);
    ids.set(id, folder);
    if (!screens.has(folder)) problems.push(`src/games/${folder}/Screen.tsx is missing`);
  }
  for (const folder of screens) if (!folders.has(folder)) problems.push(`src/games/${folder}/Screen.tsx has no manifest.ts next to it`);
  return problems;
}

/** Problems with the discovered games: unique ids, folder name equals id, a Screen for every game. Empty when all is well. */
export function validateRegistry(): string[] {
  return checkRegistry(manifestFiles, Object.keys(screenFiles));
}
