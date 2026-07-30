import 'dotenv/config'

export const config = {
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    maxTokens: 8192,
    temperature: 0.3,
  },
  dataDir: process.env.SAC_DATA_DIR || './data',
  crawl: {
    maxPages: parseInt(process.env.MAX_CRAWL_PAGES || '1000', 10),
    concurrency: 8,
    respectRobotsTxt: true,
    userAgent: 'DeepSeek-SEO-Audit/0.1',
    timeoutMs: 30000,
  },
  gsc: {
    credentials: process.env.GOOGLE_APPLICATION_CREDENTIALS || '',
  },
  pagespeed: {
    apiKey: process.env.PAGE_SPEED_API_KEY || '',
  },
}
