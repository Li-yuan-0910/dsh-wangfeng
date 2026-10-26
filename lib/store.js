/**
 * 望峰 · Ascent —— 数据层
 * ============================================================================
 * 一天一个 JSON，原子写；数据放 ~/.dsh/wangfeng/，插件目录整个换掉也不丢。
 * 这个文件不碰网络、不碰界面，只认文件夹路径。
 */

import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

export const DEFAULT_CUTOFF_HOUR = 4
export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

const pad = (n) => String(n).padStart(2, '0')

/** 数据目录：默认 ~/.dsh/wangfeng，也可以在 cordis patch 里给 dataDir */
export function dataRoot(config = {}) {
  const raw = config && typeof config.dataDir === 'string' ? config.dataDir.trim() : ''
  return raw ? resolve(raw) : join(homedir(), '.dsh', 'wangfeng')
}

/** 本地日期键；凌晨 4 点前算前一天 */
export function dayKeyOf(date = new Date(), cutoffHour = DEFAULT_CUTOFF_HOUR) {
  const d = new Date(date instanceof Date ? date.getTime() : date)
  const cutoff = Number.isFinite(Number(cutoffHour)) ? Number(cutoffHour) : DEFAULT_CUTOFF_HOUR
  d.setHours(d.getHours() - cutoff)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 只认严格的 YYYY-MM-DD，且要是真实存在的日子 */
export function normalizeDayKey(input) {
  if (typeof input !== 'string') return ''
  const s = input.trim()
  if (!DAY_RE.test(s)) return ''
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return ''
  return s
}

export function addDays(key, delta) {
  const [y, m, d] = key.split('-').map(Number)
  const dt = new Date(y, m - 1, d + delta)
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
}

/** 0=周一 … 6=周日 */
export function weekdayOf(key) {
  const [y, m, d] = key.split('-').map(Number)
  return (new Date(y, m - 1, d).getDay() + 6) % 7
}

export function dayPath(root, key) {
  return join(root, 'days', `${key}.json`)
}

export function ensureDir(dir) {
  mkdirSync(dir, { recursive: true })
}

export function readJson(path, fallback = null) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return fallback
  }
}

