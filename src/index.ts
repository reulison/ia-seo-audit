#!/usr/bin/env node

import 'dotenv/config'
import { Command } from 'commander'
import chalk from 'chalk'
import { crawlSite } from './crawler/index.js'
import { runOnPageChecks, calculateScore, prioritizeFindings } from './audit/checks.js'
import {
  analyzeSEO,
  fullAuditAnalysis,
  generateFix,
  suggestImprovements,
} from './deepseek/client.js'
import { fetchGscData, formatGscSummary } from './gsc/client.js'
import { runPageSpeed, formatPageSpeedSummary } from './pagespeed/client.js'
import { formatReportMarkdown } from './utils/index.js'
import { generateDashboard } from './server/dashboard.js'
import { startServer, printServerInfo } from './server/index.js'
import { AuditFinding, AuditReport } from './types.js'
import { enrichGscWithSearchVolume, fetchMultipleRelatedKeywords } from './kwrds/client.js'
import { config } from './config.js'
import { saveReport, loadReport } from './persist.js'

const program = new Command()

program
  .name('seo-audit')
  .description('Technical SEO audit powered by DeepSeek API')
  .version('0.1.0')

program
  .command('audit')
  .description('Run a full SEO audit on a website')
  .argument('<url>', 'Website URL to audit')
  .option('-p, --max-pages <number>', 'Maximum pages to crawl', String(config.crawl.maxPages))
  .option('-o, --output <file>', 'Save report to file')
  .option('--html', 'Generate HTML report output')
  .option('-s, --serve', 'Start local server with dashboard after audit')
  .option('--port <number>', 'Port for dashboard server', '3456')
  .option('--sitemap', 'Start crawling from sitemap.xml instead of homepage links')
  .action(async (url: string, options) => {
    const maxPages = parseInt(options.maxPages, 10)

    console.log(chalk.cyan(`\n🔍 Starting SEO audit for: ${url}`))
    console.log(chalk.gray(`Max pages: ${maxPages}\n`))

    console.log(chalk.yellow('Step 1/3: Crawling site...'))
    const { pages, errors } = await crawlSite({
      url,
      maxPages,
      fromSitemap: options.sitemap || false,
    })

    console.log(chalk.green(`✓ Crawled ${pages.length} pages (${errors.length} errors)`))

    console.log(chalk.yellow('\nStep 2/3: Running audit checks...'))
    const findings = runOnPageChecks(pages)
    const prioritized = prioritizeFindings(findings)
    const score = calculateScore(findings)

    const critical = findings.filter((f) => f.severity === 'critical').length
    const high = findings.filter((f) => f.severity === 'high').length
    const medium = findings.filter((f) => f.severity === 'medium').length
    const low = findings.filter((f) => f.severity === 'low').length

    console.log(chalk.green(`✓ ${findings.length} total findings`))
    console.log(`  ${chalk.red(`${critical} critical`)} · ${chalk.yellow(`${high} high`)} · ${chalk.hex('#f7c948')(`${medium} medium`)} · ${chalk.green(`${low} low`)}`)
    console.log(chalk.cyan(`  SEO Score: ${score}/100`))

    console.log(chalk.yellow('\nStep 3/3: Analyzing with DeepSeek...'))
    console.log(chalk.gray('  This may take a moment...'))

    const crawlSummary = pages
      .map(
        (p) =>
          `${p.url} | ${p.statusCode} | title:${p.title.slice(0, 60)} | h1:${(p.h1 || '').slice(0, 40)} | ${p.contentLength}bytes | ${p.loadTimeMs}ms | noindex:${p.noindex}`
      )
      .join('\n')

    let gscSummary = ''
    let gscData: Awaited<ReturnType<typeof fetchGscData>> = null
    if (config.gsc.credentials) {
      console.log(chalk.gray('  Fetching Google Search Console data...'))
      gscData = await fetchGscData(url)
      if (gscData) {
        gscSummary = formatGscSummary(gscData)
        console.log(chalk.green(`  ✓ GSC: ${gscData.totalClicks.toLocaleString()} clicks, ${gscData.totalImpressions.toLocaleString()} impressions`))
      } else {
        console.log(chalk.yellow('  ⚠ GSC data unavailable — check credentials and site verification'))
      }
    }

    let kwrdsData: AuditReport['kwrds'] = undefined
    let dataforseoData: AuditReport['dataforseo'] = undefined

    if (config.dataforseo.login && config.dataforseo.password && gscData) {
      console.log(chalk.gray('  Fetching search volume from DataForSEO...'))
      kwrdsData = await enrichGscWithSearchVolume(gscData)
      if (kwrdsData?.length) {
        const total = kwrdsData.reduce((s, q) => s + q.keywords.length, 0)
        console.log(chalk.green(`  ✓ ${total} search volume results for ${kwrdsData.length} GSC queries`))
      }

      console.log(chalk.gray('  Fetching related keywords from DataForSEO...'))
      const queryTexts = gscData.topQueries.slice(0, config.dataforseo.maxQueries).map((q) => q.query)
      dataforseoData = await fetchMultipleRelatedKeywords(queryTexts)
      if (dataforseoData?.length) {
        const total = dataforseoData.reduce((s, r) => s + r.keywords.length, 0)
        console.log(chalk.green(`  ✓ ${total} related keywords for ${dataforseoData.length} queries`))
      }
    }

    let pagespeedSummary = ''
    let pagespeedScores: { mobile: { performance: number; accessibility: number; 'best-practices': number; seo: number }; desktop: { performance: number; accessibility: number; 'best-practices': number; seo: number } } | undefined
    if (config.pagespeed.apiKey) {
      console.log(chalk.gray('  Running PageSpeed Insights (mobile)...'))
      const psMobile = await runPageSpeed(url, 'mobile')
      if (psMobile) {
        const psDesktop = await runPageSpeed(url, 'desktop')
        const results = [psMobile, psDesktop].filter(Boolean) as NonNullable<typeof psMobile>[]
        pagespeedSummary = formatPageSpeedSummary(results)

        pagespeedScores = { mobile: psMobile.scores, desktop: (psDesktop || psMobile).scores }

        const perf = psMobile.scores.performance
        const a11y = psMobile.scores.accessibility
        const bp = psMobile.scores['best-practices']
        const seo = psMobile.scores.seo
        console.log(chalk.green(`  ✓ PageSpeed: P${perf} A${a11y} BP${bp} SEO${seo} (mobile)`))

        const psFindings: AuditFinding[] = []

        if (perf < 90) {
          psFindings.push({
            id: `pagespeed-performance-${Date.now()}`,
            severity: perf < 50 ? 'high' : perf < 70 ? 'medium' : 'low',
            category: 'Performance',
            title: `Lighthouse Performance score: ${perf}/100`,
            description: `A página inicial tem pontuação de Performance ${perf}/100 no PageSpeed Insights (mobile).`,
            evidence: url,
            recommendation: psMobile.opportunities.length
              ? `Principais oportunidades: ${psMobile.opportunities.map((o) => o.title).join('; ')}`
              : 'Otimize imagens, reduza JavaScript não utilizado e melhore o tempo de resposta do servidor.',
            url,
          })
        }

        if (a11y < 90) {
          psFindings.push({
            id: `pagespeed-a11y-${Date.now()}`,
            severity: a11y < 70 ? 'medium' : 'low',
            category: 'Accessibility',
            title: `Lighthouse Accessibility score: ${a11y}/100`,
            description: `A página inicial tem pontuação de Acessibilidade ${a11y}/100 no PageSpeed Insights (mobile).`,
            evidence: url,
            recommendation: 'Adicione atributos alt às imagens, contraste de cores adequado e roles ARIA corretos.',
            url,
          })
        }

        if (seo < 90) {
          psFindings.push({
            id: `pagespeed-seo-${Date.now()}`,
            severity: seo < 70 ? 'high' : 'medium',
            category: 'SEO',
            title: `Lighthouse SEO score: ${seo}/100`,
            description: `A página inicial tem pontuação SEO ${seo}/100 no PageSpeed Insights (mobile).`,
            evidence: url,
            recommendation: 'Verifique meta tags, heading structure e links quebrados.',
            url,
          })
        }

        if (bp < 90) {
          psFindings.push({
            id: `pagespeed-bp-${Date.now()}`,
            severity: bp < 70 ? 'medium' : 'low',
            category: 'Best Practices',
            title: `Lighthouse Best Practices score: ${bp}/100`,
            description: `A página inicial tem pontuação de Boas Práticas ${bp}/100 no PageSpeed Insights (mobile).`,
            evidence: url,
            recommendation: 'Verifique dependências com vulnerabilidades, uso de HTTPS e práticas modernas de desenvolvimento.',
            url,
          })
        }

        prioritized.push(...psFindings)
      } else {
        console.log(chalk.yellow('  ⚠ PageSpeed API error'))
      }
    }

    let analysis = ''

    try {
      if (!config.deepseek.apiKey) {
        console.log(chalk.red('\n⚠ DEEPSEEK_API_KEY not set. Skipping DeepSeek analysis.'))
        console.log(chalk.gray('  Set it in .env or as an environment variable to enable AI analysis.\n'))
        analysis = '*DeepSeek analysis not available - DEEPSEEK_API_KEY not configured.*'
      } else {
        const enhancedCrawlData = crawlSummary + (pagespeedSummary ? `\n\nPAGESPEED DATA:\n${pagespeedSummary}` : '')
        analysis = await fullAuditAnalysis(enhancedCrawlData, gscSummary)
        console.log(chalk.green('✓ DeepSeek analysis complete'))
      }
    } catch (err) {
      console.log(chalk.red(`\n⚠ DeepSeek analysis failed: ${err}`))
      analysis = `*DeepSeek analysis failed: ${err}*`
    }

    const auditReport: AuditReport = {
      url,
      timestamp: new Date().toISOString(),
      summary: {
        totalPages: pages.length,
        criticalIssues: critical,
        highIssues: high,
        mediumIssues: medium,
        lowIssues: low,
        overallScore: score,
      },
      findings: prioritized,
      deepseekAnalysis: analysis,
      pagespeed: pagespeedScores,
      kwrds: kwrdsData,
      dataforseo: dataforseoData,
    }

    const savedPath = saveReport(auditReport)
    console.log(chalk.gray(`  Report saved to ${savedPath}`))

    const report = formatReportMarkdown(url, pages.length, prioritized, score, analysis)

    if (options.output) {
      const fs = await import('fs/promises')
      if (options.html) {
        const html = await generateHtml(report)
        await fs.writeFile(options.output, html, 'utf-8')
        console.log(chalk.green(`\n✓ HTML report saved to: ${options.output}`))
      } else {
        await fs.writeFile(options.output, report, 'utf-8')
        console.log(chalk.green(`\n✓ Report saved to: ${options.output}`))
      }
    } else {
      console.log(chalk.cyan('\n═══════════════════════════════════════'))
      console.log(chalk.bold('              AUDIT REPORT'))
      console.log(chalk.cyan('═══════════════════════════════════════\n'))

      console.log(chalk.bold('Summary:'))
      console.log(`  Pages crawled: ${pages.length}`)
      console.log(`  SEO Score: ${chalk.cyan(`${score}/100`)}`)
      console.log(`  Critical: ${chalk.red(critical)}`)
      console.log(`  High: ${chalk.yellow(high)}`)
      console.log(`  Medium: ${medium}`)
      console.log(`  Low: ${chalk.green(low)}`)

      console.log(chalk.cyan('\n--- Prioritized Findings ---\n'))
      for (const f of prioritized.slice(0, 20)) {
        const color =
          f.severity === 'critical'
            ? chalk.red
            : f.severity === 'high'
              ? chalk.yellow
              : f.severity === 'medium'
                ? chalk.hex('#f7c948')
                : chalk.green
        console.log(color(`[${f.severity.toUpperCase()}] `) + chalk.bold(f.title))
        console.log(`  URL: ${chalk.gray(f.url)}`)
        console.log(`  ${f.recommendation}`)
        console.log()
      }

      if (prioritized.length > 20) {
        console.log(chalk.gray(`... and ${prioritized.length - 20} more findings`))
      }
    }

    if (options.serve) {
      const port = parseInt(options.port, 10)
      const dashboardHtml = generateDashboard(auditReport)
      const server = await startServer({ port, html: dashboardHtml })
      printServerInfo(port)
    }
  })

