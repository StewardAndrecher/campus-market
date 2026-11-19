import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { createServer as createTcpServer } from 'node:net'
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const directory = path.dirname(fileURLToPath(import.meta.url))
const h5Root = path.resolve(directory, '../unpackage/verified/h5')
const reportDirectory = path.join(directory, 'test-results')
const results = []
const startedAt = new Date().toISOString()

function uniqueName(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`.toLowerCase()
}

async function freePort() {
  const server = createTcpServer()
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject))
  const { port } = server.address()
  await new Promise(resolve => server.close(resolve))
  return port
}

function contentType(file) {
  return ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' })[path.extname(file)] || 'application/octet-stream'
}

async function serveH5(port) {
  if (!existsSync(path.join(h5Root, 'index.html'))) throw new Error('缺少 H5 构建，请先运行 sh tools/build.sh h5')
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
      let file = path.resolve(h5Root, `.${pathname}`)
      if (file !== h5Root && !file.startsWith(`${h5Root}${path.sep}`)) {
        response.writeHead(403).end('Forbidden')
        return
      }
      if (pathname.endsWith('/')) file = path.join(file, 'index.html')
      const body = await readFile(file)
      response.writeHead(200, { 'Content-Type': contentType(file), 'Cache-Control': 'no-store' })
      response.end(body)
    } catch {
      response.writeHead(404).end('Not found')
    }
  })
  await new Promise((resolve, reject) => server.listen(port, '127.0.0.1', resolve).once('error', reject))
  return server
}

async function findChrome() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ]
  const cache = path.join(homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(cache)) {
    for (const name of await readdir(cache)) {
      if (name.startsWith('chromium_headless_shell-')) candidates.push(path.join(cache, name, 'chrome-headless-shell-mac-arm64/chrome-headless-shell'))
      if (name.startsWith('chromium-')) candidates.push(path.join(cache, name, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'))
    }
  }
  const executable = candidates.find(existsSync)
  if (!executable) throw new Error('未找到 Chromium；请设置 CHROME_BIN 为浏览器可执行文件')
  return executable
}

async function waitFor(check, label, timeout = 15_000) {
  const deadline = Date.now() + timeout
  let last
  while (Date.now() < deadline) {
    last = await check()
    if (last) return last
    await new Promise(resolve => setTimeout(resolve, 150))
  }
  throw new Error(`等待超时：${label}；最后结果：${JSON.stringify(last)}`)
}

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url)
    this.nextId = 0
    this.pending = new Map()
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true })
      this.ws.addEventListener('error', reject, { once: true })
    })
    this.ws.addEventListener('message', event => {
      const message = JSON.parse(event.data)
      if (!message.id) return
      const pending = this.pending.get(message.id)
      if (!pending) return
      this.pending.delete(message.id)
      if (message.error) pending.reject(new Error(JSON.stringify(message.error)))
      else pending.resolve(message.result)
    })
  }

  send(method, params = {}) {
    const id = ++this.nextId
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  async evaluate(expression) {
    const response = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text || '页面脚本执行失败')
    return response.result.value
  }

  async navigate(url) {
    await this.send('Page.navigate', { url })
    await waitFor(() => this.evaluate('document.readyState === "complete"'), `加载 ${url}`)
  }

  async waitText(text) {
    await waitFor(() => this.evaluate(`document.body && document.body.innerText.includes(${JSON.stringify(text)})`), `显示文本 ${text}`)
  }

  async fill(placeholder, value) {
    const expression = `(() => {
      const fields = [...document.querySelectorAll('input, textarea')]
      const field = fields.find(e => {
        if ((e.placeholder || '').trim() === ${JSON.stringify(placeholder)}) return true
        const wrapper = e.closest('.uni-input-wrapper, .uni-textarea-wrapper')
        return wrapper && wrapper.innerText.includes(${JSON.stringify(placeholder)})
      })
      if (!field) return false
      const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(field, ${JSON.stringify(value)})
      field.dispatchEvent(new Event('input', { bubbles: true }))
      field.dispatchEvent(new Event('change', { bubbles: true }))
      return true
    })()`
    assert.equal(await this.evaluate(expression), true, `找不到输入框：${placeholder}`)
  }

  async click(label) {
    const expression = `(() => {
      const rank = e => e.matches('button') ? 0 : e.matches('uni-button, [role="button"]') ? 1 : 2
      let matches = [...document.querySelectorAll('button, uni-button, [role="button"], .button, .btn')]
        .filter(e => e.textContent.trim() === ${JSON.stringify(label)} && e.getClientRects().length && !e.disabled)
        .sort((a, b) => rank(a) - rank(b))
      let target = matches[0]
      if (!target) return false
      if (target.matches('.button, .btn') && !target.matches('button, uni-button, [role="button"]')) {
        target = target.querySelector('button, uni-button, [role="button"], [tabindex]') || target
      }
      target.click()
      return true
    })()`
    assert.equal(await this.evaluate(expression), true, `找不到可点击按钮：${label}`)
  }

  close() {
    this.ws.close()
  }
}

let browser
let server
let cdp
let profile
try {
  const h5Port = await freePort()
  const debugPort = await freePort()
  server = await serveH5(h5Port)
  const executable = await findChrome()
  profile = path.join(tmpdir(), `campus-market-e2e-${process.pid}`)
  browser = spawn(executable, [
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-gpu',
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--window-size=1440,1000', 'about:blank'
  ], { stdio: 'ignore' })
  const version = await waitFor(async () => {
    try { return await (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).json() } catch { return null }
  }, 'Chromium 调试端口')
  const target = await waitFor(async () => {
    const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()
    return targets.find(item => item.type === 'page')
  }, 'Chromium 页面')
  cdp = new Cdp(target.webSocketDebuggerUrl)
  await cdp.open()
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  const base = `http://127.0.0.1:${h5Port}`

  await cdp.navigate(`${base}/#/pages/index/index`)
  await cdp.waitText('发现校园好物')
  assert.equal(await cdp.evaluate(`document.body.innerText.includes('搜索教材、数码、宿舍好物')`), true)
  results.push({ name: '首页渲染真实 H5 商品目录', status: 'passed' })

  const username = uniqueName('e2e')
  const nickname = `浏览器验收${username.slice(-5)}`
  const title = `E2E 教材 ${username.slice(-5)}`
  const password = 'CampusE2E2026!'
  await cdp.navigate(`${base}/#/pages/user/register`)
  await cdp.waitText('创建校园集市账号')
  await cdp.fill('4～32位小写字母、数字或下划线', username)
  await cdp.fill('1～30个字符，可以使用中文', nickname)
  await cdp.fill('8～64个字符', password)
  await cdp.fill('再次输入密码', password)
  await cdp.click('注册账号')
  await cdp.waitText('注册成功')
  await cdp.click('去登录')
  await cdp.waitText('登录校园集市')
  await cdp.fill('填写密码', password)
  await cdp.click('登录')
  await cdp.waitText('发现校园好物')
  await cdp.waitText(nickname)
  await cdp.click('发布闲置')
  await cdp.waitText('发布商品')
  await cdp.fill('2～50个字符，例如：闲置台灯', title)
  await cdp.fill('成色、使用情况、交接地点，可不填', '本机隔离环境浏览器验收数据')
  await cdp.fill('例如：35.50', '35.50')
  await waitFor(() => cdp.evaluate(`[...document.querySelectorAll('button, uni-button, [role="button"], .button, .btn')].some(e => e.textContent.trim() === '发布商品' && !e.disabled)`), '发布按钮可用')
  await cdp.click('发布商品')
  await cdp.waitText(title)
  results.push({ name: '注册、登录并发布一件商品', status: 'passed', username, title })

  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await cdp.navigate(`${base}/#/pages/index/index?e2e=mobile`)
  await cdp.send('Page.reload', { ignoreCache: true })
  await cdp.waitText('发现校园好物')
  assert.equal(await cdp.evaluate('document.documentElement.scrollWidth > document.documentElement.clientWidth'), false, '移动布局存在横向溢出')
  results.push({ name: '390px 移动视口首页可达且无横向溢出', status: 'passed' })
  console.log(JSON.stringify({ status: 'passed', browser: version.Browser, results }, null, 2))
} catch (error) {
  results.push({ name: '执行中断', status: 'failed', error: error.message })
  if (cdp) {
    try {
      await mkdir(reportDirectory, { recursive: true })
      const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' })
      await writeFile(path.join(reportDirectory, 'failure.png'), Buffer.from(screenshot.data, 'base64'))
      await writeFile(path.join(reportDirectory, 'page.txt'), String(await cdp.evaluate('document.body ? document.body.innerText : ""')))
      const controls = await cdp.evaluate(`(() => [...document.querySelectorAll('button, uni-button, [role="button"], .button, .btn')]
        .filter(e => e.textContent.trim().includes('发布商品'))
        .map(e => ({ tag: e.tagName, className: String(e.className), text: e.textContent.trim(), disabled: e.disabled, html: e.outerHTML.slice(0, 300), rect: e.getBoundingClientRect().toJSON() })) )()`)
      await writeFile(path.join(reportDirectory, 'controls.json'), JSON.stringify(controls, null, 2))
    } catch {}
  }
  console.error(error.stack || error)
  process.exitCode = 1
} finally {
  await mkdir(reportDirectory, { recursive: true })
  await writeFile(path.join(reportDirectory, 'summary.json'), JSON.stringify({ startedAt, finishedAt: new Date().toISOString(), status: process.exitCode ? 'failed' : 'passed', results }, null, 2))
  if (cdp) cdp.close()
  if (browser) {
    browser.kill('SIGTERM')
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  if (server) await new Promise(resolve => server.close(resolve))
  if (profile) await rm(profile, { recursive: true, force: true })
}
