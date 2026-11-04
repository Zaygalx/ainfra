import { chromium } from '/root/earn-ops/video-tools/node_modules/playwright/index.mjs'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const root = '/root/earn-ops/projects/integral-index/page'
const server = http.createServer((req, res) => {
  const f = path.join(root, req.url === '/' ? 'index.html' : req.url.split('?')[0])
  try {
    const b = fs.readFileSync(f)
    res.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.png') ? 'image/png' : 'text/html' })
    res.end(b)
  } catch { res.writeHead(404); res.end('no') }
})
await new Promise(r => server.listen(8899, r))

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 420, height: 900 } })
page.on('console', m => console.log('console:', m.type(), m.text()))
page.on('pageerror', e => console.log('pageerror:', e.message))
await page.addInitScript(() => {
  const addr = '0x000000000000000000000000000000000000dEaD'
  window.__txs = []
  window.ethereum = {
    isMetaMask: true,
    async request({ method, params }) {
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [addr]
      if (method === 'eth_chainId') return '0x1237'
      if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain') return null
      if (method === 'eth_sendTransaction') { window.__txs.push(params[0]); throw new Error('stub: not sending') }
      throw new Error('stub method ' + method)
    },
    on() {}, removeListener() {},
  }
})
await page.goto('http://127.0.0.1:8899/', { waitUntil: 'networkidle' })
await page.click('#connect')
await page.waitForTimeout(4000)
console.log('addr:', await page.textContent('#addr'))
console.log('fee:', await page.textContent('#fee'))
console.log('token:', await page.textContent('#token'))
console.log('log:', await page.textContent('#log'))
await page.click('#go')
await page.waitForTimeout(2500)
console.log('log2:', await page.textContent('#log'))
const txs = await page.evaluate(() => window.__txs)
console.log('captured', txs.length)
if (txs[0]) {
  fs.writeFileSync('/tmp/captured_tx.json', JSON.stringify(txs[0], null, 2))
  console.log(txs[0].to, txs[0].value, txs[0].data?.slice(0, 80), (txs[0].data || '').length)
}
await page.screenshot({ path: '/tmp/ainfra_page.png', fullPage: true })
await browser.close(); server.close()
