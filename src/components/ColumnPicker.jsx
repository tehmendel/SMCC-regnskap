import { useState, useRef, useEffect } from 'react'

export function ColumnPicker({ prefs, style }) {
  const [open, setOpen] = useState(false)
  const ref = useRef()

  useEffect(() => {
    function close(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative', ...style }}>
      <button className="btn btn-sm btn-secondary" onClick={() => setOpen(v => !v)}>
        ⚙ Kolonner
      </button>
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 4px)',
          background: 'var(--steel)', border: '1px solid var(--border)',
          borderRadius: 6, zIndex: 300, minWidth: 200,
          boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
        }}>
          <div style={{
            padding: '8px 14px 5px',
            fontSize: 10, color: 'var(--muted)',
            textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600,
          }}>
            Vis kolonner
          </div>
          {prefs.allColumns.map(col => (
            <label key={col.key} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '5px 14px', cursor: 'pointer', fontSize: 13, userSelect: 'none',
            }}>
              <input type="checkbox"
                checked={prefs.isVisible(col.key)}
                onChange={() => prefs.toggle(col.key)} />
              {col.label}
            </label>
          ))}
          <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
          <button
            style={{
              background: 'none', border: 'none', color: 'var(--muted)',
              padding: '5px 14px 8px', cursor: 'pointer', fontSize: 12,
              width: '100%', textAlign: 'left',
            }}
            onClick={() => { prefs.reset(); setOpen(false) }}
          >
            ↺ Tilbakestill til standard
          </button>
        </div>
      )}
    </div>
  )
}
