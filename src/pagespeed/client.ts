import { config } from '../config.js'

export interface PageSpeedResult {
  url: string
  strategy: 'mobile' | 'desktop'
  scores: {
    performance: number
    accessibility: number
    'best-practices': number
    seo: number
  }
  metrics: {
    lcpMs: number
    fidMs: number
    cls: number
    tbtMs: number
    siMs: number
  }
  opportunities: { title: string; description: string; impact: string }[]
}

export async function runPageSpeed(
  url: string,
  strategy: 'mobile' | 'desktop' = 'mobile'
): Promise<PageSpeedResult | null> {
  if (!config.pagespeed.apiKey) return null

  const params = new URLSearchParams({ url, key: config.pagespeed.apiKey, strategy })
  for (const cat of ['PERFORMANCE', 'ACCESSIBILITY', 'BEST_PRACTICES', 'SEO']) {
    params.append('category', cat)
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`, {
        signal: AbortSignal.timeout(60000),
      })

      if (res.ok) {
        const data = await res.json()
        const lighthouse = data.lighthouseResult

        if (!lighthouse) return null

        const categories = lighthouse.categories || {}
        const audits = lighthouse.audits || {}

        return {
          url,
          strategy,
          scores: {
            performance: Math.round((categories.performance?.score ?? 0) * 100),
            accessibility: Math.round((categories.accessibility?.score ?? 0) * 100),
            'best-practices': Math.round((categories['best-practices']?.score ?? 0) * 100),
            seo: Math.round((categories.seo?.score ?? 0) * 100),
          },
          metrics: {
            lcpMs: audits['largest-contentful-paint']?.numericValue ?? 0,
            fidMs: audits['max-potential-fid']?.numericValue ?? 0,
            cls: audits['cumulative-layout-shift']?.numericValue ?? 0,
            tbtMs: audits['total-blocking-time']?.numericValue ?? 0,
            siMs: audits['speed-index']?.numericValue ?? 0,
          },
          opportunities: Object.values(lighthouse.audits || {})
            .filter((a: any) => a.details?.type === 'opportunity' && a.score !== 1)
            .slice(0, 10)
            .map((a: any) => ({
              title: a.title || '',
              description: a.description || '',
              impact: a.details?.overallSavingsMs ? `${Math.round(a.details.overallSavingsMs / 1000)}s` : '',
            })),
        }
      }

      if (res.status === 500 && attempt < 2) {
        const delay = (attempt + 1) * 2000
        console.error(`  PageSpeed API error (500) — retrying in ${delay / 1000}s...`)
        await new Promise((r) => setTimeout(r, delay))
        continue
      }

      const text = await res.text()
      console.error(`  PageSpeed API error (${res.status}): ${text.slice(0, 200)}`)
      return null
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (attempt < 2 && (msg.includes('timeout') || msg.includes('500'))) {
        const delay = (attempt + 1) * 2000
        console.error(`  PageSpeed API ${msg.includes('timeout') ? 'timeout' : 'error'} — retrying in ${delay / 1000}s...`)
        await new Promise((r) => setTimeout(r, delay))
        continue
      }
      if (msg.includes('timeout')) {
        console.error(`  PageSpeed API timeout for ${url}`)
      } else {
        console.error(`  PageSpeed API error: ${msg.slice(0, 200)}`)
      }
      return null
    }
  }
  return null
}

export function formatPageSpeedSummary(results: PageSpeedResult[]): string {
  const lines: string[] = ['Lighthouse (PageSpeed Insights):']

  for (const r of results) {
    lines.push(`  [${r.strategy}] ${r.url}`)
    lines.push(`    Performance: ${r.scores.performance}`)
    lines.push(`    Accessibility: ${r.scores.accessibility}`)
    lines.push(`    Best Practices: ${r.scores['best-practices']}`)
    lines.push(`    SEO: ${r.scores.seo}`)
    lines.push(`    LCP: ${(r.metrics.lcpMs / 1000).toFixed(1)}s | TBT: ${r.metrics.tbtMs}ms | CLS: ${r.metrics.cls.toFixed(2)}`)
    if (r.opportunities.length) {
      lines.push(`    Top opportunities: ${r.opportunities.slice(0, 3).map((o) => o.title).join(', ')}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}
