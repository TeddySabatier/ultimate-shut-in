/**
 * Typed asset maps. Every entry is a URL string resolved by Vite
 * (`import x from './foo.svg'`), so the maps are safe to use in `<img src>`
 * and CSS `url()` alike. See docs/design/ART.md for the style guide and
 * the full inventory.
 */

// ---- habits (48x48, monochrome, tint with CSS `color`) ----
import habitMove from './habits/move.svg';
import habitOutside from './habits/outside.svg';
import habitClean from './habits/clean.svg';
import habitSocial from './habits/social.svg';
import habitStudy from './habits/study.svg';
import habitSleep from './habits/sleep.svg';
import habitEat from './habits/eat.svg';
import habitHygiene from './habits/hygiene.svg';

// ---- vassals (128x128, full colour portrait busts) ----
import vassalMove from './vassals/move.svg';
import vassalOutside from './vassals/outside.svg';
import vassalClean from './vassals/clean.svg';
import vassalSocial from './vassals/social.svg';
import vassalStudy from './vassals/study.svg';
import vassalSleep from './vassals/sleep.svg';
import vassalEat from './vassals/eat.svg';
import vassalHygiene from './vassals/hygiene.svg';
import vassalSilhouette from './vassals/silhouette.svg';

// ---- haven (360x200 header scenes, one per ring) ----
import havenRoom from './haven/room.svg';
import havenFlat from './haven/flat.svg';
import havenFloor from './haven/floor.svg';
import havenBuilding from './haven/building.svg';
import havenBlock from './haven/block.svg';
import havenDistrict from './haven/district.svg';
import havenCity from './haven/city.svg';
import havenAbsolute from './haven/absolute.svg';

// ---- monsters (64x64 wave-log sprites, boss 96x96) ----
import monsterClutterBlob from './monsters/clutter-blob.svg';
import monsterProcrastinationMoth from './monsters/procrastination-moth.svg';
import monsterDoomscrollWyrm from './monsters/doomscroll-wyrm.svg';
import monsterDustBunny from './monsters/dust-bunny.svg';
import monsterSnoozeGolem from './monsters/snooze-golem.svg';
import monsterCouchLeech from './monsters/couch-leech.svg';
import monsterFogWraith from './monsters/fog-wraith.svg';
import monsterJunkFoodImp from './monsters/junk-food-imp.svg';
import monsterSilenceSpecter from './monsters/silence-specter.svg';
import monsterTheStatic from './monsters/the-static.svg';
import monsterBossStatic from './monsters/boss-static.svg';

// ---- ui ----
import uiPanelFrame from './ui/panel-frame.svg';
import uiXpBarCap from './ui/xp-bar-cap.svg';
import uiCoin from './ui/coin.svg';
import uiDomainPoint from './ui/domain-point.svg';
import uiUtilityPower from './ui/utility-power.svg';
import uiUtilityWater from './ui/utility-water.svg';
import uiUtilityGas from './ui/utility-gas.svg';
import uiTitleBadge from './ui/title-badge.svg';
import uiComboWeapon from './ui/combo-weapon.svg';
import uiResurrectionToken from './ui/resurrection-token.svg';
import uiWaveShield from './ui/wave-shield.svg';
import uiCheck from './ui/check.svg';
import uiTimer from './ui/timer.svg';
import uiLock from './ui/lock.svg';
import uiChevron from './ui/chevron.svg';
import uiClose from './ui/close.svg';
import uiSettings from './ui/settings.svg';
import uiHome from './ui/home.svg';
import uiQuests from './ui/quests.svg';
import uiCharacter from './ui/character.svg';
import uiMic from './ui/mic.svg';
import uiMap from './ui/map.svg';
import uiCompare from './ui/compare.svg';
import uiList from './ui/list.svg';

// ---- outposts (24x24, monochrome, the City Map pin plaques and the add-outpost form) ----
import outpostGym from './outposts/gym.svg';
import outpostPark from './outposts/park.svg';
import outpostLibrary from './outposts/library.svg';
import outpostFriend from './outposts/friend.svg';
import outpostFamily from './outposts/family.svg';
import outpostCafe from './outposts/cafe.svg';
import outpostClinic from './outposts/clinic.svg';
import outpostMarket from './outposts/market.svg';
import outpostPool from './outposts/pool.svg';
import outpostClass from './outposts/class.svg';
import outpostOther from './outposts/other.svg';

// ---- logo ----
import logoTitle from './logo/logo.svg';
import logoMark from './logo/mark.svg';

export const HABIT_IDS = ['move', 'outside', 'clean', 'social', 'study', 'sleep', 'eat', 'hygiene'] as const;
export type HabitId = (typeof HABIT_IDS)[number];

