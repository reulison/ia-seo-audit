import * as cheerio from 'cheerio'
import { config } from '../config.js'
import { CrawlResult } from '../types.js'

interface CrawlOptions {
  url: string
  maxPages?: number
  concurrency?: number
  fromSitemap?: boolean
}

async function fetchSitemapUrls(sitemapUrl: string): Promise<string[]> {
  const urls: string[] = []
  try {
    const res = await fetch(sitemapUrl, {
      headers: { 'User-Agent': config.crawl.userAgent },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return urls
    const xml = await res.text()

    // Sitemap index → recursive fetch
    const sitemaps = [...xml.matchAll(/<sitemap>\s*<loc>(.*?)<\/loc>\s*<\/sitemap>/gi)]
    if (sitemaps.length > 0) {
      for (const [, loc] of sitemaps.slice(0, 10)) {
        const nested = await fetchSitemapUrls(loc.trim())
        urls.push(...nested)
      }
      return urls
    }

    // Regular sitemap → extract URLs
    const locs = [...xml.matchAll(/<loc>(.*?)<\/loc>/gi)]
    for (const [, loc] of locs) {
      urls.push(loc.trim())
    }
  } catch {}
  return urls
}

export async function crawlSite(options: CrawlOptions): Promise<{
  pages: CrawlResult[]
  errors: { url: string; error: string }[]
}> {
  const { url, maxPages = config.crawl.maxPages, fromSitemap } = options
  const base = new URL(url)
  const visited = new Set<string>()
  const pages: CrawlResult[] = []
  const errors: { url: string; error: string }[] = []

  let queue: string[] = [normalizeUrl(url)]

  if (fromSitemap) {
    const sitemapUrl = `${base.origin}/sitemap.xml`
    console.log(`  Fetching sitemap: ${sitemapUrl}`)
    const sitemapUrls = await fetchSitemapUrls(sitemapUrl)
    if (sitemapUrls.length > 0) {
      queue = sitemapUrls.map(normalizeUrl).filter((u) => u.startsWith(base.origin))
      console.log(`  Found ${queue.length} URLs in sitemap`)
    } else {
      console.log(`  No URLs found in sitemap, falling back to link crawling`)
    }
  }

  while (queue.length > 0 && visited.size < maxPages) {
    const currentUrl = queue.shift()!
    if (visited.has(currentUrl)) continue
    visited.add(currentUrl)

    try {
      const result = await fetchPage(currentUrl, base.origin)
      if (result) {
        pages.push(result)
        const links = extractInternalLinks(result.content, base.origin)
        for (const link of links) {
          const normalized = normalizeUrl(link)
          if (!visited.has(normalized) && !queue.includes(normalized)) {
            queue.push(normalized)
          }
        }
      }
    } catch (err) {
      errors.push({ url: currentUrl, error: String(err) })
    }
  }

  return { pages, errors }
}

async function fetchPage(
  url: string,
  baseOrigin: string
): Promise<CrawlResult | null> {
  const start = Date.now()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.crawl.timeoutMs)

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': config.crawl.userAgent,
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'manual',
    })

    clearTimeout(timeout)
    const loadTimeMs = Date.now() - start

    const contentType = res.headers.get('content-type') || ''
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      return null
    }

    const statusCode = res.status
    const finalUrl = res.url || url

    if (statusCode >= 300 && statusCode < 400) {
      const location = res.headers.get('location')
      if (location) {
        return {
          url: finalUrl,
          statusCode,
          contentType,
          title: `Redirects to: ${location}`,
          metaDescription: '',
          h1: '',
          headings: [],
          links: [location],
          images: [],
          canonical: null,
          noindex: false,
          robotsTxt: true,
          structuredData: [],
          contentLength: 0,
          loadTimeMs,
          content: '',
        }
      }
      return null
    }

    const text = await res.text()
    const $ = cheerio.load(text)

    const title = $('title').first().text().trim()
    const metaDescription = $('meta[name="description"]').attr('content')?.trim() || ''
    const h1 = $('h1').first().text().trim()
    const headings: string[] = []
    $('h2, h3, h4').each((_, el) => { headings.push($(el).text().trim()) })

    const links: string[] = []
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href')
      if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
        try {
          links.push(new URL(href, finalUrl).href)
        } catch {}
      }
    })

    const images: { src: string; alt: string }[] = []
    $('img[src]').each((_, el) => {
      const src = $(el).attr('src') || ''
      try {
        images.push({
          src: new URL(src, finalUrl).href,
          alt: $(el).attr('alt') || '',
        })
      } catch {}
    })

    const noindex =
      $('meta[name="robots"]')
        .attr('content')
        ?.toLowerCase()
        .includes('noindex') ||
      $('meta[name="googlebot"]')
        .attr('content')
        ?.toLowerCase()
        .includes('noindex') ||
      false

    const canonical = $('link[rel="canonical"]').attr('href') || null

    const structuredData: any[] = []
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        structuredData.push(JSON.parse($(el).html() || '{}'))
      } catch {}
    })

    const contentLength = text.length

    return {
      url: finalUrl,
      statusCode,
      contentType,
      title,
      metaDescription,
      h1,
      headings,
      links,
      images,
      canonical,
      noindex,
      robotsTxt: true,
      structuredData,
      contentLength,
      loadTimeMs,
      content: text,
    }
  } catch (err) {
    clearTimeout(timeout)
    throw err
  }
}

function extractInternalLinks(html: string, baseOrigin: string): string[] {
  const $ = cheerio.load(html)
  const links: string[] = []
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return
    try {
      const url = new URL(href, baseOrigin)
      if (url.origin === baseOrigin) {
        links.push(url.href)
      }
    } catch {}
  })
  return links
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url)
    u.hash = ''
    u.search = ''
    return u.href.replace(/\/$/, '')
  } catch {
    return url
  }
}
