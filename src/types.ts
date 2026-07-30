export interface CrawlResult {
  url: string
  statusCode: number
  contentType: string
  title: string
  metaDescription: string
  h1: string
  headings: string[]
  links: string[]
  images: { src: string; alt: string }[]
  canonical: string | null
  noindex: boolean
  robotsTxt: boolean
  structuredData: any[]
  contentLength: number
  loadTimeMs: number
  content: string
}

export interface AuditFinding {
  id: string
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  category: string
  title: string
  description: string
  evidence: string
  recommendation: string
  url: string
  fix?: string
}

export interface KwrdsKeyword {
  keyword: string
  volume: number
  cpc: number
  searchIntent: string
  competitionValue: string
}

export interface DataForSeoResult {
  query: string
  keywords: KwrdsKeyword[]
}

export interface KwrdsQueryData {
  query: string
  gsc: {
    clicks: number
    impressions: number
    ctr: number
    position: number
  }
  keywords: KwrdsKeyword[]
}

export interface AuditReport {
  url: string
  timestamp: string
  summary: {
    totalPages: number
    criticalIssues: number
    highIssues: number
    mediumIssues: number
    lowIssues: number
    overallScore: number
  }
  findings: AuditFinding[]
  deepseekAnalysis: string
  pagespeed?: {
    mobile: { performance: number; accessibility: number; 'best-practices': number; seo: number }
    desktop: { performance: number; accessibility: number; 'best-practices': number; seo: number }
  }
  kwrds?: KwrdsQueryData[]
  dataforseo?: DataForSeoResult[]
}

export interface GscQuery {
  query: string
  clicks: number
  impressions: number
  ctr: number
  position: number
  pages: string[]
}

export interface DeepSeekConfig {
  apiKey: string
  model: string
  maxTokens: number
  temperature: number
}

export interface CrawlerConfig {
  maxPages: number
  concurrency: number
  respectRobotsTxt: boolean
  userAgent: string
  timeoutMs: number
}