program
  .command('analyze')
  .description('Analyze a single page with DeepSeek')
  .argument('<url>', 'Page URL to analyze')
  .action(async (url: string) => {
    if (!config.deepseek.apiKey) {
      console.log(chalk.red('DEEPSEEK_API_KEY not set. Add it to .env'))
      process.exit(1)
    }

    console.log(chalk.cyan(`Analyzing ${url}...`))
    const { pages } = await crawlSite({ url, maxPages: 1 })

    if (pages.length === 0) {
      console.log(chalk.red('Failed to fetch page'))
      process.exit(1)
    }

    const page = pages[0]
    const missingAlt = page.images.filter((img) => !img.alt)

    const analysis = await analyzeSEO({
      url: page.url,
      title: page.title,
      metaDescription: page.metaDescription,
      h1: page.h1,
      headings: page.headings,
      contentLength: page.contentLength,
      loadTimeMs: page.loadTimeMs,
      linksCount: page.links.length,
      imagesWithoutAlt: missingAlt.length,
      hasStructuredData: page.structuredData.length > 0,
      statusCode: page.statusCode,
      noindex: page.noindex,
      canonical: page.canonical,
    })

    console.log(chalk.cyan('\n--- DeepSeek Page Analysis ---\n'))
    console.log(analysis)
  })

