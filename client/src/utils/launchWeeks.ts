/*
 * The Submit page's launch calendar: generated from today's date rather than
 * hardcoded, so the schedule always starts "about two months out" without
 * ever offering a week that has already passed. Shared by
 * components/submit/SubmitLaunchSection.tsx (renders it) and pages/SubmitPage
 * (resolves the chosen week's label for the confirmation screen).
 */

export interface LaunchWeek {
  id: string
  label: string
  status: 'featuredOnly' | 'open'
}

const STATUS_PATTERN: LaunchWeek['status'][] = ['featuredOnly', 'featuredOnly', 'open', 'open', 'open', 'open']

/** How far out the calendar's first week opens. */
export const LAUNCH_WEEKS_OUT = 8

/**
 * `YYYY-MM-DD` from the date's LOCAL calendar fields, not `toISOString()`
 * (which converts to UTC first). For a positive-UTC-offset visitor, local
 * midnight Monday is still Sunday evening in UTC — `toISOString().slice(0,10)`
 * would silently give the id the previous day's date, one calendar day off
 * from what `formatWeekLabel` (also local) displays as the label.
 */
function toLocalDateId(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatWeekLabel(start: Date, end: Date): string {
  const now = new Date()
  const sameYear = start.getFullYear() === now.getFullYear() && end.getFullYear() === now.getFullYear()
  const sameMonth = start.getMonth() === end.getMonth()
  const startStr = start.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
  const endStr = end.toLocaleDateString('en-US', sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' })
  return `${startStr}–${endStr}${sameYear ? '' : ` ${end.getFullYear()}`}`
}

export function buildLaunchWeeks(): LaunchWeek[] {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() + LAUNCH_WEEKS_OUT * 7)
  // Roll forward to the Monday on or after that date.
  const day = start.getDay()
  start.setDate(start.getDate() + ((1 - day + 7) % 7))

  return STATUS_PATTERN.map((status, index) => {
    const weekStart = new Date(start)
    weekStart.setDate(start.getDate() + index * 7)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 6)
    return {
      id: toLocalDateId(weekStart),
      label: formatWeekLabel(weekStart, weekEnd),
      status,
    }
  })
}
