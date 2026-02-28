import { FormEvent, useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { Customer } from '../types'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { I18nKey } from '../lib/i18n'
import ConfirmModal from '../components/ConfirmModal'
import FormModal from '../components/FormModal'

type Props = { token: string; notify: (message: string, type: 'success' | 'error') => void; t: (key: I18nKey) => string }

const emptyForm = {
  customer_code: '',
  customer_name: '',
  address: '',
  contact_person: '',
  phone: '',
  email: '',
  production_2025: '',
  production_2026: '',
  in_production: '',
  level: '',
}

export default function CustomersPage({ token, notify, t }: Props) {
  const PAGE_SIZE_OPTIONS = [5, 10]
  const [rows, setRows] = useState<Customer[]>([])
  const [search, setSearch] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Customer | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const firstSearchRunRef = useRef(true)

  const load = async () => {
    const data = await api<Customer[]>(`/api/customers?search=${encodeURIComponent(search)}`, 'GET', undefined, token)
    setRows(data)
    setPage(1)
  }

  useEffect(() => {
    void load()
  }, [])

  useEffect(() => {
    if (firstSearchRunRef.current) {
      firstSearchRunRef.current = false
      return
    }
    const timer = window.setTimeout(() => {
      void load()
    }, 250)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    const valid = new Set(rows.map((r) => r.id))
    setSelectedIds((prev) => new Set([...prev].filter((id) => valid.has(id))))
  }, [rows])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      const payload = {
        ...form,
        production_2025: form.production_2025 ? Number(form.production_2025) : 0,
        production_2026: form.production_2026 ? Number(form.production_2026) : 0,
        in_production: form.in_production ? Number(form.in_production) : 0,
      }
      if (editingId) {
        await api(`/api/customers/${editingId}`, 'PUT', payload, token)
      } else {
        await api('/api/customers', 'POST', payload, token)
      }
      setForm(emptyForm)
      setShowForm(false)
      setEditingId(null)
      await load()
      notify(t(editingId ? 'customerUpdated' : 'customerCreated'), 'success')
    } catch (err) {
      const message = (err as Error).message
      setError(message)
      notify(message, 'error')
    }
  }

  const startEditCustomer = (item: Customer) => {
    setForm({
      customer_code: item.customer_code || '',
      customer_name: item.customer_name || '',
      address: item.address || '',
      contact_person: item.contact_person || '',
      phone: item.phone || '',
      email: item.email || '',
      production_2025: item.production_2025 != null ? String(item.production_2025) : '',
      production_2026: item.production_2026 != null ? String(item.production_2026) : '',
      in_production: item.in_production != null ? String(item.in_production) : '',
      level: item.level || '',
    })
    setError('')
    setEditingId(item.id)
    setShowForm(true)
  }

  const deleteCustomer = async () => {
    if (!pendingDelete) return
    try {
      await api(`/api/customers/${pendingDelete.id}`, 'DELETE', undefined, token)
      await load()
      notify(t('customerDeleted'), 'success')
    } catch (err) {
      notify((err as Error).message, 'error')
    } finally {
      setPendingDelete(null)
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

  const deleteSelectedCustomers = async () => {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    try {
      const results = await Promise.allSettled(ids.map((id) => api(`/api/customers/${id}`, 'DELETE', undefined, token)))
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
    <>
      <div className="page-content">
        <div className="row toolbar-row">
          <input className="toolbar-search-input" placeholder={t('searchCustomer')} value={search} onChange={(e) => setSearch(e.target.value)} />
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
            onClick={() => {
              setEditingId(null)
              setForm(emptyForm)
              setError('')
              setShowForm(true)
            }}
          >
            <Plus size={15} /> {t('addCustomer')}
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th><input type="checkbox" checked={allPageSelected} onChange={(e) => toggleSelectAllPage(e.target.checked)} /></th>
                <th>{t('colCustomerCode')}</th>
                <th>{t('colCustomerName')}</th>
                <th>{t('colContactPerson')}</th>
                <th>{t('colPhone')}</th>
                <th>{t('colEmail')}</th>
                <th>{t('colLevel')}</th>
                <th>{t('colUpdatedAt')}</th>
                <th>{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {pagedRows.length > 0 ? pagedRows.map((r) => (
                <tr key={r.id}>
                  <td><input type="checkbox" checked={selectedIds.has(r.id)} onChange={(e) => toggleSelectRow(r.id, e.target.checked)} /></td>
                  <td>{r.customer_code}</td>
                  <td>{r.customer_name}</td>
                  <td>{r.contact_person}</td>
                  <td>{r.phone}</td>
                  <td>{r.email}</td>
                  <td>{r.level}</td>
                  <td>{r.updated_at}</td>
                  <td>
                    <div className="row action-row">
                      <button type="button" className="icon-btn" title={t('edit')} aria-label={t('edit')} onClick={() => startEditCustomer(r)}><Pencil size={14} /></button>
                      <button type="button" className="danger-light icon-btn" title={t('delete')} aria-label={t('delete')} onClick={() => setPendingDelete(r)}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr><td className="empty-cell" colSpan={9}>{t('noData')}</td></tr>
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
      </div>
      <FormModal
        open={showForm}
        title={editingId ? `${t('edit')}: ${form.customer_code || form.customer_name || ''}` : t('addCustomer')}
        onClose={() => { setShowForm(false); setEditingId(null); setForm(emptyForm); setError('') }}
      >
        <form onSubmit={submit}>
          <div className="grid-2">
            <div className="form-field"><label>{t('lblCustomerCode')}</label><input placeholder={t('phCustomerCode')} value={form.customer_code} onChange={(e) => setForm({ ...form, customer_code: e.target.value })} required /></div>
            <div className="form-field"><label>{t('lblCustomerName')}</label><input placeholder={t('phCustomerName')} value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} required /></div>
            <div className="form-field"><label>{t('lblAddress')}</label><input placeholder={t('phAddress')} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <div className="form-field"><label>{t('lblContactPerson')}</label><input placeholder={t('phContactPerson')} value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} /></div>
            <div className="form-field"><label>{t('lblPhone')}</label><input placeholder={t('phPhone')} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="form-field"><label>{t('lblEmail')}</label><input placeholder={t('phEmail')} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="form-field"><label>{t('lblProduction2025')}</label><input type="number" placeholder={t('phProduction2025')} value={form.production_2025} onChange={(e) => setForm({ ...form, production_2025: e.target.value })} /></div>
            <div className="form-field"><label>{t('lblProduction2026')}</label><input type="number" placeholder={t('phProduction2026')} value={form.production_2026} onChange={(e) => setForm({ ...form, production_2026: e.target.value })} /></div>
            <div className="form-field"><label>{t('lblInProduction')}</label><input type="number" placeholder={t('phInProduction')} value={form.in_production} onChange={(e) => setForm({ ...form, in_production: e.target.value })} /></div>
            <div className="form-field"><label>{t('lblLevel')}</label><input placeholder={t('phLevel')} value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} /></div>
          </div>
          {error ? <div className="error">{error}</div> : null}
          <div className="row form-actions">
            <button className="primary" type="submit">{t('save')}</button>
            <button type="button" onClick={() => { setShowForm(false); setEditingId(null); setForm(emptyForm); setError('') }}>{t('cancel')}</button>
          </div>
        </form>
      </FormModal>
      <ConfirmModal
        open={!!pendingDelete}
        title={t('confirmTitle')}
        message={`${t('confirmDeleteCustomer')} ${pendingDelete?.customer_code ?? ''}?`}
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        onConfirm={() => void deleteCustomer()}
        onCancel={() => setPendingDelete(null)}
      />
      <ConfirmModal
        open={showBulkDeleteConfirm}
        title={t('confirmTitle')}
        message={`${t('confirmDeleteSelected')} (${selectedIds.size})?`}
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        onConfirm={() => void deleteSelectedCustomers()}
        onCancel={() => setShowBulkDeleteConfirm(false)}
      />
    </>
  )
}
