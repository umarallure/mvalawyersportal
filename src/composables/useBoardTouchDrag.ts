/**
 * Touch drag-and-drop for the kanban boards (My Cases / Fulfillment / Invoicing).
 *
 * The boards use native HTML5 drag-and-drop, which never fires on touch screens,
 * so dragging a card on a phone/tablet does nothing. This composable adds a
 * parallel, touch-only path:
 *
 *  - press-and-hold a card briefly to pick it up (a quick swipe still scrolls
 *    the board / column instead of starting a drag),
 *  - a styled clone of the card follows the finger,
 *  - the column under the finger is highlighted and used as the drop target,
 *  - dragging near the left/right edge auto-scrolls the board so cards can be
 *    moved between columns that aren't both on screen.
 *
 * Desktop mouse drag is untouched — these are additive touch handlers.
 */
import { onScopeDispose } from 'vue'

interface BoardTouchDragOptions<T> {
  /** Attribute on each droppable column that holds its stage / status key. */
  stageAttr?: string
  /** Selector for the horizontal scroll container (used for edge auto-scroll). */
  scrollSelector?: string
  /** Hold duration (ms) before a press becomes a drag. */
  longPressMs?: number
  /** Movement (px) before activation that cancels the press (treated as a scroll). */
  moveThreshold?: number
  /** Called when a drag actually starts — set your drag state here. */
  onStart: (payload: T) => void
  /** Called on release over a column — perform the move. */
  onDrop: (targetStage: string, payload: T) => void
  /** Called when released without a valid target, or cancelled. */
  onCancel: (payload: T) => void
}

export function useBoardTouchDrag<T>(options: BoardTouchDragOptions<T>) {
  const stageAttr = options.stageAttr ?? 'data-board-stage'
  const scrollSelector = options.scrollSelector ?? '.ap-mobile-board-shell'
  const longPressMs = options.longPressMs ?? 200
  const moveThreshold = options.moveThreshold ?? 12

  let payload: T | null = null
  let cardEl: HTMLElement | null = null
  let scrollEl: HTMLElement | null = null
  let ghost: HTMLElement | null = null
  let highlighted: HTMLElement | null = null
  let offsetX = 0
  let offsetY = 0
  let startX = 0
  let startY = 0
  let lastX = 0
  let lastY = 0
  let active = false
  let pressTimer: number | null = null
  let rafId = 0
  let prevSnapType = ''

  function columnFromPoint(x: number, y: number): HTMLElement | null {
    const el = document.elementFromPoint(x, y) as HTMLElement | null
    return el?.closest<HTMLElement>(`[${stageAttr}]`) ?? null
  }

  function clearHighlight() {
    if (highlighted) {
      highlighted.style.removeProperty('box-shadow')
      highlighted = null
    }
  }

  function setHighlight(el: HTMLElement | null) {
    if (el === highlighted) return
    clearHighlight()
    if (el) {
      el.style.boxShadow = 'inset 0 0 0 2px var(--ap-accent)'
      highlighted = el
    }
  }

  function moveGhost(x: number, y: number) {
    if (ghost) {
      ghost.style.transform = `translate(${x - offsetX}px, ${y - offsetY}px) rotate(2deg) scale(1.03)`
    }
  }

  function autoScroll() {
    if (!active) return
    if (scrollEl) {
      const r = scrollEl.getBoundingClientRect()
      const edge = 56
      if (lastX < r.left + edge) scrollEl.scrollLeft -= 12
      else if (lastX > r.right - edge) scrollEl.scrollLeft += 12
    }
    rafId = requestAnimationFrame(autoScroll)
  }

  function createGhost() {
    if (!cardEl) return
    const rect = cardEl.getBoundingClientRect()
    const clone = cardEl.cloneNode(true) as HTMLElement
    clone.style.position = 'fixed'
    clone.style.left = '0'
    clone.style.top = '0'
    clone.style.width = `${rect.width}px`
    clone.style.height = `${rect.height}px`
    clone.style.margin = '0'
    clone.style.zIndex = '99999'
    clone.style.pointerEvents = 'none'
    clone.style.boxShadow = '0 12px 32px rgba(0,0,0,0.22), 0 2px 6px rgba(0,0,0,0.14)'
    clone.style.borderRadius = '12px'
    clone.style.opacity = '0.95'
    clone.style.transition = 'none'
    clone.style.willChange = 'transform'
    // Hold the card at the same point under the finger where it was grabbed.
    offsetX = startX - rect.left
    offsetY = startY - rect.top
    document.body.appendChild(clone)
    ghost = clone
    moveGhost(startX, startY)
  }

  function activate() {
    if (!cardEl) return
    active = true
    cardEl.style.opacity = '0.4'
    createGhost()
    // Disable scroll-snap so programmatic edge auto-scroll stays smooth.
    if (scrollEl) {
      prevSnapType = scrollEl.style.scrollSnapType
      scrollEl.style.scrollSnapType = 'none'
    }
    if (payload != null) options.onStart(payload)
    try { navigator.vibrate?.(12) } catch { /* vibration unsupported */ }
    rafId = requestAnimationFrame(autoScroll)
  }

  function cleanup() {
    if (pressTimer != null) { clearTimeout(pressTimer); pressTimer = null }
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0 }
    document.removeEventListener('touchmove', onTouchMove)
    document.removeEventListener('touchend', onTouchEnd)
    document.removeEventListener('touchcancel', onTouchCancel)
    if (ghost) { ghost.remove(); ghost = null }
    if (cardEl) cardEl.style.removeProperty('opacity')
    if (scrollEl) scrollEl.style.scrollSnapType = prevSnapType
    clearHighlight()
    active = false
    cardEl = null
    scrollEl = null
    payload = null
  }

  function onTouchMove(e: TouchEvent) {
    const t = e.touches[0]
    if (!t) return
    lastX = t.clientX
    lastY = t.clientY

    if (!active) {
      // Moved before the hold completed → user is scrolling, not dragging.
      if (Math.abs(t.clientX - startX) > moveThreshold || Math.abs(t.clientY - startY) > moveThreshold) {
        cleanup()
      }
      return
    }

    e.preventDefault() // stop the board/column from scrolling while dragging
    moveGhost(t.clientX, t.clientY)
    setHighlight(columnFromPoint(t.clientX, t.clientY))
  }

  function onTouchEnd() {
    if (active && payload != null) {
      const stage = columnFromPoint(lastX, lastY)?.getAttribute(stageAttr)
      if (stage) options.onDrop(stage, payload)
      else options.onCancel(payload)
    }
    cleanup()
  }

  function onTouchCancel() {
    if (active && payload != null) options.onCancel(payload)
    cleanup()
  }

  function onCardTouchStart(e: TouchEvent, data: T) {
    if (e.touches.length !== 1) return
    // Don't hijack presses that start on an interactive control inside the card.
    const target = e.target as HTMLElement | null
    if (target?.closest('button, a, input, select, textarea, [role="button"]')) return

    const t = e.touches[0]
    payload = data
    cardEl = e.currentTarget as HTMLElement
    scrollEl = cardEl.closest<HTMLElement>(scrollSelector)
    startX = lastX = t.clientX
    startY = lastY = t.clientY

    document.addEventListener('touchmove', onTouchMove, { passive: false })
    document.addEventListener('touchend', onTouchEnd)
    document.addEventListener('touchcancel', onTouchCancel)
    pressTimer = window.setTimeout(activate, longPressMs)
  }

  onScopeDispose(cleanup)

  return { onCardTouchStart }
}
