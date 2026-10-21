/**
 * Every word Haven Rush shows, in English and French. `defineStrings` makes a
 * missing French key a compile error; the contract test also checks that no
 * string is empty and that `{placeholders}` match.
 *
 * No React here: the engine imports this file to write the outcome log.
 */
import { defineStrings } from '../contract';

export const strings = defineStrings({
  en: {
    intro: 'The squad runs on its own. Steer left or right to pick the better gate, shoot crowds and walls, then bring the boss down before it reaches you.',
    squad: 'Squad {n}',
    boss: 'Boss {hp} / {max}',
    nextGate: 'Next: {left} or {right}',
    pause: 'Pause',
    resume: 'Resume',
    leave: 'Leave',
    forfeit: 'Forfeit',
    slowLane: 'Slow lane',
    left: 'Left',
    right: 'Right',
    keys: 'Arrows or A and D steer. Space pauses.',
    shield: 'Shield {n}',
    reviveReady: 'Revive ready',
    fireRate: 'Rapid fire',
    studyTitle: 'Coming gates',
    studyPair: '{left} → {leftN} · {right} → {rightN}',
    hint: 'Hint: {side}',
    flash: '{delta}',
    canvasLabel: 'Squad of {n}. Next gates {left} and {right}. Boss {hp}.',
    end: {
      won: 'The troops come home ahead',
      lost: 'The troops come home',
      fled: 'The troops step back',
    },
    log: {
      gate: 'Gate {op}: squad {before} → {after}.',
      hit: 'Contact with {kind} ({n}).',
      crowd: 'a crowd',
      wall: 'a wall',
      pickMembers: 'Pickup: +{n} members.',
      pickFire: 'Pickup: rapid fire.',
      revive: 'A revive brought five members back.',
      endWon: 'The boss fell. {n} members still with you.',
      endLost: 'The squad reached zero. They still come home.',
      endLostBoss: 'The boss reached the squad. The troops still come home.',
      endFled: 'You left the lane with {n} members still running.',
    },
  },
  fr: {
    intro: "L'escouade avance toute seule. Vire à gauche ou à droite pour choisir la meilleure porte, tire sur les groupes et les murs, puis abats le boss avant qu'il ne vous rattrape.",
    squad: 'Escouade {n}',
    boss: 'Boss {hp} / {max}',
    nextGate: 'Suivant : {left} ou {right}',
    pause: 'Pause',
    resume: 'Reprendre',
    leave: 'Quitter',
    forfeit: 'Abandonner',
    slowLane: 'Voie lente',
    left: 'Gauche',
    right: 'Droite',
    keys: 'Les flèches ou A et D dirigent. Espace met en pause.',
    shield: 'Bouclier {n}',
    reviveReady: 'Relance prête',
    fireRate: 'Tir rapide',
    studyTitle: 'Portes à venir',
    studyPair: '{left} → {leftN} · {right} → {rightN}',
    hint: 'Indice : {side}',
    flash: '{delta}',
    canvasLabel: 'Escouade de {n}. Prochaines portes {left} et {right}. Boss {hp}.',
    end: {
      won: 'Les troupes rentrent en avance',
      lost: 'Les troupes rentrent',
      fled: 'Les troupes reculent',
    },
    log: {
      gate: 'Porte {op} : escouade {before} → {after}.',
      hit: 'Contact avec {kind} ({n}).',
      crowd: 'un groupe',
      wall: 'un mur',
      pickMembers: 'Bonus : +{n} membres.',
      pickFire: 'Bonus : tir rapide.',
      revive: 'Une relance a ramené cinq membres.',
      endWon: 'Le boss est tombé. {n} membres sont encore avec toi.',
      endLost: "L'escouade est tombée à zéro. Elles rentrent quand même.",
      endLostBoss: "Le boss a rattrapé l'escouade. Les troupes rentrent quand même.",
      endFled: 'Tu quittes la voie avec {n} membres encore en course.',
    },
  },
});

/** The English tree's type; both languages share it. */
export type HavenRushStrings = (typeof strings)['en'];
