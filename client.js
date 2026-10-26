/**
 * 望峰 · Ascent —— 浏览器半边
 * ============================================================================
 * 两个入口：
 *   1. 设置 → 插件 → 「望峰」标签页：今日摘要 + 打开按钮；
 *   2. 侧栏插件页里本插件的详情页：页头一个「打开望峰」。
 * 网页本身是独立页面，不在这里重画一遍。
 */

window.__ModuleLoader__.load({
  id: 'dsh-wangfeng',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement

    const API = '/dsh-wangfeng/api/snapshot?days=14'
    const PAGE = '/dsh-wangfeng/'
    const WEEK = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
    const LEVEL = ['休息', '低强度', '中强度', '高强度']

    const CSS = `
[data-wf]{display:flex;flex-direction:column;gap:14px;padding:16px;border:1px solid rgba(127,127,127,.2);border-radius:14px;background:var(--dsw-alias-bg-layer-1,var(--dsw-alias-bg-base,#fff));color:var(--dsw-alias-label-primary,inherit);}
[data-wf-head]{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;}
[data-wf-title]{font-size:20px;font-weight:650;line-height:1.2;margin:0;}
[data-wf-title small]{font-size:10px;letter-spacing:2.4px;color:rgba(127,127,127,.75);font-weight:500;margin-left:7px;vertical-align:2px;}
[data-wf-sub]{font-size:12px;color:rgba(127,127,127,.85);margin-top:4px;}
[data-wf-grid]{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;}
[data-wf-cell]{border:1px solid rgba(127,127,127,.2);border-radius:12px;padding:11px 12px;min-width:0;}
[data-wf-cell b]{display:block;font-size:19px;line-height:1.2;font-weight:650;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
[data-wf-cell span]{display:block;font-size:11px;color:rgba(127,127,127,.9);margin-top:3px;}
[data-wf-list]{display:flex;flex-direction:column;gap:6px;}
[data-wf-row]{display:flex;justify-content:space-between;gap:10px;font-size:13px;padding:6px 0;border-top:1px dashed rgba(127,127,127,.2);}
[data-wf-row]:first-child{border-top:0;}
[data-wf-row i]{font-style:normal;color:rgba(127,127,127,.95);white-space:nowrap;font-variant-numeric:tabular-nums;}
[data-wf-btn]{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:40px;padding:0 18px;border-radius:10px;background:#2f7d5a;color:#fff;font-size:14px;font-family:inherit;font-weight:550;text-decoration:none;border:0;cursor:pointer;align-self:flex-start;}
[data-wf-btn]:hover{background:#286b4d;color:#fff;}
[data-wf-btn-small]{height:30px;padding:0 12px;font-size:12px;font-family:inherit;border-radius:8px;display:inline-flex;align-items:center;gap:6px;background:#2f7d5a;color:#fff;text-decoration:none;border:0;cursor:pointer;margin-left:8px;}
[data-wf-btn-small]:hover{background:#286b4d;color:#fff;}
[data-wf-note]{font-size:11px;color:rgba(127,127,127,.8);line-height:1.6;}
[data-wf-empty]{font-size:12px;color:rgba(127,127,127,.9);padding:8px 0;}
[data-wf-loading]{font-size:12px;color:rgba(127,127,127,.85);padding:16px 0;}
[data-wf-overlay]{position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:#0f1216;}
[data-wf-overlay-bar]{height:46px;display:flex;align-items:center;gap:12px;padding:0 14px;background:#171b21;color:#fff;font-size:13px;flex:0 0 auto;}
[data-wf-overlay-title]{font-weight:600;margin-right:auto;}
[data-wf-overlay-link]{color:#9ad2b5;text-decoration:none;font-size:12px;}
[data-wf-overlay-link:hover]{text-decoration:underline;}
[data-wf-overlay-close]{height:30px;padding:0 14px;border-radius:8px;border:0;background:#2f7d5a;color:#fff;font-size:12px;font-family:inherit;cursor:pointer;}
[data-wf-overlay-close]:hover{background:#286b4d;}
[data-wf-frame]{flex:1;width:100%;border:0;background:#f5f6f8;}
`

    function pad(n) {
      return String(n).padStart(2, '0')
    }
    function monthDay(key) {
      const p = String(key || '').split('-').map(Number)
      return p.length === 3 ? p[1] + '月' + p[2] + '日' : ''
    }
    function weekdayOf(key) {
      const p = String(key || '').split('-').map(Number)
      if (p.length !== 3) return ''
      return (new Date(p[0], p[1] - 1, p[2]).getDay() + 6) % 7
    }
    function fmtDuration(minutes) {
      const n = Number(minutes)
      if (!Number.isFinite(n) || n <= 0) return '—'
      const hours = Math.floor(n / 60)
      const mins = Math.round(n % 60)
      if (!hours) return mins + ' 分钟'
      return hours + ' 小时' + (mins ? ' ' + mins + ' 分' : '')
    }
    function fmtWeight(value) {
      const n = Number(value)
      if (!Number.isFinite(n)) return ''
      return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10)
    }

    function Panel() {
      const [state, setState] = React.useState({ loading: true, error: '', snap: null })
      const [preview, setPreview] = React.useState(false)
      React.useEffect(() => {
        let alive = true
        fetch(API, { cache: 'no-store' })
          .then((res) => {
            if (!res.ok) throw new Error('HTTP ' + res.status)
            return res.json()
          })
          .then((snap) => {
            if (alive) setState({ loading: false, error: '', snap })
          })
          .catch((error) => {
            if (alive) setState({ loading: false, error: String((error && error.message) || error), snap: null })
          })
        return () => {
          alive = false
        }
      }, [])

      const snap = state.snap
      const today = snap ? snap.days.find((day) => day.date === snap.today) : null
      let sleep = today && today.sleep
      if (snap && !sleep) {
        for (let i = 1; i < 7 && !sleep; i += 1) {
          const key = new Date(snap.today + 'T00:00:00')
          key.setDate(key.getDate() - i)
          const k = key.getFullYear() + '-' + pad(key.getMonth() + 1) + '-' + pad(key.getDate())
          const day = snap.days.find((item) => item.date === k)
          if (day && day.sleep) sleep = day.sleep
        }
      }

      const level = today && Number.isFinite(Number(today.intensity)) ? Number(today.intensity) : 0
      const estimated = today && (today.intensitySource === 'estimated' || today.intensityEstimated)
      const exercises = today && today.workouts
        ? today.workouts.reduce((list, workout) => list.concat(workout.exercises || []), [])
        : []

      return h(
        'div',
        { 'data-wf': '' },
        h(
          'div',
          { 'data-wf-head': '' },
          h(
            'div',
            null,
            h('h3', { 'data-wf-title': '' }, '望峰', h('small', null, 'ASCENT')),
            h(
              'div',
              { 'data-wf-sub': '' },
              snap ? monthDay(snap.today) + ' ' + WEEK[weekdayOf(snap.today)] : '正在读取…',
            ),
          ),
          h(
            'button',
            {
              'data-wf-btn-small': '',
              type: 'button',
              onClick: () => setPreview(true),
              title: '在设置里打开望峰页面',
            },
            '打开望峰 ↗',
          ),
        ),

        state.loading
          ? h('div', { 'data-wf-loading': '' }, '正在读取记录…')
          : state.error
            ? h('div', { 'data-wf-empty': '' }, '没读到数据：' + state.error)
            : h(
                React.Fragment,
                null,
                h(
                  'div',
                  { 'data-wf-grid': '' },
                  h(
                    'div',
                    { 'data-wf-cell': '' },
                    h('b', null, level ? LEVEL[level] : '休息'),
                    h('span', null, estimated ? '强度（估的）' : '今天强度'),
                  ),
                  h(
                    'div',
                    { 'data-wf-cell': '' },
                    h('b', null, sleep ? fmtDuration(sleep.durationMin) : '—'),
                    h('span', null, sleep && sleep.quality ? '睡眠 · ' + sleep.quality + ' 星' : '睡眠'),
                  ),
                  h(
                    'div',
                    { 'data-wf-cell': '' },
                    h('b', null, '本周 ' + snap.stats.weekDays + ' 练'),
                    h('span', null, '连续 ' + snap.stats.streak + ' 天'),
                  ),
                ),

                exercises.length
                  ? h(
                      'div',
                      { 'data-wf-list': '' },
                      exercises.slice(0, 5).map((exercise) =>
                        h(
                          'div',
                          { 'data-wf-row': '', key: exercise.movement },
                          h('span', null, exercise.movement),
                          h(
                            'i',
                            null,
                            exercise.assistKg !== null && exercise.assistKg !== undefined
                              ? '辅助 ' + fmtWeight(exercise.assistKg) + ' × ' + exercise.reps + '×' + exercise.sets
                              : (exercise.weightKg !== null && exercise.weightKg !== undefined
                                  ? fmtWeight(exercise.weightKg) + 'kg'
                                  : '') +
                                ' × ' + exercise.reps + '×' + exercise.sets,
                          ),
                        ),
                      ),
                    )
                  : h('div', { 'data-wf-empty': '' }, '今天还没记训练。'),

                h(
                  'button',
                  {
                    'data-wf-btn': '',
                    type: 'button',
                    onClick: () => setPreview(true),
                  },
                  '打开望峰 · 热力图与最佳表现',
                ),
                h(
                  'div',
                  { 'data-wf-note': '' },
                  '全部 ' + snap.prs.length + ' 个动作在册 · 网页只读，记东西直接跟我说。',
                ),
              ),
        preview
          ? h(
              'div',
              { 'data-wf-overlay': '' },
              h(
                'div',
                { 'data-wf-overlay-bar': '' },
                h('span', { 'data-wf-overlay-title': '' }, '望峰 · Ascent'),
                h(
                  'a',
                  { 'data-wf-overlay-link': '', href: PAGE, target: '_blank', rel: 'noopener' },
                  '在新窗口打开',
                ),
                h(
                  'button',
                  { 'data-wf-overlay-close': '', type: 'button', onClick: () => setPreview(false) },
                  '关闭',
                ),
              ),
              h('iframe', { 'data-wf-frame': '', src: PAGE, title: '望峰' }),
            )
          : null,
      )
    }

    function OpenButton({ subject }) {
      return h(
        'a',
        {
          'data-wf-btn-small': '',
          href: PAGE,
          target: '_blank',
          rel: 'noopener',
          title: '打开望峰的完整页面',
        },
        '打开望峰 ↗',
      )
    }

    function isOurs(subject) {
      return Boolean(
        subject &&
          subject.kind === 'bundle' &&
          subject.pkg &&
          subject.pkg.name === 'dsh-wangfeng',
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const style = document.createElement('style')
        style.setAttribute('data-plugin-css', 'dsh-wangfeng')
        style.textContent = CSS
        document.head.appendChild(style)
        ctx.effect(() => () => style.remove(), 'dsh-wangfeng: styles')

        const slots = (typeof ctx.get === 'function' ? ctx.get('slots') : undefined) || ctx.slots
        if (!slots) return

        slots.inject('settings.section', () =>
          slots.register(
            { name: 'settings.section', id: 'wangfeng', order: 55, label: '望峰' },
            () => h(Panel),
          ),
        )

        slots.inject('settings.plugins.tab', () =>
          slots.register(
            { name: 'settings.plugins.tab', id: 'wangfeng', order: 60, label: '望峰' },
            () => h(Panel),
          ),
        )

        slots.inject('plugins.detail.actions', () =>
          slots.register({ name: 'plugins.detail.actions', id: 'wangfeng-open', order: 20 }, (props) =>
            isOurs(props && props.subject) ? h(OpenButton, props) : null,
          ),
        )
      },
    }
  },
})
