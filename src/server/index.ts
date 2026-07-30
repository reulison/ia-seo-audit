import http from 'http'
import url from 'url'
import { loadReport } from '../persist.js'
import { generateArticleTopics } from '../deepseek/client.js'
import { fetchRelatedKeywords } from '../kwrds/client.js'

interface ServerOptions {
  port: number
  html: string
  host?: string
}

export function startServer(options: ServerOptions): Promise<http.Server> {
  return new Promise((resolve) => {
    const { port, html, host = '0.0.0.0' } = options

    const server = http.createServer(async (req, res) => {
      const parsed = url.parse(req.url || '', true)
      const pathname = parsed.pathname

      if (pathname === '/' || pathname === '/dashboard') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(html)
        return
      }

      if (pathname === '/api/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }))
        return
      }

      if (pathname === '/api/report') {
        const report = loadReport()
        if (report) {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(report))
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'No saved report found' }))
        }
        return
      }

      if (pathname === '/api/related-keywords' && req.method === 'POST') {
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          try {
            const { query } = JSON.parse(body)
            const keywords = await fetchRelatedKeywords(query || '')
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ keywords }))
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ keywords: [], error: msg }))
          }
        })
        return
      }

      if (pathname === '/api/topics' && req.method === 'POST') {
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          try {
            const result = await generateArticleTopics(body)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: true, result }))
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, error: msg }))
          }
        })
        return
      }

      res.writeHead(404)
      res.end('Not found')
    })

    server.listen(port, host, () => {
      resolve(server)
    })
  })
}

export function printServerInfo(port: number): void {
  console.log('')
  console.log('  ╔══════════════════════════════════════════════╗')
  console.log('  ║         SEO Audit Dashboard                  ║')
  console.log('  ╠══════════════════════════════════════════════╣')
  console.log(`  ║  Local:   http://localhost:${port.toString().padEnd(27)}║`)
  console.log(`  ║  Network: http://0.0.0.0:${port.toString().padEnd(25)}║`)
  console.log('  ╠══════════════════════════════════════════════╣')
  console.log('  ║  Pressione Ctrl+C para encerrar             ║')
  console.log('  ╚══════════════════════════════════════════════╝')
  console.log('')
}
