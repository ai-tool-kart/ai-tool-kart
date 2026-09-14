/*
 * Non-component helpers for the News Agent dashboard.
 *
 * Split out of primitives.tsx so that file exports only components — React Fast
 * Refresh cannot handle a module that mixes the two.
 */

import type { StageStatus } from '@/types/newsAgentDemo'

export const STATUS_STYLES: Record<StageStatus, { dot: string; text: string; label: string }> = {
  waiting: { dot: 'bg-zinc-600', text: 'text-zinc-500', label: 'Waiting' },
  running: { dot: 'bg-amber-400 animate-pulse', text: 'text-amber-300', label: 'Running' },
  completed: { dot: 'bg-emerald-400', text: 'text-emerald-300', label: 'Completed' },
  failed: { dot: 'bg-red-500', text: 'text-red-300', label: 'Failed' },
  skipped: { dot: 'bg-zinc-700', text: 'text-zinc-500', label: 'Skipped' },
}

export function formatTime(iso?: string): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleTimeString(undefined, { hour12: false })
}

export function formatDate(iso?: string): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function duration(from?: string, to?: string): string {
  if (!from || !to) return ''
  const ms = new Date(to).getTime() - new Date(from).getTime()
  if (!Number.isFinite(ms) || ms < 0) return ''
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}
