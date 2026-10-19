/**
 * Every word the game shows, in English and French. `defineStrings` makes a
 * missing French key a compile error; the contract test also checks that no
 * string is empty and that `{placeholders}` match.
 *
 * No React here: the engine imports this file to write the outcome log.
 */
import { defineStrings } from '../contract';

export const strings = defineStrings({
  en: {
    intro: 'Three flips against the Rival. Send one ally per round: the stronger they are, the more the coin leans your way.',
    round: 'Round {n} of {total}',
    score: 'You {wins}, Rival {losses}',
    rivalTitle: 'Rival line-up',
    rivalRound: 'Round {n}',
    rivalPower: 'Power {power}',
    allies: 'Send an ally',
    send: 'Send {name}',
    odds: 'Power {power}, {chance}% to win',
    tired: 'Tired: -{fatigue} power',
    keys: 'Keys 1 to {n} send an ally.',
    revives: 'Revives left: {n}',
    edge: 'Lottery edge: +{edge}%',
    forfeit: 'Forfeit',
    leave: 'Leave',
    coin: { heads: 'Heads', tails: 'Tails', idle: 'The coin waits.' },
    flip: {
      won: '{name} wins the flip: {roll} is under {chance}.',
      lost: '{name} loses the flip: {roll} is not under {chance}.',
    },
    end: {
      won: 'Duel won',
      lost: 'Duel lost',
      fled: 'Duel forfeited',
    },
    log: {
      round: 'Round {n}: {name} (power {power}) against the Rival ({rival}), {chance}% chance: {result}.',
      won: 'won',
      lost: 'lost',
      revived: 'Round {n}: a revive gave {name} a second flip.',
      endWon: 'You won the duel {wins} to {losses}.',
      endLost: 'The Rival took the duel {losses} to {wins}. The coin will turn again.',
      endFled: 'You stepped away from the duel at {wins} to {losses}.',
    },
    learned: {
      topic: 'Odds',
      note: 'A 60% chance still misses four times in ten. Good choices raise the odds; they never promise the flip.',
    },
  },
  fr: {
    intro: "Trois lancers contre le Rival. Envoyez un allié par manche : plus il est fort, plus la pièce penche de votre côté.",
    round: 'Manche {n} sur {total}',
    score: 'Vous {wins}, Rival {losses}',
    rivalTitle: 'Les adversaires',
    rivalRound: 'Manche {n}',
    rivalPower: 'Puissance {power}',
    allies: 'Envoyer un allié',
    send: 'Envoyer {name}',
    odds: 'Puissance {power}, {chance} % de chances',
    tired: 'Fatigué : -{fatigue} de puissance',
    keys: 'Les touches 1 à {n} envoient un allié.',
    revives: 'Relances restantes : {n}',
    edge: 'Bonus de loterie : +{edge} %',
    forfeit: 'Abandonner',
    leave: 'Quitter',
    coin: { heads: 'Face', tails: 'Pile', idle: 'La pièce attend.' },
    flip: {
      won: '{name} gagne le lancer : {roll} est sous {chance}.',
      lost: "{name} perd le lancer : {roll} n'est pas sous {chance}.",
    },
    end: {
      won: 'Duel gagné',
      lost: 'Duel perdu',
      fled: 'Duel abandonné',
    },
    log: {
      round: 'Manche {n} : {name} (puissance {power}) contre le Rival ({rival}), {chance} % de chances : {result}.',
      won: 'gagnée',
      lost: 'perdue',
      revived: 'Manche {n} : une relance a offert un second lancer à {name}.',
      endWon: 'Vous gagnez le duel {wins} à {losses}.',
      endLost: 'Le Rival remporte le duel {losses} à {wins}. La pièce tournera encore.',
      endFled: 'Vous quittez le duel à {wins} contre {losses}.',
    },
    learned: {
      topic: 'Probabilités',
      note: 'Une chance de 60 % rate encore quatre fois sur dix. Les bons choix améliorent les chances, ils ne promettent jamais le lancer.',
    },
  },
});

/** The English tree's type; both languages share it. */
export type CoinDuelStrings = (typeof strings)['en'];
