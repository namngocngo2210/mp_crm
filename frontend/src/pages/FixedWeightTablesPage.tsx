import { FormEvent, useEffect, useMemo, useState } from 'react'
import Select from 'react-select'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { FixedWeightTable, MaterialMaster } from '../types'
import { I18nKey } from '../lib/i18n'
import ConfirmModal from '../components/ConfirmModal'
import FormModal from '../components/FormModal'

type Props = { token: string; notify: (message: string, type: 'success' | 'error') => void; t: (key: I18nKey) => string }
type Option = { value: number; label: string }

const PAGE_SIZE_OPTIONS = [10, 20, 50]
const fmtWeight5 = (v?: number | null) => {
  if (v == null || Number.isNaN(Number(v))) return '-'
  return Number(v).toLocaleString(undefined, { minimumFractionDigits: 5, maximumFractionDigits: 5 })
}
const fmtPrice3 = (v?: number | null) => {
  if (v == null || Number.isNaN(Number(v))) return '-'
  return Number(v).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })
}

export default function FixedWeightTablesPage({ token, notify, t }: Props) {
  const [rows, setRows] = useState<FixedWeightTable[]>([])
  const [materials, setMaterials] = useState<MaterialMaster[]>([])
  const [search, setSearch] = useState('')
  const [filterMaterialId, setFilterMaterialId] = useState<number | null>(null)

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<FixedWeightTable | null>(null)
  const [pendingDelete, setPendingDelete] = useState<FixedWeightTable | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)

  const [materialId, setMaterialId] = useState<number | null>(null)
  const [sizeLabel, setSizeLabel] = useState('')
  const [unitWeightValue, setUnitWeightValue] = useState('')
  const [unitPrice, setUnitPrice] = useState('')

  const materialOptions: Option[] = materials.map((m) => ({
    value: m.id,
    label: `${m.material_name}${m.material_category_name ? ` (${m.material_category_name})` : ''}`,
  }))

  const load = async () => {
    const [data, mgs] = await Promise.all([
      api<FixedWeightTable[]>(
        `/api/fixed-weight-tables?search=${encodeURIComponent(search)}${filterMaterialId ? `&material_id=${filterMaterialId}` : ''}`,
        'GET',
        undefined,
        token,
      ),
      api<MaterialMaster[]>('/api/materials', 'GET', undefined, token),
    ])
    setRows(data)
    setMaterials(mgs)
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
  }, [search, filterMaterialId])

  useEffect(() => {
    const valid = new Set(rows.map((r) => r.id))
    setSelectedIds((prev) => new Set([...prev].filter((id) => valid.has(id))))
  }, [rows])

  const resetForm = () => {
    setEditing(null)
    setMaterialId(null)
    setSizeLabel('')
    setUnitWeightValue('')
    setUnitPrice('')
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!materialId) {
      notify('Vui lòng chọn Material', 'error')
      return
    }
    if (!sizeLabel.trim()) {
      notify('Vui lòng nhập Size', 'error')
      return
    }
    if (unitWeightValue.trim() === '' || Number.isNaN(Number(unitWeightValue))) {
      notify('Định lượng phải là số', 'error')
      return
    }
    if (unitPrice.trim() === '' || Number.isNaN(Number(unitPrice))) {
      notify('Giá tiền phải là số', 'error')
      return
    }
    const payload = {
      material_id: materialId,
      size_label: sizeLabel.trim(),
      unit_weight_value: unitWeightValue.trim(),
      unit_price: unitPrice.trim(),
    }
    try {
      if (editing) {
        await api(`/api/fixed-weight-tables/${editing.id}`, 'PUT', payload, token)
        notify('Cập nhật bảng định lượng thành công', 'success')
      } else {
        await api('/api/fixed-weight-tables', 'POST', payload, token)
        notify('Tạo bảng định lượng thành công', 'success')
      }
      setShowForm(false)
      resetForm()
      await load()
    } catch (err) {
      notify((err as Error).message, 'error')
    }
  }

  const deleteOne = async () => {
    if (!pendingDelete) return
    try {
      await api(`/api/fixed-weight-tables/${pendingDelete.id}`, 'DELETE', undefined, token)
      setPendingDelete(null)
      notify('Xóa bảng định lượng thành công', 'success')
      await load()
    } catch (err) {
      notify((err as Error).message, 'error')
    }
  }

  const deleteSelected = async () => {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    try {
      const results = await Promise.allSettled(ids.map((id) => api(`/api/fixed-weight-tables/${id}`, 'DELETE', undefined, token)))
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

  const filtered = useMemo(() => rows, [rows])
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
        <input className="toolbar-search-input" placeholder="Tìm theo material / size" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div style={{ minWidth: 240 }}>
          <Select
            classNamePrefix="select2"
            options={materialOptions}
            value={materialOptions.find((o) => o.value === filterMaterialId) || null}
            onChange={(opt: Option | null) => setFilterMaterialId(opt?.value ?? null)}
            placeholder="Lọc material"
            isClearable
          />
        </div>
        <button className="danger-light toolbar-add-btn" type="button" disabled={selectedIds.size === 0} onClick={() => setShowBulkDeleteConfirm(true)}>
          {t('deleteSelected')}
        </button>
        <button
          className="primary-light"
          type="button"
          onClick={() => {
            resetForm()
            setShowForm(true)
          }}
        >
          <Plus size={15} /> Thêm bảng định lượng
        </button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th><input type="checkbox" checked={allPageSelected} onChange={(e) => toggleSelectAllPage(e.target.checked)} /></th>
              <th>Material</th>
              <th>Size (mm)</th>
              <th>Định lượng</th>
              <th>Giá tiền ($)</th>
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
                <td>{r.material_name || '-'}</td>
                <td>{r.size_label}</td>
                <td>{fmtWeight5(r.unit_weight_value)}</td>
                <td>{fmtPrice3(r.unit_price)}$</td>
                <td>{r.created_at || '-'}</td>
                <td>{r.updated_at || '-'}</td>
                <td>
                  <div className="row action-row">
                    <button
                      type="button"
                      className="icon-btn"
                      title={t('edit')}
                      aria-label={t('edit')}
                      onClick={() => {
                        setEditing(r)
                        setMaterialId(r.material_id || null)
                        setSizeLabel(r.size_label)
                        setUnitWeightValue(String(r.unit_weight_value))
                        setUnitPrice(String(r.unit_price))
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
              <tr><td className="empty-cell" colSpan={8}>{t('noData')}</td></tr>
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
              const next = Math.min(50, Math.max(10, Number(e.target.value) || 10))
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

      <FormModal open={showForm} title={editing ? `Sửa: ${editing.size_label}` : 'Thêm bảng định lượng'} onClose={() => setShowForm(false)}>
        <form onSubmit={save}>
          <div className="grid-2">
            <div className="form-field">
              <label>Material</label>
              <Select
                classNamePrefix="select2"
                options={materialOptions}
                value={materialOptions.find((o) => o.value === materialId) || null}
                onChange={(opt: Option | null) => setMaterialId(opt?.value ?? null)}
                placeholder="Chọn material"
                isClearable
              />
            </div>
            <div className="form-field">
              <label>Size (mm)</label>
              <input value={sizeLabel} onChange={(e) => setSizeLabel(e.target.value)} placeholder="Size (mm)" required />
            </div>
            <div className="form-field">
              <label>Định lượng</label>
              <input type="number" step="any" value={unitWeightValue} onChange={(e) => setUnitWeightValue(e.target.value)} placeholder="Định lượng" required />
            </div>
            <div className="form-field">
              <label>Giá tiền ($)</label>
              <input type="number" step="any" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} placeholder="Giá tiền" required />
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
        message={`Bạn có chắc muốn xóa dòng size ${pendingDelete?.size_label || ''}?`}
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
