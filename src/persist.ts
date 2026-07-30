import fs from 'fs'
import path from 'path'
import { AuditReport } from './types.js'
import { config } from './config.js'

const REPORT_FILE = 'last-report.json'

export function ensureDataDir(): string {
  const dir = path.resolve(config.dataDir)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

export function saveReport(report: AuditReport): string {
  const dir = ensureDataDir()
  const filePath = path.join(dir, REPORT_FILE)
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf-8')
  return filePath
}

export function loadReport(): AuditReport | null {
  const dir = path.resolve(config.dataDir)
  const filePath = path.join(dir, REPORT_FILE)
  if (!fs.existsSync(filePath)) return null
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(raw) as AuditReport
  } catch {
    return null
  }
}
