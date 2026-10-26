/**
 * 本地预览服务器（不启动 DSH 也能看页面）
 *
 *   node tools/dev-server.mjs          读 ~/.dsh/wangfeng/ 的真实数据
 *   node tools/dev-server.mjs --demo   读 .demo-data/ 的示例数据（先 npm run seed:demo）
 *   PORT=5098 node tools/dev-server.mjs
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { dataRoot } from '../lib/store.js'
import { buildSnapshot } from '../lib/snapshot.js'

const demo = process.argv.includes('--demo')
const dataDir = process.env.WANGFENG_DATA_DIR || (demo ? '.demo-data' : '')
const today = process.env.WANGFENG_TODAY || (demo ? '2026-10-24' : undefined)
const root = dataRoot({ dataDir })
const pageFile = fileURLToPath(new URL('../web/index.html', import.meta.url))
const port = Number(process.env.PORT) || 5098

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')
  try {
    if (url.pathname === '/dsh-wangfeng/api/snapshot' || url.pathname === '/api/snapshot') {
      const days = Math.max(1, Math.min(400, Number(url.searchParams.get('days')) || 120))
      const body = JSON.stringify(buildSnapshot(root, { days, today }))
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      res.end(body)
      return
    }
    if (url.pathname === '/' || url.pathname === '/dsh-wangfeng' || url.pathname === '/dsh-wangfeng/') {
      const html = await readFile(pageFile, 'utf8')
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
      res.end(html)
      return
    }
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('not found')
  } catch (error) {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
    res.end(String((error && error.stack) || error))
  }
})

server.listen(port, '127.0.0.1', () => {
  console.log(`望峰预览： http://127.0.0.1:${port}/`)
  console.log(`数据目录： ${root}${demo ? '（示例数据）' : ''}`)
})
