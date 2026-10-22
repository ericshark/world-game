import { dailyNumber } from './daily'
import type { DailyRecord } from './profile'

const TONE_SQUARES: Record<string, string> = {
  perfect: '🟩',
  great: '🟩',
  good: '🟨',
  close: '🟧',
  miss: '🟥',
}
const ROUND_ICONS = ['📍', '🔎', '💎', '🏙️', '📍']

/** Spoiler-free text for sharing a day's results. */
export function dailyShareText(
  dateKey: string,
  day: DailyRecord,
  streak: number,
  url: string,
): string {
  const lines = [`World Game Daily #${dailyNumber(dateKey)}`]
  if (day.five) {
    lines.push(
      `Daily Five ${day.five.score.toLocaleString('en-US')}/5,000`,
      day.five.tones
        .map((tone, i) => `${ROUND_ICONS[i] ?? ''}${TONE_SQUARES[tone] ?? '⬛'}`)
        .join(' '),
    )
  }
  if (day.mystery) {
    lines.push(
      day.mystery.solved
        ? `🕵️ Mystery country in ${day.mystery.guesses} ${day.mystery.guesses === 1 ? 'guess' : 'guesses'}`
        : '🕵️ Mystery country: gave up',
    )
  }
  if (day.route) {
    lines.push(`🧭 Route ${'★'.repeat(day.route.stars)}${'☆'.repeat(3 - day.route.stars)}`)
  }
  if (streak > 1) lines.push(`🔥 ${streak}-day streak`)
  lines.push(url)
  return lines.join('\n')
}