program
  .command('crawl')
  .description('Crawl a site and output JSON')
  .argument('<url>', 'Website URL to crawl')
  .option('-p, --max-pages <number>', 'Maximum pages', String(config.crawl.maxPages))
  .option('-o, --output <file>', 'Save output to JSON file')
  .option('--sitemap', 'Start crawling from sitemap.xml instead of homepage links')
  .action(async (url: string, options) => {
    const maxPages = parseInt(options.maxPages, 10)

    console.log(chalk.cyan(`Crawling ${url} (max ${maxPages} pages)...`))
    const { pages, errors } = await crawlSite({ url, maxPages, fromSitemap: options.sitemap || false })
    console.log(chalk.green(`Crawled ${pages.length} pages, ${errors.length} errors`))

    const output = JSON.stringify({ url, pages, errors }, null, 2)

    if (options.output) {
      const fs = await import('fs/promises')
      await fs.writeFile(options.output, output, 'utf-8')
      console.log(chalk.green(`Saved to ${options.output}`))
    } else {
      console.log(output)
    }
  })

program
  .command('fix')
  .description('Generate a fix for a specific SEO issue')
  .argument('<issue>', 'Description of the SEO issue')
  .option('-u, --url <url>', 'URL of the affected page')
  .action(async (issue: string, options) => {
    if (!config.deepseek.apiKey) {
      console.log(chalk.red('DEEPSEEK_API_KEY not set. Add it to .env'))
      process.exit(1)
    }

    console.log(chalk.cyan(`Generating fix for: ${issue}`))
    const fix = await generateFix(issue, options.url || 'unknown')
    console.log(chalk.cyan('\n--- Suggested Fix ---\n'))
    console.log(fix)
  })

