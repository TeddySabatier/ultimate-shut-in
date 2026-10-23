/**
 * 150 concrete nouns in English and French, plus confusable groups and a
 * seeded picker. The engine keeps word ids; the Screen and the log look the
 * strings up here. Original vocabulary: no trademarks, no room names.
 */
import { rngInt, type Rng } from '../../game/rng';
import type { Locale } from '../contract';

export interface Word {
  readonly en: string;
  readonly fr: string;
}

export const WORDS: readonly Word[] = [
  { en: 'acorn', fr: 'gland' },
  { en: 'amber', fr: 'ambre' },
  { en: 'anchor', fr: 'ancre' },
  { en: 'anvil', fr: 'enclume' },
  { en: 'apple', fr: 'pomme' },
  { en: 'apricot', fr: 'abricot' },
  { en: 'barrel', fr: 'tonneau' },
  { en: 'basket', fr: 'panier' },
  { en: 'bead', fr: 'perle' },
  { en: 'bell', fr: 'cloche' },
  { en: 'belt', fr: 'ceinture' },
  { en: 'berry', fr: 'baie' },
  { en: 'biscuit', fr: 'biscuit' },
  { en: 'blanket', fr: 'couverture' },
  { en: 'bolt', fr: 'boulon' },
  { en: 'boot', fr: 'botte' },
  { en: 'bottle', fr: 'bouteille' },
  { en: 'bowl', fr: 'bol' },
  { en: 'brick', fr: 'brique' },
  { en: 'broom', fr: 'balai' },
  { en: 'bucket', fr: 'seau' },
  { en: 'buckle', fr: 'boucle' },
  { en: 'button', fr: 'bouton' },
  { en: 'cabbage', fr: 'chou' },
  { en: 'cactus', fr: 'cactus' },
  { en: 'candle', fr: 'bougie' },
  { en: 'cannon', fr: 'canon' },
  { en: 'canoe', fr: 'canoë' },
  { en: 'carrot', fr: 'carotte' },
  { en: 'chain', fr: 'chaîne' },
  { en: 'chisel', fr: 'burin' },
  { en: 'cloak', fr: 'cape' },
  { en: 'clock', fr: 'horloge' },
  { en: 'clover', fr: 'trèfle' },
  { en: 'cobweb', fr: 'toile' },
  { en: 'cocoa', fr: 'cacao' },
  { en: 'comb', fr: 'peigne' },
  { en: 'compass', fr: 'boussole' },
  { en: 'cork', fr: 'bouchon' },
  { en: 'crayon', fr: 'crayon' },
  { en: 'crystal', fr: 'cristal' },
  { en: 'cucumber', fr: 'concombre' },
  { en: 'cushion', fr: 'coussin' },
  { en: 'daisy', fr: 'marguerite' },
  { en: 'dice', fr: 'dé' },
  { en: 'doormat', fr: 'paillasson' },
  { en: 'drum', fr: 'tambour' },
  { en: 'dustpan', fr: 'balayette' },
  { en: 'easel', fr: 'chevalet' },
  { en: 'feather', fr: 'plume' },
  { en: 'fern', fr: 'fougère' },
  { en: 'flask', fr: 'flasque' },
  { en: 'flint', fr: 'silex' },
  { en: 'flute', fr: 'flûte' },
  { en: 'funnel', fr: 'entonnoir' },
  { en: 'garlic', fr: 'ail' },
  { en: 'gear', fr: 'engrenage' },
  { en: 'globe', fr: 'globe' },
  { en: 'grape', fr: 'raisin' },
  { en: 'grater', fr: 'râpe' },
  { en: 'hammer', fr: 'marteau' },
  { en: 'hanger', fr: 'cintre' },
  { en: 'hinge', fr: 'gond' },
  { en: 'honey', fr: 'miel' },
  { en: 'hook', fr: 'crochet' },
  { en: 'ink', fr: 'encre' },
  { en: 'ivy', fr: 'lierre' },
  { en: 'jam', fr: 'confiture' },
  { en: 'kettle', fr: 'bouilloire' },
  { en: 'key', fr: 'clé' },
  { en: 'ladle', fr: 'louche' },
  { en: 'lantern', fr: 'lanterne' },
  { en: 'lemon', fr: 'citron' },
  { en: 'magnet', fr: 'aimant' },
  { en: 'marble', fr: 'bille' },
  { en: 'melon', fr: 'melon' },
  { en: 'mirror', fr: 'miroir' },
  { en: 'moss', fr: 'mousse' },
  { en: 'moth', fr: 'mite' },
  { en: 'mug', fr: 'chope' },
  { en: 'napkin', fr: 'serviette' },
  { en: 'needle', fr: 'aiguille' },
  { en: 'onion', fr: 'oignon' },
  { en: 'olive', fr: 'olive' },
  { en: 'owl', fr: 'hibou' },
  { en: 'pancake', fr: 'crêpe' },
  { en: 'pebble', fr: 'galet' },
  { en: 'pickle', fr: 'cornichon' },
  { en: 'pillow', fr: 'oreiller' },
  { en: 'pinecone', fr: 'cône' },
  { en: 'platter', fr: 'plat' },
  { en: 'plum', fr: 'prune' },
  { en: 'pretzel', fr: 'bretzel' },
  { en: 'pulley', fr: 'poulie' },
  { en: 'quilt', fr: 'édredon' },
  { en: 'quill', fr: 'calame' },
  { en: 'radish', fr: 'radis' },
  { en: 'reed', fr: 'roseau' },
  { en: 'rivet', fr: 'rivet' },
  { en: 'saddle', fr: 'selle' },
  { en: 'saucer', fr: 'soucoupe' },
  { en: 'scissors', fr: 'ciseaux' },
  { en: 'seal', fr: 'phoque' },
  { en: 'shell', fr: 'coquillage' },
  { en: 'soap', fr: 'savon' },
  { en: 'spool', fr: 'bobine' },
  { en: 'spoon', fr: 'cuillère' },
  { en: 'stool', fr: 'tabouret' },
  { en: 'string', fr: 'ficelle' },
  { en: 'swan', fr: 'cygne' },
  { en: 'thimble', fr: 'dé à coudre' },
  { en: 'thistle', fr: 'chardon' },
  { en: 'thermos', fr: 'thermos' },
  { en: 'towel', fr: 'torchon' },
  { en: 'trumpet', fr: 'trompette' },
  { en: 'umbrella', fr: 'parapluie' },
  { en: 'vase', fr: 'vase' },
  { en: 'walnut', fr: 'noix' },
  { en: 'waffle', fr: 'gaufre' },
  { en: 'whisk', fr: 'fouet' },
  { en: 'whistle', fr: 'sifflet' },
  { en: 'wolf', fr: 'loup' },
  { en: 'yoke', fr: 'joug' },
  { en: 'zipper', fr: 'fermeture' },
  { en: 'almond', fr: 'amande' },
  { en: 'bagel', fr: 'bagel' },
  { en: 'brush', fr: 'brosse' },
  { en: 'crab', fr: 'crabe' },
  { en: 'deer', fr: 'cerf' },
  { en: 'duck', fr: 'canard' },
  { en: 'fox', fr: 'renard' },
  { en: 'frog', fr: 'grenouille' },
  { en: 'goat', fr: 'chèvre' },
  { en: 'hen', fr: 'poule' },
  { en: 'ant', fr: 'fourmi' },
  { en: 'bee', fr: 'abeille' },
  { en: 'cub', fr: 'ourson' },
  { en: 'hare', fr: 'lièvre' },
  { en: 'mole', fr: 'taupe' },
  { en: 'otter', fr: 'loutre' },
  { en: 'badger', fr: 'blaireau' },
  { en: 'beetle', fr: 'scarabée' },
  { en: 'raven', fr: 'corbeau' },
  { en: 'trout', fr: 'truite' },
  { en: 'turnip', fr: 'navet' },
  { en: 'violet', fr: 'violette' },
  { en: 'willow', fr: 'saule' },
  { en: 'medal', fr: 'médaille' },
  { en: 'coral', fr: 'corail' },
  { en: 'oyster', fr: 'huître' },
];

