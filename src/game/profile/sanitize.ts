import type { ModeId, Skill } from '../core/types'
import type { CountrySkills, DailyRecord, HistoryEntry, PersonalBest } from './profile'
import type { CountryStats } from './stats'

// Saved profiles come from browser storage, backup files and the cloud, any of which can be
// damaged or edited by hand. Each reader below keeps what is sound and drops the rest, so a bad
// entry costs one entry rather than the whole profile (or a crash on the Passport screen).

const MODES: readonly ModeId[] = [
  'pinpoint',
  'rush',
  'rare-earth',
  'mystery',
  'journey',
  'daily',
  'learn',
  'battle',
]
const SKILLS: readonly Skill[] = ['locate', 'capital', 'name', 'recall', 'visit']
const COUNTRY_ID = /^[A-Z0-9]{2,8}$/
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

/** The most entries any one table may hold; far more than a real profile ever reaches. */
export const MAX_BESTS = 500
export const MAX_ACHIEVEMENTS = 300
export const MAX_DAILY_DAYS = 800
export const HISTORY_LIMIT = 300
/** The largest backup file or cloud profile that is read at all. */
export const MAX_PROFILE_BYTES = 1_500_000

const MAX_COUNT = 1e9

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function count(value: unknown, max = MAX_COUNT): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max
    ? value
    : null
}

function text(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= max ? value : null
}

function stats(value: unknown): CountryStats | null {
  if (!isObject(value)) return null
  const attempts = count(value.attempts, 1e6)
  const hits = count(value.hits, 1e6)
  if (attempts === null || hits === null || hits > attempts) return null
  const recent = Array.isArray(value.recent)
    ? value.recent.filter((r): r is boolean => typeof r === 'boolean').slice(-4)
    : []
  const clean: CountryStats = { attempts, hits, totalKm: count(value.totalKm, 1e12) ?? 0, recent }
  const box = count(value.box, 6)
  const dueAt = count(value.dueAt, 1e14)
  if (box !== null && Number.isInteger(box) && dueAt !== null) {
    clean.box = box
    clean.dueAt = dueAt
  }
  return clean
}

export function sanitizeCountries(value: unknown): Record<string, CountrySkills> {
  const result: Record<string, CountrySkills> = {}
  if (!isObject(value)) return result
  for (const [id, skills] of Object.entries(value)) {
    if (!COUNTRY_ID.test(id) || !isObject(skills)) continue
    const clean: CountrySkills = {}
    for (const skill of SKILLS) {
      const entry = stats(skills[skill])
      if (entry) clean[skill] = entry
    }
    if (Object.keys(clean).length > 0) result[id] = clean
  }
  return result
}

export function sanitizeBests(value: unknown): Record<string, PersonalBest> {
  const result: Record<string, PersonalBest> = {}
  if (!isObject(value)) return result
  for (const [key, best] of Object.entries(value).slice(0, MAX_BESTS)) {
    if (!text(key, 80) || !isObject(best)) continue
    const score = count(best.score)
    const at = count(best.at, 1e14)
    if (score !== null && at !== null) result[key] = { score, at }
  }
  return result
}

export function sanitizeHistory(value: unknown): HistoryEntry[] {
  if (!Array.isArray(value)) return []
  const entries: HistoryEntry[] = []
  for (const item of value.slice(-HISTORY_LIMIT)) {
    if (!isObject(item)) continue
    const mode = MODES.find((m) => m === item.mode)
    const bestKey = text(item.bestKey, 80)
    const score = count(item.score)
    const endedAt = count(item.endedAt, 1e14)
    if (!mode || !bestKey || score === null || endedAt === null) continue
    const maxScore = item.maxScore === null ? null : count(item.maxScore)
    if (maxScore === null && item.maxScore !== null) continue
    const entry: HistoryEntry = { mode, bestKey, score, maxScore, endedAt }
    if (isObject(item.metrics)) {
      const metrics: Record<string, number> = {}
      for (const [name, metric] of Object.entries(item.metrics).slice(0, 30)) {
        if (name.length <= 40 && typeof metric === 'number' && Number.isFinite(metric)) {
          metrics[name] = metric
        }
      }
      entry.metrics = metrics
    }
    entries.push(entry)
  }
  return entries
}

