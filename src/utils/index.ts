import { AuditFinding } from '../types.js'

export function formatReportMarkdown(
  url: string,
  pagesCount: number,
  findings: AuditFinding[],
  score: number,
  analysis: string
): string {
  const critical = findings.filter((f) => f.severity === 'critical')
  const high = findings.filter((f) => f.severity === 'high')
  const medium = findings.filter((f) => f.severity === 'medium')
  const low = findings.filter((f) => f.severity === 'low')

  return `# SEO Audit Report: ${url}

## Summary
- **Pages crawled:** ${pagesCount}
- **SEO Score:** ${score}/100
- **Critical issues:** ${critical.length}
- **High issues:** ${high.length}
- **Medium issues:** ${medium.length}
- **Low issues:** ${low.length}

---

## DeepSeek Analysis

${analysis}

---

## Prioritized Findings

${findings
  .map(
    (f) => `### [${f.severity.toUpperCase()}] ${f.title}
**URL:** ${f.url}
**Category:** ${f.category}
**Evidence:** ${f.evidence}
**Recommendation:** ${f.recommendation}
${f.fix ? `\n**Fix:**\n\`\`\`\n${f.fix}\n\`\`\`` : ''}
`
  )
  .join('\n---\n')}
`
}

export function generateHtmlReport(report: string): string {
  const marked = import('marked').then((m) => m.parse(report))
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SEO Audit Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; max-width: 900px; margin: 0 auto; padding: 20px; color: #333; }
    h1 { color: #1a1a2e; border-bottom: 2px solid #e94560; padding-bottom: 10px; }
    h2 { color: #16213e; margin-top: 30px; }
    h3 { color: #0f3460; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin: 20px 0; }
    .stat { background: #f8f9fa; padding: 15px; border-radius: 8px; text-align: center; }
    .stat .value { font-size: 2em; font-weight: bold; color: #0f3460; }
    .stat .label { font-size: 0.9em; color: #666; }
    .critical { border-left: 4px solid #e94560; padding-left: 15px; margin: 10px 0; }
    .high { border-left: 4px solid #f5a623; padding-left: 15px; margin: 10px 0; }
    .medium { border-left: 4px solid #f7c948; padding-left: 15px; margin: 10px 0; }
    .low { border-left: 4px solid #7ed321; padding-left: 15px; margin: 10px 0; }
    .info { border-left: 4px solid #4a90d9; padding-left: 15px; margin: 10px 0; }
    pre { background: #f4f4f4; padding: 15px; border-radius: 5px; overflow-x: auto; }
    code { background: #f4f4f4; padding: 2px 5px; border-radius: 3px; }
  </style>
</head>
<body>
  ${marked}
</body>
</html>`
}
