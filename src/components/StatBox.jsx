export function StatBox({ label, value, type, sub, children, style }) {
  return (
    <div className="stat-box" style={style}>
      <div className="stat-label">{label}</div>
      <div className={`stat-value${type ? ` ${type}` : ''}`}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{sub}</div>}
      {children}
    </div>
  )
}

export function StatGrid({ children, style }) {
  return (
    <div className="stat-grid" style={style}>
      {children}
    </div>
  )
}
