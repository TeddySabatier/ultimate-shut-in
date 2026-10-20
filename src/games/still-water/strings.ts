/**
 * Every word Still Water shows, in English and French. `defineStrings` makes
 * a missing French key a compile error; the contract test also checks that
 * no string is empty and that `{placeholders}` match.
 *
 * No React here: the engine imports this file to write the outcome log.
 */
import { defineStrings } from '../contract';

export const strings = defineStrings({
  en: {
    intro: 'Match the pond: hold while the ring grows, release while it shrinks. Let the ripples pass.',
    disclaimer: 'A short practice for attention, not therapy and not a medical tool.',
    phase: { inhale: 'Breathe in', hold: 'Hold', exhale: 'Breathe out' },
    cycle: 'Cycle {n} of {total}',
    water: 'Water {level}',
    waterLabel: 'Pond water',
    hold: 'Hold with the breath',
    release: 'Release',
    holding: 'Holding',
    tapPhase: 'Tap each phase',
    tapPhaseHint: 'Press once at the start of breathe in, hold, and breathe out.',
    vibrate: 'Pulse on phase change',
    pause: 'Pause',
    resume: 'Resume',
    paused: 'Paused. The pond waits.',
    forfeit: 'Step away',
    leave: 'Leave',
    keys: 'Space or Enter holds. Ignore the ripples.',
    hintLine: 'A faint line marks the ideal hold.',
    sleepPerk: 'Rest helps: {name} widens the timing.',
    eatPerk: '{name} left a gentle guide on the water.',
    movePerk: '{name} eased the rhythm so the body can follow.',
    decoy: { leaf: 'A drifting leaf', fish: 'A passing fish', light: 'A flicker of light' },
    decoyHint: 'A ripple. Let it go.',
    rhythm: 'In {in} · hold {hold} · out {out}',
    seconds: '{n}s',
    end: {
      won: 'The pond is still',
      lost: 'The pond is still here',
      fled: 'You left the bank',
    },
    log: {
      start: 'The pond is still.',
      cycle: 'Cycle {n}: the breath matched {accuracy}%.',
      revived: 'Cycle {n}: the pond held the missed breath.',
      decoyIgnored: '{name} drifted by. You let it go.',
      decoyTapped: '{name} caught the hand. The pond rippled.',
      hint: 'A gentle line marked the breath.',
      endWon: 'The pond is still. The troops come home quietly.',
      endLost: 'The pond is still here. Try again whenever you like.',
      endFled: 'You left the bank. The pond keeps its own time.',
    },
    learned: {
      topic: 'Slow exhales',
      note: 'A longer out-breath often steadies attention. This is a general practice tip, not advice.',
    },
    pondLabel: 'A still pond. {phase}. Water at {level}.',
  },
  fr: {
    intro: "Suis l'étang : reste appuyé pendant que l'anneau grandit, relâche pendant qu'il se referme. Laisse passer les rides.",
    disclaimer: "Un court exercice d'attention, pas une thérapie ni un outil médical.",
    phase: { inhale: 'Inspire', hold: 'Retiens', exhale: 'Expire' },
    cycle: 'Cycle {n} sur {total}',
    water: 'Eau {level}',
    waterLabel: "Eau de l'étang",
    hold: 'Suivre le souffle',
    release: 'Relâcher',
    holding: 'En appui',
    tapPhase: 'Toucher chaque phase',
    tapPhaseHint: 'Un appui au début de inspire, retiens et expire.',
    vibrate: 'Pulse à chaque phase',
    pause: 'Pause',
    resume: 'Reprendre',
    paused: "En pause. L'étang attend.",
    forfeit: "S'éloigner",
    leave: 'Quitter',
    keys: 'Espace ou Entrée pour suivre. Ignore les rides.',
    hintLine: "Un trait léger marque l'appui idéal.",
    sleepPerk: 'Le repos aide : {name} élargit le tempo.',
    eatPerk: "{name} a laissé un guide sur l'eau.",
    movePerk: '{name} a assoupli le rythme pour que le corps suive.',
    decoy: { leaf: 'Une feuille qui dérive', fish: 'Un poisson qui passe', light: 'Un scintillement' },
    decoyHint: 'Une ride. Laisse-la passer.',
    rhythm: 'Inspire {in} · retiens {hold} · expire {out}',
    seconds: '{n} s',
    end: {
      won: "L'étang est calme",
      lost: "L'étang est toujours là",
      fled: 'Tu as quitté la berge',
    },
    log: {
      start: "L'étang est calme.",
      cycle: 'Cycle {n} : le souffle a suivi à {accuracy} %.',
      revived: "Cycle {n} : l'étang a porté le souffle manqué.",
      decoyIgnored: "{name} est passé. Tu l'as laissé.",
      decoyTapped: "{name} a pris la main. L'étang a bougé.",
      hint: 'Un trait léger a marqué le souffle.',
      endWon: "L'étang est calme. Les troupes rentrent sans bruit.",
      endLost: "L'étang est toujours là. Reviens quand tu veux.",
      endFled: "Tu quittes la berge. L'étang garde son temps.",
    },
    learned: {
      topic: 'Expirations lentes',
      note: "Une expiration plus longue aide souvent à poser l'attention. C'est un rappel de pratique, pas un conseil.",
    },
    pondLabel: 'Un étang calme. {phase}. Eau à {level}.',
  },
});

/** The English tree's type; both languages share it. */
export type StillWaterStrings = (typeof strings)['en'];
