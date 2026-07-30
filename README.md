# IA SEO Audit

Auditoria técnica de SEO com inteligência artificial. Crawleia seu site, execute dezenas de verificações e receba uma análise completa com recomendações priorizadas — tudo via CLI com dashboard interativo.

## Features

| Funcionalidade | Descrição |
|---|---|
| **Crawler inteligente** | Crawleia a partir da homepage ou do `sitemap.xml`. Respeita `robots.txt`, limite de páginas e concorrência configurável |
| **Auditoria técnica** | 20+ verificações: status code, noindex, canonical, titles, meta, H1, alt text, tempo de carregamento, conteúdo raso, dados estruturados, duplicatas |
| **DeepSeek IA** | Análise em português do Brasil com DeepSeek, dividida em seções (Resumo Executivo, Problemas Críticos, SEO On-Page, Saúde Técnica, Conteúdo, Correções Priorizadas) |
| **Google Search Console** | Importa dados reais de cliques, impressões, CTR e posição dos últimos 28 dias |
| **PageSpeed Insights** | Scores Lighthouse (Performance, Acessibilidade, Boas Práticas, SEO) para mobile e desktop |
| **Dashboard interativo** | Servidor local com cards de score, gráficos de severidade, análise DeepSeek estruturada em cards com ícones, filtros e busca |
| **Correções automáticas** | Peça ao DeepSeek para gerar correções específicas para qualquer problema encontrado |
| **Watch mode** | Re-audite em intervalo configurável com dashboard atualizado automaticamente |

## SEO Score

O SEO Score é calculado a partir dos problemas encontrados durante a auditoria. Cada severidade tem um peso:

| Severidade | Peso | Exemplos |
|---|---|---|
| **Crítico** | −12 | Indexação bloqueada, noindex em página importante, redirect quebrado |
| **Alto** | −6 | H1 ausente, title duplicado, meta description ausente |
| **Médio** | −2 | H1 desalinhado com title, imagens sem alt text, conteúdo raso |
| **Baixo** | −1 | Dados estruturados ausentes, avisos menores |
| **Info** | 0 | Observações, sugestões |

O score começa em **100** e cada problema encontrado reduz a pontuação de acordo com seu peso. O resultado é limitado entre **5** (mínimo) e **100** (máximo).

```
Score = max(5, 100 − (12×críticos + 6×altos + 2×médios + 1×baixos))
```

## Quick Start

```bash
# Clone e instale
git clone <seu-repo>
cd deepseek-seo-audit
npm install

# Configure sua chave DeepSeek
cp .env.example .env
# Edite .env com sua DEEPSEEK_API_KEY

# Audite um site
npx tsx src/index.ts audit https://meusite.com.br
```

## CLI Usage

```
seo-audit [command] [options] <url>

Commands:
  audit   Auditoria completa (crawl + verificações + análise DeepSeek)
  crawl   Apenas crawlear o site, saída JSON
  analyze Análise detalhada de uma única página com DeepSeek
  fix     Gerar correção para um problema específico
  suggest Sugestões de melhoria para uma página
  serve   Servir um relatório existente como dashboard
  watch   Crawlear + auditar + servir dashboard continuamente
```

### Global Options

| Opção | Descrição |
|---|---|
| `-p, --max-pages <n>` | Máximo de páginas para crawlear (default: `1000`) |
| `--sitemap` | Iniciar crawl a partir do `sitemap.xml` em vez da homepage |
| `-o, --output <file>` | Salvar relatório em arquivo (.md ou .json) |
| `--html` | Gerar relatório em HTML |
| `-s, --serve` | Iniciar servidor local com dashboard após a auditoria |
| `--port <n>` | Porta do dashboard (default: `3456`) |

### Examples

```bash
# Auditoria completa com dashboard
npx tsx src/index.ts audit https://meusite.com.br -s

# Crawleando a partir do sitemap, 200 páginas
npx tsx src/index.ts audit https://meusite.com.br --sitemap -p 200 -s

# Auditoria com todas as fontes de dados (GSC + PageSpeed)
# (configure .env primeiro)
npx tsx src/index.ts audit https://meusite.com.br -p 50 --serve

# Watch mode: re-audita a cada 30 minutos
npx tsx src/index.ts watch https://meusite.com.br --interval 30

# Apenas crawlear e salvar JSON
npx tsx src/index.ts crawl https://meusite.com.br -p 500 -o crawl.json

# Análise de página única
npx tsx src/index.ts analyze https://meusite.com.br/contato
```

## Dashboard Interativo

Quando usado com a flag `-s` ou `--serve`, o SEO Audit inicia um servidor HTTP local com um dashboard completo:

- **Score card** — SEO Score com barra de progresso colorida
- **PageSpeed card** — Scores Lighthouse (mobile/desktop) para Performance, Acessibilidade, Boas Práticas e SEO
- **Severidade** — Cards com contagem de problemas por severidade + gráfico de barras
- **Aba DeepSeek** — Análise completa da IA em português, estruturada em cards com ícones, tabelas com bordas e formatação rica
- **Achados** — Tabela interativa com busca, filtro por severidade e modal de detalhes com evidência, recomendação e correção
- **Por Categoria** — Problemas agrupados por categoria
- **Por Página** — Top páginas com mais problemas

## Environment Variables

| Variável | Obrigatório | Descrição |
|---|---|---|
| `DEEPSEEK_API_KEY` | ✅ Sim | Sua chave da API DeepSeek |
| `GOOGLE_APPLICATION_CREDENTIALS` | ❌ Não | Caminho para o JSON da service account do Google Search Console |
| `PAGE_SPEED_API_KEY` | ❌ Não | Chave da API PageSpeed Insights (https://developers.google.com/speed/docs/insights/v5/get-started) |
| `DEEPSEEK_MODEL` | ❌ Não | Modelo DeepSeek (default: `deepseek-chat`) |
| `MAX_CRAWL_PAGES` | ❌ Não | Máximo de páginas por crawl (default: `1000`) |
| `SAC_DATA_DIR` | ❌ Não | Diretório para dados (default: `./data`) |

## Arquitetura

```
src/
├── index.ts              # CLI (Commander) — entrada principal
├── config.ts             # Config unificada via dotenv
├── types.ts              # Tipos compartilhados
├── crawler/
│   └── index.ts          # Crawler com suporte a sitemap.xml
├── audit/
│   └── checks.ts         # 20+ verificações SEO + cálculo de score
├── deepseek/
│   └── client.ts         # Cliente DeepSeek com prompts em pt-BR
├── gsc/
│   └── client.ts         # Integração Google Search Console API
├── pagespeed/
│   └── client.ts         # Integração PageSpeed Insights API
├── server/
│   ├── index.ts          # Servidor HTTP
│   └── dashboard.ts      # Geração do HTML do dashboard (Tailwind CSS via CDN)
└── utils/
    └── index.ts          # Utilitários de formatação
```

## License

Source-available. Free for personal and educational use.