export const habitIcons: Readonly<Record<HabitId, string>> = {
  move: habitMove,
  outside: habitOutside,
  clean: habitClean,
  social: habitSocial,
  study: habitStudy,
  sleep: habitSleep,
  eat: habitEat,
  hygiene: habitHygiene,
};

/** Portrait per habit vassal, plus the silhouette shown once a vassal has left. */
export const vassalPortraits: Readonly<Record<HabitId | 'silhouette', string>> = {
  move: vassalMove,
  outside: vassalOutside,
  clean: vassalClean,
  social: vassalSocial,
  study: vassalStudy,
  sleep: vassalSleep,
  eat: vassalEat,
  hygiene: vassalHygiene,
  silhouette: vassalSilhouette,
};

export const HAVEN_RINGS = ['room', 'flat', 'floor', 'building', 'block', 'district', 'city'] as const;
export type HavenRing = (typeof HAVEN_RINGS)[number];

/** Header background per ring, indexed 0 (room) .. 6 (city). */
export const havenScenes: readonly [string, string, string, string, string, string, string] = [
  havenRoom,
  havenFlat,
  havenFloor,
  havenBuilding,
  havenBlock,
  havenDistrict,
  havenCity,
];

export const havenSceneByRing: Readonly<Record<HavenRing, string>> = {
  room: havenRoom,
  flat: havenFlat,
  floor: havenFloor,
  building: havenBuilding,
  block: havenBlock,
  district: havenDistrict,
  city: havenCity,
};

/** Clamp any ring index into the 0..6 range and return its scene. */
export function havenSceneForRing(ring: number): string {
  const i = Math.min(havenScenes.length - 1, Math.max(0, Math.floor(ring)));
  return havenScenes[i] ?? havenRoom;
}

/** The home-bound protagonist, 128x128. */
export const absoluteAvatar: string = havenAbsolute;

export const MONSTER_IDS = [
  'clutter-blob',
  'procrastination-moth',
  'doomscroll-wyrm',
  'dust-bunny',
  'snooze-golem',
  'couch-leech',
  'fog-wraith',
  'junk-food-imp',
  'silence-specter',
  'the-static',
] as const;
export type MonsterId = (typeof MONSTER_IDS)[number];

export const monsterSprites: Readonly<Record<MonsterId, string>> = {
  'clutter-blob': monsterClutterBlob,
  'procrastination-moth': monsterProcrastinationMoth,
  'doomscroll-wyrm': monsterDoomscrollWyrm,
  'dust-bunny': monsterDustBunny,
  'snooze-golem': monsterSnoozeGolem,
  'couch-leech': monsterCouchLeech,
  'fog-wraith': monsterFogWraith,
  'junk-food-imp': monsterJunkFoodImp,
  'silence-specter': monsterSilenceSpecter,
  'the-static': monsterTheStatic,
};

/** 96x96 boss variant of "the Static" for the wave-boss card. */
export const bossSprite: string = monsterBossStatic;

export const uiIcons = {
  panelFrame: uiPanelFrame,
  xpBarCap: uiXpBarCap,
  coin: uiCoin,
  domainPoint: uiDomainPoint,
  utilityPower: uiUtilityPower,
  utilityWater: uiUtilityWater,
  utilityGas: uiUtilityGas,
  titleBadge: uiTitleBadge,
  comboWeapon: uiComboWeapon,
  resurrectionToken: uiResurrectionToken,
  waveShield: uiWaveShield,
  check: uiCheck,
  timer: uiTimer,
  lock: uiLock,
  chevron: uiChevron,
  close: uiClose,
  settings: uiSettings,
  home: uiHome,
  quests: uiQuests,
  character: uiCharacter,
  mic: uiMic,
  map: uiMap,
  compare: uiCompare,
  list: uiList,
} as const satisfies Readonly<Record<string, string>>;
export type UiIconId = keyof typeof uiIcons;

export const OUTPOST_TYPE_IDS = ['gym', 'park', 'library', 'friend', 'family', 'cafe', 'clinic', 'market', 'pool', 'class', 'other'] as const;
export type OutpostTypeId = (typeof OUTPOST_TYPE_IDS)[number];

/** One icon per outpost type (`outposts.json` `icon` keys), drawn with `currentColor`. */
export const outpostIcons: Readonly<Record<OutpostTypeId, string>> = {
  gym: outpostGym,
  park: outpostPark,
  library: outpostLibrary,
  friend: outpostFriend,
  family: outpostFamily,
  cafe: outpostCafe,
  clinic: outpostClinic,
  market: outpostMarket,
  pool: outpostPool,
  class: outpostClass,
  other: outpostOther,
};

export const logo = {
  /** 320x120 title mark, "HAVEN PROTOCOL" as paths. */
  title: logoTitle,
  /** 64x64 square app mark (also the favicon and PWA icon source). */
  mark: logoMark,
} as const;
