import { MouseEvent, ReactNode, useRef } from 'react'

type Props = {
  open: boolean
  title: string
  children: ReactNode
  onClose: () => void
  modalClassName?: string
}

export default function FormModal({ open, title, children, onClose, modalClassName }: Props) {
  const pointerStartRef = useRef<{ x: number; y: number; onOverlay: boolean } | null>(null)

  const onOverlayMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    pointerStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      onOverlay: e.target === e.currentTarget,
    }
  }

  const onOverlayMouseUp = (e: MouseEvent<HTMLDivElement>) => {
    const start = pointerStartRef.current
    pointerStartRef.current = null
    if (!start) return
    const endOnOverlay = e.target === e.currentTarget
    const moved = Math.abs(e.clientX - start.x) > 6 || Math.abs(e.clientY - start.y) > 6
    if (start.onOverlay && endOnOverlay && !moved) {
      onClose()
    }
  }

  if (!open) return null

  return (
    <div className="modal-overlay" onMouseDown={onOverlayMouseDown} onMouseUp={onOverlayMouseUp}>
      <div className={`modal-card form-modal-card ${modalClassName || ''}`.trim()} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{title}</div>
        <div className="form-modal-content">{children}</div>
      </div>
    </div>
  )
}
