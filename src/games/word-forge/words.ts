/**
 * Word Forge decks: 40 A2–B1 entries each. The engine scores from this file
 * (ids, spellings, POS, gender). Example sentences live in `examples.ts`
 * so they load with the Screen, not the registry.
 */
export const DECK_IDS = ['food', 'travel', 'work', 'feelings'] as const;
export type DeckId = (typeof DECK_IDS)[number];

export const POS_IDS = ['noun', 'verb', 'adj', 'adv', 'phrase'] as const;
export type Pos = (typeof POS_IDS)[number];

/** `n` = not a gendered noun (verbs, adjectives, phrases, epicene nouns). */
export type Gender = 'm' | 'f' | 'n';

export interface WordEntry {
  id: string;
  deck: DeckId;
  en: string;
  fr: string;
  pos: Pos;
  gender: Gender;
}

type Raw = readonly [id: string, en: string, fr: string, pos: Pos, gender: Gender];

function deck(id: DeckId, rows: readonly Raw[]): WordEntry[] {
  return rows.map(([slug, en, fr, pos, gender]) => ({
    id: `${id}-${slug}`,
    deck: id,
    en,
    fr,
    pos,
    gender,
  }));
}

/** True cognates whose English and French spellings match. Tests consult this list. */
export const COGNATES: readonly string[] = [
  'orange',
  'dessert',
  'restaurant',
  'sandwich',
  'train',
  'bus',
  'village',
  'taxi',
  'question',
  'parent',
];

const FOOD: readonly Raw[] = [
  ['apple', 'apple', 'pomme', 'noun', 'f'],
  ['bread', 'bread', 'pain', 'noun', 'm'],
  ['water', 'water', 'eau', 'noun', 'f'],
  ['cheese', 'cheese', 'fromage', 'noun', 'm'],
  ['chicken', 'chicken', 'poulet', 'noun', 'm'],
  ['rice', 'rice', 'riz', 'noun', 'm'],
  ['soup', 'soup', 'soupe', 'noun', 'f'],
  ['salad', 'salad', 'salade', 'noun', 'f'],
  ['fish', 'fish', 'poisson', 'noun', 'm'],
  ['egg', 'egg', 'œuf', 'noun', 'm'],
  ['milk', 'milk', 'lait', 'noun', 'm'],
  ['butter', 'butter', 'beurre', 'noun', 'm'],
  ['sugar', 'sugar', 'sucre', 'noun', 'm'],
  ['salt', 'salt', 'sel', 'noun', 'm'],
  ['coffee', 'coffee', 'café', 'noun', 'm'],
  ['tea', 'tea', 'thé', 'noun', 'm'],
  ['wine', 'wine', 'vin', 'noun', 'm'],
  ['beer', 'beer', 'bière', 'noun', 'f'],
  ['orange', 'orange', 'orange', 'noun', 'f'],
  ['lemon', 'lemon', 'citron', 'noun', 'm'],
  ['strawberry', 'strawberry', 'fraise', 'noun', 'f'],
  ['banana', 'banana', 'banane', 'noun', 'f'],
  ['potato', 'potato', 'pomme de terre', 'noun', 'f'],
  ['tomato', 'tomato', 'tomate', 'noun', 'f'],
  ['onion', 'onion', 'oignon', 'noun', 'm'],
  ['carrot', 'carrot', 'carotte', 'noun', 'f'],
  ['meat', 'meat', 'viande', 'noun', 'f'],
  ['breakfast', 'breakfast', 'petit-déjeuner', 'noun', 'm'],
  ['lunch', 'lunch', 'déjeuner', 'noun', 'm'],
  ['dinner', 'dinner', 'dîner', 'noun', 'm'],
  ['meal', 'meal', 'repas', 'noun', 'm'],
  ['dessert', 'dessert', 'dessert', 'noun', 'm'],
  ['cake', 'cake', 'gâteau', 'noun', 'm'],
  ['chocolate', 'chocolate', 'chocolat', 'noun', 'm'],
  ['honey', 'honey', 'miel', 'noun', 'm'],
  ['kitchen', 'kitchen', 'cuisine', 'noun', 'f'],
  ['restaurant', 'restaurant', 'restaurant', 'noun', 'm'],
  ['knife', 'knife', 'couteau', 'noun', 'm'],
  ['plate', 'plate', 'assiette', 'noun', 'f'],
  ['sandwich', 'sandwich', 'sandwich', 'noun', 'm'],
];

