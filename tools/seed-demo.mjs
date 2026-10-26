/**
 * 生成一套示例数据，只用来截图/演示，不碰 ~/.dsh/wangfeng/。
 *   node tools/seed-demo.mjs
 * 输出到 .demo-data/（已 gitignore）。
 */
import { rmSync } from 'node:fs'

import { addDays, logDay, weekdayOf } from '../lib/store.js'

const START = '2026-07-27'
const END = '2026-10-24'
const root = process.argv[2] || '.demo-data'

const pad = (n) => String(n).padStart(2, '0')
const clock = (minutes) => `${pad(Math.floor((minutes % 1440) / 60))}:${pad(minutes % 60)}`

function demoSleep(index) {
  const duration = 380 + ((index * 37 + 11) % 95)
  const awake = (index % 3) * 5
  const rem = Math.round((duration - awake) * 0.22)
  const deep = Math.round((duration - awake) * 0.15)
  const light = duration - awake - rem - deep
  const quality = duration >= 455 ? 5 : duration >= 425 ? 4 : duration >= 395 ? 3 : 2
  const bed = 23 * 60 + ((index * 7) % 50)
  return {
    bedAt: clock(bed),
    wakeAt: clock(bed + duration),
    durationMin: duration,
    quality,
    awakeCount: awake ? 1 + (index % 2) : 0,
    awakeMin: awake,
    remMin: rem,
    lightMin: light,
    deepMin: deep,
  }
}

function demoWorkout(week, weekday) {
  const squat = 40 + week * 2.5
  const bench = 30 + week * 2
  const curl = 8 + week
  const single = 10 + week
  const double = 15 + week * 1.5
  const assist = 90 - week * 4
  const bodyweight = 70

  const strengthA = {
    name: '力量 A',
    kind: 'strength',
    minutes: 55,
    intensity: week % 3 === 0 ? 3 : 2,
    exercises: [
      { movement: '深蹲', sets: 3, reps: 8, weightKg: squat },
      { movement: '卧推', sets: 3, reps: 10, weightKg: bench },
      { movement: '二头弯举', sets: 3, reps: 12, weightKg: curl },
    ],
  }
  const strengthB = {
    name: '力量 B',
    kind: 'strength',
    minutes: 50,
    intensity: week % 3 === 0 ? 3 : 2,
    exercises: [
      { movement: '辅助引体向上', sets: 3, reps: 8, assistKg: assist, bodyweightKg: bodyweight },
      { movement: '大剪刀机单臂', sets: 2, reps: 12, weightKg: single },
      { movement: '大剪刀机双臂', sets: 2, reps: 12, weightKg: double },
    ],
  }
  const strengthC = {
    name: '力量 C',
    kind: 'strength',
    minutes: 65,
    intensity: 3,
    exercises: [
      { movement: '深蹲', sets: 3, reps: 8, weightKg: squat + 2.5 },
      { movement: '卧推', sets: 3, reps: 10, weightKg: bench + 2 },
      { movement: '二头弯举', sets: 3, reps: 12, weightKg: curl + 1 },
      { movement: '大剪刀机单臂', sets: 2, reps: 12, weightKg: single + 1 },
    ],
  }
  const basketball = {
    name: '篮球',
    kind: 'ball',
    minutes: 90 + ((week * 13) % 30),
    intensity: 3,
  }
  const run = {
    name: '慢跑',
    kind: 'cardio',
    minutes: 30,
    distanceKm: 4.5 + (week % 3),
    intensity: 2,
  }
  const walk = {
    name: '快走',
    kind: 'cardio',
    minutes: 40,
    intensity: 1,
  }

  if (weekday === 0) return strengthA
  if (weekday === 2) return strengthB
  if (weekday === 4) return week % 4 === 0 ? run : basketball
  if (weekday === 5) return strengthC
  if (weekday === 6 && week % 2 === 0) return walk
  return null
}

rmSync(root, { recursive: true, force: true })

let key = START
let index = 0
let week = 0
let workouts = 0
while (key <= END) {
  const weekday = weekdayOf(key)
  const workout = demoWorkout(week, weekday)
  const sleep = demoSleep(index)
  const patch = { date: key, sleep }
  if (workout) {
    patch.workouts = [workout]
    patch.intensity = workout.intensity
    workouts += 1
  }
  logDay(root, patch)

  key = addDays(key, 1)
  index += 1
  if (weekday === 6) week += 1
}

console.log(`已写入示例数据：${root}`)
console.log(`日期 ${START} → ${END}，${index} 天睡眠，${workouts} 次训练`)
