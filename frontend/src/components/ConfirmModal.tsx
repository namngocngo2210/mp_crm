import { MouseEvent, ReactNode, useRef } from 'react'

type Props = {
  open: boolean
  title: string
  message: ReactNode
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: Props) {
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
      onCancel()
    }
  }

  if (!open) return null

  return (
    <div className="modal-overlay" onMouseDown={onOverlayMouseDown} onMouseUp={onOverlayMouseUp}>
      <div className="modal-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{title}</div>
        <div className="modal-message">{message}</div>
        <div className="row form-actions modal-actions">
          <button type="button" className="danger-light" onClick={onConfirm}>{confirmLabel}</button>
          <button type="button" onClick={onCancel}>{cancelLabel}</button>
        </div>
      </div>
    </div>
  )
}
