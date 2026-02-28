import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { I18nKey } from '../lib/i18n'
import { UnitWeightOption } from '../types'
import ConfirmModal from '../components/ConfirmModal'
import FormModal from '../components/FormModal'

type Props = { token: string; notify: (message: string, type: 'success' | 'error') => void; t: (key: I18nKey) => string }

const PAGE_SIZE_OPTIONS = [5, 10]

export default function UnitWeightOptionsPage({ token, notify, t }: Props) {
  const [rows, setRows] = useState<UnitWeightOption[]>([])
  const [search, setSearch] = useState('')
  const [groupFilter, setGroupFilter] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [pendingDelete, setPendingDelete] = useState<UnitWeightOption | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)
  const [form, setForm] = useState({ option_group: '', option_label: '', unit_weight_value: '' })
  const firstRun = useRef(true)

  const load = async () => {
    const data = await api<UnitWeightOption[]>('/api/unit-weight-options', 'GET', undefined, token)
    setRows(data)
    setPage(1)
  }

  useEffect(() => { void load() }, [])

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    const timer = window.setTimeout(() => void load(), 250)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    const valid = new Set(filtered.map((r) => r.id))
    setSelectedIds((prev) => new Set([...prev].filter((id) => valid.has(id))))
  }, [rows, search, groupFilter])

  const groupOptions = useMemo(() => {
    return [...new Set(rows.map((r) => r.option_group).filter(Boolean))].sort((a, b) => a.localeCompare(b))
  }, [rows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      const matchedGroup = !groupFilter || r.option_group === groupFilter
      const matchedText = !q || `${r.option_group} ${r.option_label}`.toLowerCase().includes(q)
      return matchedGroup && matchedText
    })
  }, [rows, search, groupFilter])

  const save = async (e: FormEvent) => {
    e.preventDefault()
    const option_group = form.option_group.trim()
    const option_label = form.option_label.trim()
    const val = form.unit_weight_value.trim()
    if (!option_group || !option_label) {
      notify('Vui lòng nhập đầy đủ nhóm và size', 'error')
      return
    }
    if (!val || Number.isNaN(Number(val))) {
      notify('Unit Weight phải là số', 'error')
      return
    }
    try {
      const payload = { option_group, option_label, unit_weight_value: Number(val) }
      if (editingId) {
        await api(`/api/unit-weight-options/${editingId}`, 'PUT', payload, token)
      } else {
        await api('/api/unit-weight-options', 'POST', payload, token)
      }
      setShowForm(false)
      setEditingId(null)
      setForm({ option_group: '', option_label: '', unit_weight_value: '' })
      await load()
      notify(t(editingId ? 'materialGroupUpdated' : 'materialGroupCreated'), 'success')
    } catch (err) {
      notify((err as Error).message, 'error')
    }
  }

  const remove = async () => {
    if (!pendingDelete) return
    try {
      await api(`/api/unit-weight-options/${pendingDelete.id}`, 'DELETE', undefined, token)
      setPendingDelete(null)
      await load()
      notify(t('materialGroupDeleted'), 'success')
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

  const deleteSelected = async () => {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    try {
      const results = await Promise.allSettled(ids.map((id) => api(`/api/unit-weight-options/${id}`, 'DELETE', undefined, token)))
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
        <input className="toolbar-search-input" placeholder={`${t('search')} ${t('unitWeightOptions')}`} value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
          <option value="">{t('allGroups')}</option>
          {groupOptions.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <button className="danger-light toolbar-add-btn" type="button" disabled={selectedIds.size === 0} onClick={() => setShowBulkDeleteConfirm(true)}>{t('deleteSelected')}</button>
        <button className="primary-light" type="button" onClick={() => { setEditingId(null); setForm({ option_group: '', option_label: '', unit_weight_value: '' }); setShowForm(true) }}>
          <Plus size={15} /> {t('addUnitWeightOption')}
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th><input type="checkbox" checked={allPageSelected} onChange={(e) => toggleSelectAllPage(e.target.checked)} /></th>
              <th>{t('fldUnitWeightOptionGroup')}</th>
              <th>{t('fldUnitWeightOptionLabel')}</th>
              <th>{t('colUnitWeightKg')}</th>
              <th>{t('colUpdatedAt')}</th>
              <th>{t('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {paged.length > 0 ? paged.map((r) => (
              <tr key={r.id}>
                <td><input type="checkbox" checked={selectedIds.has(r.id)} onChange={(e) => toggleSelectRow(r.id, e.target.checked)} /></td>
                <td>{r.option_group}</td>
                <td>{r.option_label}</td>
                <td>{r.unit_weight_value}</td>
                <td>{r.updated_at || '-'}</td>
                <td>
                  <div className="row action-row">
                    <button type="button" className="icon-btn" title={t('edit')} aria-label={t('edit')} onClick={() => { setEditingId(r.id); setForm({ option_group: r.option_group, option_label: r.option_label, unit_weight_value: String(r.unit_weight_value) }); setShowForm(true) }}><Pencil size={14} /></button>
                    <button type="button" className="danger-light icon-btn" title={t('delete')} aria-label={t('delete')} onClick={() => setPendingDelete(r)}><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            )) : <tr><td className="empty-cell" colSpan={6}>{t('noData')}</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="table-pagination">
        <div className="row action-row">
          <span>{t('rowsPerPage')}</span>
          <select value={pageSize} onChange={(e) => { const n = Math.min(10, Math.max(1, Number(e.target.value) || 10)); setPageSize(n); setPage(1) }}>
            {PAGE_SIZE_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        </div>
        <div className="row action-row">
          <button type="button" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>{t('prev')}</button>
          <span>{t('page')} {safePage}/{totalPages}</span>
          <button type="button" disabled={safePage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>{t('next')}</button>
        </div>
      </div>

      <FormModal open={showForm} title={editingId ? t('edit') : t('addUnitWeightOption')} onClose={() => { setShowForm(false); setEditingId(null) }}>
        <form onSubmit={save}>
          <div className="grid-2">
            <div className="form-field"><label>{t('fldUnitWeightOptionGroup')}</label><input placeholder={t('phUnitWeightOptionGroup')} value={form.option_group} onChange={(e) => setForm({ ...form, option_group: e.target.value })} required /></div>
            <div className="form-field"><label>{t('fldUnitWeightOptionLabel')}</label><input placeholder={t('phUnitWeightOptionLabel')} value={form.option_label} onChange={(e) => setForm({ ...form, option_label: e.target.value })} required /></div>
            <div className="form-field"><label>{t('colUnitWeightKg')}</label><input type="number" step="any" value={form.unit_weight_value} onChange={(e) => setForm({ ...form, unit_weight_value: e.target.value })} required /></div>
          </div>
          <div className="row form-actions">
            <button className="primary" type="submit">{t('save')}</button>
            <button type="button" onClick={() => { setShowForm(false); setEditingId(null) }}>{t('cancel')}</button>
          </div>
        </form>
      </FormModal>

      <ConfirmModal
        open={!!pendingDelete}
        title={t('confirmTitle')}
        message={`${t('confirmDeleteUnitWeightOption')} ${pendingDelete?.option_label ?? ''}?`}
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        onConfirm={() => void remove()}
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
