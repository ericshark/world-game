import { LOCAL_PLAYER } from '../../game/core/types'
import type {
  BattleConfig,
  BattleContent,
  BattleFormat,
  BattlePlayer,
} from '../../game/modes/battle'
import type { BotSkill } from '../../game/modes/bots'
import { loadSetup } from '../../game/profile/settings'

/** What the player picks; the roster is built from it when a game starts. */
export interface BattleSetupConfig {
  format: BattleFormat
  content: BattleContent
  /** Party and survival: how many bots. */
  opponents: number
  teamSize: 2 | 3
  skill: BotSkill
}

export const DEFAULT_BATTLE_SETUP: BattleSetupConfig = {
  format: 'duel',
  content: 'pinpoint',
  opponents: 3,
  teamSize: 2,
  skill: 'traveller',
}

const FORMATS: BattleFormat[] = ['duel', 'party', 'survival', 'teams']
const SKILLS: BotSkill[] = ['novice', 'traveller', 'explorer', 'cartographer']

export function loadBattleSetup(): BattleSetupConfig {
  return loadSetup<BattleSetupConfig>('battle', sanitizeBattleSetup)
}

export function sanitizeBattleSetup(saved: Partial<BattleSetupConfig>): BattleSetupConfig {
  const d = DEFAULT_BATTLE_SETUP
  const opponents = Number(saved.opponents)
  return {
    format: FORMATS.includes(saved.format as BattleFormat)
      ? (saved.format as BattleFormat)
      : d.format,
    content: saved.content === 'mixed' ? 'mixed' : 'pinpoint',
    opponents:
      Number.isInteger(opponents) && opponents >= 1 && opponents <= 7 ? opponents : d.opponents,
    teamSize: saved.teamSize === 3 ? 3 : 2,
    skill: SKILLS.includes(saved.skill as BotSkill) ? (saved.skill as BotSkill) : d.skill,
  }
}

const BOTS: { name: string; color: string }[] = [
  { name: 'Magellan', color: '#5ad1ff' },
  { name: 'Ibn Battuta', color: '#6be38a' },
  { name: 'Amelia', color: '#b98aff' },
  { name: 'Zheng He', color: '#ff9a4a' },
  { name: 'Nellie', color: '#ff7ad9' },
  { name: 'Humboldt', color: '#4fd1c5' },
  { name: 'Freya', color: '#e8edf5' },
  { name: 'Amundsen', color: '#a3e635' },
]

/** You plus computer opponents, named after famous travellers. */
export function localRoster(
  setup: BattleSetupConfig,
  me: { name: string; color: string },
): BattleConfig {
  const bots = BOTS.filter((bot) => bot.color !== me.color)
  const bot = (index: number, team?: 'A' | 'B'): BattlePlayer => ({
    id: `bot-${index}`,
    name: bots[index].name,
    color: bots[index].color,
    bot: setup.skill,
    team,
  })
  const you: BattlePlayer = { id: LOCAL_PLAYER, name: me.name || 'You', color: me.color }
  const roster: BattlePlayer[] =
    setup.format === 'duel'
      ? [you, bot(0)]
      : setup.format === 'teams'
        ? [
            { ...you, team: 'A' },
            ...Array.from({ length: setup.teamSize - 1 }, (_, i) => bot(i, 'A')),
            ...Array.from({ length: setup.teamSize }, (_, i) => bot(setup.teamSize - 1 + i, 'B')),
          ]
        : [you, ...Array.from({ length: setup.opponents }, (_, i) => bot(i))]
  return { format: setup.format, content: setup.content, roster }
}

export const FORMAT_LABELS: Record<BattleFormat, string> = {
  duel: 'Duel',
  party: 'Party',
  survival: 'Survival',
  teams: 'Teams',
}
