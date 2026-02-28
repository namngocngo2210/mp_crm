import { ReactNode } from 'react'

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
  if (!open) return null

  return (
    <div className="modal-overlay" onClick={onCancel}>
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
