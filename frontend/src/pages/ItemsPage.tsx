import { FormEvent, useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react'
import * as Select from '@radix-ui/react-select'
import { api } from '../lib/api'
import { Item, MaterialMaster, ProductType } from '../types'
import { I18nKey } from '../lib/i18n'
import ConfirmModal from '../components/ConfirmModal'
import FormModal from '../components/FormModal'

type Props = { token: string; notify: (message: string, type: 'success' | 'error') => void; t: (key: I18nKey) => string }

const PAGE_SIZE_OPTIONS = [10, 20, 50]

export default function ItemsPage({ token, notify, t }: Props) {
  const [rows, setRows] = useState<Item[]>([])
  const [materials, setMaterials] = useState<MaterialMaster[]>([])
  const [productTypes, setProductTypes] = useState<ProductType[]>([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Item | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Item | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)
  const [itemName, setItemName] = useState('')
  const [materialId, setMaterialId] = useState('')
  const [itemSizeSourceField, setItemSizeSourceField] = useState<'spec_inner' | 'top' | 'bottom' | 'liner'>('spec_inner')
  const [selectedProductTypeIds, setSelectedProductTypeIds] = useState<number[]>([])
  const firstRun = useRef(true)
  const groupedMaterials = materials.reduce<Record<string, MaterialMaster[]>>((acc, m) => {
    const key = (m.material_category_name || 'Khác').trim() || 'Khác'
    if (!acc[key]) acc[key] = []
    acc[key].push(m)
    return acc
  }, {})
  const sourceLabel = (value?: string) => {
    if (value === 'top') return t('srcTop')
    if (value === 'bottom') return t('srcBottom')
    if (value === 'liner') return t('srcLiner')
    return t('srcSpecInner')
  }

  const load = async () => {
    const [data, mats, ptypes] = await Promise.all([
      api<Item[]>(`/api/items?search=${encodeURIComponent(search)}`, 'GET', undefined, token),
      api<MaterialMaster[]>('/api/materials', 'GET', undefined, token),
      api<ProductType[]>('/api/product-types', 'GET', undefined, token),
    ])
    setRows(data)
    setMaterials(mats)
    setProductTypes(ptypes)
  }

  useEffect(() => { void load() }, [])

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    setPage(1)
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
    if (!materialId) {
      notify('Vui lòng chọn material', 'error')
      return
    }
    try {
      const payload = {
        item_name: name,
        material_id: Number(materialId),
        item_size_source_field: itemSizeSourceField,
        product_type_ids: selectedProductTypeIds,
      }
      if (editing) {
        await api(`/api/items/${editing.id}`, 'PUT', payload, token)
        notify(t('itemUpdated'), 'success')
      } else {
        await api('/api/items', 'POST', payload, token)
        notify(t('itemCreated'), 'success')
      }
      setShowForm(false)
      setEditing(null)
      setItemName('')
      setMaterialId('')
      setItemSizeSourceField('spec_inner')
      setSelectedProductTypeIds([])
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
            setMaterialId('')
            setItemSizeSourceField('spec_inner')
            setSelectedProductTypeIds([])
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
              <th>Material</th>
              <th>{t('fldItemSizeSourceField')}</th>
              <th>{t('tabProductTypes')}</th>
              <th>{t('colUpdatedAt')}</th>
              <th>{t('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {pagedRows.length > 0 ? pagedRows.map((it) => (
              <tr key={it.id}>
                <td><input type="checkbox" checked={selectedIds.has(it.id)} onChange={(e) => toggleSelectRow(it.id, e.target.checked)} /></td>
                <td>{it.item_name}</td>
                <td>{it.material_name || '-'}</td>
                <td>{sourceLabel(it.item_size_source_field)}</td>
                <td>
                  {(it.product_type_names || []).length > 0 ? (
                    <ul className="cell-list">
                      {(it.product_type_names || []).map((name) => (
                        <li key={`${it.id}-${name}`}>{name}</li>
                      ))}
                    </ul>
                  ) : '-'}
                </td>
                <td>{it.updated_at}</td>
                <td>
                  <div className="row action-row">
                    <button
                      type="button"
                      className="icon-btn"
                      title={t('edit')}
                      aria-label={t('edit')}
                      onClick={() => {
                        setEditing(it)
                        setItemName(it.item_name)
                        setMaterialId(it.material_id ? String(it.material_id) : '')
                        setItemSizeSourceField((it.item_size_source_field || 'spec_inner') as 'spec_inner' | 'top' | 'bottom' | 'liner')
                        setSelectedProductTypeIds((it.product_type_ids || []).map((x) => Number(x)))
                        setShowForm(true)
                      }}
                    >
                      <Pencil size={14} />
                    </button>
                    <button type="button" className="danger-light icon-btn" title={t('delete')} aria-label={t('delete')} onClick={() => setPendingDelete(it)}><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            )) : (
              <tr><td className="empty-cell" colSpan={7}>{t('noData')}</td></tr>
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

      <FormModal open={showForm} title={editing ? `${t('edit')}: ${editing.item_name}` : t('addItem')} onClose={() => setShowForm(false)}>
        <form onSubmit={save}>
          <div className="grid-2">
            <div className="form-field">
              <label>{t('colItem')}</label>
              <input value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder={t('phItemName')} required />
            </div>
            <div className="form-field">
              <label>Material</label>
              <Select.Root value={materialId} onValueChange={setMaterialId}>
                <Select.Trigger className="radix-select-trigger" aria-label="Material">
                  <Select.Value placeholder="Chọn material" />
                  <Select.Icon><ChevronDown size={16} /></Select.Icon>
                </Select.Trigger>
                <Select.Portal>
                  <Select.Content className="radix-select-content" position="popper" sideOffset={6}>
                    <Select.Viewport className="radix-select-viewport">
                      {Object.entries(groupedMaterials).map(([categoryName, list]) => (
                        <Select.Group key={categoryName}>
                          <Select.Label className="radix-select-label">{categoryName}</Select.Label>
                          {list.map((m) => (
                            <Select.Item key={m.id} value={String(m.id)} className="radix-select-item">
                              <Select.ItemText>{m.material_name}</Select.ItemText>
                              <Select.ItemIndicator className="radix-select-item-indicator">
                                <Check size={14} />
                              </Select.ItemIndicator>
                            </Select.Item>
                          ))}
                        </Select.Group>
                      ))}
                    </Select.Viewport>
                  </Select.Content>
                </Select.Portal>
              </Select.Root>
            </div>
            <div className="form-field">
              <label>{t('fldItemSizeSourceField')}</label>
              <select value={itemSizeSourceField} onChange={(e) => setItemSizeSourceField(e.target.value as 'spec_inner' | 'top' | 'bottom' | 'liner')}>
                <option value="spec_inner">{t('srcSpecInner')}</option>
                <option value="top">{t('srcTop')}</option>
                <option value="bottom">{t('srcBottom')}</option>
                <option value="liner">{t('srcLiner')}</option>
              </select>
            </div>
            <div className="form-field full-width">
              <label>{t('tabProductTypes')}</label>
              <div className="check-grid">
                {productTypes.map((pt) => {
                  const checked = selectedProductTypeIds.includes(pt.id)
                  return (
                    <label key={pt.id} className="check-field">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedProductTypeIds((prev) => (prev.includes(pt.id) ? prev : [...prev, pt.id]))
                          } else {
                            setSelectedProductTypeIds((prev) => prev.filter((id) => id !== pt.id))
                          }
                        }}
                      />
                      <span>{pt.product_type_name}</span>
                    </label>
                  )
                })}
              </div>
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
