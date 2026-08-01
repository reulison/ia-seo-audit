import http from 'http'
import url from 'url'
import { config } from '../config.js'
import { loadReport } from '../persist.js'
import { generateArticleTopics, parseTopicsJson } from '../deepseek/client.js'
import { fetchRelatedKeywords, fetchLlmMentions } from '../kwrds/client.js'

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

      if (pathname === '/api/llm-mentions' && req.method === 'POST') {
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          try {
            const { keyword } = JSON.parse(body)
            const report = loadReport()
            let domain = ''
            if (report?.url) {
              try {
                domain = new URL(report.url).hostname.replace(/^www\./, '')
              } catch {
                // keep domain empty
              }
            }
            const kw = (typeof keyword === 'string' && keyword.trim()) || config.dataforseo.llmMentions.keyword
            const result = await fetchLlmMentions(domain, kw)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(result))
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ domain: '', keyword: '', totalCount: 0, mentions: [], error: msg }))
          }
        })
        return
      }

      if (pathname === '/api/topics' && req.method === 'POST') {
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          try {
            const { keywords } = JSON.parse(body)
            if (!keywords || !keywords.length) {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: false, error: 'Nenhuma keyword fornecida.' }))
              return
            }

            // Enrich each keyword with Related Keywords API
            const relatedMap = new Map<string, string[]>()
            for (const kw of keywords.slice(0, config.dataforseo.maxQueries)) {
              const related = await fetchRelatedKeywords(kw)
              relatedMap.set(kw, related.map((s) => `${s.keyword} (vol:${s.volume}, cpc:${s.cpc}, intent:${s.searchIntent}, comp:${s.competitionValue})`))
            }

            const enrichedData = JSON.stringify([...relatedMap.entries()].map(([kw, sugs]) => ({ keyword: kw, suggestions: sugs })))
            const raw = await generateArticleTopics(enrichedData)
            const topics = parseTopicsJson(raw)

            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: true, topics }))
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
