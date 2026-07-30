import OpenAI from 'openai'
import { config } from '../config.js'

let client: OpenAI | null = null

function getClient(): OpenAI {
  if (!client) {
    if (!config.deepseek.apiKey) {
      throw new Error(
        'DEEPSEEK_API_KEY not set. Add it to .env or set it as an environment variable.'
      )
    }
    client = new OpenAI({
      baseURL: 'https://api.deepseek.com',
      apiKey: config.deepseek.apiKey,
    })
  }
  return client
}

export interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export async function chat(
  messages: DeepSeekMessage[],
  options?: { stream?: boolean }
): Promise<string> {
  const c = getClient()
  const res = await c.chat.completions.create({
    model: config.deepseek.model,
    messages,
    max_tokens: config.deepseek.maxTokens,
    temperature: config.deepseek.temperature,
    stream: false,
  })
  return res.choices[0]?.message?.content || ''
}

export async function analyzeSEO(data: {
  url: string
  title: string
  metaDescription: string
  h1: string
  headings: string[]
  contentLength: number
  loadTimeMs: number
  linksCount: number
  imagesWithoutAlt: number
  hasStructuredData: boolean
  statusCode: number
  noindex: boolean
  canonical: string | null
}): Promise<string> {
  const systemPrompt = `You are an expert technical SEO auditor. Analyze the provided page data and produce a concise, actionable audit finding. Focus on:
1. Critical issues (blocking indexation, broken canonical, noindex on important pages)
2. On-page SEO (title, meta, headings, content quality)
3. Technical issues (load time, status codes, structured data)
4. Specific, actionable recommendations

Output in markdown format. Be direct and specific.`

  const pageInfo = `
URL: ${data.url}
Title: ${data.title}
Meta Description: ${data.metaDescription}
H1: ${data.h1}
Headings: ${data.headings.join(', ')}
Content Length: ${data.contentLength} chars
Load Time: ${data.loadTimeMs}ms
Links: ${data.linksCount}
Images Missing Alt: ${data.imagesWithoutAlt}
Has Structured Data: ${data.hasStructuredData}
Status: ${data.statusCode}
Noindex: ${data.noindex}
Canonical: ${data.canonical || 'self'}
`

  return chat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Analyze this page for SEO issues:\n\n${pageInfo}` },
  ])
}

export async function generateFix(
  issue: string,
  url: string,
  pageContent?: string
): Promise<string> {
  const systemPrompt = `You are an SEO engineer who writes production-ready fixes. Given an SEO issue and page context, provide exact code or configuration changes needed. Be specific - include the exact fix.`

  const content = `
Issue: ${issue}
URL: ${url}
${pageContent ? `Page excerpt:\n${pageContent.slice(0, 3000)}` : ''}

Provide the exact fix needed including code/config snippets.`

  return chat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content },
  ])
}

export async function fullAuditAnalysis(
  crawlData: string,
  gscData?: string
): Promise<string> {
  const systemPrompt = `You are a senior technical SEO analyst. You have crawl data, optional Google Search Console data, and optional PageSpeed data.

Write the report in **Brazilian Portuguese (pt-BR)**. Be direct, specific, and actionable.

You MUST write content for EVERY section below. If there are no issues in a section, explicitly state "Nenhum problema encontrado." and explain what was checked. Never leave a section empty.

Sections:
1. **Resumo Executivo** - principais descobertas e impacto estimado (sempre preenchido)
2. **Problemas Críticos** - indexação bloqueada, redirecionamentos quebrados, noindex
3. **SEO On-Page** - title, meta, h1, headings (use tabelas com dados reais)
4. **Saúde Técnica** - tempo de carregamento, status codes, dados estruturados (use tabela com métricas)
5. **Análise de Conteúdo** - conteúdo raso, alt text ausente, estrutura de headings
6. **Correções Priorizadas** - ordenadas por impacto esperado, com recomendações específicas (use tabela)

Use markdown tables with real data from the crawl. Every section must have content.`

  const data = `
CRAWL DATA:
${crawlData.slice(0, 8000)}
${gscData ? `\nGSC DATA:\n${gscData.slice(0, 4000)}` : ''}
`

  return chat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Run a full SEO audit on this site data:\n\n${data}` },
  ])
}

export async function suggestImprovements(
  url: string,
  pageContent: string
): Promise<string> {
  const systemPrompt = `You are an SEO content strategist. Given a page's content, suggest concrete improvements to increase organic search traffic.

Focus on:
1. Content gaps - topics the page should cover but doesn't
2. Keyword opportunities - phrases to target
3. Structural improvements - headings, internal links, readability
4. Schema/structured data opportunities

Be specific and actionable.`

  return chat([
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: `Suggest SEO improvements for ${url}:\n\n${pageContent.slice(0, 4000)}`,
    },
  ])
}