program
  .command('suggest')
  .description('Get SEO improvement suggestions for a page')
  .argument('<url>', 'Page URL to analyze')
  .action(async (url: string) => {
    if (!config.deepseek.apiKey) {
      console.log(chalk.red('DEEPSEEK_API_KEY not set. Add it to .env'))
      process.exit(1)
    }

    console.log(chalk.cyan(`Fetching ${url}...`))
    const { pages } = await crawlSite({ url, maxPages: 1 })

    if (pages.length === 0) {
      console.log(chalk.red('Failed to fetch page'))
      process.exit(1)
    }

    console.log(chalk.cyan('Getting DeepSeek suggestions...'))
    const suggestions = await suggestImprovements(url, pages[0].content)
    console.log(chalk.cyan('\n--- Improvement Suggestions ---\n'))
    console.log(suggestions)
  })

program
  .command('serve')
  .description('Serve the last audit dashboard (or load from file)')
  .argument('[file]', 'Path to audit report JSON (uses last saved report if omitted)')
  .option('--port <number>', 'Server port', '3456')
  .action(async (file: string | undefined, options) => {
    const port = parseInt(options.port, 10)

    let report: AuditReport

    if (file) {
      const fs = await import('fs/promises')
      const content = await fs.readFile(file, 'utf-8')
      report = JSON.parse(content) as AuditReport
      console.log(chalk.green(`\n✓ Report loaded from: ${file}`))
    } else {
      const saved = loadReport()
      if (!saved) {
        console.log(chalk.red('\n⚠ No saved report found.'))
        console.log(chalk.yellow('  Run an audit first:'))
        console.log(chalk.cyan('  npx tsx src/index.ts audit <url> --serve\n'))
        process.exit(1)
      }
      report = saved
      console.log(chalk.green(`\n✓ Last audit loaded (${new URL(report.url).hostname}, ${report.summary.totalPages} pages)`))
    }

    const dashboardHtml = generateDashboard(report)
    const server = await startServer({ port, html: dashboardHtml })
    printServerInfo(port)
  })