/** English names that should not share a round (lookalikes, close meaning, or French homophones). */
export const CONFUSABLE_GROUPS: readonly (readonly string[])[] = [
  ['apple', 'apricot', 'plum'],
  ['lemon', 'melon'],
  ['grape', 'berry'],
  ['onion', 'garlic'],
  ['carrot', 'radish', 'turnip', 'cabbage'],
  ['walnut', 'almond', 'acorn', 'pinecone'],
  ['olive', 'pickle'],
  ['jam', 'honey', 'cocoa'],
  ['pretzel', 'bagel', 'waffle', 'pancake', 'biscuit'],
  ['owl', 'raven'],
  ['swan', 'duck', 'hen'],
  ['fox', 'wolf'],
  ['deer', 'goat', 'hare'],
  ['ant', 'bee', 'beetle', 'moth'],
  ['crab', 'seal', 'otter', 'oyster'],
  ['cub', 'fox'],
  ['bell', 'whistle'],
  ['candle', 'lantern'],
  ['drum', 'trumpet', 'flute'],
  ['spoon', 'ladle'],
  ['broom', 'dustpan'],
  ['blanket', 'quilt', 'pillow', 'cushion'],
  ['pebble', 'brick', 'marble'],
  ['needle', 'quill', 'feather'],
  ['string', 'chain'],
  ['kettle', 'thermos', 'flask', 'bottle'],
  ['comb', 'brush'],
  ['napkin', 'towel'],
  ['boot', 'saddle'],
  ['cactus', 'fern', 'ivy', 'moss'],
  ['daisy', 'thistle', 'clover', 'violet'],
  ['button', 'buckle', 'zipper'],
  ['hammer', 'chisel', 'anvil'],
  ['gear', 'pulley', 'bolt', 'rivet'],
  ['anchor', 'canoe'],
  ['bowl', 'platter', 'saucer', 'mug'],
  ['crayon', 'ink'],
  ['compass', 'clock'],
  ['crystal', 'amber', 'flint', 'coral'],
  ['reed', 'willow', 'ivy'],
  ['yoke', 'saddle'],
  ['bead', 'medal'],
  ['funnel', 'grater', 'whisk'],
  ['bucket', 'barrel', 'basket'],
  ['scissors', 'needle'],
  ['cork', 'bottle'],
  ['cloak', 'blanket'],
  ['key', 'hook'],
  ['dice', 'thimble'],
];

