/**
 * 望峰 · Ascent —— 网页数据快照
 * 宿主路由和本地预览共用这一份，别各算各的。
 */

import { addDays, dayKeyOf, listDays, normalizeDayKey } from './store.js'
import { computePRs, computeStats } from './pr.js'

export function buildSnapshot(root, options = {}) {
  const cutoff = Number.isFinite(Number(options.cutoffHour)) ? Number(options.cutoffHour) : 4
  const today = normalizeDayKey(options.today) || dayKeyOf(new Date(), cutoff)
  const days = Math.max(1, Math.min(400, Number(options.days) || 120))
  const from = addDays(today, -(days - 1))
  const list = listDays(root, from, today)
  return {
    ok: true,
    today,
    range: { from, to: today, days },
    days: list,
    prs: computePRs(list),
    stats: computeStats(list, today),
    generatedAt: new Date().toISOString(),
  }
}
