/**
 * 宿主半边自测：用假的 ctx 跑一遍 apply、工具和路由注册，不启动 DSH。
 *   node tools/test-host.mjs
 */
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { apply } from '../index.js'

const root = mkdtempSync(join(tmpdir(), 'wangfeng-host-'))
const tools = new Map()
const routes = new Map()
const promptContexts = []

const ctx = {
  effect(fn) {
    const dispose = fn()
    return typeof dispose === 'function' ? dispose : () => {}
  },
  tools: {
    register(tool) {
      tools.set(tool.name, tool)
      return () => {}
    },
  },
  webServer: {
    register(route) {
      routes.set(route.path, route)
      return () => {}
    },
  },
  inject(_services, callback) {
    callback({
      effect(fn) {
        fn()
        return () => {}
      },
      systemPrompt: {
        context(options) {
          promptContexts.push(options)
          return () => {}
        },
      },
    })
  },
  on() {},
}

apply(ctx, { dataDir: root, cutoffHour: 4 })

assert.deepEqual([...tools.keys()].sort(), ['wangfeng_log', 'wangfeng_status'])
assert.ok(routes.has('/dsh-wangfeng/'))
assert.ok(routes.has('/dsh-wangfeng/api/snapshot'))
assert.ok(routes.has('/dsh-wangfeng/api/export'))
assert.equal(promptContexts.length, 1)

const log = tools.get('wangfeng_log')
assert.ok(log.output && typeof log.output.render === 'function', '工具必须声明 output')

const result = await log.execute({
  date: '2026-10-26',
  sleep: { durationMin: 432, quality: 3, awakeCount: 0, remMin: 95, lightMin: 250, deepMin: 60 },
  intensity: 2,
  intensityEstimated: true,
  workouts: [
    {
      name: '力量训练',
      exercises: [
        { movement: '辅助引体向上', sets: 3, reps: 8, assistKg: 40, bodyweightKg: 70 },
        { movement: '大剪刀机单臂', sets: 2, reps: 12, weightKg: 15 },
      ],
    },
  ],
})

assert.equal(result.ok, true)
assert.equal(result.newRecords.length, 2)
assert.ok(result.report.includes('7小时12分'))
assert.ok(result.report.includes('新纪录'))
assert.ok(result.report.includes('强度是我估的'))
const rendered = log.output.render({}, result)
assert.equal(rendered[0].type, 'text')
assert.ok(rendered[0].text.includes('大剪刀机单臂'))

const status = await tools.get('wangfeng_status').execute({ date: '2026-10-26' })
assert.ok(status.summary.includes('今天'))
assert.ok(status.summary.includes('最佳'))
assert.equal(status.prs.length, 2)

const prompt = promptContexts[0].text()
assert.ok(prompt.includes('wangfeng_log'))
assert.ok(prompt.includes('辅助引体向上'))
assert.equal(promptContexts[0].name, 'wangfeng')

console.log('宿主半边测试通过 ✓')
