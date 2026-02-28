import { ReactNode } from 'react'

type Props = {
  open: boolean
  title: string
  children: ReactNode
  onClose: () => void
  modalClassName?: string
}

export default function FormModal({ open, title, children, onClose, modalClassName }: Props) {
  if (!open) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal-card form-modal-card ${modalClassName || ''}`.trim()} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{title}</div>
        <div className="form-modal-content">{children}</div>
      </div>
    </div>
  )
}
