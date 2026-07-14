export function fmt(amount, decimals = 0) {
  if (amount === null || amount === undefined) return '—'
  return new Intl.NumberFormat('nb-NO', {
    style: 'currency',
    currency: 'NOK',
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(amount)
}

export function fmtNum(n) {
  if (n === null || n === undefined) return '—'
  return new Intl.NumberFormat('nb-NO').format(n)
}

export function fmtDate(d) {
  if (!d) return '—'
  const s = String(d).slice(0, 10)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) return `${m[3]}.${m[2]}.${m[1]}`
  return new Date(d).toLocaleDateString('nb-NO', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Parse Norwegian date (dd.mm.yyyy) or ISO (yyyy-mm-dd) to ISO string for DB
export function parseNorDate(s) {
  if (!s) return null
  s = String(s).trim()
  const nor = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (nor) return `${nor[3]}-${nor[2].padStart(2, '0')}-${nor[1].padStart(2, '0')}`
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  return null
}

export function fmtPct(n) {
  if (n === null || n === undefined) return '—'
  return `${(n * 100).toFixed(1)} %`
}

export const MONTHS = ['Jan','Feb','Mar','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Des']
export const MONTH_NAMES = ['Januar','Februar','Mars','April','Mai','Juni','Juli','August','September','Oktober','November','Desember']

const CURRENT_YEAR = new Date().getFullYear()
export function getYearRange(back = 4, forward = 1) {
  return Array.from({ length: back + forward + 1 }, (_, i) => CURRENT_YEAR - back + i)
}