const TRAVEL: readonly Raw[] = [
  ['train', 'train', 'train', 'noun', 'm'],
  ['bus', 'bus', 'bus', 'noun', 'm'],
  ['airport', 'airport', 'aéroport', 'noun', 'm'],
  ['station', 'station', 'gare', 'noun', 'f'],
  ['ticket', 'ticket', 'billet', 'noun', 'm'],
  ['hotel', 'hotel', 'hôtel', 'noun', 'm'],
  ['passport', 'passport', 'passeport', 'noun', 'm'],
  ['suitcase', 'suitcase', 'valise', 'noun', 'f'],
  ['map', 'map', 'carte', 'noun', 'f'],
  ['street', 'street', 'rue', 'noun', 'f'],
  ['city', 'city', 'ville', 'noun', 'f'],
  ['village', 'village', 'village', 'noun', 'm'],
  ['beach', 'beach', 'plage', 'noun', 'f'],
  ['mountain', 'mountain', 'montagne', 'noun', 'f'],
  ['lake', 'lake', 'lac', 'noun', 'm'],
  ['sea', 'sea', 'mer', 'noun', 'f'],
  ['forest', 'forest', 'forêt', 'noun', 'f'],
  ['bridge', 'bridge', 'pont', 'noun', 'm'],
  ['crossroads', 'crossroads', 'carrefour', 'noun', 'm'],
  ['boat', 'boat', 'bateau', 'noun', 'm'],
  ['north', 'north', 'nord', 'noun', 'm'],
  ['south', 'south', 'sud', 'noun', 'm'],
  ['east', 'east', 'est', 'noun', 'm'],
  ['west', 'west', 'ouest', 'noun', 'm'],
  ['far', 'far', 'loin', 'adv', 'n'],
  ['near', 'near', 'près', 'adv', 'n'],
  ['late', 'late', 'tard', 'adv', 'n'],
  ['early', 'early', 'tôt', 'adv', 'n'],
  ['journey', 'journey', 'voyage', 'noun', 'm'],
  ['platform', 'platform', 'quai', 'noun', 'm'],
  ['delay', 'delay', 'retard', 'noun', 'm'],
  ['taxi', 'taxi', 'taxi', 'noun', 'm'],
  ['bike', 'bike', 'vélo', 'noun', 'm'],
  ['walk', 'walk', 'marcher', 'verb', 'n'],
  ['arrive', 'arrive', 'arriver', 'verb', 'n'],
  ['leave', 'leave', 'partir', 'verb', 'n'],
  ['border', 'border', 'frontière', 'noun', 'f'],
  ['island', 'island', 'île', 'noun', 'f'],
  ['road', 'road', 'route', 'noun', 'f'],
  ['plane', 'plane', 'avion', 'noun', 'm'],
];

const WORK: readonly Raw[] = [
  ['book', 'book', 'livre', 'noun', 'm'],
  ['school', 'school', 'école', 'noun', 'f'],
  ['teacher', 'teacher', 'professeur', 'noun', 'm'],
  ['student', 'student', 'étudiant', 'noun', 'm'],
  ['lesson', 'lesson', 'leçon', 'noun', 'f'],
  ['homework', 'homework', 'devoirs', 'noun', 'm'],
  ['exam', 'exam', 'examen', 'noun', 'm'],
  ['paper', 'paper', 'papier', 'noun', 'm'],
  ['pen', 'pen', 'stylo', 'noun', 'm'],
  ['notebook', 'notebook', 'cahier', 'noun', 'm'],
  ['computer', 'computer', 'ordinateur', 'noun', 'm'],
  ['office', 'office', 'bureau', 'noun', 'm'],
  ['meeting', 'meeting', 'réunion', 'noun', 'f'],
  ['work', 'work', 'travail', 'noun', 'm'],
  ['job', 'job', 'emploi', 'noun', 'm'],
  ['boss', 'boss', 'patron', 'noun', 'm'],
  ['colleague', 'colleague', 'collègue', 'noun', 'n'],
  ['printer', 'printer', 'imprimante', 'noun', 'f'],
  ['phone', 'phone', 'téléphone', 'noun', 'm'],
  ['write', 'write', 'écrire', 'verb', 'n'],
  ['read', 'read', 'lire', 'verb', 'n'],
  ['learn', 'learn', 'apprendre', 'verb', 'n'],
  ['study', 'study', 'étudier', 'verb', 'n'],
  ['explain', 'explain', 'expliquer', 'verb', 'n'],
  ['question', 'question', 'question', 'noun', 'f'],
  ['answer', 'answer', 'réponse', 'noun', 'f'],
  ['word', 'word', 'mot', 'noun', 'm'],
  ['sentence', 'sentence', 'phrase', 'noun', 'f'],
  ['language', 'language', 'langue', 'noun', 'f'],
  ['dictionary', 'dictionary', 'dictionnaire', 'noun', 'm'],
  ['library', 'library', 'bibliothèque', 'noun', 'f'],
  ['university', 'university', 'université', 'noun', 'f'],
  ['class', 'class', 'cours', 'noun', 'm'],
  ['break', 'break', 'pause', 'noun', 'f'],
  ['project', 'project', 'projet', 'noun', 'm'],
  ['salary', 'salary', 'salaire', 'noun', 'm'],
  ['schedule', 'schedule', 'emploi du temps', 'noun', 'm'],
  ['skill', 'skill', 'compétence', 'noun', 'f'],
  ['idea', 'idea', 'idée', 'noun', 'f'],
  ['deadline', 'deadline', 'date limite', 'noun', 'f'],
];

