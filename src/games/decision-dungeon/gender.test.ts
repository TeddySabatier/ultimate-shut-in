/**
 * The French never gives the player a gender. This guard looks for the shapes
 * that agree with "tu": a participle or an adjective after "tu es / étais /
 * te sens...", after an infinitive such as "être", "rester" or "se sentir", after
 * "ça t'a", "tu rentres le dernier", and the adjectives of feeling anywhere in a
 * sentence that speaks to the player. It catches the feminine and plural forms
 * too. Third persons ("les autres se sentent lâchés") are covered by a short
 * allow-list of exact phrases, which never hides "tu es le seul".
 */
import { describe, expect, it } from 'vitest';
import { SCENARIOS } from './content';
import { strings } from './strings';
import { TEXTS } from './texts';

const NO_L = '(?<!\\p{L})';
const END = '(?!\\p{L})';
/** Participles and adjectives that carry the gender of the person they describe. Masculine stems; -e, -s and -es are added. */
const STEMS =
  'déçu|froissé|vexé|énervé|agacé|irrité|fatigué|gêné|stressé|content|désolé|reconnaissant|tiraillé|coincé|bloqué|poli|courtois|inclus|rassuré|soulagé|' +
  'inquiet|attentif|ravi|ému|offensé|blessé|choqué|surpris|rejeté|jugé|oublié|invité|attendu|excusé|actif|prêt|seul|sûr|occupé|venu|resté|arrivé|parti|' +
  'sorti|tombé|allé|né|mis|pris|dernier|client|hôte|ennuyé|embarrassé|fâché|tendu|perdu|aimé|accueilli|écouté|compris|entendu';
/** Adjectives with their own feminine form. */
const IRREGULAR =
  'heureu[xs]e?|heureuses|fier|fière|fiers|fières|curieu[xs]e?|curieuses|sérieu[xs]e?|sérieuses|nerveu[xs]e?|nerveuses|franc|franche|francs|franches|' +
  'inquiète|inquiètes|attentive|attentives|active|actives|hôtesse|cliente|clientes|dernière|dernières|ennuyeu[xs]e?';
/** A participle the list does not know: any -é, -ée, -és, -ées after the trigger. */
const GENERIC = '\\p{L}{3,}(?:é|ée|és|ées)';
const ANY = `(?:(?:${STEMS})(?:e|s|es)?|${IRREGULAR}|${GENERIC})`;
/** What may sit between the verb and the word: adverbs and determiners. */
const FILL =
  "(?:\\s+(?:vraiment|très|si|trop|plus|moins|assez|tout|toute|bien|presque|déjà|encore|enfin|souvent|toujours|parfois|aussi|pas|jamais|plutôt|tellement|complètement|totalement|un|une|le|la|les|bon|bonne|excellent|excellente|vrai|vraie|parfait|parfaite|mauvais|mauvaise)|\\s+l')*";
const TU_BE = "(?:tu|t')\\s*(?:es|étais|seras|serais|restes|resteras|deviens|parais|sembles|te sens|te sentais|te sentiras|te sentirais|te retrouves|te montres|as été|avais été)";
const INFINITIVE = '(?:être|rester|devenir|paraître|sembler|se sentir|te sentir|se retrouver|te retrouver|se montrer|te montrer)';
const FEELING =
  'déçu|froissé|vexé|énervé|agacé|irrité|fatigué|gêné|stressé|content|désolé|reconnaissant|tiraillé|coincé|poli|courtois|inclus|rassuré|soulagé|' +
  'inquiet|attentif|ravi|ému|offensé|blessé|choqué|surpris|rejeté|jugé|excusé|heureu[xs]e?|fier|fière|curieu[xs]e?|nerveu[xs]e?|sérieu[xs]e?|ennuyé|embarrassé|fâché|tendu';

const RULES: RegExp[] = [
  new RegExp(`${NO_L}${TU_BE}${FILL}\\s+${ANY}${END}`, 'iu'),
  new RegExp(`${NO_L}${INFINITIVE}${FILL}\\s+${ANY}${END}`, 'iu'),
  new RegExp(`${NO_L}(?:t'a|t'as|te|t')\\s+(?:\\p{L}+\\s+)?(?:touché|${FEELING})(?:e|s|es)?${END}`, 'iu'),
  /(?<!\p{L})tu t'es (?:senti|sentie|sentis|sentes|retrouvé|retrouvée|montré|montrée)(?!\p{L})/iu,
  new RegExp(`${NO_L}tu\\s+(?:rentres|arrives|restes|sors|pars|termines|finis|passes)\\s+(?:le|la)\\s+(?:dernier|dernière|premier|première)${END}`, 'iu'),
];
/** A sentence that speaks to the player and uses a feeling adjective is gendered whatever the verb. */
const SPEAKS_TO_PLAYER = new RegExp(`${NO_L}(?:tu|t'|te|toi|ton|ta|tes)${END}`, 'iu');
const FEELING_ANYWHERE = new RegExp(`${NO_L}(?:${FEELING})(?:e|s|es)?${END}`, 'iu');

/** Exact phrases about other people or things. Never an idiom that contains "tu es" or the player. */
const ALLOWED = ['se sentir lâchés', 'se sentir chassés', 'se sentir pris à partie'];

export function genderedForm(text: string): string | null {
  let t = text.split(String.fromCharCode(0xa0)).join(' ');
  for (const ok of ALLOWED) t = t.split(ok).join(' ');
  for (const rule of RULES) {
    const m = rule.exec(t);
    if (m) return m[0];
  }
  for (const sentence of t.split(/[.!?;:«»]/)) {
    if (SPEAKS_TO_PLAYER.test(sentence)) {
      const m = FEELING_ANYWHERE.exec(sentence);
      if (m) return m[0];
    }
  }
  return null;
}

