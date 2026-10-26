/**
 * 望峰 · Ascent —— 宿主半边
 * ============================================================================
 * 用户说的睡眠和训练，从这里落进 ~/.dsh/wangfeng/，再长成一张网页。
 *
 * 铁律（踩坑清单）：
 *   · 加载时什么都不做：不读大文件、不联网、不 spawn；
 *   · 数据不放插件目录；
 *   · 工具声明 output，inject 带 webServer。
 */

import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  addDays,
  dataRoot,
  dayKeyOf,
  listDays,
  loadMovements,
  logDay,
  normalizeDayKey,
  readDay,
} from './lib/store.js'
import { computePRs, computeStats } from './lib/pr.js'
import { buildSnapshot } from './lib/snapshot.js'
import { dayBrief, exerciseText, fmtDuration, monthDay, renderLogReport, renderStatus, weekdayName } from './lib/report.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const PAGE_FILE = join(HERE, 'web', 'index.html')

const DEFAULTS = {
  cutoffHour: 4,
  dataDir: '',
}

export const inject = ['tools', 'webServer']

export function apply(ctx, config = {}) {
  const cfg = { ...DEFAULTS }
  if (config && typeof config === 'object') {
    const cutoff = Number(config.cutoffHour)
    if (Number.isFinite(cutoff) && cutoff >= 0 && cutoff <= 12) cfg.cutoffHour = cutoff
    if (typeof config.dataDir === 'string' && config.dataDir.trim()) cfg.dataDir = config.dataDir.trim()
  }

  const root = dataRoot(cfg)
  const todayKey = () => dayKeyOf(new Date(), cfg.cutoffHour)

  // -------------------------------------------------------------------------
  // 路由
  // -------------------------------------------------------------------------

  const sendJson = (res, code, value) => {
    res.writeHead(code, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    })
    res.end(JSON.stringify(value))
  }

  const route = (path, handler) =>
    ctx.effect(() =>
      ctx.webServer.register({
        kind: 'exact',
        path,
        handler: async (req, res) => {
          try {
            await handler(req, res)
          } catch (error) {
            sendJson(res, 500, { ok: false, error: String((error && error.message) || error) })
          }
        },
      }),
    )

  const page = async (_req, res) => {
    const html = await readFile(PAGE_FILE, 'utf8')
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    })
    res.end(html)
  }

  route('/dsh-wangfeng', page)
  route('/dsh-wangfeng/', page)

  route('/dsh-wangfeng/api/snapshot', async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    const days = Math.max(1, Math.min(400, Number(url.searchParams.get('days')) || 120))
    sendJson(res, 200, buildSnapshot(root, { days, today: todayKey(), cutoffHour: cfg.cutoffHour }))
  })

  route('/dsh-wangfeng/api/export', async (_req, res) => {
    const days = listDays(root, '0000-01-01', '9999-12-31')
    const payload = {
      app: 'wangfeng',
      version: 1,
      exportedAt: new Date().toISOString(),
      days,
      movements: loadMovements(root).items,
    }
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="wangfeng-export-${todayKey()}.json"`,
      'cache-control': 'no-store',
    })
    res.end(JSON.stringify(payload, null, 2))
  })

  // -------------------------------------------------------------------------
  // 工具
  // -------------------------------------------------------------------------

  const logTool = {
    name: 'wangfeng_log',
    description:
      '把用户今天（或指定日期）的睡眠、训练强度、每个动作的组数/次数/重量记进「望峰」。' +
      '⭐ 只要用户说睡眠或训练（含动作、组数、次数、重量、篮球/跑步/球类、强度），就必须调用这个工具，不要只在嘴上答应。' +
      '只记用户说出口的数字，不要替用户编；没说的字段留空。用户没说强度时可以按训练量估一档，但要设置 intensityEstimated=true，并在回话里说明是估的。' +
      '用户说「昨天/前天/补记某天」时用 date；说错了要改同一天，用 replaceWorkouts=true 整段重写运动。' +
      '同一个动作名请沿用上下文里给出的正式名，避免造出两个同义动作。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        date: {
          type: 'string',
          description: '要记哪一天，YYYY-MM-DD；不填就是今天（凌晨 4 点前算前一天）。补记昨天/前天时才填。',
        },
        sleep: {
          type: 'object',
          additionalProperties: false,
          description: '睡眠。时长可以给 durationMin，或者给 bedAt/wakeAt 让插件算；分段用分钟。',
          properties: {
            bedAt: { type: 'string', description: '入睡时间 HH:MM，比如 23:40' },
            wakeAt: { type: 'string', description: '醒来时间 HH:MM，比如 07:10' },
            durationMin: { type: 'number', description: '总睡眠分钟数，比如 432（7小时12分）' },
            quality: { type: 'integer', minimum: 1, maximum: 5, description: '睡眠质量 1–5 星' },
            awakeCount: { type: 'integer', minimum: 0, description: '清醒次数' },
            awakeMin: { type: 'number', description: '清醒总分钟数' },
            remMin: { type: 'number', description: '快速眼动分钟数' },
            lightMin: { type: 'number', description: '浅睡分钟数' },
            deepMin: { type: 'number', description: '深睡分钟数' },
            note: { type: 'string' },
          },
        },
        intensity: {
          type: 'integer',
          minimum: 0,
          maximum: 3,
          description: '当天训练强度：0 休息、1 低、2 中、3 高。用户说了才填；没说可以估，但配 intensityEstimated=true。',
        },
        intensityEstimated: { type: 'boolean', description: '强度是你估的（不是用户说的）时设 true' },
        workouts: {
          type: 'array',
          description: '这一天的运动，可以有多段（力量、篮球、跑步……）。',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              name: { type: 'string', description: '这段运动的名字，比如 力量训练 / 篮球 / 跑步' },
              kind: { type: 'string', enum: ['strength', 'cardio', 'ball', 'other'] },
              minutes: { type: 'number', description: '时长（分钟）' },
              intensity: { type: 'integer', minimum: 0, maximum: 3, description: '这段运动的强度' },
              distanceKm: { type: 'number' },
              note: { type: 'string' },
              exercises: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    movement: { type: 'string', description: '动作正式名，比如 辅助引体向上 / 大剪刀机单臂 / 二头弯举' },
                    sets: { type: 'integer', minimum: 1, description: '组数' },
                    reps: { type: 'integer', minimum: 0, description: '每组次数' },
                    weightKg: { type: 'number', description: '器械/杠铃重量（kg），不含自重' },
                    assistKg: { type: 'number', description: '辅助重量（kg），辅助引体这类才有' },
                    bodyweightKg: { type: 'number', description: '当时自重（kg），算辅助动作的等效重量要用' },
                    note: { type: 'string' },
                  },
                  required: ['movement'],
                },
              },
            },
            required: ['name'],
          },
        },
        replaceWorkouts: { type: 'boolean', description: 'true = 这一天的运动整段重写（改错时用）；默认追加' },
        note: { type: 'string', description: '当天备注' },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean' },
          date: { type: 'string' },
          report: { type: 'string' },
          newRecords: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                movement: { type: 'string' },
                text: { type: 'string' },
                first: { type: 'boolean' },
              },
              required: ['movement', 'text', 'first'],
            },
          },
          movements: { type: 'array', items: { type: 'string' } },
          dataPath: { type: 'string' },
        },
        required: ['ok', 'date', 'report', 'newRecords', 'movements', 'dataPath'],
      },
      render(_args, value) {
        return [{ type: 'text', text: String((value && value.report) || '记下了') }]
      },
    },
    isConcurrencySafe: () => false,
    async execute(args) {
      const input = args && typeof args === 'object' ? args : {}
      const hasSomething =
        (input.sleep && typeof input.sleep === 'object' && Object.keys(input.sleep).length > 0) ||
        (Array.isArray(input.workouts) && input.workouts.length > 0) ||
        input.intensity !== undefined ||
        typeof input.note === 'string'
      if (!hasSomething) throw new Error('没有要记的内容：至少给 sleep、workouts、intensity 或 note 其中一个')

      const key = normalizeDayKey(input.date) || todayKey()
      if (normalizeDayKey(input.date) && key > todayKey()) throw new Error(`不能记未来的日子（${key}）`)

      const historyFrom = addDays(key, -3650)
      const before = computePRs(listDays(root, historyFrom, key))
      const day = logDay(root, {
        ...input,
        date: key,
        intensityEstimated: Boolean(input.intensityEstimated),
      })
      const after = computePRs(listDays(root, historyFrom, key))
      const beforeByMovement = new Map(before.map((pr) => [pr.movement, pr]))

      const newRecords = []
      for (const pr of after) {
        if (!pr.best || pr.best.date !== key) continue
        const old = beforeByMovement.get(pr.movement)
        if (old && !isImprovement(pr, old)) continue
        newRecords.push({
          movement: pr.movement,
          text: exerciseText(pr.best),
          first: !old,
        })
      }

      const movements = [
        ...new Set((day.workouts || []).flatMap((w) => (w.exercises || []).map((e) => e.movement)).filter(Boolean)),
      ]
      const report = renderLogReport({
        day,
        newRecords,
        estimatedIntensity: day.intensitySource === 'estimated',
      })

      return {
        ok: true,
        date: key,
        report,
        newRecords,
        movements,
        dataPath: join(root, 'days', `${key}.json`),
      }
    },
  }

  const statusTool = {
    name: 'wangfeng_status',
    description:
      '看看望峰里记到哪了：今天/某天的睡眠和训练、连着练了几天、本周数据、各动作的最佳表现。' +
      '用户问「我今天记了吗」「最近练得怎么样」「我的最佳」时用它。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD，不填就是今天' },
        days: { type: 'integer', minimum: 1, maximum: 90, description: '最近几天，默认 7' },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean' },
          date: { type: 'string' },
          summary: { type: 'string' },
          prs: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                movement: { type: 'string' },
                text: { type: 'string' },
                date: { type: 'string' },
              },
              required: ['movement', 'text', 'date'],
            },
          },
          movements: { type: 'array', items: { type: 'string' } },
          dataPath: { type: 'string' },
        },
        required: ['ok', 'date', 'summary', 'prs', 'movements', 'dataPath'],
      },
      render(_args, value) {
        return [{ type: 'text', text: String((value && value.summary) || '还没有记录') }]
      },
    },
    async execute(args) {
      const input = args && typeof args === 'object' ? args : {}
      const key = normalizeDayKey(input.date) || todayKey()
      const days = Math.max(1, Math.min(90, Number(input.days) || 7))
      const history = listDays(root, addDays(key, -400), key)
      const recent = listDays(root, addDays(key, -(days - 1)), key)
      const today = readDay(root, key)
      const stats = computeStats(history, key)
      const prs = computePRs(history)
      const movements = loadMovements(root).items.map((item) => item.name)
      const summary = renderStatus({ todayKey: key, today, stats, prs, recentDays: recent })

      return {
        ok: true,
        date: key,
        summary,
        prs: prs.slice(0, 10).map((pr) => ({ movement: pr.movement, text: exerciseText(pr.best), date: pr.best.date })),
        movements,
        dataPath: join(root, 'days'),
      }
    },
  }

  ctx.effect(() => ctx.tools.register(logTool))
  ctx.effect(() => ctx.tools.register(statusTool))

  // -------------------------------------------------------------------------
  // 每轮那一小段说明
  // -------------------------------------------------------------------------

  let cached = { at: 0, text: '' }

  function buildContextText() {
    const now = Date.now()
    if (now - cached.at < 3000) return cached.text

    const key = todayKey()
    let brief = '还没读到今天的记录'
    let movementNames = []
    let best = []
    try {
      const days = listDays(root, addDays(key, -120), key)
      brief = dayBrief(readDay(root, key))
      const prs = computePRs(days)
      best = prs.slice(0, 3).map((pr) => `${pr.movement} ${exerciseText(pr.best)}`)
      movementNames = loadMovements(root).items.map((item) => item.name)
    } catch {
      /* 读不到就按空的说 */
    }

    const lines = []
    lines.push('【望峰 · Ascent｜睡眠与训练】')
    lines.push(
      '用户说睡眠、训练、动作、组数、次数、重量、篮球/跑步/球类或强度时，**调用 wangfeng_log 记下来**，不要只在嘴上答应。',
    )
    lines.push('只记用户说出口的数字，不编；没说的留空。用户没说强度可以估一档，但要配 intensityEstimated=true 并说明是估的。')
    lines.push(`今天 ${key}：${brief}`)
    if (movementNames.length) lines.push(`已有动作（沿用这些正式名）：${movementNames.slice(0, 16).join('、')}`)
    if (best.length) lines.push(`最佳：${best.join('；')}`)
    lines.push('记完把新纪录说给用户听；网页在 设置 → 插件 → 望峰。')
    lines.push('用户说「改一下/说错了」时，同一天重记，运动整段重写用 replaceWorkouts=true。')

    const text = lines.join('\n')
    cached = { at: now, text }
    return text
  }

  const registerPrompt = (scope) => {
    try {
      const prompt = scope.systemPrompt
      if (!prompt || typeof prompt.context !== 'function') return
      scope.effect(() =>
        prompt.context({
          name: 'wangfeng',
          order: 870,
          text: () => {
            try {
              return buildContextText()
            } catch {
              return ''
            }
          },
        }),
      )
    } catch {
      /* 没有系统提示也能用工具 */
    }
  }

  if (typeof ctx.inject === 'function') {
    try {
      ctx.inject(['systemPrompt'], (scope) => registerPrompt(scope))
    } catch {
      registerPrompt(ctx)
    }
  } else {
    registerPrompt(ctx)
  }
}

function isImprovement(after, before) {
  if (!before) return true
  if (after.best.e1rm !== null && before.best.e1rm !== null) return after.best.e1rm > before.best.e1rm + 1e-9
  if (after.best.e1rm === null && before.best.e1rm === null) {
    const a = after.best.assistKg === null || after.best.assistKg === undefined ? Number.POSITIVE_INFINITY : after.best.assistKg
    const b = before.best.assistKg === null || before.best.assistKg === undefined ? Number.POSITIVE_INFINITY : before.best.assistKg
    return a < b
  }
  return after.best.e1rm !== null
}

export { fmtDuration, monthDay, weekdayName }
