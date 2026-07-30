import http from 'http'
import url from 'url'
import { loadReport } from '../persist.js'

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
