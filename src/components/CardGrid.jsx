import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { SortableCard } from './SortableCard'
import { useCardLayout } from '../hooks/useCardLayout'

export function CardGrid({ pageKey, cards }) {
  const { sortedCards, order, saveOrder } = useCardLayout(pageKey, cards)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  function handleDragEnd({ active, over }) {
    if (!over || active.id === over.id) return
    const oldIndex = order.indexOf(String(active.id))
    const newIndex = order.indexOf(String(over.id))
    if (oldIndex !== -1 && newIndex !== -1)
      saveOrder(arrayMove(order, oldIndex, newIndex))
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={order} strategy={verticalListSortingStrategy}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {sortedCards.map(card => (
            <SortableCard key={card.id} id={card.id}>
              {card.content}
            </SortableCard>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