const MUST_FLAG = [
  'Tu es venu trop tard',
  'tu rentres le dernier',
  'tu rentres la dernière',
  'Tu as été poli',
  'Tu as été polie',
  'Tu peux être franc',
  'Tu peux être franche',
  'rester un excellent hôte',
  'rester une excellente hôtesse',
  'Tu es resté calme et patient',
  'Tu es restée là',
  'être déçu',
  'être déçue',
  'et être déçu est légitime',
  'Tu es contente',
  'Tu es prête',
  'Tu es seule',
  'Tu es seul',
  'Tu es le seul à faire la vaisselle',
  'Tu es la seule à le savoir',
  'tu es presque prêt',
  'tu es heureux',
  'tu es heureuse',
  'tu es fier',
  'tu es fière de toi',
  'Tu es sérieux',
  'tu es inquiet',
  'tu es inquiète',
  'tu es attentif',
  'tu es nerveux',
  'tu es vraiment ravi',
  'tu te sens rejeté',
  'tu te sens rejetée',
  'être oublié',
  "se sentir mis à l'écart",
  'te sentir jugé',
  "Ça t'a touché",
  "Ça t'a vexée",
  "tu t'es senti seul",
  'Tu es agacé',
  'Tu étais fatigué',
  'tu es gêné',
  'tu es excusé',
  'Tu es occupé en ce moment',
  'Tu es arrivé en retard',
  'tu es parti trop tôt',
  'Tu restes curieuse',
  'devenir curieux',
  'se retrouver seul',
  'Tu es désolée',
  'une blague qui te laisse froissé',
  'Tu peux vouloir être inclus',
  'Tu as été invité',
  'ce que tu ressens quand tu es tiraillé',
];

const MUST_PASS = [
  'Si tu es ici',
  'Tu es aussi en retard',
  'tu étais si près',
  'tu es parmi eux',
  'Si tu es là',
  'Tu es en retard',
  'Tu es sur place',
  'Tu es à ton aise',
  'Tu es toi-même',
  'Bien sûr, tu peux le faire',
  'le mois dernier, tu as essayé',
  'lundi dernier',
  'un prêt à taux zéro',
  'tirer parti de la situation',
  'prendre parti',
  'Tu as pris soin de toi',
  'Garde ta politesse',
  'Le serveur arrive avec un balai',
  'ton brouillon est presque prêt',
  'le premier agent venu',
  'Les invités arrivent dans quarante minutes',
  "Le train est arrivé",
  'Un temps perdu',
  'Un regard curieux',
  "L'hôte de la soirée",
  "Rien n'est perdu entre vous",
  'Ton ami est venu',
  'le déjeuner est perdu',
  'Tu as su aider sans te surcharger',
  'Tu peux dire les choses franchement, sans colère',
  'On a vite fait de se montrer sévère envers soi-même',
  'Tu as pris du recul après 2 salles',
  'Si tu réponds quand même à un message aujourd’hui',
  'Un seul message',
  'Les autres peuvent se sentir lâchés',
  'ils sont occupés dans la pièce à côté',
  'Une voisine pleine d’espoir',
  'Les deux proches risquent de se sentir lâchés',
  'Les gens peuvent ranger pendant que tu t’installes',
  'Tu peux garder ta curiosité',
  'garde l’esprit ouvert',
  'tu avais promis',
  'tu te sens bien',
  'tu restes calme',
  'tu es libre',
];

describe('Decision Dungeon French: no gender addressed to the player', () => {
  it('flags at least 30 forms that agree with the player, feminine and plural ones included', () => {
    expect(MUST_FLAG.length).toBeGreaterThanOrEqual(30);
    for (const bad of MUST_FLAG) expect(genderedForm(bad), bad).not.toBeNull();
  });

  it('lets at least 30 neutral phrases through, including the idioms that fooled the first guard', () => {
    expect(MUST_PASS.length).toBeGreaterThanOrEqual(30);
    for (const ok of MUST_PASS) expect(genderedForm(ok), ok).toBeNull();
  });

  it('does not hide "tu es le seul" behind the allow-list', () => {
    expect(genderedForm('Tu es le seul à faire la vaisselle')).not.toBeNull();
    expect(ALLOWED.some((a) => /\bseul\b|\bprêt\b|tu es/i.test(a))).toBe(false);
  });

  it('catches a word that follows an accented letter (the old word-boundary bug)', () => {
    expect(genderedForm('tu es agacé ce soir')).not.toBeNull();
    expect(genderedForm('tu es agacé')).not.toBeNull();
  });

  it('finds none in any scene: situation, reframe, door, cue and reflection', () => {
    for (const s of SCENARIOS) {
      const t = TEXTS.fr[s.id]!;
      for (const text of [t.situation, t.reframe, ...t.options.flatMap((o) => [o.label, o.cue, o.reflection])]) expect(genderedForm(text), `fr ${s.id}: "${text}"`).toBeNull();
    }
  });

  it('finds none in the French strings (UI, tips, log, learned note)', () => {
    const leaves: string[] = [];
    const walk = (v: unknown): void => {
      if (typeof v === 'string') leaves.push(v);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(strings.fr);
    expect(leaves.length).toBeGreaterThan(50);
    for (const text of leaves) expect(genderedForm(text), text).toBeNull();
  });
});
