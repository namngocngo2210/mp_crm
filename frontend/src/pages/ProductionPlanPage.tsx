import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import Select from 'react-select'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { Customer, Product, ProductionPlan } from '../types'
import { I18nKey } from '../lib/i18n'
import ConfirmModal from '../components/ConfirmModal'
import FormModal from '../components/FormModal'

type Props = { token: string; notify: (message: string, type: 'success' | 'error') => void; t: (key: I18nKey) => string }
type Option = { value: number; label: string }

const initForm = {
  customer_id: '',
  product_id: '',
  lot_no: '',
  etd: '',
  eta: '',
  contp_date: '',
  order_qty_pcs: '0',
  status: 'draft',
}

export default function ProductionPlanPage({ token, notify, t }: Props) {
  const PAGE_SIZE_OPTIONS = [5, 10]
  const [customers, setCustomers] = useState<Customer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [rows, setRows] = useState<ProductionPlan[]>([])
  const [search, setSearch] = useState('')
  const [form, setForm] = useState(initForm)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [pendingDelete, setPendingDelete] = useState<ProductionPlan | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const firstSearchRunRef = useRef(true)

  const customerOptions: Option[] = customers.map((c) => ({
    value: c.id,
    label: `${c.customer_code} - ${c.customer_name}`,
  }))

  const customerProducts = useMemo(
    () => products.filter((p) => p.customer_id === Number(form.customer_id)),
    [products, form.customer_id],
  )

  const productOptions: Option[] = customerProducts.map((p) => ({
    value: p.id,
    label: `${p.product_code} - ${p.product_name}`,
  }))

  const selectedCustomer = customerOptions.find((o) => String(o.value) === form.customer_id) || null
  const selectedProduct = productOptions.find((o) => String(o.value) === form.product_id) || null

  const load = async () => {
    const [cus, prod, plans] = await Promise.all([
      api<Customer[]>('/api/customers', 'GET', undefined, token),
      api<Product[]>('/api/products', 'GET', undefined, token),
      api<ProductionPlan[]>(`/api/production-plans?search=${encodeURIComponent(search)}`, 'GET', undefined, token),
    ])
    setCustomers(cus)
    setProducts(prod)
    setRows(plans)
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
        customer_id: Number(form.customer_id),
        product_id: Number(form.product_id),
        order_qty_pcs: Number(form.order_qty_pcs),
      }
      if (editingId) {
        await api(`/api/production-plans/${editingId}`, 'PUT', payload, token)
      } else {
        await api('/api/production-plans', 'POST', payload, token)
      }
      setForm(initForm)
      setShowForm(false)
      setEditingId(null)
      await load()
      notify(t(editingId ? 'planUpdated' : 'planCreated'), 'success')
    } catch (err) {
      const message = (err as Error).message
      setError(message)
      notify(message, 'error')
    }
  }

  const startEditPlan = (item: ProductionPlan) => {
    setForm({
      customer_id: String(item.customer_id),
      product_id: String(item.product_id),
      lot_no: item.lot_no || '',
      etd: item.etd || '',
      eta: item.eta || '',
      contp_date: item.contp_date || '',
      order_qty_pcs: String(item.order_qty_pcs ?? 0),
      status: item.status || 'draft',
    })
    setError('')
    setEditingId(item.id)
    setShowForm(true)
  }

  const deletePlan = async () => {
    if (!pendingDelete) return
    try {
      await api(`/api/production-plans/${pendingDelete.id}`, 'DELETE', undefined, token)
      await load()
      notify(t('planDeleted'), 'success')
      setPendingDelete(null)
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

  const deleteSelectedPlans = async () => {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    try {
      const results = await Promise.allSettled(ids.map((id) => api(`/api/production-plans/${id}`, 'DELETE', undefined, token)))
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
        <input className="toolbar-search-input" placeholder={t('searchLot')} value={search} onChange={(e) => setSearch(e.target.value)} />
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
            setForm(initForm)
            setError('')
            setShowForm(true)
          }}
        >
          <Plus size={15} /> {t('addPlan')}
        </button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th><input type="checkbox" checked={allPageSelected} onChange={(e) => toggleSelectAllPage(e.target.checked)} /></th>
              <th>{t('colLot')}</th>
              <th>{t('colCustomerId')}</th>
              <th>{t('colProductId')}</th>
              <th>{t('colEtd')}</th>
              <th>{t('colEta')}</th>
              <th>{t('colOrderQtyPcs')}</th>
              <th>{t('colStatus')}</th>
              <th>{t('colUpdatedAt')}</th>
              <th>{t('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {pagedRows.length > 0 ? pagedRows.map((r) => (
              <tr key={r.id}>
                <td><input type="checkbox" checked={selectedIds.has(r.id)} onChange={(e) => toggleSelectRow(r.id, e.target.checked)} /></td>
                <td>{r.lot_no}</td>
                <td>{r.customer_id}</td>
                <td>{r.product_id}</td>
                <td>{r.etd}</td>
                <td>{r.eta}</td>
                <td>{r.order_qty_pcs}</td>
                <td>{r.status}</td>
                <td>{r.updated_at}</td>
                <td>
                  <div className="row action-row">
                    <button type="button" className="icon-btn" title={t('edit')} aria-label={t('edit')} onClick={() => startEditPlan(r)}><Pencil size={14} /></button>
                    <button type="button" className="danger-light icon-btn" title={t('delete')} aria-label={t('delete')} onClick={() => setPendingDelete(r)}><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            )) : (
              <tr><td className="empty-cell" colSpan={10}>{t('noData')}</td></tr>
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
      <ConfirmModal
        open={!!pendingDelete}
        title={t('confirmTitle')}
        message={`${t('confirmDeletePlan')} ${pendingDelete?.lot_no ?? ''}?`}
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        onConfirm={() => void deletePlan()}
        onCancel={() => setPendingDelete(null)}
      />
      <ConfirmModal
        open={showBulkDeleteConfirm}
        title={t('confirmTitle')}
        message={`${t('confirmDeleteSelected')} (${selectedIds.size})?`}
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        onConfirm={() => void deleteSelectedPlans()}
        onCancel={() => setShowBulkDeleteConfirm(false)}
      />
      <FormModal
        open={showForm}
        title={editingId ? `${t('edit')}: ${form.lot_no || ''}` : t('addPlan')}
        onClose={() => { setShowForm(false); setEditingId(null); setForm(initForm); setError('') }}
      >
        <form onSubmit={submit}>
          <div className="grid-2">
            <div className="form-field">
              <label>{t('lblCustomer')}</label>
              <Select
                classNamePrefix="select2"
                options={customerOptions}
                value={selectedCustomer}
                onChange={(opt: Option | null) => setForm({ ...form, customer_id: opt ? String(opt.value) : '', product_id: '' })}
                placeholder={t('phSelectCustomer')}
                isClearable
              />
            </div>
            <div className="form-field">
              <label>{t('lblProduct')}</label>
              <Select
                classNamePrefix="select2"
                options={productOptions}
                value={selectedProduct}
                onChange={(opt: Option | null) => setForm({ ...form, product_id: opt ? String(opt.value) : '' })}
                placeholder={t('phSelectProduct')}
                isClearable
              />
            </div>
            <div className="form-field"><label>{t('lblLot')}</label><input placeholder={t('phLot')} value={form.lot_no} onChange={(e) => setForm({ ...form, lot_no: e.target.value })} required /></div>
            <div className="form-field"><label>{t('lblOrderQtyPcs')}</label><input placeholder={t('phOrderQtyPcs')} type="number" value={form.order_qty_pcs} onChange={(e) => setForm({ ...form, order_qty_pcs: e.target.value })} required /></div>
            <div className="form-field"><label>{t('lblEtd')}</label><input placeholder={t('phEtd')} value={form.etd} onChange={(e) => setForm({ ...form, etd: e.target.value })} /></div>
            <div className="form-field"><label>{t('lblEta')}</label><input placeholder={t('phEta')} value={form.eta} onChange={(e) => setForm({ ...form, eta: e.target.value })} /></div>
            <div className="form-field"><label>{t('lblContpDate')}</label><input placeholder={t('phContpDate')} value={form.contp_date} onChange={(e) => setForm({ ...form, contp_date: e.target.value })} /></div>
            <div className="form-field">
              <label>{t('lblStatus')}</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="draft">draft</option>
                <option value="planned">planned</option>
                <option value="in_progress">in_progress</option>
                <option value="completed">completed</option>
                <option value="cancelled">cancelled</option>
              </select>
            </div>
          </div>
          {error ? <div className="error">{error}</div> : null}
          <div className="row form-actions">
            <button className="primary" type="submit">{t('save')}</button>
            <button type="button" onClick={() => { setShowForm(false); setEditingId(null); setForm(initForm); setError('') }}>{t('cancel')}</button>
          </div>
        </form>
      </FormModal>
    </div>
  )
}
