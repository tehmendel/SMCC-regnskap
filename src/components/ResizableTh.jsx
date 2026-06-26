import { useRef } from 'react'

export function ResizableTh({ colKey, prefs, children, className, style }) {
  const thRef = useRef()

  function onMouseDown(e) {
    e.preventDefault()
    const startX = e.clientX
    const startW = thRef.current.offsetWidth

    function onMove(ev) {
      prefs.setWidth(colKey, Math.max(48, startW + ev.clientX - startX))
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const w = prefs?.getWidth(colKey)

  return (
    <th
      ref={thRef}
      className={className}
      style={{ ...style, width: w ? `${w}px` : undefined, position: 'relative', userSelect: 'none' }}
    >
      {children}
      <div
        onMouseDown={onMouseDown}
        style={{
          position: 'absolute', right: 0, top: 0, bottom: 0,
          width: 5, cursor: 'col-resize',
          background: 'transparent',
        }}
      />
    </th>
  )
}