const FEELINGS: readonly Raw[] = [
  ['happy', 'happy', 'heureux', 'adj', 'n'],
  ['sad', 'sad', 'triste', 'adj', 'n'],
  ['angry', 'angry', 'en colère', 'adj', 'n'],
  ['tired', 'tired', 'fatigué', 'adj', 'n'],
  ['scared', 'scared', 'effrayé', 'adj', 'n'],
  ['proud', 'proud', 'fier', 'adj', 'n'],
  ['kind', 'kind', 'gentil', 'adj', 'n'],
  ['friend', 'friend', 'ami', 'noun', 'm'],
  ['family', 'family', 'famille', 'noun', 'f'],
  ['parent', 'parent', 'parent', 'noun', 'm'],
  ['mother', 'mother', 'mère', 'noun', 'f'],
  ['father', 'father', 'père', 'noun', 'm'],
  ['sister', 'sister', 'sœur', 'noun', 'f'],
  ['brother', 'brother', 'frère', 'noun', 'm'],
  ['child', 'child', 'enfant', 'noun', 'n'],
  ['visitor', 'visitor', 'visiteur', 'noun', 'm'],
  ['love', 'love', 'amour', 'noun', 'm'],
  ['hope', 'hope', 'espoir', 'noun', 'm'],
  ['fear', 'fear', 'peur', 'noun', 'f'],
  ['joy', 'joy', 'joie', 'noun', 'f'],
  ['peace', 'peace', 'paix', 'noun', 'f'],
  ['smile', 'smile', 'sourire', 'noun', 'm'],
  ['laugh', 'laugh', 'rire', 'verb', 'n'],
  ['cry', 'cry', 'pleurer', 'verb', 'n'],
  ['wait', 'wait', 'attendre', 'verb', 'n'],
  ['help', 'help', 'aider', 'verb', 'n'],
  ['thanks', 'thank you', 'merci', 'phrase', 'n'],
  ['welcome', 'welcome', 'bienvenue', 'phrase', 'n'],
  ['sorry', 'sorry', 'désolé', 'adj', 'n'],
  ['hello', 'hello', 'bonjour', 'phrase', 'n'],
  ['goodbye', 'goodbye', 'au revoir', 'phrase', 'n'],
  ['name', 'name', 'nom', 'noun', 'm'],
  ['people', 'people', 'gens', 'noun', 'm'],
  ['together', 'together', 'ensemble', 'adv', 'n'],
  ['alone', 'alone', 'seul', 'adj', 'n'],
  ['brave', 'brave', 'courageux', 'adj', 'n'],
  ['calm', 'calm', 'calme', 'adj', 'n'],
  ['worry', 'worry', "s'inquiéter", 'verb', 'n'],
  ['trust', 'trust', 'confiance', 'noun', 'f'],
  ['guest', 'guest', 'invité', 'noun', 'm'],
];

export const WORDS: readonly WordEntry[] = [
  ...deck('food', FOOD),
  ...deck('travel', TRAVEL),
  ...deck('work', WORK),
  ...deck('feelings', FEELINGS),
];

export const WORDS_PER_RUN = 20;
export const MAX_SHOWS = 4;

const BY_ID: Readonly<Record<string, WordEntry>> = Object.fromEntries(WORDS.map((w) => [w.id, w]));

export function getWord(id: string): WordEntry | undefined {
  return BY_ID[id];
}

export function wordsInDecks(decks: readonly DeckId[]): WordEntry[] {
  const set = new Set<DeckId>(decks);
  return WORDS.filter((w) => set.has(w.deck));
}

export function decksForDifficulty(difficulty: 1 | 2 | 3 | 4 | 5): DeckId[] {
  if (difficulty <= 1) return ['food'];
  if (difficulty === 2) return ['food', 'travel'];
  if (difficulty === 3) return ['food', 'travel', 'work'];
  return ['food', 'travel', 'work', 'feelings'];
}

/** Epicene nouns tagged `n` on purpose (both genders in French). */
export const EPICENE_IDS: readonly string[] = ['work-colleague', 'feelings-child'];
