/**
 * Every word Haven Rush shows, in English and French. `defineStrings` makes a missing French key a
 * compile error; the contract test also checks that no string is empty and that `{placeholders}` match.
 *
 * No React here: the engine imports this file to write the outcome log.
 */
import { defineStrings } from '../contract';

export const strings = defineStrings({
  en: {
    intro: 'Your squad runs and shoots on its own. Pick the better gate for each pair, shoot down crowds and walls, then bring the boss down before it reaches you.',
    squad: 'Squad {n}',
    boss: 'Boss {hp} of {max}',
    bossName: 'Boss',
    nextGates: 'Next gates: {left} or {right}',
    noMoreGates: 'No more gates. The boss is ahead.',
    bossFight: 'The boss is on you. Keep shooting!',
    left: 'Left',
    right: 'Right',
    pause: 'Pause',
    resume: 'Resume',
    slowLane: 'Slow lane',
    forfeit: 'Give up',
    leave: 'Leave',
    keys: 'Left and right arrows, or A and D, pick a side. P pauses.',
    touch: 'On a touch screen, tap or drag on the lane to pick a side.',
    shield: 'Shield {n}',
    revive: 'Revive x{n}',
    rapid: 'Rapid fire',
    hint: 'Hint: the {side} gate',
    studyTitle: 'Coming gates',
    studyPair: '{left} gives {leftN}, {right} gives {rightN}',
    canvasLabel: 'Lane. Squad of {n}. Next gates {left} and {right}. Boss {hp}.',
    canvasLabelBoss: 'Lane. Squad of {n}. The boss has {hp} left.',
    feed: {
      paused: 'Paused.',
    },
    end: {
      won: 'The boss fell. The troops come home with a story.',
      lost: 'The troops come home. The lane will be there next time.',
      fled: 'The troops step back and come home.',
    },
    log: {
      gate: 'Gate {op}: squad {before} to {after}.',
      hitCrowd: 'A crowd reached the squad: {n} lost.',
      hitWall: 'A wall stood in the way: {n} lost.',
      pickMembers: 'An orb brought {n} more members.',
      pickRapid: 'A rapid-fire orb: the squad shoots twice as fast for a while.',
      revive: 'A revive brought five members back.',
      endWon: 'The boss fell. {n} members still running.',
      endLostSquad: 'The squad ran out. The troops still come home.',
      endLostBoss: 'The boss reached the squad. The troops still come home.',
      endFled: 'You left the lane with {n} members still running.',
    },
  },
  fr: {
    intro: "Ton escouade court et tire toute seule. Choisis la meilleure porte de chaque paire, abats les groupes et les murs, puis fais tomber le boss avant qu'il ne t'atteigne.",
    squad: 'Escouade {n}',
    boss: 'Boss {hp} sur {max}',
    bossName: 'Boss',
    nextGates: 'Prochaines portes : {left} ou {right}',
    noMoreGates: "Plus de portes. Le boss t'attend.",
    bossFight: 'Le boss est sur vous. Continue de tirer !',
    left: 'Gauche',
    right: 'Droite',
    pause: 'Pause',
    resume: 'Reprendre',
    slowLane: 'Voie lente',
    forfeit: 'Abandonner',
    leave: 'Quitter',
    keys: 'Les flèches gauche et droite, ou A et D, choisissent un côté. P met en pause.',
    touch: 'Sur un écran tactile, touche ou fais glisser le doigt sur la voie pour choisir un côté.',
    shield: 'Bouclier {n}',
    revive: 'Relance x{n}',
    rapid: 'Tir rapide',
    hint: 'Indice : la porte de {side}',
    studyTitle: 'Portes à venir',
    studyPair: '{left} donne {leftN}, {right} donne {rightN}',
    canvasLabel: "Voie. Escouade de {n}. Prochaines portes {left} et {right}. Boss {hp}.",
    canvasLabelBoss: 'Voie. Escouade de {n}. Il reste {hp} au boss.',
    feed: {
      paused: 'En pause.',
    },
    end: {
      won: 'Le boss est tombé. Les troupes rentrent avec une belle histoire.',
      lost: 'Les troupes rentrent. La voie sera là la prochaine fois.',
      fled: 'Les troupes reculent et rentrent.',
    },
    log: {
      gate: 'Porte {op} : escouade de {before} à {after}.',
      hitCrowd: "Un groupe a atteint l'escouade : {n} perdus.",
      hitWall: 'Un mur barrait la route : {n} perdus.',
      pickMembers: 'Une orbe apporte {n} membres de plus.',
      pickRapid: "Une orbe de tir rapide : l'escouade tire deux fois plus vite un moment.",
      revive: 'Une relance a ramené cinq membres.',
      endWon: 'Le boss est tombé. {n} membres encore en course.',
      endLostSquad: "L'escouade n'a plus personne. Les troupes rentrent quand même.",
      endLostBoss: "Le boss a rattrapé l'escouade. Les troupes rentrent quand même.",
      endFled: 'Tu quittes la voie avec {n} membres encore en course.',
    },
  },
});

/** The English tree's type; both languages share it. */
export type HavenRushStrings = (typeof strings)['en'];
