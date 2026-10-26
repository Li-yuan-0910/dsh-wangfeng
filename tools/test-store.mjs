/**
 * 数据层自测：日期、睡眠合并、动作归并、运动追加/重写。
 *   node tools/test-store.mjs
 */
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  dayKeyOf,
  durationBetween,
  listDays,
  loadMovements,
  logDay,
  mergeSleep,
  normalizeDayKey,
  readDay,
} from '../lib/store.js'

// 凌晨 4 点前算前一天
assert.equal(dayKeyOf(new Date(2026, 9, 27, 2, 0), 4), '2026-10-26')
assert.equal(dayKeyOf(new Date(2026, 9, 27, 9, 0), 4), '2026-10-27')
assert.equal(normalizeDayKey('2026-02-30'), '')
assert.equal(normalizeDayKey('2026-10-26'), '2026-10-26')
assert.equal(durationBetween('23:40', '07:10'), 450)

// 睡眠按字段合并：改质量不动时长
const merged = mergeSleep({ durationMin: 432, quality: 3, remMin: 95 }, { quality: 4 })
assert.equal(merged.durationMin, 432)
assert.equal(merged.quality, 4)
assert.equal(merged.remMin, 95)

const root = mkdtempSync(join(tmpdir(), 'wangfeng-test-'))

// 先记睡眠，再记运动：两次都留着
logDay(root, { date: '2026-10-26', sleep: { durationMin: 432, quality: 3, remMin: 95, lightMin: 250, deepMin: 60 } })
logDay(root, {
  date: '2026-10-26',
  intensity: 2,
  intensityEstimated: true,
  workouts: [
    {
      name: '力量训练',
      exercises: [
        { movement: '大剪刀机单臂', sets: 2, reps: 12, weightKg: 15 },
        { movement: '辅助引体向上', sets: 3, reps: 8, assistKg: 40, bodyweightKg: 70 },
      ],
    },
  ],
})
let saved = readDay(root, '2026-10-26')
assert.equal(saved.sleep.durationMin, 432)
assert.equal(saved.workouts.length, 1)
assert.equal(saved.workouts[0].exercises.length, 2)
assert.equal(saved.intensity, 2)
assert.equal(saved.intensitySource, 'estimated')

// 追加第二段运动
logDay(root, { date: '2026-10-26', workouts: [{ name: '篮球', kind: 'ball', minutes: 60, intensity: 3 }] })
saved = readDay(root, '2026-10-26')
assert.equal(saved.workouts.length, 2)
assert.equal(saved.workouts[1].name, '篮球')

// 整段重写
logDay(root, {
  date: '2026-10-26',
  replaceWorkouts: true,
  workouts: [{ name: '力量训练', exercises: [{ movement: '二头弯举', sets: 3, reps: 12, weightKg: 25 }] }],
})
saved = readDay(root, '2026-10-26')
assert.equal(saved.workouts.length, 1)
assert.equal(saved.workouts[0].exercises[0].movement, '二头弯举')

// 动作归并：先有正式名，再来漏字的别名，归到正式名
logDay(root, { date: '2026-10-27', workouts: [{ name: '力量训练', exercises: [{ movement: '大剪刀机双臂', sets: 2, reps: 12, weightKg: 25 }] }] })
logDay(root, { date: '2026-10-27', workouts: [{ name: '力量训练', exercises: [{ movement: '剪刀机双臂', sets: 2, reps: 12, weightKg: 25 }] }] })
saved = readDay(root, '2026-10-27')
assert.equal(saved.workouts[1].exercises[0].movement, '大剪刀机双臂')
const db = loadMovements(root)
assert.ok(db.items.find((item) => item.name === '大剪刀机双臂').aliases.includes('剪刀机双臂'))

// 区间读取
assert.deepEqual(listDays(root, '2026-10-26', '2026-10-26').map((d) => d.date), ['2026-10-26'])

console.log('数据层测试通过 ✓')
