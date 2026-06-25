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
  return new Date(d).toLocaleDateString('nb-NO')
}

export function fmtPct(n) {
  if (n === null || n === undefined) return '—'
  return `${(n * 100).toFixed(1)} %`
}

export const MONTHS = ['Jan','Feb','Mar','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Des']
export const MONTH_NAMES = ['Januar','Februar','Mars','April','Mai','Juni','Juli','August','September','Oktober','November','Desember']
