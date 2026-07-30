import { AuditFinding, AuditReport } from '../types.js'
import { marked } from 'marked'

function renderDeepSeekAnalysis(markdown: string): string {
  if (!markdown || markdown.startsWith('*')) {
    const isMissingKey = markdown?.includes('DEEPSEEK_API_KEY')
    const msg = isMissingKey
      ? '<p class="text-yellow-700 font-medium">DeepSeek não configurado</p><p class="text-sm text-yellow-600 mt-1">Configure DEEPSEEK_API_KEY no arquivo .env</p>'
      : markdown || '<p class="text-gray-400">Nenhuma análise disponível.</p>'
    return `<div class="bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-center"><div class="text-3xl mb-2">🤖</div>${msg}</div>`
  }

  const lines = markdown.split('\n')
  const sections: { title: string; body: string[] }[] = []
  let title = ''
  let body: string[] = []

  for (const line of lines) {
    const m = line.match(/^(#{2,3})\s+(.+)/)
    if (m) {
      if (title || body.some(l => l.trim())) {
        sections.push({ title, body })
      }
      title = m[2].trim()
      body = []
    } else {
      body.push(line)
    }
  }
  if (title || body.some(l => l.trim())) {
    sections.push({ title, body })
  }

  if (sections.length === 0) {
    sections.push({ title: '', body: lines })
  }

  const iconRules: [RegExp, string][] = [
    [/execut|sum[áa]|resum|vis[aã]o.?geral|overview/i, '📊'],
    [/cr[ií]tic|bloqueant|blocking|urgent/i, '🚨'],
    [/on.?page/i, '📝'],
    [/t[ée]cnic|techni|sa[uú]de|health/i, '⚙️'],
    [/conte[úu]do|content|thin/i, '📄'],
    [/priorit|prioridad|fix|corre[cç][aã]o|a[cç][aã]o|impact/i, '🎯'],
    [/recomend|sugest|recommend|suggestion/i, '💡'],
    [/link|internal/i, '🔗'],
    [/mobile|responsiv|core.?web|perform|velocidade|speed/i, '⚡'],
    [/schema|structured|estruturad|rich.?snippet|dados.?estruturados/i, '🔍'],
    [/meta|title|description|heading|h1|h2|tag.?title/i, '🏷️'],
    [/imagem|image|alt|acessibilidad|accessibility/i, '🖼️'],
    [/url|canonical|redirect|status.?code|404|301|redirecionamento/i, '🔀'],
    [/seguran[çc]a|security|https|ssl|certificado/i, '🔒'],
    [/indexa[çc][aã]o|indexation|noindex|crawl|robot/i, '🕸️'],
  ]

  function pickIcon(t: string): string {
    for (const [re, icon] of iconRules) {
      if (re.test(t)) return icon
    }
    return '📌'
  }

  let html = ''
  for (const sec of sections) {
    const md = sec.body.join('\n').trim()
    if (!md && !sec.title) continue
    const rendered = marked.parse(md, { async: false }) as string

    html += `<div class="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-4 transition hover:shadow-md">
      ${sec.title ? `<div class="flex items-center gap-2 mb-3 pb-3 border-b border-gray-100">
        <span class="text-xl">${pickIcon(sec.title)}</span>
        <h4 class="font-bold text-gray-900 text-base">${sec.title}</h4>
      </div>` : ''}
      <div class="prose prose-sm max-w-none text-gray-700 prose-headings:text-gray-900 prose-a:text-blue-600 prose-strong:text-gray-900 prose-code:bg-gray-100 prose-code:px-1.5 prose-code:rounded prose-code:text-sm prose-pre:bg-gray-900 prose-pre:text-green-400 prose-pre:rounded-xl prose-table:text-xs prose-table:border-collapse prose-th:bg-gray-50 prose-th:px-2.5 prose-th:py-2 prose-th:text-left prose-th:text-xs prose-th:font-semibold prose-th:text-gray-500 prose-th:uppercase prose-td:px-2.5 prose-td:py-1.5 prose-td:text-xs prose-td:border prose-td:border-gray-200 prose-ul:space-y-1 prose-li:marker:text-gray-300">${rendered}</div>
    </div>`
  }

  return html
}

export function generateDashboard(report: AuditReport): string {
  const { summary, findings, url } = report
  const deepseekHtml = renderDeepSeekAnalysis(report.deepseekAnalysis || '')

  const severityColors: Record<string, string> = {
    critical: '#dc2626',
    high: '#ea580c',
    medium: '#ca8a04',
    low: '#16a34a',
    info: '#2563eb',
  }

  const findingsBySeverity = {
    critical: findings.filter((f) => f.severity === 'critical'),
    high: findings.filter((f) => f.severity === 'high'),
    medium: findings.filter((f) => f.severity === 'medium'),
    low: findings.filter((f) => f.severity === 'low'),
    info: findings.filter((f) => f.severity === 'info'),
  }

  const perPage: Record<string, { count: number; critical: number; high: number }> = {}
  for (const f of findings) {
    if (!perPage[f.url]) perPage[f.url] = { count: 0, critical: 0, high: 0 }
    perPage[f.url].count++
    if (f.severity === 'critical') perPage[f.url].critical++
    if (f.severity === 'high') perPage[f.url].high++
  }

  const topPages = Object.entries(perPage)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)

  const categories: Record<string, AuditFinding[]> = {}
  for (const f of findings) {
    if (!categories[f.category]) categories[f.category] = []
    categories[f.category].push(f)
  }

  const findingsJson = JSON.stringify(
    findings.map((f) => ({
      ...f,
      fix: f.fix || '',
    }))
  )

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SEO Audit — ${new URL(url).hostname}</title>
<script src="https://cdn.tailwindcss.com"></script>
<script>
tailwind.config = {
  theme: {
    extend: {
      colors: {
        critical: '#dc2626',
        high: '#ea580c',
        medium: '#ca8a04',
        low: '#16a34a',
        info: '#2563eb',
      }
    }
  }
}
</script>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
body { font-family: 'Inter', sans-serif; }
.severity-critical { border-left: 4px solid #dc2626; }
.severity-high { border-left: 4px solid #ea580c; }
.severity-medium { border-left: 4px solid #ca8a04; }
.severity-low { border-left: 4px solid #16a34a; }
.severity-info { border-left: 4px solid #2563eb; }
.finding-card { transition: all 0.2s; }
.finding-card:hover { transform: translateX(4px); }
.glass { background: rgba(255,255,255,0.7); backdrop-filter: blur(12px); }
.mb-4 { margin-bottom: 1rem !important; }
.mb-8 { margin-bottom: 2rem !important; }
.mb-6 { margin-bottom: 1.5rem !important; }
.prose table { border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; margin: 1rem 0; font-size: 0.8125rem; }
.prose table td, .prose table th { padding: 0.5rem 0.625rem; border: 1px solid #e5e7eb; }
.prose table th { background: #f9fafb; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; font-weight: 600; }
.prose table td { font-size: 0.8125rem; color: #374151; }
.prose table tr:last-child td { border-bottom: none; }
.prose h3, .prose h4 { margin-top: 1.25rem !important; margin-bottom: 0.5rem !important; padding-bottom: 0.25rem; border-bottom: 1px solid #f3f4f6; }
.prose p { margin-top: 0.5rem !important; margin-bottom: 0.5rem !important; }
.prose ul, .prose ol { margin-top: 0.5rem !important; margin-bottom: 0.75rem !important; }
.prose hr { margin: 1rem 0 !important; border-color: #e5e7eb; }
.prose strong { color: #111827; }
</style>
</head>
<body class="bg-gray-50 text-gray-900">
  <nav class="glass border-b border-gray-200 sticky top-0 z-50">
    <div class="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <span class="text-2xl">🔍</span>
        <span class="font-bold text-lg">SEO Audit</span>
        <span class="text-gray-400 text-sm">${new URL(url).hostname}</span>
      </div>
      <div class="flex items-center gap-4 text-sm">
        <span class="text-gray-500">${new Date(report.timestamp).toLocaleString('pt-BR')}</span>
        <span class="bg-gray-200 px-3 py-1 rounded-full font-medium">${summary.totalPages} páginas</span>
      </div>
    </div>
  </nav>

  <main class="max-w-7xl mx-auto px-4 py-6">
    <!-- Score -->
    <div class="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-8">
      <div class="lg:col-span-1">
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center">
          <div class="text-5xl font-extrabold ${
            summary.overallScore >= 80 ? 'text-green-600' :
            summary.overallScore >= 60 ? 'text-yellow-600' :
            summary.overallScore >= 40 ? 'text-orange-600' : 'text-red-600'
          }">${summary.overallScore}</div>
          <div class="text-gray-500 mt-1 font-medium">/ 100</div>
          <div class="text-sm text-gray-400 mt-1">SEO Score</div>
          <div class="mt-3 w-full bg-gray-200 rounded-full h-2">
            <div class="h-2 rounded-full ${
              summary.overallScore >= 80 ? 'bg-green-500' :
              summary.overallScore >= 60 ? 'bg-yellow-500' :
              summary.overallScore >= 40 ? 'bg-orange-500' : 'bg-red-500'
            }" style="width:${summary.overallScore}%"></div>
          </div>
        </div>
      </div>
      ${[
        { label: 'Críticos', count: summary.criticalIssues, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
        { label: 'Altos', count: summary.highIssues, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
        { label: 'Médios', count: summary.mediumIssues, color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-200' },
        { label: 'Baixos', count: summary.lowIssues, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200' },
      ].map(s => `
      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div class="text-3xl font-bold ${s.color}">${s.count}</div>
        <div class="text-gray-500 font-medium mt-1">${s.label}</div>
      </div>`).join('')}
    </div>

    <!-- PageSpeed card -->
    ${report.pagespeed ? `
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-8">
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-2">
          <span class="text-lg">⚡</span>
          <h3 class="font-bold text-gray-900">PageSpeed Insights (Lighthouse)</h3>
        </div>
        <div class="flex gap-2 text-xs text-gray-400">
          <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-blue-500"></span> Mobile</span>
          <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-gray-500"></span> Desktop</span>
        </div>
      </div>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        ${[
          { key: 'performance' as const, label: 'Performance' },
          { key: 'accessibility' as const, label: 'Acessibilidade' },
          { key: 'best-practices' as const, label: 'Boas Práticas' },
          { key: 'seo' as const, label: 'SEO' },
        ].map(cat => {
          const m = report.pagespeed!.mobile[cat.key]
          const d = report.pagespeed!.desktop[cat.key]
          const avg = Math.round((m + d) / 2)
          const color = avg >= 90 ? 'text-green-600' : avg >= 70 ? 'text-yellow-600' : avg >= 50 ? 'text-orange-600' : 'text-red-600'
          const barColor = avg >= 90 ? 'bg-green-500' : avg >= 70 ? 'bg-yellow-500' : avg >= 50 ? 'bg-orange-500' : 'bg-red-500'
          return `
        <div class="bg-gray-50 rounded-xl p-4 text-center">
          <div class="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2">${cat.label}</div>
          <div class="flex items-center justify-center gap-3 mb-2">
            <span class="text-blue-600 font-bold text-lg tabular-nums">${m}</span>
            <span class="text-gray-300 text-sm">|</span>
            <span class="text-gray-500 font-bold text-lg tabular-nums">${d}</span>
          </div>
          <div class="w-full bg-gray-200 rounded-full h-2">
            <div class="h-2 rounded-full ${barColor}" style="width:${avg}%"></div>
          </div>
          <div class="text-xs text-gray-400 mt-1 flex justify-between">
            <span>M ${m}</span>
            <span class="font-semibold ${color}">${avg}</span>
            <span>D ${d}</span>
          </div>
        </div>`
        }).join('')}
      </div>
    </div>` : ''}

    <!-- Tabs -->
    <div class="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6" id="tabs">
      <button class="tab-btn px-5 py-2.5 rounded-lg font-medium text-sm bg-white shadow-sm" data-tab="findings">📋 Todos os Problemas</button>
      <button class="tab-btn px-5 py-2.5 rounded-lg font-medium text-sm text-gray-500 hover:text-gray-700" data-tab="categories">📁 Por Categoria</button>
      <button class="tab-btn px-5 py-2.5 rounded-lg font-medium text-sm text-gray-500 hover:text-gray-700" data-tab="pages">📄 Por Página</button>
      <button class="tab-btn px-5 py-2.5 rounded-lg font-medium text-sm text-gray-500 hover:text-gray-700" data-tab="deepseek">🤖 IA Análise</button>
    </div>

    <!-- Tab: Findings -->
    <div id="tab-findings" class="tab-content">
      <div class="flex gap-2 mb-4 flex-wrap">
        <input id="searchInput" type="text" placeholder="Buscar problemas..." class="px-4 py-2 border border-gray-200 rounded-xl text-sm flex-1 min-w-[200px] focus:outline-none focus:ring-2 focus:ring-blue-500">
        <select id="severityFilter" class="px-4 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="all">Todas severidades</option>
          <option value="critical">Crítico</option>
          <option value="high">Alto</option>
          <option value="medium">Médio</option>
          <option value="low">Baixo</option>
          <option value="info">Info</option>
        </select>
      </div>
      <div id="findingsList" class="space-y-3"></div>
    </div>

    <!-- Tab: Categories -->
    <div id="tab-categories" class="tab-content hidden">
      ${Object.entries(categories).map(([cat, items]) => `
      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-4">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-bold text-lg">${cat}</h3>
          <span class="bg-gray-100 px-3 py-1 rounded-full text-sm font-medium">${items.length}</span>
        </div>
        ${items.map(f => `
        <div class="severity-${f.severity} pl-4 py-2 mb-2 bg-gray-50 rounded-lg">
          <div class="font-medium text-sm">${f.title}</div>
          <div class="text-xs text-gray-500 mt-0.5">${f.url}</div>
        </div>`).join('')}
      </div>`).join('')}
    </div>

    <!-- Tab: Pages -->
    <div id="tab-pages" class="tab-content hidden">
      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h3 class="font-bold text-lg mb-4">Páginas com mais problemas</h3>
        <div class="space-y-3">
          ${topPages.map(([pageUrl, info]) => `
          <div class="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium truncate">${pageUrl}</div>
            </div>
            <div class="flex items-center gap-3 ml-4">
              ${info.critical > 0 ? `<span class="bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs font-medium">${info.critical} crítico</span>` : ''}
              ${info.high > 0 ? `<span class="bg-orange-100 text-orange-700 px-2 py-0.5 rounded text-xs font-medium">${info.high} alto</span>` : ''}
              <span class="bg-gray-100 px-2 py-0.5 rounded text-xs font-medium">${info.count} total</span>
            </div>
          </div>`).join('')}
        </div>
      </div>
    </div>

    <!-- Tab: DeepSeek -->
    <div id="tab-deepseek" class="tab-content hidden">
      <div class="flex items-center gap-3 mb-4">
        <span class="text-2xl">🤖</span>
        <div>
          <h3 class="font-bold text-lg text-gray-900">Análise</h3>
          <p class="text-sm text-gray-400">Relatório inteligente gerado pela IA</p>
        </div>
      </div>

      <!-- Score + stats row -->
      <div class="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4 text-center">
          <div class="text-2xl font-bold ${
            summary.overallScore >= 80 ? 'text-green-600' :
            summary.overallScore >= 60 ? 'text-yellow-600' :
            summary.overallScore >= 40 ? 'text-orange-600' : 'text-red-600'
          }">${summary.overallScore}</div>
          <div class="text-xs text-gray-500 mt-1 font-medium">SEO Score</div>
          <div class="mt-2 w-full bg-gray-200 rounded-full h-1.5">
            <div class="h-1.5 rounded-full ${
              summary.overallScore >= 80 ? 'bg-green-500' :
              summary.overallScore >= 60 ? 'bg-yellow-500' :
              summary.overallScore >= 40 ? 'bg-orange-500' : 'bg-red-500'
            }" style="width:${summary.overallScore}%"></div>
          </div>
        </div>
        ${[
          { label: 'Críticos', count: summary.criticalIssues, bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-600', textLabel: 'text-red-500' },
          { label: 'Altos', count: summary.highIssues, bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-600', textLabel: 'text-orange-500' },
          { label: 'Médios', count: summary.mediumIssues, bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-600', textLabel: 'text-yellow-500' },
          { label: 'Baixos', count: summary.lowIssues, bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-600', textLabel: 'text-green-500' },
        ].map(s => `
        <div class="${s.bg} rounded-xl border ${s.border} p-4 text-center">
          <div class="text-2xl font-bold ${s.text}">${s.count}</div>
          <div class="text-xs ${s.textLabel} mt-1 font-medium">${s.label}</div>
        </div>`).join('')}
      </div>

      <!-- Severity bar chart -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-4">
        <div class="flex items-center gap-2 mb-4">
          <span class="text-sm">📊</span>
          <h4 class="font-semibold text-sm text-gray-500 uppercase tracking-wide">Distribuição por Severidade</h4>
        </div>
        <div class="space-y-2.5">
          ${(['critical', 'high', 'medium', 'low', 'info'] as const).map(sev => {
            const count = findingsBySeverity[sev].length
            const maxCount = Math.max(...Object.values(findingsBySeverity).map((f: AuditFinding[]) => f.length), 1)
            const pct = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0
            const barColors: Record<string, string> = {
              critical: '#dc2626',
              high: '#ea580c',
              medium: '#ca8a04',
              low: '#16a34a',
              info: '#2563eb',
            }
            const labels: Record<string, string> = {
              critical: 'Crítico',
              high: 'Alto',
              medium: 'Médio',
              low: 'Baixo',
              info: 'Info',
            }
            return `
          <div class="flex items-center gap-3">
            <span class="text-xs font-medium w-16 text-gray-500">${labels[sev]}</span>
            <div class="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
              <div class="h-5 rounded-full transition-all duration-500" style="width:${pct}%;background:${barColors[sev]}"></div>
            </div>
            <span class="text-xs font-bold w-8 text-right text-gray-600 tabular-nums">${count}</span>
          </div>`
          }).join('')}
        </div>
      </div>

      <!-- DeepSeek analysis cards -->
      <div class="space-y-0">
        ${deepseekHtml}
      </div>
    </div>
  </main>

  <script>
  const findings = ${findingsJson}

  function renderFindings(list, filter = 'all', search = '') {
    const filtered = list.filter(f => {
      if (filter !== 'all' && f.severity !== filter) return false
      if (search && !f.title.toLowerCase().includes(search.toLowerCase()) && !f.url.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })

    if (filtered.length === 0) {
      return '<div class="text-center py-12 text-gray-400 font-medium">Nenhum problema encontrado com esses filtros.</div>'
    }

    return filtered.map(f => {
      const severityLabel = { critical: 'Crítico', high: 'Alto', medium: 'Médio', low: 'Baixo', info: 'Info' }[f.severity] || f.severity
      return \`
      <div class="finding-card severity-\${f.severity} bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <span class="text-xs font-bold uppercase px-2 py-0.5 rounded" style="background:\${getSeverityBg(f.severity)}; color:\${getSeverityText(f.severity)}">\${severityLabel}</span>
              <span class="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">\${f.category}</span>
            </div>
            <h4 class="font-semibold text-gray-900 mt-1">\${f.title}</h4>
            <p class="text-sm text-gray-600 mt-1">\${f.description}</p>
            <div class="mt-2 text-xs text-gray-400 truncate">\${f.url}</div>
          </div>
          <button onclick="this.nextElementSibling.classList.toggle('hidden')" class="shrink-0 text-gray-400 hover:text-gray-600 text-xl leading-none">&hellip;</button>
          <div class="hidden fixed inset-0 bg-black/40 flex items-center justify-center z-50" onclick="if(event.target===this)this.classList.add('hidden')">
            <div class="bg-white rounded-2xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto p-6" onclick="event.stopPropagation()">
              <div class="flex justify-between items-start mb-4">
                <h3 class="font-bold text-lg">\${f.title}</h3>
                <button onclick="this.closest('.fixed').classList.add('hidden')" class="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
              </div>
              <div class="space-y-4">
                <div>
                  <div class="text-xs font-semibold text-gray-400 uppercase tracking-wide">Categoria</div>
                  <div class="text-sm font-medium">\${f.category}</div>
                </div>
                <div>
                  <div class="text-xs font-semibold text-gray-400 uppercase tracking-wide">URL</div>
                  <div class="text-sm font-medium break-all">\${f.url}</div>
                </div>
                <div>
                  <div class="text-xs font-semibold text-gray-400 uppercase tracking-wide">Evidência</div>
                  <div class="text-sm">\${f.evidence}</div>
                </div>
                <div>
                  <div class="text-xs font-semibold text-gray-400 uppercase tracking-wide">Recomendação</div>
                  <div class="text-sm bg-blue-50 p-3 rounded-lg">\${f.recommendation}</div>
                </div>
                \${f.fix ? \`
                <div>
                  <div class="text-xs font-semibold text-gray-400 uppercase tracking-wide">Correção</div>
                  <pre class="text-sm bg-gray-900 text-green-400 p-4 rounded-xl overflow-x-auto mt-1"><code>\${f.fix}</code></pre>
                </div>\` : ''}
              </div>
            </div>
          </div>
        </div>
      </div>\`
    }).join('')
  }

  function getSeverityBg(s) { return { critical: '#fef2f2', high: '#fff7ed', medium: '#fefce8', low: '#f0fdf4', info: '#eff6ff' }[s] || '#f9fafb' }
  function getSeverityText(s) { return { critical: '#dc2626', high: '#ea580c', medium: '#ca8a04', low: '#16a34a', info: '#2563eb' }[s] || '#374151' }

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => { b.classList.remove('bg-white', 'shadow-sm'); b.classList.add('text-gray-500') })
      btn.classList.add('bg-white', 'shadow-sm'); btn.classList.remove('text-gray-500')
      document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'))
      document.getElementById('tab-' + btn.dataset.tab).classList.remove('hidden')
    })
  })

  // Render findings
  document.getElementById('findingsList').innerHTML = renderFindings(findings)
  document.getElementById('searchInput').addEventListener('input', (e) => {
    document.getElementById('findingsList').innerHTML = renderFindings(findings, document.getElementById('severityFilter').value, e.target.value)
  })
  document.getElementById('severityFilter').addEventListener('change', (e) => {
    document.getElementById('findingsList').innerHTML = renderFindings(findings, e.target.value, document.getElementById('searchInput').value)
  })
  </script>
</body>
</html>`
}

export function generateDashboardFromFindings(
  url: string,
  findings: AuditFinding[],
  totalPages: number,
  score: number,
  deepseekAnalysis: string,
  pagespeed?: { mobile: { performance: number; accessibility: number; 'best-practices': number; seo: number }; desktop: { performance: number; accessibility: number; 'best-practices': number; seo: number } }
): string {
  const report: AuditReport = {
    url,
    timestamp: new Date().toISOString(),
    summary: {
      totalPages,
      criticalIssues: findings.filter((f) => f.severity === 'critical').length,
      highIssues: findings.filter((f) => f.severity === 'high').length,
      mediumIssues: findings.filter((f) => f.severity === 'medium').length,
      lowIssues: findings.filter((f) => f.severity === 'low').length,
      overallScore: score,
    },
    findings,
    deepseekAnalysis,
    pagespeed,
  }
  return generateDashboard(report)
}