program
  .command('watch')
  .description('Crawl + audit + serve dashboard continuously')
  .argument('<url>', 'Website URL to monitor')
  .option('-p, --max-pages <number>', 'Maximum pages to crawl', String(config.crawl.maxPages))
  .option('--port <number>', 'Dashboard port', '3456')
  .option('--interval <minutes>', 'Re-audit interval in minutes', '0')
  .option('--sitemap', 'Start crawling from sitemap.xml instead of homepage links')
  .action(async (url: string, options) => {
    const maxPages = parseInt(options.maxPages, 10)
    const port = parseInt(options.port, 10)
    const intervalMin = parseInt(options.interval, 10)

    async function runAuditAndServe() {
      console.log(chalk.cyan(`\n🔍 Auditing ${url}...`))
      const { pages } = await crawlSite({ url, maxPages, fromSitemap: options.sitemap || false })
      const findings = runOnPageChecks(pages)
      const prioritized = prioritizeFindings(findings)
      const score = calculateScore(findings)

      const crawlSummary = pages.map(p => `${p.url} | ${p.statusCode}`).join('\n')

      let gscSummary = ''
      let gscData: Awaited<ReturnType<typeof fetchGscData>> = null
      if (config.gsc.credentials) {
        gscData = await fetchGscData(url)
        if (gscData) gscSummary = formatGscSummary(gscData)
      }

      let kwrdsData: AuditReport['kwrds'] = undefined
      let dataforseoData: AuditReport['dataforseo'] = undefined

      if (config.dataforseo.login && config.dataforseo.password && gscData) {
        kwrdsData = await enrichGscWithSearchVolume(gscData)
        const queryTexts = gscData.topQueries.slice(0, config.dataforseo.maxQueries).map((q) => q.query)
        dataforseoData = await fetchMultipleRelatedKeywords(queryTexts)
      }

      let pagespeedSummary = ''
      let pagespeedScores: { mobile: { performance: number; accessibility: number; 'best-practices': number; seo: number }; desktop: { performance: number; accessibility: number; 'best-practices': number; seo: number } } | undefined
      if (config.pagespeed.apiKey) {
        const ps = await runPageSpeed(url, 'mobile')
        if (ps) {
          const ps2 = await runPageSpeed(url, 'desktop')
          const results = [ps, ps2].filter(Boolean) as NonNullable<typeof ps>[]
          pagespeedSummary = formatPageSpeedSummary(results)
          pagespeedScores = { mobile: ps.scores, desktop: (ps2 || ps).scores }
        }
      }

      const analysis = config.deepseek.apiKey
        ? await fullAuditAnalysis(
            crawlSummary + (pagespeedSummary ? `\n\nPAGESPEED DATA:\n${pagespeedSummary}` : ''),
            gscSummary
          )
        : '*DeepSeek analysis not available*'

      const report: AuditReport = {
        url,
        timestamp: new Date().toISOString(),
        summary: {
          totalPages: pages.length,
          criticalIssues: prioritized.filter((f) => f.severity === 'critical').length,
          highIssues: prioritized.filter((f) => f.severity === 'high').length,
          mediumIssues: prioritized.filter((f) => f.severity === 'medium').length,
          lowIssues: prioritized.filter((f) => f.severity === 'low').length,
          overallScore: score,
        },
        findings: prioritized,
        deepseekAnalysis: analysis,
        pagespeed: pagespeedScores,
        kwrds: kwrdsData,
        dataforseo: dataforseoData,
      }

      saveReport(report)
      return generateDashboard(report)
    }

    const html = await runAuditAndServe()
    const server = await startServer({ port, html })
    printServerInfo(port)

    if (intervalMin > 0) {
      console.log(chalk.cyan(`Re-auditing every ${intervalMin} minutes...`))
      setInterval(async () => {
        const html = await runAuditAndServe()
        printServerInfo(port)
      }, intervalMin * 60 * 1000)
    }
  })

async function generateHtml(markdown: string): Promise<string> {
  const { marked } = await import('marked')
  const body = await marked(markdown)
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SEO Audit Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; max-width: 960px; margin: 0 auto; padding: 20px; color: #1a1a2e; }
    h1 { border-bottom: 3px solid #e94560; padding-bottom: 10px; }
    h2 { color: #16213e; margin-top: 30px; border-bottom: 1px solid #eee; padding-bottom: 5px; }
    .stat { display: inline-block; background: #f0f0f5; padding: 10px 20px; margin: 5px; border-radius: 8px; }
    .stat .n { font-size: 1.8em; font-weight: bold; display: block; }
    .stat .l { font-size: 0.85em; color: #666; }
    pre { background: #f5f5f5; padding: 15px; border-radius: 6px; overflow-x: auto; }
    code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; font-size: 0.9em; }
    hr { border: none; border-top: 1px solid #ddd; margin: 20px 0; }
    blockquote { border-left: 4px solid #e94560; margin: 0; padding: 5px 15px; background: #fafafa; }
  </style>
</head>
<body>
  ${body}
</body>
</html>`
}

program.parse(process.argv)
