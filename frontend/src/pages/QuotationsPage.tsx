import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import Select from 'react-select'
import { CheckCircle2, Pencil, Plus, Trash2, XCircle } from 'lucide-react'
import { api } from '../lib/api'
import { Customer, Product, Quotation, QuotationExtraRow } from '../types'
import { I18nKey } from '../lib/i18n'
import ConfirmModal from '../components/ConfirmModal'
import FormModal from '../components/FormModal'

type Props = { token: string; notify: (message: string, type: 'success' | 'error') => void; t: (key: I18nKey) => string }
type Option = { value: number; label: string }
type PreviewRow = { name: string; value?: string | number | null; amount?: number | null }
type PreviewData = {
  level_code?: string
  level_factor?: number
  total_weight_kg?: number
  pe_weight_kg?: number
  pp_weight_kg?: number
  amount_weight?: number
  amount_lami?: number
  amount_color?: number
  subtotal?: number
  total?: number
  row_payload?: { rows?: PreviewRow[]; extra_rows?: QuotationExtraRow[] }
}

const PAGE_SIZE_OPTIONS = [5, 10]

const emptyForm = {
  customer_id: '',
  product_id: '',
  has_lami: false,
  note: '',
}

const emptyExtra = (): QuotationExtraRow => ({ name: '', value: '', amount: 0 })

