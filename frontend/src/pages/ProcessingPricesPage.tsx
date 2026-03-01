import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { ProcessingPrice } from '../types'
import { I18nKey } from '../lib/i18n'
import ConfirmModal from '../components/ConfirmModal'
import FormModal from '../components/FormModal'

type Props = { token: string; notify: (message: string, type: 'success' | 'error') => void; t: (key: I18nKey) => string }

const PAGE_SIZE_OPTIONS = [5, 10]
const fmt2 = (v?: number | null) => {
  if (v == null || Number.isNaN(Number(v))) return '-'
  return Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function ProcessingPricesPage({ token, notify, t }: Props) {
  const [rows, setRows] = useState<ProcessingPrice[]>([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<ProcessingPrice | null>(null)
  const [pendingDelete, setPendingDelete] = useState<ProcessingPrice | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)

  const [processName, setProcessName] = useState('')
  const [unitPrice, setUnitPrice] = useState('')
  const [note, setNote] = useState('')

  const load = async () => {
    const data = await api<ProcessingPrice[]>(`/api/processing-prices?search=${encodeURIComponent(search)}`, 'GET', undefined, token)
    setRows(data)
    setPage(1)
  }

  useEffect(() => {
    void load()
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load()
    }, 250)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    const valid = new Set(rows.map((r) => r.id))
    setSelectedIds((prev) => new Set([...prev].filter((id) => valid.has(id))))
  }, [rows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => (r.process_name || '').toLowerCase().includes(q))
  }, [rows, search])

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!processName.trim()) return
    if (unitPrice.trim() === '' || Number.isNaN(Number(unitPrice))) {
      notify(t('msgInvalidUnitPrice'), 'error')
      return
    }
    const payload = {
      process_name: processName.trim(),
      unit_price: unitPrice.trim(),
      note: note.trim(),
    }
    try {
      if (editing) {
        await api(`/api/processing-prices/${editing.id}`, 'PUT', payload, token)
        notify(t('processingPriceUpdated'), 'success')
      } else {
        await api('/api/processing-prices', 'POST', payload, token)
        notify(t('processingPriceCreated'), 'success')
      }
      setShowForm(false)
      setEditing(null)
      setProcessName('')
      setUnitPrice('')
      setNote('')
      await load()
    } catch (err) {
      notify((err as Error).message, 'error')
    }
  }

  const deleteOne = async () => {
    if (!pendingDelete) return
    try {
      await api(`/api/processing-prices/${pendingDelete.id}`, 'DELETE', undefined, token)
      setPendingDelete(null)
      notify(t('processingPriceDeleted'), 'success')
      await load()
    } catch (err) {
      notify((err as Error).message, 'error')
    }
  }

  const deleteSelected = async () => {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    try {
      const results = await Promise.allSettled(ids.map((id) => api(`/api/processing-prices/${id}`, 'DELETE', undefined, token)))
      const successCount = results.filter((r) => r.status === 'fulfilled').length
      if (successCount > 0) notify(`${t('deleteSelected')}: ${successCount}/${ids.length}`, 'success')
      else notify(`${t('deleteSelected')}: 0/${ids.length}`, 'error')
      setSelectedIds(new Set())
      setShowBulkDeleteConfirm(false)
      await load()
    } catch (err) {
      notify((err as Error).message, 'error')
    }
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * pageSize
  const paged = filtered.slice(start, start + pageSize)
  const pageIds = paged.map((r) => r.id)
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id))
  const toggleSelectAllPage = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      pageIds.forEach((id) => {
        if (checked) next.add(id)
        else next.delete(id)
      })
      return next
    })
  }

  return (
    <div className="page-content">
      <div className="row toolbar-row">
        <input className="toolbar-search-input" placeholder={t('searchProcessingPrice')} value={search} onChange={(e) => setSearch(e.target.value)} />
        <button
          className="danger-light toolbar-add-btn"
          type="button"
          disabled={selectedIds.size === 0}
          onClick={() => setShowBulkDeleteConfirm(true)}
        >
          {t('deleteSelected')}
        </button>
        <button
          className="primary-light"
          type="button"
          onClick={() => {
            setEditing(null)
            setProcessName('')
            setUnitPrice('')
            setNote('')
            setShowForm(true)
          }}
        >
          <Plus size={15} /> {t('addProcessingPrice')}
        </button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th><input type="checkbox" checked={allPageSelected} onChange={(e) => toggleSelectAllPage(e.target.checked)} /></th>
              <th>{t('colProcessName')}</th>
              <th>{t('colUnitPrice')}</th>
              <th>{t('lblOtherNote')}</th>
              <th>{t('colUpdatedAt')}</th>
              <th>{t('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {paged.length > 0 ? paged.map((r) => (
              <tr key={r.id}>
                <td><input type="checkbox" checked={selectedIds.has(r.id)} onChange={(e) => {
                  const checked = e.target.checked
                  setSelectedIds((prev) => {
                    const next = new Set(prev)
                    if (checked) next.add(r.id)
                    else next.delete(r.id)
                    return next
                  })
                }} /></td>
                <td>{r.process_name}</td>
                <td>{`${fmt2(r.unit_price)}$`}</td>
                <td>{r.note || '-'}</td>
                <td>{r.updated_at}</td>
                <td>
                  <div className="row action-row">
                    <button
                      type="button"
                      className="icon-btn"
                      title={t('edit')}
                      aria-label={t('edit')}
                      onClick={() => {
                        setEditing(r)
                        setProcessName(r.process_name)
                        setUnitPrice(String(r.unit_price ?? ''))
                        setNote(r.note || '')
                        setShowForm(true)
                      }}
                    >
                      <Pencil size={14} />
                    </button>
                    <button type="button" className="danger-light icon-btn" title={t('delete')} aria-label={t('delete')} onClick={() => setPendingDelete(r)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            )) : (
              <tr><td className="empty-cell" colSpan={6}>{t('noData')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="table-pagination">
        <div className="row action-row">
          <span>{t('rowsPerPage')}</span>
          <select
            value={pageSize}
            onChange={(e) => {
              const next = Math.min(10, Math.max(1, Number(e.target.value) || 10))
              setPageSize(next)
              setPage(1)
            }}
          >
            {PAGE_SIZE_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        </div>
        <div className="row action-row">
          <button type="button" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>{t('prev')}</button>
          <span>{t('page')} {safePage}/{totalPages}</span>
          <button type="button" disabled={safePage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>{t('next')}</button>
        </div>
      </div>

      <FormModal open={showForm} title={editing ? `${t('edit')}: ${editing.process_name}` : t('addProcessingPrice')} onClose={() => setShowForm(false)}>
        <form onSubmit={save}>
          <div className="grid-2">
            <div className="form-field">
              <label>{t('colProcessName')}</label>
              <input value={processName} onChange={(e) => setProcessName(e.target.value)} placeholder={t('phProcessName')} required />
            </div>
            <div className="form-field">
              <label>{t('colUnitPrice')}</label>
              <div className="input-postfix-wrap">
                <input type="number" step="any" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} placeholder={t('phUnitPrice')} required />
                <span>$</span>
              </div>
            </div>
            <div className="form-field full-width">
              <label>{t('lblOtherNote')}</label>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('phOtherNote')} />
            </div>
          </div>
          <div className="row form-actions">
            <button className="primary" type="submit">{t('save')}</button>
            <button type="button" onClick={() => setShowForm(false)}>{t('cancel')}</button>
          </div>
        </form>
      </FormModal>

      <ConfirmModal
        open={!!pendingDelete}
        title={t('confirmTitle')}
        message={`${t('confirmDeleteProcessingPrice')} ${pendingDelete?.process_name ?? ''}?`}
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        onConfirm={() => void deleteOne()}
        onCancel={() => setPendingDelete(null)}
      />
      <ConfirmModal
        open={showBulkDeleteConfirm}
        title={t('confirmTitle')}
        message={`${t('confirmDeleteSelected')} (${selectedIds.size})?`}
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        onConfirm={() => void deleteSelected()}
        onCancel={() => setShowBulkDeleteConfirm(false)}
      />
    </div>
  )
}