const NAME_TO_ID: Readonly<Record<string, number>> = (() => {
  const map: Record<string, number> = {};
  for (let i = 0; i < WORDS.length; i++) map[WORDS[i]!.en] = i;
  return map;
})();

/** Packed "lo:hi" pairs of word ids that must not share a round. */
const CONFUSABLE_PAIRS: ReadonlySet<string> = (() => {
  const pairs = new Set<string>();
  for (const group of CONFUSABLE_GROUPS) {
    const ids = group.map((name) => NAME_TO_ID[name]).filter((id): id is number => id !== undefined);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i]!;
        const b = ids[j]!;
        pairs.add(a < b ? `${a}:${b}` : `${b}:${a}`);
      }
    }
  }
  return pairs;
})();

export function wordText(id: number, locale: Locale): string {
  const word = WORDS[id];
  return word ? word[locale] : '';
}

export function wordPrefix(id: number, locale: Locale, letters: number): string {
  const text = wordText(id, locale);
  const n = letters < 1 ? 1 : letters;
  return text.slice(0, n);
}

export function areConfusable(a: number, b: number): boolean {
  if (a === b) return true;
  return CONFUSABLE_PAIRS.has(a < b ? `${a}:${b}` : `${b}:${a}`);
}

export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = rngInt(rng, i + 1);
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

/**
 * Pick `count` word ids that do not repeat, are not in `used`, and do not
 * mix a confusable pair with each other. Falls back to unique-only if the
 * pool is too tight (should not happen with 150 words).
 */
export function pickWords(rng: Rng, count: number, used: readonly number[] = []): number[] {
  const blocked = new Set(used);
  const pool = shuffle(
    rng,
    WORDS.map((_, id) => id).filter((id) => !blocked.has(id)),
  );
  const picked: number[] = [];
  for (const id of pool) {
    if (picked.length >= count) break;
    if (picked.some((p) => areConfusable(p, id))) continue;
    picked.push(id);
  }
  if (picked.length < count) {
    for (const id of pool) {
      if (picked.length >= count) break;
      if (!picked.includes(id)) picked.push(id);
    }
  }
  return picked;
}
