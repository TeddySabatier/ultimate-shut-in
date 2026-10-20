/**
 * Every word the game shows, in English and French. `defineStrings` makes a
 * missing French key a compile error. No React here: the engine imports this
 * file to write the outcome log.
 */
import { defineStrings } from '../contract';

export const strings = defineStrings({
  en: {
    intro:
      'Each room is an ordinary snag. Choose a door. There is no perfect answer; this is practice, not a test of character.',
    disclaimer: 'A game, not therapy. If a day feels too heavy, talk to someone you trust or a professional.',
    room: 'Room {n} of {total}',
    situation: 'The room',
    reframe: 'A question to sit with',
    doors: 'Choose a door',
    door: 'Door {n}',
    cue: 'A clearer read: {cue}',
    tag: 'This door leans {style}.',
    peek: 'Sleep on door {n}',
    peeked: 'A preview of that door',
    hint: 'Reveal a tag ({n} left)',
    undo: 'Choose again',
    continue: 'Next room',
    keys: 'Keys 1 to {n} choose a door.',
    sleepLeft: 'You can sleep on one door this run.',
    sleepUsed: 'You already slept on a door.',
    hints: 'Hints left: {n}',
    revives: 'Second looks left: {n}',
    forfeit: 'Step away',
    leave: 'Leave',
    reflection: 'A way to see it',
    end: {
      won: 'The troops come home with a lighter bag',
      lost: 'The troops come home',
      fled: 'The troops come home early',
    },
    styles: {
      reactive: 'reactive',
      avoidant: 'avoidant',
      constructive: 'constructive',
      boundary: 'boundary',
      curious: 'curious',
    },
    tips: {
      reactive:
        'When heat shows up first, name it, then pick one small next step. The first flash is information, not a verdict.',
      avoidant:
        'A pause can be rest. Try pairing it with a time you will come back, so the drawer does not become a fourth day.',
      constructive:
        'Tiny next steps add up. One timer, one sentence, one repaired plate is already a door.',
      boundary:
        'A kind sentence that names a limit is a gift to both of you. You can say yes to some sharing and no to the rest.',
      curious:
        'A plain question often beats the novel in your head. Check the story before you move in.',
    },
    log: {
      room: 'Room {n}: a {style} choice ({kind}).',
      kindGood: 'constructive or a boundary',
      kindOther: 'another tool',
      endWon: 'You practised a constructive or boundaried door in {n} of {total} rooms. The troops come home with a lighter bag.',
      endLost: 'You practised a constructive or boundaried door in {n} of {total} rooms. The troops still come home; another run is waiting.',
      endFled: 'You stepped away after {n} of {total} rooms. The troops come home early.',
    },
  },
  fr: {
    intro:
      "Chaque pièce est un accroc ordinaire. Choisis une porte. Il n'y a pas de réponse parfaite ; c'est un entraînement, pas un examen de caractère.",
    disclaimer:
      "Un jeu, pas une thérapie. Si une journée pèse trop, parle à quelqu'un de confiance ou à un professionnel.",
    room: 'Salle {n} sur {total}',
    situation: 'La pièce',
    reframe: 'Une question à garder',
    doors: 'Choisis une porte',
    door: 'Porte {n}',
    cue: 'Lecture plus claire : {cue}',
    tag: 'Cette porte penche {style}.',
    peek: 'Dors sur la porte {n}',
    peeked: 'Un aperçu de cette porte',
    hint: 'Révéler une étiquette ({n} restantes)',
    undo: 'Choisir à nouveau',
    continue: 'Salle suivante',
    keys: 'Les touches 1 à {n} choisissent une porte.',
    sleepLeft: 'Tu peux dormir sur une porte pendant cette partie.',
    sleepUsed: 'Tu as déjà dormi sur une porte.',
    hints: 'Indices restants : {n}',
    revives: 'Second regard restant : {n}',
    forfeit: "S'éloigner",
    leave: 'Quitter',
    reflection: 'Une façon de voir',
    end: {
      won: 'Les troupes rentrent avec un sac plus léger',
      lost: 'Les troupes rentrent',
      fled: 'Les troupes rentrent plus tôt',
    },
    styles: {
      reactive: 'réactif',
      avoidant: 'évitant',
      constructive: 'constructif',
      boundary: 'de limite',
      curious: 'curieux',
    },
    tips: {
      reactive:
        "Quand la chaleur arrive d'abord, nomme-la, puis choisis un tout petit pas. Le premier flash informe, il ne juge pas.",
      avoidant:
        "Une pause peut être un repos. Essaie de lui donner une heure de retour, pour que le tiroir ne devienne pas un quatrième jour.",
      constructive: "Les tout petits pas s'additionnent. Un minuteur, une phrase, une assiette réparée, c'est déjà une porte.",
      boundary:
        "Une phrase gentille qui nomme une limite est un cadeau pour vous deux. Tu peux dire oui à un partage et non au reste.",
      curious: "Une question plate bat souvent le roman dans ta tête. Vérifie l'histoire avant d'emménager dedans.",
    },
    log: {
      room: 'Salle {n} : un choix {style} ({kind}).',
      kindGood: 'constructif ou une limite',
      kindOther: 'un autre outil',
      endWon:
        'Tu as pratiqué une porte constructive ou de limite dans {n} salles sur {total}. Les troupes rentrent avec un sac plus léger.',
      endLost:
        'Tu as pratiqué une porte constructive ou de limite dans {n} salles sur {total}. Les troupes rentrent quand même ; une autre partie attend.',
      endFled: "Tu t'es éloigné après {n} salles sur {total}. Les troupes rentrent plus tôt.",
    },
  },
});

export type DungeonStrings = (typeof strings)['en'];