/** Id → time, for achievements and mastered countries. */
export function sanitizeTimes(value: unknown, max = MAX_ACHIEVEMENTS): Record<string, number> {
  const result: Record<string, number> = {}
  if (!isObject(value)) return result
  for (const [id, at] of Object.entries(value).slice(0, max)) {
    const time = count(at, 1e14)
    if (text(id, 60) && time !== null) result[id] = time
  }
  return result
}

export function sanitizeDaily(value: unknown): Record<string, DailyRecord> {
  const result: Record<string, DailyRecord> = {}
  if (!isObject(value)) return result
  for (const [date, day] of Object.entries(value).slice(-MAX_DAILY_DAYS)) {
    if (!DATE_KEY.test(date) || !isObject(day)) continue
    const record: DailyRecord = {}
    const { five, mystery, route } = day
    if (isObject(five) && count(five.score) !== null && Array.isArray(five.tones)) {
      record.five = {
        score: five.score as number,
        tones: five.tones.filter((t): t is string => text(t, 12) !== null).slice(0, 5),
      }
    }
    if (
      isObject(mystery) &&
      count(mystery.score) !== null &&
      count(mystery.guesses, 1e4) !== null
    ) {
      record.mystery = {
        score: mystery.score as number,
        guesses: mystery.guesses as number,
        solved: mystery.solved === true,
      }
    }
    if (isObject(route) && count(route.score) !== null && count(route.stars, 3) !== null) {
      record.route = { score: route.score as number, stars: route.stars as number }
    }
    if (record.five || record.mystery || record.route) result[date] = record
  }
  return result
}

export function sanitizeWeeklyDone(value: unknown): Record<string, string[]> {
  const result: Record<string, string[]> = {}
  if (!isObject(value)) return result
  for (const [week, ids] of Object.entries(value).slice(-12)) {
    if (!DATE_KEY.test(week) || !Array.isArray(ids)) continue
    result[week] = ids.filter((id): id is string => text(id, 60) !== null).slice(0, 10)
  }
  return result
}

export const MAX_CONFUSIONS = 300
const CONFUSION_KEY = /^[A-Z0-9]{2,8}>[A-Z0-9]{2,8}$/

/** Mix-up counts; the most frequent are kept when there are too many. */
export function sanitizeConfusions(value: unknown): Record<string, number> {
  if (!isObject(value)) return {}
  const entries = Object.entries(value).flatMap(([key, n]): [string, number][] => {
    const times = count(n, 1e6)
    return CONFUSION_KEY.test(key) && times !== null && times >= 1 ? [[key, Math.floor(times)]] : []
  })
  return Object.fromEntries(entries.sort((a, b) => b[1] - a[1]).slice(0, MAX_CONFUSIONS))
}

const REGION_NAME = /^[A-Za-z ]{3,20}$/

/** Region → when its exam was passed. */
export function sanitizeCertificates(value: unknown): Record<string, number> {
  const result: Record<string, number> = {}
  if (!isObject(value)) return result
  for (const [region, at] of Object.entries(value).slice(0, 12)) {
    const when = count(at, 1e14)
    if (REGION_NAME.test(region) && when !== null) result[region] = when
  }
  return result
}

/** Keeps the picks that are short strings; the profile fills in defaults for the rest. */
export function sanitizeCosmeticPicks(value: unknown): Record<string, string> {
  const result: Record<string, string> = {}
  if (!isObject(value)) return result
  for (const key of ['pin', 'shape', 'trail', 'glow', 'title']) {
    const pick = text(value[key], 40)
    if (pick) result[key] = pick
  }
  return result
}

export function sanitizeXp(value: unknown): number {
  const xp = count(value)
  return xp === null ? 0 : Math.floor(xp)
}
