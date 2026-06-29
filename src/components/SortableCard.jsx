import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

export function SortableCard({ id, children, style }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        position: 'relative',
        ...style,
      }}
    >
      {/* Drag handle — shows on hover */}
      <div
        {...attributes}
        {...listeners}
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          zIndex: 10,
          cursor: 'grab',
          color: 'var(--graphite)',
          fontSize: 14,
          padding: '2px 4px',
          borderRadius: 4,
          opacity: 0,
          transition: 'opacity 0.15s',
          userSelect: 'none',
        }}
        className="drag-handle"
        title="Dra for å flytte"
      >
        ⠿
      </div>
      {children}
    </div>
  )
}
