/**
 * 望峰 · Ascent —— 最佳表现
 * ============================================================================
 * 比的是「等效最大重量」：有效重量 × (1 + 次数 / 30)。
 * 辅助动作的有效重量 = 自重 − 辅助，所以「辅助 60kg」一定比「辅助 80kg」好。
 * 没给自重的辅助动作退化成「辅助越少越好」。
 */

import { addDays, weekdayOf } from './store.js'

export function num(value) {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function effectiveLoad(exercise) {
  const assist = num(exercise && exercise.assistKg)
  const bodyweight = num(exercise && exercise.bodyweightKg)
  const weight = num(exercise && exercise.weightKg)
  if (assist !== null) return bodyweight !== null ? Math.max(0, bodyweight - assist) : null
  if (weight !== null) return weight
  return null
}

export function estimate1RM(exercise) {
  const load = effectiveLoad(exercise)
  if (load === null || load <= 0) return null
  const reps = num(exercise && exercise.reps) ?? 0
  return load * (1 + reps / 30)
}

/** 按日期升序收集每一次动作尝试 */
export function collectAttempts(days) {
  const attempts = []
  for (const day of days) {
    for (const workout of day.workouts || []) {
      for (const exercise of workout.exercises || []) {
        const load = effectiveLoad(exercise)
        const e1rm = estimate1RM(exercise)
        attempts.push({
          movement: exercise.movement,
          date: day.date,
          at: day.updatedAt || day.date,
          workout: workout.name,
          sets: num(exercise.sets) ?? 0,
          reps: num(exercise.reps) ?? 0,
          weightKg: num(exercise.weightKg),
          assistKg: num(exercise.assistKg),
          bodyweightKg: num(exercise.bodyweightKg),
          effective: load,
          e1rm,
          volume: load === null ? null : load * (num(exercise.sets) ?? 0) * (num(exercise.reps) ?? 0),
        })
      }
    }
  }
  return attempts
}

function better(a, b) {
  if (!b) return true
  if (a.e1rm === null && b.e1rm === null) {
    const aAssist = a.assistKg === null ? Number.POSITIVE_INFINITY : a.assistKg
    const bAssist = b.assistKg === null ? Number.POSITIVE_INFINITY : b.assistKg
    if (aAssist !== bAssist) return aAssist < bAssist
    if (a.reps !== b.reps) return a.reps > b.reps
    return a.sets > b.sets
  }
  if (a.e1rm === null) return false
  if (b.e1rm === null) return true
  if (Math.abs(a.e1rm - b.e1rm) > 1e-9) return a.e1rm > b.e1rm
  if ((a.volume ?? 0) !== (b.volume ?? 0)) return (a.volume ?? 0) > (b.volume ?? 0)
  return false
}

function bestIndexOf(list) {
  let index = -1
  let best = null
  list.forEach((item, i) => {
    if (better(item, best)) {
      best = item
      index = i
    }
  })
  return index
}

/** 所有动作的最佳表现、最近一次、涨跌 */
export function computePRs(days) {
  const attempts = collectAttempts(days)
  const groups = new Map()
  for (const attempt of attempts) {
    if (!attempt.movement) continue
    if (!groups.has(attempt.movement)) groups.set(attempt.movement, [])
    groups.get(attempt.movement).push(attempt)
  }

  const prs = []
  for (const [movement, list] of groups) {
    const bestIndex = bestIndexOf(list)
    const latestIndex = list.length - 1
    const best = list[bestIndex]
    const latest = list[latestIndex]
    const prior = list.slice(0, -1)
    const priorBest = prior.length ? prior[bestIndexOf(prior)] : null

    let delta = null
    let deltaUnit = 'kg'
    if (latest.e1rm !== null && priorBest && priorBest.e1rm !== null) {
      delta = latest.e1rm - priorBest.e1rm
    } else if (latest.e1rm === null && latest.assistKg !== null && priorBest && priorBest.assistKg !== null) {
      delta = priorBest.assistKg - latest.assistKg
      deltaUnit = 'assist'
    }

    prs.push({
      movement,
      best,
      latest,
      priorBest,
      bestIsLatest: bestIndex === latestIndex,
      delta,
      deltaUnit,
      count: list.length,
      history: list.slice(-12).map((a) => ({
        date: a.date,
        e1rm: a.e1rm,
        effective: a.effective,
        sets: a.sets,
        reps: a.reps,
        weightKg: a.weightKg,
        assistKg: a.assistKg,
      })),
    })
  }

  prs.sort((a, b) => (a.latest.date < b.latest.date ? 1 : a.latest.date > b.latest.date ? -1 : a.movement.localeCompare(b.movement, 'zh')))
  return prs
}

export function computeStats(days, todayKey) {
  const workoutDays = new Set()
  const recordedDays = new Set()
  const movements = new Set()
  for (const day of days) {
    if (day.sleep || (day.workouts && day.workouts.length) || day.note) recordedDays.add(day.date)
    if (!day.workouts || !day.workouts.length) continue
    workoutDays.add(day.date)
    for (const workout of day.workouts) {
      for (const exercise of workout.exercises || []) if (exercise.movement) movements.add(exercise.movement)
    }
  }

  const weekStart = addDays(todayKey, -weekdayOf(todayKey))
  let weekDays = 0
  let weekMinutes = 0
  for (const day of days) {
    if (day.date < weekStart || day.date > todayKey) continue
    if (day.workouts && day.workouts.length) {
      weekDays += 1
      for (const workout of day.workouts) weekMinutes += num(workout.minutes) ?? 0
    }
  }

  let cursor = workoutDays.has(todayKey) ? todayKey : addDays(todayKey, -1)
  let streak = 0
  while (workoutDays.has(cursor) && streak < 3650) {
    streak += 1
    cursor = addDays(cursor, -1)
  }

  return {
    weekDays,
    weekMinutes,
    streak,
    totalDays: recordedDays.size,
    actions: movements.size,
  }
}
