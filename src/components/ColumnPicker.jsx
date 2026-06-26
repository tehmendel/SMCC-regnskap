import { useState, useRef, useEffect } from 'react'

export function ColumnPicker({ prefs, style }) {
  const [open, setOpen] = useState(false)
  const ref = useRef()
  const dragIdx = useRef(null)

  useEffect(() => {
    function close(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const visible  = prefs.orderedVisible
  const hidden   = prefs.allColumns.filter(c => !prefs.isVisible(c.key))

  return (
    <div ref={ref} style={{ position: 'relative', ...style }}>
      <button className="btn btn-sm btn-secondary" onClick={() => setOpen(v => !v)}>
        ⚙ Kolonner
      </button>
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 4px)',
          background: 'var(--steel)', border: '1px solid var(--border)',
          borderRadius: 6, zIndex: 300, minWidth: 220,
          boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
        }}>

          {/* Visible (draggable for reordering) */}
          <div style={{ padding: '8px 14px 4px', fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>
            Aktive kolonner — dra for å endre rekkefølge
          </div>
          {visible.map((col, idx) => (
            <div
              key={col.key}
              draggable
              onDragStart={() => { dragIdx.current = idx }}
              onDragOver={e => e.preventDefault()}
              onDrop={() => {
                if (dragIdx.current !== null && dragIdx.current !== idx) {
                  prefs.moveColumn(dragIdx.current, idx)
                }
                dragIdx.current = null
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 14px', fontSize: 13, cursor: 'grab', userSelect: 'none',
              }}
            >
              <span style={{ color: 'var(--muted)', fontSize: 11, lineHeight: 1 }}>⠿</span>
              <span style={{ flex: 1 }}>{col.label}</span>
              <button
                onClick={() => prefs.toggle(col.key)}
                style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 14, padding: '0 2px', lineHeight: 1 }}
                title="Skjul kolonne"
              >✕</button>
            </div>
          ))}

          {/* Hidden columns */}
          {hidden.length > 0 && (
            <>
              <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
              <div style={{ padding: '4px 14px 4px', fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>
                Skjulte kolonner
              </div>
              {hidden.map(col => (
                <label
                  key={col.key}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '4px 14px', cursor: 'pointer', fontSize: 13, userSelect: 'none',
                    color: 'var(--muted)',
                  }}
                >
                  <input type="checkbox" checked={false} onChange={() => prefs.toggle(col.key)} />
                  {col.label}
                </label>
              ))}
            </>
          )}

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