export function writeJsonAtomic(path, value) {
  ensureDir(dirname(path))
  const tmp = `${path}.tmp-${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  renameSync(tmp, path)
}

// ---------------------------------------------------------------------------
// 数字与时间
// ---------------------------------------------------------------------------

export function numOrNull(value) {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function clampInt(value, min, max, fallback = null) {
  const n = numOrNull(value)
  if (n === null) return fallback
  return Math.max(min, Math.min(max, Math.round(n)))
}

function normalizeClock(value) {
  if (typeof value !== 'string') return ''
  const m = value.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return ''
  const h = Number(m[1])
  const min = Number(m[2])
  if (h < 0 || h > 23 || min < 0 || min > 59) return ''
  return `${pad(h)}:${pad(min)}`
}

function minutesOf(clock) {
  const [h, m] = clock.split(':').map(Number)
  return h * 60 + m
}

export function durationBetween(bedAt, wakeAt) {
  if (!bedAt || !wakeAt) return null
  let mins = minutesOf(wakeAt) - minutesOf(bedAt)
  if (mins <= 0) mins += 24 * 60
  return mins
}

// ---------------------------------------------------------------------------
// 睡眠
// ---------------------------------------------------------------------------

export function mergeSleep(previous, patch, now = new Date().toISOString()) {
  const out = { ...(previous || {}) }
  if (!patch || typeof patch !== 'object') return out

  const bed = normalizeClock(patch.bedAt)
  const wake = normalizeClock(patch.wakeAt)
  if (bed) out.bedAt = bed
  if (wake) out.wakeAt = wake
  if (patch.bedAt === null) delete out.bedAt
  if (patch.wakeAt === null) delete out.wakeAt

  const numberFields = ['durationMin', 'quality', 'awakeCount', 'awakeMin', 'remMin', 'lightMin', 'deepMin']
  for (const field of numberFields) {
    if (patch[field] === null) {
      delete out[field]
      continue
    }
    if (patch[field] === undefined) continue
    const n = numOrNull(patch[field])
    if (n === null) continue
    if (field === 'quality') out.quality = Math.max(1, Math.min(5, Math.round(n)))
    else if (field === 'durationMin') out.durationMin = Math.max(0, Math.min(1440, Math.round(n)))
    else if (field === 'awakeCount') out.awakeCount = Math.max(0, Math.min(99, Math.round(n)))
    else out[field] = Math.max(0, Math.min(1440, Math.round(n)))
  }

  if (typeof patch.note === 'string') out.note = patch.note.trim()
  if (patch.note === null) delete out.note

  // 只给了入睡/醒来时间：算总时长
  if (out.bedAt && out.wakeAt && out.durationMin === undefined) {
    const mins = durationBetween(out.bedAt, out.wakeAt)
    if (mins !== null) out.durationMin = mins
  }

  // 只给了分段：总时长按分段相加
  const stages = ['remMin', 'lightMin', 'deepMin']
  const hasAllStages = stages.every((s) => typeof out[s] === 'number')
  if (out.durationMin === undefined && hasAllStages) {
    out.durationMin = stages.reduce((sum, s) => sum + out[s], 0) + (out.awakeMin || 0)
  }

  out.updatedAt = now
  return out
}

// ---------------------------------------------------------------------------
// 动作字典
// ---------------------------------------------------------------------------

export function normalizeName(input) {
  return String(input || '')
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[\s·•\-_/]+/g, '')
    .toLowerCase()
}

export function loadMovements(root) {
  const db = readJson(join(root, 'movements.json'), null)
  if (!db || !Array.isArray(db.items)) return { version: 1, items: [] }
  return { version: 1, items: db.items.filter((x) => x && typeof x.name === 'string' && x.name.trim()) }
}

export function saveMovements(root, db) {
  writeJsonAtomic(join(root, 'movements.json'), db)
}

/**
 * 把用户或模型给的动作名对到正式名上。
 * 先精确匹配正式名和别名，再对 5 字以上的名字做一次包含匹配（防「剪刀机单臂」这种漏字）。
 * 对不上就新建一个正式名。
 */
export function resolveMovement(root, rawName, now = new Date().toISOString()) {
  const display = String(rawName || '').trim().replace(/\s+/g, ' ')
  if (!display) throw new Error('动作名不能为空')
  const key = normalizeName(display)
  const db = loadMovements(root)

  for (const item of db.items) {
    if (normalizeName(item.name) === key) return { name: item.name, created: false }
    if ((item.aliases || []).some((a) => normalizeName(a) === key)) return { name: item.name, created: false }
  }

  let fuzzy = null
  if (key.length >= 5) {
    for (const item of db.items) {
      const nameKey = normalizeName(item.name)
      if (nameKey.length < 5) continue
      if (key.includes(nameKey) || nameKey.includes(key)) {
        if (!fuzzy || nameKey.length > normalizeName(fuzzy.name).length) fuzzy = item
      }
    }
  }
  if (fuzzy) {
    fuzzy.aliases = Array.isArray(fuzzy.aliases) ? fuzzy.aliases : []
    if (!fuzzy.aliases.includes(display)) fuzzy.aliases.push(display)
    saveMovements(root, db)
    return { name: fuzzy.name, created: false }
  }

  db.items.push({ name: display, aliases: [], createdAt: now })
  saveMovements(root, db)
  return { name: display, created: true }
}

// ---------------------------------------------------------------------------
// 一天
// ---------------------------------------------------------------------------

export function normalizeExercise(exercise, root, now) {
  const source = exercise && typeof exercise === 'object' ? exercise : {}
  const resolved = resolveMovement(root, source.movement, now)
  return {
    movement: resolved.name,
    sets: clampInt(source.sets, 1, 99, 1),
    reps: clampInt(source.reps, 0, 999, 0),
    weightKg: numOrNull(source.weightKg),
    assistKg: numOrNull(source.assistKg),
    bodyweightKg: numOrNull(source.bodyweightKg),
    ...(typeof source.note === 'string' && source.note.trim() ? { note: source.note.trim() } : {}),
  }
}

export function normalizeWorkout(workout, root, now) {
  const source = workout && typeof workout === 'object' ? workout : {}
  const exercises = Array.isArray(source.exercises)
    ? source.exercises.map((ex) => normalizeExercise(ex, root, now))
    : []
  const kind = ['strength', 'cardio', 'ball', 'other'].includes(source.kind)
    ? source.kind
    : exercises.length
      ? 'strength'
      : 'other'
  const name = String(source.name || '').trim() || (exercises.length ? '力量训练' : '运动')
  return {
    id: `w-${randomUUID().replace(/-/g, '').slice(0, 10)}`,
    name,
    kind,
    minutes: numOrNull(source.minutes),
    intensity: source.intensity === undefined || source.intensity === null ? null : clampInt(source.intensity, 0, 3, null),
    distanceKm: numOrNull(source.distanceKm),
    ...(typeof source.note === 'string' && source.note.trim() ? { note: source.note.trim() } : {}),
    exercises,
    createdAt: now,
  }
}

export function readDay(root, key) {
  const raw = readJson(dayPath(root, key), null)
  if (!raw || typeof raw !== 'object') return null
  return {
    v: 1,
    ...raw,
    date: key,
    workouts: Array.isArray(raw.workouts) ? raw.workouts : [],
  }
}

export function writeDay(root, day) {
  writeJsonAtomic(dayPath(root, day.date), day)
  return day
}

/** 记一天：睡眠按字段合并，运动默认追加，replaceWorkouts 整段重写 */
export function logDay(root, patch = {}) {
  const now = new Date().toISOString()
  const key = normalizeDayKey(patch.date) || dayKeyOf(new Date())
  const day = readDay(root, key) || { v: 1, date: key, workouts: [] }

  if (patch.sleep && typeof patch.sleep === 'object') {
    day.sleep = mergeSleep(day.sleep, patch.sleep, now)
  }

  if (Array.isArray(patch.workouts)) {
    const list = patch.workouts.map((w) => normalizeWorkout(w, root, now))
    day.workouts = patch.replaceWorkouts ? list : [...(day.workouts || []), ...list]
  }

  if (patch.intensity !== undefined && patch.intensity !== null) {
    day.intensity = clampInt(patch.intensity, 0, 3, 0)
    day.intensitySource = patch.intensityEstimated ? 'estimated' : 'said'
  } else if (!day.intensitySource || day.intensitySource === 'derived') {
    const max = Math.max(0, ...(day.workouts || []).map((w) => Number(w.intensity) || 0))
    day.intensity = max
    day.intensitySource = max > 0 ? 'derived' : 'none'
  }

  if (typeof patch.note === 'string') day.note = patch.note.trim()
  if (patch.note === null) delete day.note

  day.updatedAt = now
  return writeDay(root, day)
}

/** 区间内的日子（只返回真的存在的文件），升序 */
export function listDays(root, fromKey, toKey) {
  const dir = join(root, 'days')
  if (!existsSync(dir)) return []
  let names = []
  try {
    names = readdirSync(dir)
  } catch {
    return []
  }
  return names
    .filter((name) => name.endsWith('.json') && DAY_RE.test(name.slice(0, 10)))
    .map((name) => name.slice(0, 10))
    .filter((key) => (!fromKey || key >= fromKey) && (!toKey || key <= toKey))
    .sort()
    .map((key) => readDay(root, key))
    .filter(Boolean)
}

export function hasAnySection(day) {
  return Boolean(day && (day.sleep || (day.workouts && day.workouts.length) || day.note))
}