const numberFmt = (v?: number | null) => {
  if (v == null || Number.isNaN(Number(v))) return '-'
  return Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const QUOTATION_ROW_LABELS: Record<string, string> = {
  customer_code: 'Mã khách hàng',
  product_code: 'Mã sản phẩm',
  size: 'Kích thước',
  weight: 'Trọng lượng',
  pe: 'PE',
  pp: 'PP',
  lami: 'Lami',
  color: 'Màu',
}

const rowLabel = (name?: string | null) => {
  const key = (name || '').trim().toLowerCase()
  return QUOTATION_ROW_LABELS[key] || name || '-'
}

const renderRowValue = (row: PreviewRow) => {
  const key = (row.name || '').trim().toLowerCase()
  if (key === 'lami') {
    const raw = String(row.value || '').trim().toUpperCase()
    const isYes = raw === 'Y' || raw === 'YES' || raw === 'TRUE' || raw === '1'
    if (isYes) return <CheckCircle2 size={16} color="#16a34a" />
    return <XCircle size={16} color="#dc2626" />
  }
  if (typeof row.value === 'number') return numberFmt(row.value)
  return row.value || '-'
}

export default function QuotationsPage({ token, notify, t }: Props) {
  const [rows, setRows] = useState<Quotation[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Quotation | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Quotation | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)

  const [form, setForm] = useState(emptyForm)
  const [extraRows, setExtraRows] = useState<QuotationExtraRow[]>([])
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [previewError, setPreviewError] = useState('')
  const firstSearchRunRef = useRef(true)

  const customerOptions: Option[] = customers.map((c) => ({
    value: c.id,
    label: `${c.customer_code} - ${c.customer_name}`,
  }))

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === Number(form.customer_id)) || null,
    [customers, form.customer_id],
  )

  const productOptions: Option[] = useMemo(() => {
    const cid = Number(form.customer_id)
    const list = products.filter((p) => p.customer_id === cid)
    return list.map((p) => ({ value: p.id, label: `${p.product_code} - ${p.product_name}` }))
  }, [products, form.customer_id])

  const baseRows = useMemo(() => {
    if (!preview?.row_payload?.rows) return []
    return preview.row_payload.rows
  }, [preview])

  const load = async () => {
    const [quotationRows, customerRows, productRows] = await Promise.all([
      api<Quotation[]>(`/api/quotations?search=${encodeURIComponent(search)}`, 'GET', undefined, token),
      api<Customer[]>('/api/customers', 'GET', undefined, token),
      api<Product[]>('/api/products', 'GET', undefined, token),
    ])
    setRows(quotationRows)
    setCustomers(customerRows)
    setProducts(productRows)
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

  useEffect(() => {
    if (!showForm) return
    if (!form.customer_id || !form.product_id) {
      setPreview(null)
      setPreviewError('')
      return
    }
    const timer = window.setTimeout(async () => {
      try {
        const data = await api<PreviewData>('/api/quotations/preview', 'POST', {
          customer_id: Number(form.customer_id),
          product_id: Number(form.product_id),
          has_lami: form.has_lami,
          extra_rows: extraRows,
        }, token)
        setPreview(data)
        setPreviewError('')
      } catch (err) {
        setPreview(null)
        setPreviewError((err as Error).message)
      }
    }, 180)
    return () => window.clearTimeout(timer)
  }, [showForm, form.customer_id, form.product_id, form.has_lami, extraRows])

  const startCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setExtraRows([])
    setPreview(null)
    setPreviewError('')
    setShowForm(true)
  }

  const startEdit = (item: Quotation) => {
    setEditing(item)
    setForm({
      customer_id: String(item.customer_id),
      product_id: String(item.product_id),
      has_lami: !!item.has_lami,
      note: item.note || '',
    })
    setExtraRows(item.row_payload?.extra_rows || [])
    setPreview(null)
    setPreviewError('')
    setShowForm(true)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    try {
      const payload = {
        customer_id: Number(form.customer_id),
        product_id: Number(form.product_id),
        has_lami: form.has_lami,
        note: form.note,
        extra_rows: extraRows,
      }
      if (editing) {
        await api(`/api/quotations/${editing.id}`, 'PUT', payload, token)
      } else {
        await api('/api/quotations', 'POST', payload, token)
      }
      setShowForm(false)
      setEditing(null)
      setForm(emptyForm)
      setExtraRows([])
      setPreview(null)
      await load()
      notify(editing ? 'Cập nhật báo giá thành công' : 'Tạo báo giá thành công', 'success')
    } catch (err) {
      notify((err as Error).message, 'error')
    }
  }

  const deleteOne = async () => {
    if (!pendingDelete) return
    try {
      await api(`/api/quotations/${pendingDelete.id}`, 'DELETE', undefined, token)
      setPendingDelete(null)
      await load()
      notify('Xóa báo giá thành công', 'success')
    } catch (err) {
      notify((err as Error).message, 'error')
    }
  }

  const deleteSelected = async () => {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    try {
      const results = await Promise.allSettled(ids.map((id) => api(`/api/quotations/${id}`, 'DELETE', undefined, token)))
      const successCount = results.filter((r) => r.status === 'fulfilled').length
      notify(`Xóa đã chọn: ${successCount}/${ids.length}`, successCount > 0 ? 'success' : 'error')
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
  const paged = rows.slice(start, start + pageSize)
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
        <input className="toolbar-search-input" placeholder="Tìm theo khách hàng/sản phẩm" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button
          className="danger-light toolbar-add-btn"
          type="button"
          disabled={selectedIds.size === 0}
          onClick={() => setShowBulkDeleteConfirm(true)}
        >
          {t('deleteSelected')}
        </button>
        <button className="primary-light" type="button" onClick={startCreate}>
          <Plus size={15} /> Thêm báo giá
        </button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th><input type="checkbox" checked={allPageSelected} onChange={(e) => toggleSelectAllPage(e.target.checked)} /></th>
              <th>Mã KH</th>
              <th>Tên khách hàng</th>
              <th>Mã SP</th>
              <th>Tên sản phẩm</th>
              <th>Cấp độ</th>
              <th>Tổng</th>
              <th>{t('colCreatedAt')}</th>
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
                <td>{r.customer_code || '-'}</td>
                <td>{r.customer_name || '-'}</td>
                <td>{r.product_code || '-'}</td>
                <td>{r.product_name || '-'}</td>
                <td>{r.level_code || '-'} {r.level_factor ? `(${Math.round(r.level_factor * 100)}%)` : ''}</td>
                <td>{numberFmt(r.total)} $</td>
                <td>{r.created_at || '-'}</td>
                <td>{r.updated_at}</td>
                <td>
                  <div className="row action-row">
                    <button type="button" className="icon-btn" title={t('edit')} aria-label={t('edit')} onClick={() => startEdit(r)}><Pencil size={14} /></button>
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

      <FormModal open={showForm} title={editing ? 'Sửa báo giá' : 'Thêm báo giá'} onClose={() => setShowForm(false)} modalClassName="quotation-modal">
        <form onSubmit={submit}>
          <div className="grid-2">
            <div className="form-field">
              <label>{t('lblCustomer')}</label>
              <Select
                classNamePrefix="react-select"
                options={customerOptions}
                value={customerOptions.find((o) => String(o.value) === form.customer_id) || null}
                onChange={(opt: Option | null) => setForm((prev) => ({ ...prev, customer_id: opt ? String(opt.value) : '', product_id: '' }))}
                placeholder={t('phSelectCustomer')}
                isClearable
              />
            </div>
            <div className="form-field">
              <label>{t('lblProduct')} {selectedCustomer?.level ? `(Level ${selectedCustomer.level} - ${Math.round((selectedCustomer.level_factor || 1) * 100)}%)` : ''}</label>
              <Select
                classNamePrefix="react-select"
                options={productOptions}
                value={productOptions.find((o) => String(o.value) === form.product_id) || null}
                onChange={(opt: Option | null) => setForm((prev) => ({ ...prev, product_id: opt ? String(opt.value) : '' }))}
                placeholder={t('phSelectProduct')}
                isClearable
                isDisabled={!form.customer_id}
              />
            </div>
            <div className="form-field full-width">
              <label>
                <input
                  type="checkbox"
                  checked={form.has_lami}
                  onChange={(e) => setForm((prev) => ({ ...prev, has_lami: e.target.checked }))}
                  style={{ marginRight: 8 }}
                />
                Lami
              </label>
            </div>
          </div>

          {previewError ? <div className="error">{previewError}</div> : null}

          {preview ? (
            <>
              <div className="table-wrap" style={{ marginTop: 12 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Tên</th>
                      <th>Giá trị</th>
                      <th>Thành tiền ($)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {baseRows.map((r, idx) => (
                      <tr key={`${r.name}-${idx}`}>
                        <td>{rowLabel(r.name)}</td>
                        <td>{renderRowValue(r)}</td>
                        <td>{r.amount == null ? '-' : numberFmt(r.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ marginTop: 12 }}>
                {extraRows.map((r, idx) => (
                  <div key={idx} className="quotation-extra-row" style={{ marginBottom: 8 }}>
                    <div className="form-field"><input placeholder="Tên" value={r.name} onChange={(e) => setExtraRows((prev) => prev.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))} /></div>
                    <div className="form-field"><input placeholder="Giá trị" value={r.value || ''} onChange={(e) => setExtraRows((prev) => prev.map((x, i) => i === idx ? { ...x, value: e.target.value } : x))} /></div>
                    <div className="form-field">
                      <input type="number" step="any" placeholder="Thành tiền" value={String(r.amount ?? '')} onChange={(e) => setExtraRows((prev) => prev.map((x, i) => i === idx ? { ...x, amount: Number(e.target.value || 0) } : x))} />
                    </div>
                    <div className="quotation-extra-delete-cell">
                      <button type="button" className="danger-light" onClick={() => setExtraRows((prev) => prev.filter((_, i) => i !== idx))}>{t('delete')}</button>
                    </div>
                  </div>
                ))}
                <div className="row" style={{ justifyContent: 'flex-start' }}>
                  <button type="button" onClick={() => setExtraRows((prev) => [...prev, emptyExtra()])}><Plus size={14} /> Thêm dòng</button>
                </div>
              </div>

              <div className="table-wrap" style={{ marginTop: 12 }}>
                <table>
                  <tbody>
                    <tr>
                      <td><strong>Tổng</strong></td>
                      <td><strong>{numberFmt(preview.total)} $</strong></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          ) : null}

          <div className="form-field" style={{ marginTop: 10 }}>
            <label>{t('lblOtherNote')}</label>
            <input value={form.note} onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))} placeholder={t('phOtherNote')} />
          </div>

          <div className="row form-actions">
            <button className="primary" type="submit" disabled={!preview}>{t('save')}</button>
            <button type="button" onClick={() => setShowForm(false)}>{t('cancel')}</button>
          </div>
        </form>
      </FormModal>

      <ConfirmModal
        open={!!pendingDelete}
        title={t('confirmTitle')}
        message={`Bạn có chắc muốn xóa báo giá #${pendingDelete?.id ?? ''}?`}
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
