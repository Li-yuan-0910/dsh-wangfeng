/**
 * 最佳表现的纯函数自测，不碰真实数据。
 *   node tools/test-pr.mjs
 */
import assert from 'node:assert/strict'

import { computePRs, effectiveLoad, estimate1RM } from '../lib/pr.js'

function day(date, exercises) {
  return {
    date,
    updatedAt: date + 'T10:00:00.000Z',
    workouts: [{ name: '力量训练', exercises }],
  }
}

const weekAgo = day('2026-10-20', [
  { movement: '大剪刀机单臂', sets: 2, reps: 12, weightKg: 10 },
  { movement: '辅助引体向上', sets: 3, reps: 8, assistKg: 40, bodyweightKg: 70 },
  { movement: '二头弯举', sets: 3, reps: 12, weightKg: 25 },
])

const today = day('2026-10-26', [
  { movement: '大剪刀机单臂', sets: 2, reps: 12, weightKg: 15 },
  { movement: '辅助引体向上', sets: 3, reps: 8, assistKg: 20, bodyweightKg: 70 },
])

const prs = computePRs([weekAgo, today])
const byName = new Map(prs.map((pr) => [pr.movement, pr]))

// 有效重量与 e1RM
assert.equal(effectiveLoad({ assistKg: 40, bodyweightKg: 70 }), 30)
assert.equal(Math.round(estimate1RM({ assistKg: 40, bodyweightKg: 70, reps: 8 }) * 100) / 100, 38)

// 单臂 10 → 15：最佳换成今天，涨 7
const arm = byName.get('大剪刀机单臂')
assert.equal(arm.best.weightKg, 15)
assert.equal(arm.best.date, '2026-10-26')
assert.equal(Math.round(arm.delta * 10) / 10, 7)
assert.equal(arm.bestIsLatest, true)

// 辅助 40 → 20：等效 30 → 50，涨 25.3
const pull = byName.get('辅助引体向上')
assert.equal(pull.best.assistKg, 20)
assert.equal(Math.round(pull.best.e1rm * 10) / 10, 63.3)
assert.equal(Math.round(pull.delta * 10) / 10, 25.3)

// 二头只有一次：没有前一次
assert.equal(byName.get('二头弯举').priorBest, null)

// 退步：第三天回到 10kg，最佳仍是 15kg，delta 为负
const back = day('2026-10-27', [{ movement: '大剪刀机单臂', sets: 2, reps: 12, weightKg: 10 }])
const arm2 = computePRs([weekAgo, today, back]).find((pr) => pr.movement === '大剪刀机单臂')
assert.equal(arm2.best.weightKg, 15)
assert.equal(arm2.bestIsLatest, false)
assert.equal(Math.round(arm2.delta * 10) / 10, -7)

// 平手：同 e1RM 时看容量，容量大的留下
const tieA = day('2026-10-21', [{ movement: '测试动作', sets: 1, reps: 10, weightKg: 20 }])
const tieB = day('2026-10-22', [{ movement: '测试动作', sets: 3, reps: 10, weightKg: 20 }])
const tie = computePRs([tieA, tieB]).find((pr) => pr.movement === '测试动作')
assert.equal(tie.best.sets, 3)
assert.equal(tie.best.date, '2026-10-22')

console.log('最佳表现测试通过 ✓')
