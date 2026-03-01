import { FormEvent, useEffect, useRef, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { Item } from '../types'
import { I18nKey } from '../lib/i18n'
import ConfirmModal from '../components/ConfirmModal'
import FormModal from '../components/FormModal'

type Props = { token: string; notify: (message: string, type: 'success' | 'error') => void; t: (key: I18nKey) => string }

const PAGE_SIZE_OPTIONS = [5, 10]
const FORMULA_ALLOWED_REGEX = /^[A-Za-z0-9_+\-*/().\s]+$/
const SPEC_ABC_REGEX = /^\s*[^*]+\s*\*\s*\d+(\.\d+)?\s*\*\s*\d+(\.\d+)?\s*$/
const SPEC_AB_REGEX = /^\s*[^*]+\s*\*\s*\d+(\.\d+)?\s*$/
const A_NUMBER_REGEX = /[-+]?\d+(\.\d+)?/
const SPLIT_TOP_STAR = (expr: string) => {
  let depth = 0
  for (let i = 0; i < expr.length; i += 1) {
    const ch = expr[i]
    if (ch === '(') depth += 1
    else if (ch === ')') depth -= 1
    else if (ch === '*' && depth === 0) {
      const left = expr.slice(0, i).trim()
      const right = expr.slice(i + 1).trim()
      if (!left || !right) return null
      return { left, right }
    }
  }
  return null
}

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
  const [itemSizeMode, setItemSizeMode] = useState<'fixed' | 'formula'>('fixed')
  const [itemSizeFixedType, setItemSizeFixedType] = useState<'number' | 'ab'>('number')
  const [itemSizeValue, setItemSizeValue] = useState('')
  const [itemSizeFormula, setItemSizeFormula] = useState('')
  const [itemSizeSourceField, setItemSizeSourceField] = useState<'spec_inner' | 'top' | 'bottom' | 'liner'>('spec_inner')
  const [itemSizePreviewSource, setItemSizePreviewSource] = useState('')
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

  const expectedSourceHint = itemSizeSourceField === 'top' || itemSizeSourceField === 'bottom' ? 'A*B' : 'A*B*C'
  const sourceDescription =
    itemSizeSourceField === 'top'
      ? t('descItemSizeTop')
      : itemSizeSourceField === 'bottom'
        ? t('descItemSizeBottom')
        : itemSizeSourceField === 'liner'
          ? t('descItemSizeLiner')
          : t('descItemSizeSpecInner')

  const computeItemSizePreview = () => {
    if (itemSizeMode !== 'formula') return '-'
    const expr = itemSizeFormula.trim()
    const src = itemSizePreviewSource.trim()
    if (!src) return '-'
    if (itemSizeSourceField === 'liner' && !expr) return src
    if (!expr || !FORMULA_ALLOWED_REGEX.test(expr)) return '-'
    const pair = SPLIT_TOP_STAR(expr)
    if (!pair) return '-'
    const isAB = itemSizeSourceField === 'top' || itemSizeSourceField === 'bottom'
    if (isAB && !SPEC_AB_REGEX.test(src)) return '-'
    if (!isAB && !SPEC_ABC_REGEX.test(src)) return '-'
    const parts = src.split('*').map((p) => p.trim())
    const vars: Record<string, number> = {}
    const aMatch = (parts[0] || '').match(A_NUMBER_REGEX)
    const a = aMatch ? Number(aMatch[0]) : Number.NaN
    if (!Number.isNaN(a)) vars.A = a
    if (parts.length >= 2) {
      const b = Number(parts[1])
      if (!Number.isNaN(b)) vars.B = b
    }
    if (parts.length >= 3) {
      const c = Number(parts[2])
      if (!Number.isNaN(c)) vars.C = c
    }
    const replacedLeft = pair.left
      .replace(/\bA\b/gi, Number.isNaN(vars.A) ? 'NaN' : `(${String(vars.A)})`)
      .replace(/\bB\b/gi, vars.B == null ? 'NaN' : `(${String(vars.B)})`)
      .replace(/\bC\b/gi, vars.C == null ? 'NaN' : `(${String(vars.C)})`)
    const replacedRight = pair.right
      .replace(/\bA\b/gi, Number.isNaN(vars.A) ? 'NaN' : `(${String(vars.A)})`)
      .replace(/\bB\b/gi, vars.B == null ? 'NaN' : `(${String(vars.B)})`)
      .replace(/\bC\b/gi, vars.C == null ? 'NaN' : `(${String(vars.C)})`)
    try {
      // eslint-disable-next-line no-new-func
      const left = Function(`"use strict"; return (${replacedLeft});`)()
      // eslint-disable-next-line no-new-func
      const right = Function(`"use strict"; return (${replacedRight});`)()
      if (typeof left !== 'number' || Number.isNaN(left) || !Number.isFinite(left)) return '-'
      if (typeof right !== 'number' || Number.isNaN(right) || !Number.isFinite(right)) return '-'
      const fmt = (n: number) => String(Number(n.toFixed(6))).replace(/\.0+$/, '')
      return `${fmt(left)}*${fmt(right)}`
    } catch {
      return '-'
    }
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    const name = itemName.trim()
    if (!name) return
    if (itemSizeMode === 'fixed') {
      if (itemSizeFixedType === 'number' && (itemSizeValue.trim() === '' || Number.isNaN(Number(itemSizeValue)))) {
        notify('Item Size (fixed) phải là số', 'error')
        return
      }
      if (itemSizeFixedType === 'ab' && !SPEC_AB_REGEX.test(itemSizeValue.trim())) {
        notify('Item Size fixed dạng A*B không hợp lệ', 'error')
        return
      }
    }
    if (itemSizeMode === 'formula' && (!itemSizeFormula.trim() || !FORMULA_ALLOWED_REGEX.test(itemSizeFormula.trim()))) {
      if (itemSizeSourceField !== 'liner') {
        notify('Công thức Item Size không hợp lệ. Chỉ dùng A/B/C, số và + - * / ( )', 'error')
        return
      }
    }
    if (itemSizeMode === 'formula' && itemSizeSourceField !== 'liner' && !SPLIT_TOP_STAR(itemSizeFormula.trim())) {
      notify('Công thức Item Size phải có dạng (expr1)*(expr2)', 'error')
      return
    }
    try {
      const payload = {
        item_name: name,
        item_color: itemColor.trim() || null,
        item_size_mode: itemSizeMode,
        item_size_fixed_type: itemSizeMode === 'fixed' ? itemSizeFixedType : 'number',
        item_size_value: itemSizeMode === 'fixed' && itemSizeFixedType === 'number' ? itemSizeValue.trim() : '',
        item_size_value_text: itemSizeMode === 'fixed' && itemSizeFixedType === 'ab' ? itemSizeValue.trim() : '',
        item_size_formula: itemSizeMode === 'formula' ? itemSizeFormula.trim() : '',
        item_size_source_field: itemSizeMode === 'formula' ? itemSizeSourceField : null,
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
      setItemColor('')
      setItemSizeMode('fixed')
      setItemSizeFixedType('number')
      setItemSizeValue('')
      setItemSizeFormula('')
      setItemSizeSourceField('spec_inner')
      setItemSizePreviewSource('')
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
            setItemSizeMode('fixed')
            setItemSizeFixedType('number')
            setItemSizeValue('')
            setItemSizeFormula('')
            setItemSizeSourceField('spec_inner')
            setItemSizePreviewSource('')
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
              <th>{t('fldItemSizeMode')}</th>
              <th>{t('fldItemSizeSourceField')}</th>
              <th>{t('fldItemSizeFormula')}</th>
              <th>{t('fldItemSizeValue')}</th>
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
                <td>{it.item_size_mode === 'formula' ? t('modeFormula') : t('modeFixed')}</td>
                <td>
                  {it.item_size_mode === 'formula'
                    ? (it.item_size_source_field === 'top'
                        ? t('srcTop')
                        : it.item_size_source_field === 'bottom'
                          ? t('srcBottom')
                          : it.item_size_source_field === 'liner'
                            ? t('srcLiner')
                            : t('srcSpecInner'))
                    : '-'}
                </td>
                <td>{it.item_size_mode === 'formula' ? (it.item_size_formula_code || '-') : '-'}</td>
                <td>
                  {it.item_size_mode === 'fixed'
                    ? (it.item_size_fixed_type === 'ab' ? (it.item_size_value_text || '-') : (it.item_size_value ?? '-'))
                    : '-'}
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
                        setItemColor(it.item_color || '')
                        setItemSizeMode((it.item_size_mode || 'fixed') as 'fixed' | 'formula')
                        setItemSizeFixedType((it.item_size_fixed_type || 'number') as 'number' | 'ab')
                        setItemSizeValue(
                          it.item_size_mode === 'fixed' && it.item_size_fixed_type === 'ab'
                            ? (it.item_size_value_text || '')
                            : (it.item_size_value != null ? String(it.item_size_value) : ''),
                        )
                        setItemSizeFormula(it.item_size_formula_code || it.item_size_formula || '')
                        setItemSizeSourceField((it.item_size_source_field || 'spec_inner') as 'spec_inner' | 'top' | 'bottom' | 'liner')
                        setItemSizePreviewSource('')
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

      <FormModal open={showForm} title={editing ? `${t('edit')}: ${editing.item_name}` : t('addItem')} onClose={() => setShowForm(false)}>
        <form onSubmit={save}>
          <div className="grid-2">
            <div className="form-field"><label>{t('colItem')}</label><input value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder={t('phItemName')} required /></div>
            <div className="form-field"><label>{t('fldItemColor')}</label><input value={itemColor} onChange={(e) => setItemColor(e.target.value)} placeholder={t('phColor')} /></div>
            <div className="form-field">
              <label>{t('fldItemSizeMode')}</label>
              <select value={itemSizeMode} onChange={(e) => setItemSizeMode(e.target.value as 'fixed' | 'formula')}>
                <option value="fixed">{t('modeFixed')}</option>
                <option value="formula">{t('modeFormula')}</option>
              </select>
            </div>
            {itemSizeMode === 'fixed' ? (
              <>
                <div className="form-field">
                  <label>{t('fldItemSizeFixedType')}</label>
                  <select value={itemSizeFixedType} onChange={(e) => setItemSizeFixedType(e.target.value as 'number' | 'ab')}>
                    <option value="number">{t('fixedNumber')}</option>
                    <option value="ab">{t('fixedAB')}</option>
                  </select>
                </div>
                <div className="form-field">
                  <label>{t('fldItemSizeValue')}</label>
                  {itemSizeFixedType === 'ab' ? (
                    <input value={itemSizeValue} onChange={(e) => setItemSizeValue(e.target.value)} placeholder="A*B" required />
                  ) : (
                    <input type="number" step="any" value={itemSizeValue} onChange={(e) => setItemSizeValue(e.target.value)} required />
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="form-field">
                  <label>{t('fldItemSizeSourceField')}</label>
                  <select
                    value={itemSizeSourceField}
                    onChange={(e) => {
                      const next = e.target.value as 'spec_inner' | 'top' | 'bottom' | 'liner'
                      setItemSizeSourceField(next)
                      if (next === 'liner') setItemSizeFormula('')
                    }}
                  >
                    <option value="spec_inner">{t('srcSpecInner')}</option>
                    <option value="top">{t('srcTop')}</option>
                    <option value="bottom">{t('srcBottom')}</option>
                    <option value="liner">{t('srcLiner')}</option>
                  </select>
                  <div className="small">{sourceDescription}</div>
                </div>
                {itemSizeSourceField !== 'liner' ? (
                  <div className="form-field">
                    <label>{t('fldItemSizeFormula')}</label>
                    <input value={itemSizeFormula} onChange={(e) => setItemSizeFormula(e.target.value)} placeholder={t('phItemSizeFormula')} required />
                    <div className="small">Biến hỗ trợ: A, B, C. Toán tử: + - * / ( )</div>
                  </div>
                ) : (
                  <div className="form-field">
                    <label>{t('fldItemSizeFormula')}</label>
                    <input value="" readOnly placeholder="Lấy trực tiếp từ Liner của Product" />
                    <div className="small">Liner: không cần công thức, dùng trực tiếp giá trị liner của Product.</div>
                  </div>
                )}
                <div className="form-field">
                  <label>{t('lblItemSizePreviewSource')}</label>
                  <input
                    value={itemSizePreviewSource}
                    onChange={(e) => setItemSizePreviewSource(e.target.value)}
                    placeholder={expectedSourceHint}
                  />
                </div>
                <div className="form-field">
                  <label>{t('lblItemSizePreviewResult')}</label>
                  <input value={computeItemSizePreview()} readOnly />
                </div>
              </>
            )}
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
