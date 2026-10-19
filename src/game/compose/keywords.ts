/**
 * Keyword tables for the on-device quest parser (`parse.ts`).
 *
 * One list per habit and language. Each entry is `[pattern, weight]`: the
 * pattern is a regular-expression fragment matched whole-word against the
 * sentence after it was lower-cased, stripped of accents and stripped of the
 * recurrence, time and duration phrases (so "after lunch" does not vote for
 * Eat). Weight 3 is a phrase that names the habit outright, 2 a strong word,
 * 1 a hint. Both languages are always tried; the player's language only
 * breaks ties. Patterns are written accent-free ("etudi", not "étudi").
 */
import type { HabitId } from '../types';

export type KeywordEntry = readonly [pattern: string, weight: number];
export interface HabitKeywords {
  en: readonly KeywordEntry[];
  fr: readonly KeywordEntry[];
}

export const HABIT_KEYWORDS: Record<HabitId, HabitKeywords> = {
  move: {
    en: [
      ['walk\\w*', 2], ['run', 2], ['runs', 2], ['running', 2], ['jog\\w*', 2], ['stretch\\w*', 2], ['yoga', 2], ['pilates', 2],
      ['gym', 2], ['workouts?', 2], ['work out', 2], ['exercis\\w*', 2], ['push ?ups?', 2], ['pull ?ups?', 2], ['sit ?ups?', 2],
      ['squats?', 2], ['planks?', 2], ['lunges?', 2], ['burpees?', 2], ['cycl\\w*', 2], ['bik(?:e|es|ing)', 2], ['swim\\w*', 2],
      ['danc\\w*', 2], ['lift(?:ing)?', 1], ['weights', 1], ['cardio', 2], ['hik(?:e|es|ing)', 1], ['sports?', 1], ['climb\\w*', 1],
      ['steps', 2], ['fitness', 2], ['training', 1], ['skat\\w*', 1], ['football', 1], ['soccer', 1], ['tennis', 1], ['basketball', 1],
      ['stairs', 2], ['kettlebells?', 2], ['treadmill', 2], ['laps', 1], ['move', 1], ['moving', 1], ['active', 1],
    ],
    fr: [
      ['march\\w*', 2], ['courir', 2], ['je cours', 3], ['course a pied', 3], ['footing', 2], ['jogging', 2], ['etir\\w*', 2],
      ['yoga', 2], ['pilates', 2], ['salle de sport', 3], ['muscu\\w*', 2], ['sports?', 2], ['entrainement', 1], ['fitness', 2],
      ['pompes', 2], ['abdos', 2], ['gainage', 2], ['squats?', 2], ['velo', 2], ['nage\\w*', 2], ['natation', 2], ['danse', 2],
      ['danser', 2], ['cardio', 2], ['randonn\\w*', 1], ['escalad\\w*', 1], ['bouger', 2], ['tapis de course', 2], ['escaliers?', 2],
      ['exercice physique', 3],
    ],
  },
  outside: {
    en: [
      ['outside', 3], ['outdoors?', 3], ['park', 1], ['gardens?', 1], ['gardening', 1], ['fresh air', 3], ['sunlight', 3], ['daylight', 3],
      ['sunshine', 3], ['sun', 1], ['nature', 2], ['forest', 1], ['woods', 1], ['beach', 1], ['balcony', 2], ['terrace', 2], ['patio', 2],
      ['neighbou?rhood', 2], ['around the block', 3], ['block', 1], ['sky', 1], ['grass', 1], ['picnic', 2], ['go out', 2], ['get out', 2],
      ['leave the (?:house|flat|apartment)', 3], ['step out', 2], ['out of the house', 3], ['trails?', 1], ['lake', 1], ['river', 1], ['stroll\\w*', 2],
    ],
    fr: [
      ['dehors', 3], ['exterieur', 3], ['parc', 1], ['jardin\\w*', 1], ['air frais', 3], ['au grand air', 3], ['soleil', 2],
      ['lumiere du jour', 3], ['nature', 2], ['foret', 1], ['plage', 1], ['balcon', 2], ['terrasse', 2], ['quartier', 2], ['sortir', 2],
      ['sortie', 1], ['prendre l air', 3], ['balade\\w*', 2], ['se balader', 2], ['promen\\w*', 2], ['pique nique', 2], ['ciel', 1],
      ['lac', 1], ['riviere', 1],
    ],
  },
  clean: {
    en: [
      ['clean\\w*', 3], ['tidy\\w*', 3], ['dust\\w*', 2], ['vacuum\\w*', 3], ['hoover\\w*', 3], ['sweep\\w*', 2], ['mop\\w*', 2], ['laundry', 3],
      ['dishes', 2], ['dishwasher', 2], ['declutter\\w*', 3], ['organi[sz]\\w*', 1], ['kitchen', 1], ['bedroom', 1], ['living room', 1], ['room', 1],
      ['make (?:the|my|your) bed', 3], ['trash', 2], ['garbage', 2], ['rubbish', 2], ['bins?', 1], ['fold\\w*', 1], ['iron\\w*', 2], ['wipe\\w*', 2],
      ['desk', 1], ['chores?', 3], ['housework', 3], ['house work', 3], ['scrub\\w*', 2], ['polish\\w*', 2], ['clutter\\w*', 2], ['bathroom', 1],
      ['floor', 1], ['windows', 1], ['wash (?:the |my )?(?:dishes|clothes|car|floor|windows)', 3], ['water (?:the |my )?plants', 5], ['clean (?:the |my |your )?(?:bathroom|toilet|shower|bath)', 3], ['plants', 1],
    ],
    fr: [
      ['nettoy\\w*', 3], ['range\\w*', 2], ['rangement', 3], ['ordre', 1], ['menage', 3], ['aspir\\w*', 3], ['balai', 2], ['serpilliere', 2],
      ['vaisselle', 2], ['lave vaisselle', 2], ['lessive', 3], ['poubelles?', 2], ['faire le lit', 3], ['debarras', 2], ['desencombr\\w*', 3],
      ['repass\\w*', 2], ['plier', 1], ['cuisine', 1], ['chambre', 1], ['salon', 1], ['salle de bain', 1], ['bureau', 1], ['epousset\\w*', 2],
      ['essuy\\w*', 2], ['frott\\w*', 2], ['corvees?', 3], ['bazar', 1], ['trier', 1], ['linge', 1], ['arroser (?:les |mes )?plantes', 3],
    ],
  },
  social: {
    en: [
      ['call\\w*', 2], ['phone', 2], ['texts?', 2], ['texting', 2], ['messages?', 2], ['messaging', 2], ['msg', 2], ['friends?', 2], ['family', 2],
      ['mom', 2], ['mum', 2], ['mother', 2], ['dad', 2], ['father', 2], ['brother', 2], ['sister', 2], ['grandma', 2], ['grandpa', 2],
      ['grandmother', 2], ['grandfather', 2], ['grandparents', 2], ['parents', 2], ['neighbou?rs?', 2], ['meet\\w*', 2], ['coffee with', 3],
      ['dinner with', 3], ['lunch with', 3], ['drinks? with', 3], ['chat\\w*', 2], ['talk (?:to|with)', 2], ['visit\\w*', 2], ['hang out', 3],
      ['party', 2], ['reach out', 3], ['check in on', 3], ['catch up', 3], ['colleagues?', 1], ['coworkers?', 1], ['write to', 2], ['email\\w*', 1],
      ['video call', 3], ['cousins?', 2], ['uncle', 2], ['aunt\\w*', 2], ['relatives?', 2], ['social\\w*', 2], ['invite\\w*', 2], ['say hi', 2],
    ],
    fr: [
      ['appel\\w*', 2], ['telephon\\w*', 2], ['sms', 2], ['texto', 2], ['messag\\w*', 2], ['ami', 2], ['amis', 2], ['amies?', 2], ['famille', 2],
      ['maman', 2], ['papa', 2], ['mere', 2], ['pere', 2], ['frere', 2], ['soeur', 2], ['grand mere', 2], ['grand pere', 2], ['grands parents', 2],
      ['parents', 2], ['voisin\\w*', 2], ['rencontr\\w*', 2], ['cafe avec', 3], ['diner avec', 3], ['dejeuner avec', 3], ['verre avec', 3],
      ['discut\\w*', 2], ['parler (?:a|avec)', 2], ['visites?', 2], ['sortie entre amis', 3], ['prendre des nouvelles', 3], ['ecrire a', 2],
      ['copain', 2], ['copine', 2], ['pote', 2], ['cousins?', 2], ['oncle', 2], ['tante', 2], ['inviter', 2], ['collegues?', 1], ['appeler', 2],
    ],
  },
  study: {
    en: [
      ['study', 3], ['studies', 3], ['studying', 3], ['studied', 3], ['learn\\w*', 3], ['read', 2], ['reads', 2], ['reading', 2], ['books?', 2],
      ['pages?', 1], ['chapters?', 2], ['practi[cs]\\w*', 2], ['lessons?', 2], ['courses?', 2], ['class', 1], ['classes', 1], ['homework', 3],
      ['revis\\w*', 2], ['flashcards?', 3], ['languages?', 2], ['french', 1], ['spanish', 1], ['english', 1], ['german', 1], ['italian', 1],
      ['japanese', 1], ['chinese', 1], ['portuguese', 1], ['korean', 1], ['arabic', 1], ['russian', 1], ['code', 2], ['coding', 2], ['program\\w*', 2],
      ['writing', 1], ['essays?', 2], ['exams?', 2], ['memori[sz]\\w*', 2], ['vocab\\w*', 2], ['duolingo', 3], ['maths?', 2], ['piano', 1],
      ['guitar', 1], ['violin', 1], ['skills?', 1], ['tutorials?', 2], ['podcasts?', 1], ['lectures?', 2], ['research', 1], ['thesis', 2],
      ['notes', 1], ['novel', 1], ['articles?', 1], ['journal\\w*', 2], ['diary', 2],
    ],
    fr: [
      ['etudi\\w*', 3], ['apprend\\w*', 3], ['appris', 2], ['lire', 2], ['lis', 1], ['lecture', 2], ['livres?', 2], ['pages?', 1], ['chapitres?', 2],
      ['revis\\w*', 2], ['cours', 1], ['devoirs?', 3], ['exercices?', 1], ['langues?', 2], ['francais', 1], ['anglais', 1], ['espagnol', 1],
      ['allemand', 1], ['italien', 1], ['japonais', 1], ['chinois', 1], ['coder', 2], ['code', 2], ['programm\\w*', 2], ['memori\\w*', 2],
      ['vocabulaire', 2], ['formation', 2], ['pratiquer', 2], ['examens?', 2], ['maths?', 2], ['mathematiques', 2], ['piano', 1], ['guitare', 1],
      ['apprentissage', 3], ['tutoriels?', 2], ['conferences?', 1], ['recherches?', 1], ['notes', 1], ['ecriture', 1], ['ecrire', 1],
      ['dissertation', 2], ['lecons?', 2], ['journal', 2],
    ],
  },
  sleep: {
    en: [
      ['sleep', 3], ['sleeping', 3], ['sleeps', 3], ['slept', 3], ['sleepy', 2], ['naps?', 3], ['napping', 3], ['bedtime', 3], ['go to bed', 3], ['get to bed', 3],
      ['lights out', 3], ['wind down', 3], ['unwind', 2], ['wake up', 3], ['wake', 2], ['get up', 2], ['alarm', 2], ['early night', 3], ['rest', 1],
      ['relax\\w*', 1], ['medit\\w*', 1], ['asleep', 3], ['screens? off', 3], ['no screens', 2], ['pyjamas?', 2], ['pajamas?', 2],
    ],
    fr: [
      ['dorm\\w*', 3], ['sommeil', 3], ['siestes?', 3], ['se coucher', 3], ['coucher', 2], ['au lit', 3], ['aller au lit', 3], ['extinction', 2],
      ['reveil', 2], ['se lever', 2], ['me lever', 2], ['lever tot', 3], ['detente', 1], ['relax\\w*', 1], ['medit\\w*', 1], ['pyjama', 2],
      ['ecrans? eteints?', 3], ['sans ecran', 2], ['nuit', 1],
    ],
  },
  eat: {
    en: [
      ['eat\\w*', 3], ['ate', 2], ['meals?', 3], ['breakfast', 2], ['lunch', 2], ['dinner', 2], ['supper', 2], ['cook\\w*', 3], ['recipes?', 2],
      ['water', 2], ['glass(?:es)?', 1], ['drink\\w*', 1], ['hydrate\\w*', 3], ['hydration', 3], ['fruits?', 2], ['veg(?:etables?|gies)?', 2], ['salad\\w*', 2],
      ['snacks?', 2], ['meal prep', 3], ['prep meals', 3], ['groceries', 2], ['grocery', 2], ['bake\\w*', 2], ['baking', 2], ['protein', 1],
      ['juice', 1], ['soup', 2], ['sandwich\\w*', 2], ['table', 1],
    ],
    fr: [
      ['mang\\w*', 3], ['repas', 3], ['petit dej\\w*', 3], ['dejeuner', 2], ['diner', 2], ['souper', 2], ['cuisiner', 3], ['cuisine maison', 3],
      ['je cuisine', 3], ['recettes?', 2], ['eau', 2], ['verres?', 1], ['boire', 2], ['hydrat(?:e|er|ez|ation)', 3], ['fruits?', 2], ['legumes?', 2],
      ['salade\\w*', 2], ['collation', 2], ['gouter', 2], ['faire les courses', 3], ['courses', 1], ['soupe', 2], ['sandwich\\w*', 2], ['jus', 1], ['table', 1],
    ],
  },
  hygiene: {
    en: [
      ['showers?', 3], ['showering', 3], ['bath\\w*', 2], ['brush\\w*', 2], ['teeth', 3], ['tooth\\w*', 3], ['floss\\w*', 3], ['shav\\w*', 2], ['hair', 1],
      ['haircut', 2], ['wash (?:my |your |the )?(?:face|hands?|hair|body)', 3], ['face', 1], ['skin ?care', 3], ['moistur\\w*', 2], ['sunscreen', 2],
      ['get dressed', 3], ['dress(?:ed)?', 1], ['clean clothes', 2], ['nails?', 2], ['deodorant', 2], ['self ?care', 3], ['hygiene', 3], ['wash\\w*', 1],
      ['soap', 2], ['lotion', 2],
    ],
    fr: [
      ['douche\\w*', 3], ['bains?', 2], ['brosse\\w*', 2], ['dents?', 3], ['dentifrice', 3], ['fil dentaire', 3], ['rasage', 2], ['raser', 2], ['cheveux', 1],
      ['coiffeur', 2], ['coupe de cheveux', 2], ['se laver', 3], ['laver (?:le |les |mon |ma |mes )?(?:visage|mains|cheveux|corps)', 3], ['visage', 1],
      ['soins? (?:de la )?peau', 3], ['hydratant\\w*', 2], ['creme solaire', 2], ['s habiller', 3], ['habille\\w*', 1], ['ongles?', 2], ['deodorant', 2],
      ['hygiene', 3], ['savon', 2], ['prendre soin de moi', 3], ['soin\\w*', 1], ['toilette', 2],
    ],
  },
};
