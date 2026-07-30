import { config } from '../config.js'
import { KwrdsKeyword, KwrdsQueryData, DataForSeoResult } from '../types.js'
import { GscSummary } from '../gsc/client.js'

function basicAuth(): string {
  return Buffer.from(`${config.dataforseo.login}:${config.dataforseo.password}`).toString('base64')
}

// --- DataForSEO Google Ads Search Volume API ---
// POST /v3/keywords_data/google_ads/search_volume/live
// Returns search volume, CPC, competition for a batch of keywords

interface SearchVolumeItem {
  keyword: string
  search_volume?: number
  cpc?: number
  competition?: string
  competition_index?: number
}

interface SearchVolumeTask {
  status_code: number
  result?: SearchVolumeItem[]
}

export async function fetchSearchVolume(queries: string[]): Promise<Map<string, KwrdsKeyword>> {
  if (!queries.length) return new Map()
  const auth = basicAuth()

  try {
    const res = await fetch('https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live', {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([{
        keywords: queries,
        location_code: 2840,
        language_code: 'pt',
        date_from: '2025-01-01',
      }]),
      signal: AbortSignal.timeout(30000),
    })

    if (!res.ok) {
      console.error(`  DataForSEO Search Volume API error (${res.status})`)
      return new Map()
    }

    const data = await res.json()
    const tasks: SearchVolumeTask[] = data.tasks || []
    const results = tasks[0]?.result || []

    const map = new Map<string, KwrdsKeyword>()
    for (const item of results) {
      if (item.keyword) {
        map.set(item.keyword, {
          keyword: item.keyword,
          volume: item.search_volume ?? 0,
          cpc: item.cpc ?? 0,
          searchIntent: '',
          competitionValue: item.competition || '',
        })
      }
    }
    return map
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`  DataForSEO Search Volume API error: ${msg}`)
    return new Map()
  }
}

// --- DataForSEO Related Keywords API ---
// POST /v3/dataforseo_labs/google/related_keywords/live
// Returns related keywords with volume, CPC, competition, intent

interface RelatedKeywordItem {
  keyword_data?: {
    keyword?: string
    keyword_info?: {
      search_volume?: number
      cpc?: number
      competition_level?: string
    }
    search_intent_info?: {
      main_intent?: string
    }
  }
}

interface RelatedKeywordTask {
  status_code: number
  result?: {
    items?: RelatedKeywordItem[]
  }[]
}

export async function fetchRelatedKeywords(query: string): Promise<KwrdsKeyword[]> {
  if (!query.trim()) return []
  const auth = basicAuth()

  try {
    const res = await fetch('https://api.dataforseo.com/v3/dataforseo_labs/google/related_keywords/live', {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([{
        keyword: query,
        location_name: 'Brazil',
        language_name: 'Portuguese',
        limit: config.dataforseo.limit,
      }]),
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) {
      console.error(`  DataForSEO Related Keywords API error (${res.status}) for "${query}"`)
      return []
    }

    const data = await res.json()
    const task: RelatedKeywordTask | undefined = data.tasks?.[0]
    if (task?.status_code !== 20000) {
      console.error(`  DataForSEO Related Keywords API error (${task?.status_code}) for "${query}"`)
      return []
    }

    const items = task.result?.[0]?.items || []
    return items
      .map((item) => {
        const kd = item.keyword_data
        if (!kd?.keyword) return null
        return {
          keyword: kd.keyword,
          volume: kd.keyword_info?.search_volume ?? 0,
          cpc: kd.keyword_info?.cpc ?? 0,
          searchIntent: kd.search_intent_info?.main_intent || '',
          competitionValue: kd.keyword_info?.competition_level || '',
        }
      })
      .filter((k): k is KwrdsKeyword => k !== null)
      .slice(0, config.dataforseo.limit)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`  DataForSEO Related Keywords API error for "${query}": ${msg}`)
    return []
  }
}

// --- Batch enrichment functions ---

export async function enrichGscWithSearchVolume(gscData: GscSummary | null): Promise<KwrdsQueryData[]> {
  if (!gscData || !gscData.topQueries.length) return []

  const queries = gscData.topQueries.slice(0, config.dataforseo.maxQueries)
  const queryTexts = queries.map((q) => q.query)

  console.log(`  Fetching search volume for ${queryTexts.length} GSC queries...`)
  const volumeMap = await fetchSearchVolume(queryTexts)

  return queries.map((q) => ({
    query: q.query,
    gsc: {
      clicks: q.clicks,
      impressions: q.impressions,
      ctr: q.ctr,
      position: q.position,
    },
    keywords: (() => {
      const kw = volumeMap.get(q.query)
      return kw ? [kw] : []
    })(),
  }))
}

export async function fetchMultipleRelatedKeywords(queries: string[]): Promise<DataForSeoResult[]> {
  const results: DataForSeoResult[] = []

  for (let i = 0; i < queries.length; i++) {
    const q = queries[i]
    process.stdout.write(`  ${i + 1}/${queries.length} "${q}"... `)
    const keywords = await fetchRelatedKeywords(q)
    console.log(`${keywords.length} related keywords`)

    results.push({ query: q, keywords })
  }

  return results
}
