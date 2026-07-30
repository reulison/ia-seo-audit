import { CrawlResult, AuditFinding } from '../types.js'

export function runOnPageChecks(pages: CrawlResult[]): AuditFinding[] {
  const findings: AuditFinding[] = []

  for (const page of pages) {
    if (page.statusCode >= 400) {
      findings.push({
        id: `STATUS_${page.statusCode}_${page.url}`,
        severity: 'critical',
        category: 'Crawlability & Indexation',
        title: `Page returns ${page.statusCode}`,
        description: `The page returns HTTP ${page.statusCode}. This blocks indexation and wastes crawl budget.`,
        evidence: page.url,
        recommendation: page.statusCode === 404
          ? 'Restore the page or set up a 301 redirect to the nearest relevant page.'
          : 'Investigate the server error and fix the underlying issue.',
        url: page.url,
      })
    }

    if (page.noindex) {
      findings.push({
        id: `NOINDEX_${page.url}`,
        severity: 'high',
        category: 'Crawlability & Indexation',
        title: 'Page has noindex directive',
        description: 'This page has a noindex meta tag or X-Robots header, preventing indexation.',
        evidence: page.url,
        recommendation: 'Remove the noindex directive if this page should appear in search results.',
        url: page.url,
      })
    }

    if (page.canonical && page.canonical !== page.url) {
      findings.push({
        id: `CANONICAL_MISMATCH_${page.url}`,
        severity: page.canonical.includes(page.url) ? 'low' : 'high',
        category: 'Canonicalisation',
        title: 'Canonical URL differs from page URL',
        description: `Canonical points to ${page.canonical}`,
        evidence: page.url,
        recommendation: 'Ensure the canonical tag points to the preferred version of this page.',
        url: page.url,
      })
    }

    if (!page.title) {
      findings.push({
        id: `MISSING_TITLE_${page.url}`,
        severity: 'high',
        category: 'On-Page',
        title: 'Missing page title',
        description: 'Page has no <title> tag, which is critical for SEO and usability.',
        evidence: page.url,
        recommendation: 'Add a unique, descriptive title tag (50-60 characters).',
        url: page.url,
      })
    } else if (page.title.length < 20) {
      findings.push({
        id: `SHORT_TITLE_${page.url}`,
        severity: 'medium',
        category: 'On-Page',
        title: 'Page title too short',
        description: `Title is only ${page.title.length} characters. Titles should be 50-60 characters.`,
        evidence: `"${page.title}"`,
        recommendation: 'Expand the title to 50-60 characters including primary keywords.',
        url: page.url,
      })
    } else if (page.title.length > 60) {
      findings.push({
        id: `LONG_TITLE_${page.url}`,
        severity: 'low',
        category: 'On-Page',
        title: 'Page title too long',
        description: `Title is ${page.title.length} characters. May be truncated in SERPs.`,
        evidence: `"${page.title}"`,
        recommendation: 'Shorten the title to under 60 characters.',
        url: page.url,
      })
    }

    if (page.title && !page.title.includes('|') && !page.title.includes('-') && !page.title.includes(':')) {
      const duplicates = pages.filter(
        (p) => p.title === page.title && p.url !== page.url
      )
      if (duplicates.length > 0) {
        findings.push({
          id: `DUPLICATE_TITLE_${page.url}`,
          severity: 'medium',
          category: 'On-Page',
          title: 'Duplicate page title',
          description: `Title "${page.title}" is used on ${duplicates.length + 1} pages.`,
          evidence: `Also on: ${duplicates.map((d) => d.url).join(', ')}`,
          recommendation: 'Give each page a unique, descriptive title.',
          url: page.url,
        })
      }
    }

    if (!page.metaDescription) {
      findings.push({
        id: `MISSING_META_${page.url}`,
        severity: 'medium',
        category: 'On-Page',
        title: 'Missing meta description',
        description: 'No meta description tag found. Google may auto-generate a snippet.',
        evidence: page.url,
        recommendation: 'Add a compelling meta description (120-160 characters) with primary keyword.',
        url: page.url,
      })
    }

    if (!page.h1) {
      findings.push({
        id: `MISSING_H1_${page.url}`,
        severity: 'medium',
        category: 'On-Page',
        title: 'Missing H1 heading',
        description: 'Page has no H1 tag, missing a key relevance signal.',
        evidence: page.url,
        recommendation: 'Add one H1 that includes the primary keyword and matches user intent.',
        url: page.url,
      })
    }

    if (page.h1 && page.title && !page.title.toLowerCase().includes(page.h1.toLowerCase())) {
      findings.push({
        id: `H1_TITLE_MISMATCH_${page.url}`,
        severity: 'low',
        category: 'On-Page',
        title: 'H1 and title do not align',
        description: 'The H1 differs from the page title, missing a consistency signal.',
        evidence: `Title: "${page.title}" | H1: "${page.h1}"`,
        recommendation: 'Align H1 with the title or ensure both target the same primary keyword.',
        url: page.url,
      })
    }

    const missingAlt = page.images.filter((img) => !img.alt && !img.src.endsWith('.svg'))
    if (missingAlt.length > 0) {
      findings.push({
        id: `MISSING_ALT_${page.url}`,
        severity: 'medium',
        category: 'On-Page',
        title: `${missingAlt.length} images missing alt text`,
        description: `${missingAlt.length} images have no alt attribute, hurting accessibility and image search.`,
        evidence: missingAlt.slice(0, 5).map((i) => i.src).join(', '),
        recommendation: 'Add descriptive alt text to all images.',
        url: page.url,
      })
    }

    if (page.structuredData.length === 0) {
      findings.push({
        id: `NO_SCHEMA_${page.url}`,
        severity: 'info',
        category: 'Structured Data',
        title: 'No structured data found',
        description: 'Page has no JSON-LD or structured data markup.',
        evidence: page.url,
        recommendation: 'Add relevant schema.org markup (e.g., Article, Product, FAQ, LocalBusiness).',
        url: page.url,
      })
    }

    if (page.loadTimeMs > 3000) {
      findings.push({
        id: `SLOW_LOAD_${page.url}`,
        severity: page.loadTimeMs > 5000 ? 'high' : 'medium',
        category: 'Performance',
        title: `Slow page load (${page.loadTimeMs}ms)`,
        description: `Page loaded in ${page.loadTimeMs}ms. Google uses Core Web Vitals as a ranking factor.`,
        evidence: page.url,
        recommendation: 'Optimize images, leverage caching, minify CSS/JS, and consider a CDN.',
        url: page.url,
      })
    }

    if (page.contentLength < 300) {
      findings.push({
        id: `THIN_CONTENT_${page.url}`,
        severity: 'medium',
        category: 'Content',
        title: 'Thin content',
        description: `Page has only ${page.contentLength} characters of content.`,
        evidence: page.url,
        recommendation: 'Add substantive, unique content that provides value to users.',
        url: page.url,
      })
    }
  }

  return findings
}

export function calculateScore(findings: AuditFinding[]): number {
  const weights: Record<string, number> = {
    critical: 12,
    high: 6,
    medium: 2,
    low: 1,
    info: 0,
  }
  const deductions = findings.reduce((sum, f) => sum + (weights[f.severity] || 0), 0)
  return Math.max(5, Math.min(100, 100 - deductions))
}

export function prioritizeFindings(findings: AuditFinding[]): AuditFinding[] {
  const order: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    info: 4,
  }
  return [...findings].sort((a, b) => order[a.severity] - order[b.severity])
}
