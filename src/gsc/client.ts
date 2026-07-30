import { google, searchconsole_v1 } from 'googleapis'
import { config } from '../config.js'

let auth: ReturnType<typeof google.auth.getClient> | null = null

export interface GscSummary {
  totalClicks: number
  totalImpressions: number
  avgCtr: number
  avgPosition: number
  topQueries: { query: string; clicks: number; impressions: number; ctr: number; position: number }[]
  topPages: { url: string; clicks: number; impressions: number }[]
  dateRange: { start: string; end: string }
}

async function listSites(): Promise<string[]> {
  const authClient = await getAuth()
  const client = createClient()
  google.options({ auth: authClient })
  const res = await client.sites.list({})
  return (res.data.siteEntry || []).map((s) => s.siteUrl || '').filter(Boolean)
}

async function getAuth(): Promise<ReturnType<typeof google.auth.getClient>> {
  if (!auth) {
    if (!config.gsc.credentials) {
      throw new Error(
        'GOOGLE_APPLICATION_CREDENTIALS not set. Add it to .env pointing to your service account JSON.'
      )
    }
    auth = google.auth.getClient({
      keyFile: config.gsc.credentials,
      scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
    })
  }
  return auth
}

function createClient(): searchconsole_v1.Searchconsole {
  return google.searchconsole('v1')
}

export async function fetchGscData(site: string, days = 28): Promise<GscSummary | null> {
  try {
    const authClient = await getAuth()
    const client = createClient()
    google.options({ auth: authClient })

    const endDate = new Date().toISOString().split('T')[0]
    const startDate = new Date(Date.now() - days * 86400000).toISOString().split('T')[0]

    // Discover available sites and find a match
    const availableSites = await listSites()
    const u = new URL(site)
    const hostname = u.hostname

    let matchedSite: string | null = null
    const urlPrefix = `${u.protocol}//${hostname}/`
    const bareDomain = hostname.replace(/^www\./, '')

    // 1. Exact URL-prefix match
    if (availableSites.includes(urlPrefix)) {
      matchedSite = urlPrefix
    }
    // 2. Domain property match (sc-domain: prefix)
    if (!matchedSite) {
      matchedSite = availableSites.find((s) => {
        if (s === `sc-domain:${bareDomain}`) return true
        if (s === `sc:domain:${bareDomain}`) return true
        // partial fallback
        const domainFromSite = s.replace(/^sc[-:]domain:/, '')
        return domainFromSite === bareDomain || s.includes(hostname)
      }) || null
    }

    if (!matchedSite) {
      console.error(`  Site "${site}" not found in Google Search Console.\n  Available sites: ${availableSites.join(', ') || 'none'}`)
      console.error(`  Add the service account (vertex-express@ai-seo-audit-503917.iam.gserviceaccount.com) to GSC first.`)
      return null
    }

    const queryRes = await client.searchanalytics.query({
      siteUrl: matchedSite,
      requestBody: {
        startDate,
        endDate,
        dimensions: ['query'],
        rowLimit: 10,
      },
    })

    const pageRes = await client.searchanalytics.query({
      siteUrl: matchedSite,
      requestBody: {
        startDate,
        endDate,
        dimensions: ['page'],
        rowLimit: 10,
      },
    })

    const totalRes = await client.searchanalytics.query({
      siteUrl: matchedSite,
      requestBody: {
        startDate,
        endDate,
        dimensions: [],
      },
    })

    const totalRow = totalRes.data.rows?.[0]
    const totalClicks = totalRow?.clicks ?? 0
    const totalImpressions = totalRow?.impressions ?? 0
    const avgCtr = totalImpressions > 0 ? (totalRow?.ctr ?? 0) * 100 : 0
    const avgPosition = totalRow?.position ?? 0

    const topQueries = (queryRes.data.rows || []).map((r) => ({
      query: r.keys?.[0] || '',
      clicks: r.clicks ?? 0,
      impressions: r.impressions ?? 0,
      ctr: r.ctr != null ? r.ctr * 100 : 0,
      position: r.position ?? 0,
    }))

    const topPages = (pageRes.data.rows || []).map((r) => ({
      url: r.keys?.[0] || '',
      clicks: r.clicks ?? 0,
      impressions: r.impressions ?? 0,
    }))

    return {
      totalClicks,
      totalImpressions,
      avgCtr,
      avgPosition,
      topQueries,
      topPages,
      dateRange: { start: startDate, end: endDate },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('permission') || message.includes('not found')) {
      console.error(`  Permission denied. Add the service account email to GSC:\n    vertex-express@ai-seo-audit-503917.iam.gserviceaccount.com\n  Then verify the site is added to your Search Console.`)
    } else {
      console.error(`  GSC API error: ${message}`)
    }
    return null
  }
}

export function formatGscSummary(data: GscSummary): string {
  const lines: string[] = [
    `GSC Performance (${data.dateRange.start} to ${data.dateRange.end}):`,
    `  Clicks: ${data.totalClicks.toLocaleString()}`,
    `  Impressions: ${data.totalImpressions.toLocaleString()}`,
    `  Avg CTR: ${data.avgCtr.toFixed(2)}%`,
    `  Avg Position: ${data.avgPosition.toFixed(1)}`,
    '',
    'Top Queries:',
    ...data.topQueries.map(
      (q, i) => `  ${i + 1}. "${q.query}" — ${q.clicks} clicks, ${q.impressions} impressions, ${q.ctr.toFixed(2)}% CTR, pos ${q.position.toFixed(1)}`
    ),
    '',
    'Top Pages:',
    ...data.topPages.map(
      (p, i) => `  ${i + 1}. ${p.url} — ${p.clicks} clicks, ${p.impressions} impressions`
    ),
  ]

  return lines.join('\n')
}
