import type { FactionDef, FactionId } from '../types.ts';

export const FACTIONS: Record<FactionId, FactionDef> = {
  castle: {
    id: 'castle',
    name: 'Старые авторитеты',
    tagline: 'Раньше было понятие. Сейчас — беспредел. Мы за понятие.',
    district: 'Центр, Литейный',
    color: '#c9a227',
    icon: '🎩',
    bonus: '+1 к морали всей бригады',
    bonusKey: 'castle_morale',
  },
  stronghold: {
    id: 'stronghold',
    name: 'Качалка',
    tagline: 'Мозги — это тоже мышца. Просто мы её не качаем.',
    district: 'Гаражи, дворовые спортплощадки',
    color: '#c0392b',
    icon: '💪',
    bonus: '+10% урона в первые 3 раунда',
    bonusKey: 'stronghold_rush',
  },
  inferno: {
    id: 'inferno',
    name: 'Гопники',
    tagline: 'Э, слышь. Есть чё? А если найду?',
    district: 'Купчино, промзона, дальние спальники',
    color: '#7a4b8f',
    icon: '🧢',
    bonus: '−1 к морали противника в первом раунде',
    bonusKey: 'inferno_intimidate',
  },
  tower: {
    id: 'tower',
    name: 'Айтишники',
    tagline: 'У нас всё под NDA. И под VPN.',
    district: 'Петроградка, БЦ, коворкинги',
    color: '#2980b9',
    icon: '💻',
    bonus: 'Стрелки не получают штраф в ближнем бою',
    bonusKey: 'tower_melee',
  },
};

export const FACTION_IDS = Object.keys(FACTIONS) as FactionId[];
