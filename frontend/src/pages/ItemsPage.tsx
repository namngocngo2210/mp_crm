import { FormEvent, useEffect, useRef, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { Item } from '../types'
import { I18nKey } from '../lib/i18n'
import ConfirmModal from '../components/ConfirmModal'
import FormModal from '../components/FormModal'

type Props = { token: string; notify: (message: string, type: 'success' | 'error') => void; t: (key: I18nKey) => string }

const PAGE_SIZE_OPTIONS = [5, 10]

export default function ItemsPage({ token, notify, t }: Props) {
  const [rows, setRows] = useState<Item[]>([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Item | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Item | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)
  const [itemName, setItemName] = useState('')
  const [itemColor, setItemColor] = useState('')
  const firstRun = useRef(true)

  const load = async () => {
    const data = await api<Item[]>(`/api/items?search=${encodeURIComponent(search)}`, 'GET', undefined, token)
    setRows(data)
    setPage(1)
  }

  useEffect(() => { void load() }, [])

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    const timer = window.setTimeout(() => { void load() }, 250)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    const valid = new Set(rows.map((r) => r.id))
    setSelectedIds((prev) => new Set([...prev].filter((id) => valid.has(id))))
  }, [rows])

  const save = async (e: FormEvent) => {
    e.preventDefault()
    const name = itemName.trim()
    if (!name) return
    try {
      if (editing) {
        await api(`/api/items/${editing.id}`, 'PUT', { item_name: name, item_color: itemColor.trim() || null }, token)
        notify(t('itemUpdated'), 'success')
      } else {
        await api('/api/items', 'POST', { item_name: name, item_color: itemColor.trim() || null }, token)
        notify(t('itemCreated'), 'success')
      }
      setShowForm(false)
      setEditing(null)
      setItemName('')
      setItemColor('')
      await load()
    } catch (err) {
      notify((err as Error).message, 'error')
    }
  }

  const deleteItem = async () => {
    if (!pendingDelete) return
    try {
      await api(`/api/items/${pendingDelete.id}`, 'DELETE', undefined, token)
      setPendingDelete(null)
      notify(t('itemDeleted'), 'success')
      await load()
    } catch (err) {
      notify((err as Error).message, 'error')
    }
  }

  const toggleSelectRow = (id: number, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const deleteSelectedItems = async () => {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    try {
      const results = await Promise.allSettled(ids.map((id) => api(`/api/items/${id}`, 'DELETE', undefined, token)))
      const successCount = results.filter((r) => r.status === 'fulfilled').length
      if (successCount > 0) {
        notify(`${t('deleteSelected')}: ${successCount}/${ids.length}`, 'success')
      } else {
        notify(`${t('deleteSelected')}: 0/${ids.length}`, 'error')
      }
      setSelectedIds(new Set())
      setShowBulkDeleteConfirm(false)
      await load()
    } catch (err) {
      notify((err as Error).message, 'error')
    }
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * pageSize
  const pagedRows = rows.slice(start, start + pageSize)
  const pageIds = pagedRows.map((r) => r.id)
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
        <input className="toolbar-search-input" placeholder={`${t('search')} ${t('colItem')}`} value={search} onChange={(e) => setSearch(e.target.value)} />
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
            setItemName('')
            setItemColor('')
            setShowForm(true)
          }}
        >
          <Plus size={15} /> {t('addItem')}
        </button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th><input type="checkbox" checked={allPageSelected} onChange={(e) => toggleSelectAllPage(e.target.checked)} /></th>
              <th>{t('colItem')}</th>
              <th>{t('fldItemColor')}</th>
              <th>{t('colUpdatedAt')}</th>
              <th>{t('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {pagedRows.length > 0 ? pagedRows.map((it) => (
              <tr key={it.id}>
                <td><input type="checkbox" checked={selectedIds.has(it.id)} onChange={(e) => toggleSelectRow(it.id, e.target.checked)} /></td>
                <td>{it.item_name}</td>
                <td>{it.item_color || '-'}</td>
                <td>{it.updated_at}</td>
                <td>
                  <div className="row action-row">
                    <button type="button" className="icon-btn" title={t('edit')} aria-label={t('edit')} onClick={() => { setEditing(it); setItemName(it.item_name); setItemColor(it.item_color || ''); setShowForm(true) }}><Pencil size={14} /></button>
                    <button type="button" className="danger-light icon-btn" title={t('delete')} aria-label={t('delete')} onClick={() => setPendingDelete(it)}><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            )) : (
              <tr><td className="empty-cell" colSpan={5}>{t('noData')}</td></tr>
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

      <FormModal open={showForm} title={editing ? `${t('edit')}: ${editing.item_name}` : t('addItem')} onClose={() => setShowForm(false)}>
        <form onSubmit={save}>
          <div className="grid-2">
            <div className="form-field"><label>{t('colItem')}</label><input value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder={t('phItemName')} required /></div>
            <div className="form-field"><label>{t('fldItemColor')}</label><input value={itemColor} onChange={(e) => setItemColor(e.target.value)} placeholder={t('phColor')} /></div>
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
        message={`${t('confirmDeleteItem')} ${pendingDelete?.item_name ?? ''}?`}
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        onConfirm={() => void deleteItem()}
        onCancel={() => setPendingDelete(null)}
      />
      <ConfirmModal
        open={showBulkDeleteConfirm}
        title={t('confirmTitle')}
        message={`${t('confirmDeleteSelected')} (${selectedIds.size})?`}
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        onConfirm={() => void deleteSelectedItems()}
        onCancel={() => setShowBulkDeleteConfirm(false)}
      />
    </div>
  )
}
