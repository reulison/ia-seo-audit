import { config } from '../config.js'
import { KwrdsKeyword, KwrdsQueryData, DataForSeoResult, LlmMention, LlmMentionsResult } from '../types.js'
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

// --- DataForSEO Keyword Suggestions API ---
// POST /v3/dataforseo_labs/google/keyword_suggestions/live
// Returns keyword suggestions with volume, CPC, competition, intent

interface SuggestionItem {
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

interface SuggestionTask {
  status_code: number
  result?: {
    items?: SuggestionItem[]
  }[]
}

export async function fetchKeywordSuggestions(query: string): Promise<KwrdsKeyword[]> {
  if (!query.trim()) return []
  const auth = basicAuth()

  try {
    const res = await fetch('https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_suggestions/live', {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([{
        keyword: query,
        location_code: 2840,
        limit: config.dataforseo.limit,
      }]),
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) {
      console.error(`  DataForSEO Keyword Suggestions API error (${res.status}) for "${query}"`)
      return []
    }

    const data = await res.json()
    const task: SuggestionTask | undefined = data.tasks?.[0]
    if (task?.status_code !== 20000) return []

    const items = task.result?.[0]?.items || []
    return items
      .filter((item) => item.keyword)
      .map((item) => ({
        keyword: item.keyword!,
        volume: item.keyword_info?.search_volume ?? 0,
        cpc: item.keyword_info?.cpc ?? 0,
        searchIntent: item.search_intent_info?.main_intent || '',
        competitionValue: item.keyword_info?.competition_level || '',
      }))
      .slice(0, config.dataforseo.limit)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`  DataForSEO Keyword Suggestions API error for "${query}": ${msg}`)
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

// --- DataForSEO LLM Mentions Search Mentions API ---
// POST /v3/ai_optimization/llm_mentions/search_mentions/live
// Returns mentions of a domain/keyword across AI search platforms (ChatGPT, Google AI Overview)

interface LlmSourceItem {
  snippet?: string | null
  source_name?: string | null
  rank?: number | null
  title?: string | null
  domain?: string | null
  url?: string | null
  publication_date?: string | null
}

interface LlmMentionItem {
  platform?: string
  model_name?: string
  location_code?: number
  language_code?: string
  question?: string
  answer?: string
  sources?: LlmSourceItem[] | null
  ai_search_volume?: number | null
  first_response_at?: string | null
  last_response_at?: string | null
  is_web_search_based?: boolean | null
}

interface LlmMentionsTask {
  status_code: number
  result?: {
    total_count?: number
    items?: LlmMentionItem[]
  }[]
}

export async function fetchLlmMentions(domain: string, keyword: string): Promise<LlmMentionsResult> {
  const target: Record<string, unknown>[] = []
  if (domain) target.push({ domain, search_filter: 'include' })
  if (keyword.trim()) target.push({ keyword: keyword.trim(), search_filter: 'include' })

  if (!target.length) return { domain, keyword, totalCount: 0, mentions: [] }
  const auth = basicAuth()

  try {
    const res = await fetch('https://api.dataforseo.com/v3/ai_optimization/llm_mentions/search_mentions/live', {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([{
        target,
        platform: config.dataforseo.llmMentions.platform || undefined,
        location_code: config.dataforseo.llmMentions.locationCode,
        language_code: config.dataforseo.llmMentions.languageCode,
        limit: config.dataforseo.llmMentions.limit,
      }]),
      signal: AbortSignal.timeout(120000),
    })

    if (!res.ok) {
      console.error(`  DataForSEO LLM Mentions API error (${res.status})`)
      return { domain, keyword, totalCount: 0, mentions: [] }
    }

    const data = await res.json()
    const task: LlmMentionsTask | undefined = data.tasks?.[0]
    if (task?.status_code !== 20000) {
      console.error(`  DataForSEO LLM Mentions API error (${task?.status_code})`)
      return { domain, keyword, totalCount: 0, mentions: [] }
    }

    const result = task.result?.[0]
    const mentions: LlmMention[] = (result?.items || []).map((item) => ({
      platform: item.platform || '',
      model_name: item.model_name || '',
      location_code: item.location_code ?? 0,
      language_code: item.language_code || '',
      question: item.question || '',
      answer: item.answer || '',
      sources: item.sources ? item.sources.map((s) => ({
        snippet: s.snippet ?? null,
        source_name: s.source_name ?? null,
        rank: s.rank ?? null,
        title: s.title ?? null,
        domain: s.domain ?? null,
        url: s.url ?? null,
        publication_date: s.publication_date ?? null,
      })) : null,
      ai_search_volume: item.ai_search_volume ?? null,
      first_response_at: item.first_response_at ?? null,
      last_response_at: item.last_response_at ?? null,
      is_web_search_based: item.is_web_search_based ?? null,
    }))

    return { domain, keyword, totalCount: result?.total_count ?? mentions.length, mentions }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`  DataForSEO LLM Mentions API error: ${msg}`)
    return { domain, keyword, totalCount: 0, mentions: [] }
  }
}
