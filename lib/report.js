/**
 * 望峰 · Ascent —— 回话
 * 记完给用户看的那一小段，和查状态时的摘要。只做文字，不碰界面。
 */

import { weekdayOf } from './store.js'

const WEEK = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
export const LEVEL = ['休息', '低强度', '中强度', '高强度']

export function monthDay(key) {
  const [, m, d] = key.split('-').map(Number)
  return `${m}月${d}日`
}

export function weekdayName(key) {
  return WEEK[weekdayOf(key)] || ''
}

export function fmtDuration(minutes) {
  const n = Number(minutes)
  if (!Number.isFinite(n) || n <= 0) return '—'
  const h = Math.floor(n / 60)
  const m = Math.round(n % 60)
  if (!h) return `${m}分钟`
  return m ? `${h}小时${m}分` : `${h}小时`
}

export function fmtWeight(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return ''
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10)
}

export function stars(quality) {
  const q = Math.max(0, Math.min(5, Math.round(Number(quality) || 0)))
  return '★★★★★'.slice(0, q) + '☆☆☆☆☆'.slice(0, 5 - q)
}

export function qualityWord(quality) {
  const q = Math.round(Number(quality) || 0)
  if (q >= 5) return '睡得很好'
  if (q >= 4) return '睡得不错'
  if (q === 3) return '还算行'
  if (q === 2) return '没睡好'
  if (q === 1) return '睡得很差'
  return '没打分'
}

export function exerciseText(exercise) {
  const sets = Number(exercise.sets) || 0
  const reps = Number(exercise.reps) || 0
  const tail = `${reps}次 × ${sets}组`
  if (exercise.assistKg !== null && exercise.assistKg !== undefined) {
    const assist = fmtWeight(exercise.assistKg)
    const bodyweight = exercise.bodyweightKg !== null && exercise.bodyweightKg !== undefined ? fmtWeight(exercise.bodyweightKg) : ''
    const load = bodyweight ? Math.max(0, Number(bodyweight) - Number(assist)) : null
    const head = bodyweight ? `辅助${assist} / 自重${bodyweight} → 等效${fmtWeight(load)}kg` : `辅助${assist}kg`
    return `${head} × ${tail}`
  }
  if (exercise.weightKg !== null && exercise.weightKg !== undefined) {
    return `${fmtWeight(exercise.weightKg)}kg × ${tail}`
  }
  return tail
}

export function dayBrief(day) {
  if (!day) return '还没记录'
  const parts = []
  if (day.sleep && day.sleep.durationMin) {
    parts.push(`睡眠 ${fmtDuration(day.sleep.durationMin)}${day.sleep.quality ? `（${day.sleep.quality}星）` : ''}`)
  }
  if (day.workouts && day.workouts.length) {
    const minutes = day.workouts.reduce((sum, w) => sum + (Number(w.minutes) || 0), 0)
    const count = day.workouts.reduce((sum, w) => sum + (w.exercises ? w.exercises.length : 0), 0)
    const level = LEVEL[day.intensity] || ''
    parts.push(`${level}${day.intensityEstimated || day.intensitySource === 'estimated' ? '（估）' : ''}${minutes ? ` · ${minutes}分钟` : ''}${count ? ` · ${count}个动作` : ''}`)
  } else {
    parts.push('没有运动')
  }
  return parts.join(' · ')
}

/** 记完回给用户的一段 */
export function renderLogReport({ day, newRecords, estimatedIntensity }) {
  const lines = []
  lines.push(`望峰 · ${monthDay(day.date)} ${weekdayName(day.date)}`)
  if (day.sleep) {
    const bits = []
    if (day.sleep.durationMin) bits.push(fmtDuration(day.sleep.durationMin))
    if (day.sleep.quality) bits.push(`${stars(day.sleep.quality)}`)
    lines.push(`睡眠 ${bits.join(' · ') || '已记'}`)
  }
  if (day.workouts && day.workouts.length) {
    const minutes = day.workouts.reduce((sum, w) => sum + (Number(w.minutes) || 0), 0)
    const level = LEVEL[day.intensity] || '—'
    lines.push(`训练 ${minutes ? `${minutes}分钟 · ` : ''}${level}${estimatedIntensity ? '（强度是我估的，不对的话你说一声，我改）' : ''}`)
    for (const workout of day.workouts) {
      if (workout.name) lines.push(`· ${workout.name}`)
      for (const exercise of workout.exercises || []) {
        lines.push(`  ${exercise.movement}：${exerciseText(exercise)}`)
      }
    }
  }
  if (newRecords && newRecords.length) {
    lines.push('')
    lines.push('新纪录：')
    for (const record of newRecords) {
      lines.push(`· ${record.movement}：${record.text}${record.first ? '（首次）' : ''}`)
    }
  }
  if (!day.sleep && !(day.workouts && day.workouts.length)) lines.push('今天还没记到东西。')
  return lines.join('\n')
}

/** 查状态时的一段 */
export function renderStatus({ todayKey, today, stats, prs, recentDays }) {
  const lines = []
  lines.push(`望峰 · ${monthDay(todayKey)} ${weekdayName(todayKey)}`)
  lines.push(`今天：${dayBrief(today)}`)
  lines.push(`本周 ${stats.weekDays} 练 · 连续 ${stats.streak} 天 · ${fmtDuration(stats.weekMinutes)} · ${stats.actions} 个动作`)
  if (recentDays && recentDays.length > 1) {
    lines.push('最近：')
    for (const day of recentDays) {
      if (day.date === todayKey) continue
      lines.push(`· ${monthDay(day.date)} ${weekdayName(day.date)}：${dayBrief(day)}`)
    }
  }
  if (prs && prs.length) {
    lines.push('最佳：')
    for (const pr of prs.slice(0, 8)) {
      lines.push(`· ${pr.movement}：${exerciseText(pr.best)}${pr.best.date ? `（${monthDay(pr.best.date)}）` : ''}`)
    }
  }
  return lines.join('\n')
}
