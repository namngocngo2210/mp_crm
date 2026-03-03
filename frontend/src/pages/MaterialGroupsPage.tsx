import { FormEvent, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Pencil, Plus, Trash2, XCircle } from 'lucide-react'
import { api } from '../lib/api'
import { MaterialGroup, UnitWeightOption } from '../types'
import { I18nKey } from '../lib/i18n'
import ConfirmModal from '../components/ConfirmModal'
import FormModal from '../components/FormModal'

type Props = { token: string; notify: (message: string, type: 'success' | 'error') => void; t: (key: I18nKey) => string }

const PAGE_SIZE_OPTIONS = [10, 20, 50]
const SPEC_ABC_REGEX = /^\s*[^*]+\s*\*\s*\d+(\.\d+)?\s*\*\s*\d+(\.\d+)?\s*$/
const FORMULA_ALLOWED_REGEX = /^[A-Za-z0-9_+\-*/().\s]+$/
const A_NUMBER_REGEX = /[-+]?\d+(\.\d+)?/

export default function MaterialGroupsPage({ token, notify, t }: Props) {
  const [rows, setRows] = useState<MaterialGroup[]>([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [pendingDelete, setPendingDelete] = useState<MaterialGroup | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)
  const [unitWeightOptions, setUnitWeightOptions] = useState<UnitWeightOption[]>([])
  const [form, setForm] = useState({
    material_group_name: '',
    spec_label: '',
    has_lami: false,
    use_lami_for_calc: false,
    lami_calc_value: '',
    pcs_ea_label: '',
    unit_weight_mode: 'fixed' as 'fixed' | 'formula' | 'choice',
    unit_weight_value: '',
    unit_weight_formula: '',
    unit_weight_option_id: '',
    unit_weight_note: '',
  })
  const [previewSpec, setPreviewSpec] = useState('')

  const load = async () => {
    const [mgs, options] = await Promise.all([
      api<MaterialGroup[]>('/api/material-groups', 'GET', undefined, token),
      api<UnitWeightOption[]>('/api/unit-weight-options', 'GET', undefined, token),
    ])
    setRows(mgs)
    setUnitWeightOptions(options)
    setPage(1)
  }

  useEffect(() => {
    void load()
  }, [])

  useEffect(() => {
    const valid = new Set(rows.map((r) => r.id))
    setSelectedIds((prev) => new Set([...prev].filter((id) => valid.has(id))))
  }, [rows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => (r.material_group_name || '').toLowerCase().includes(q))
  }, [rows, search])

  const save = async (e: FormEvent) => {
    e.preventDefault()
    const name = form.material_group_name.trim()
    const rawSpec = form.spec_label.trim()
    const rawPcs = form.pcs_ea_label.trim()
    if (!name) {
      notify(t('phMaterialGroupName'), 'error')
      return
    }
    if (rawSpec && !SPEC_ABC_REGEX.test(rawSpec)) {
      notify('Spec phải đúng định dạng A*B*C (A là text hoặc số, B và C là số)', 'error')
      return
    }
    if (rawPcs && Number.isNaN(Number(rawPcs))) {
      notify('PCS (EA) phải là số', 'error')
      return
    }
    const rawLamiCalcValue = form.lami_calc_value.trim()
    if (form.use_lami_for_calc && (rawLamiCalcValue === '' || Number.isNaN(Number(rawLamiCalcValue)))) {
      notify('Giá trị lami tính toán phải là số', 'error')
      return
    }
    const rawUnitWeight = form.unit_weight_value.trim()
    if (form.unit_weight_mode === 'fixed' && (rawUnitWeight === '' || Number.isNaN(Number(rawUnitWeight)))) {
      notify('Unit Weight (fixed) phải là số', 'error')
      return
    }
    const rawFormula = form.unit_weight_formula.trim()
    if (form.unit_weight_mode === 'formula' && (!rawFormula || !FORMULA_ALLOWED_REGEX.test(rawFormula))) {
      notify('Công thức không hợp lệ. Chỉ dùng A/B/C, số và + - * / ( )', 'error')
      return
    }
    if (form.unit_weight_mode === 'choice' && !form.unit_weight_option_id) {
      notify('Vui lòng chọn thông số Unit Weight theo size', 'error')
      return
    }
    try {
      const payload = {
        material_group_name: name,
        spec_label: rawSpec ? rawSpec.split('*').map((x) => x.trim()).join('*') : '',
        has_lami: form.has_lami,
        use_lami_for_calc: form.has_lami && form.use_lami_for_calc,
        lami_calc_value: form.has_lami && form.use_lami_for_calc ? rawLamiCalcValue : '',
        pcs_ea_label: rawPcs,
        unit_weight_mode: form.unit_weight_mode,
        unit_weight_value: form.unit_weight_mode === 'fixed' ? rawUnitWeight : '',
        unit_weight_formula: form.unit_weight_mode === 'formula' ? rawFormula : '',
        unit_weight_option_id: form.unit_weight_mode === 'choice' ? Number(form.unit_weight_option_id) : null,
        unit_weight_note: form.unit_weight_note.trim(),
      }
      if (editingId) {
        await api(`/api/material-groups/${editingId}`, 'PUT', payload, token)
      } else {
        await api('/api/material-groups', 'POST', payload, token)
      }
      setShowForm(false)
      setEditingId(null)
      setForm({
        material_group_name: '',
        spec_label: '',
        has_lami: false,
        use_lami_for_calc: false,
        lami_calc_value: '',
        pcs_ea_label: '',
        unit_weight_mode: 'fixed',
        unit_weight_value: '',
        unit_weight_formula: '',
        unit_weight_option_id: '',
        unit_weight_note: '',
      })
      await load()
      notify(t(editingId ? 'materialGroupUpdated' : 'materialGroupCreated'), 'success')
    } catch (err) {
      notify((err as Error).message, 'error')
    }
  }

  const startEdit = (item: MaterialGroup) => {
    setEditingId(item.id)
    setForm({
      material_group_name: item.material_group_name || '',
      spec_label: item.spec_label || '',
      has_lami: !!item.has_lami,
      use_lami_for_calc: !!item.use_lami_for_calc,
      lami_calc_value: item.lami_calc_value != null ? String(item.lami_calc_value) : '',
      pcs_ea_label: item.pcs_ea_label || '',
      unit_weight_mode: item.unit_weight_mode || 'fixed',
      unit_weight_value: item.unit_weight_value != null ? String(item.unit_weight_value) : '',
      unit_weight_formula: item.unit_weight_formula || item.unit_weight_formula_code || '',
      unit_weight_option_id: item.unit_weight_option_id != null ? String(item.unit_weight_option_id) : '',
      unit_weight_note: item.unit_weight_note || '',
    })
    setPreviewSpec(item.spec_label || '')
    setShowForm(true)
  }

  const computeFormulaPreview = () => {
    if (form.unit_weight_mode !== 'formula') return '-'
    const expr = form.unit_weight_formula.trim()
    const spec = previewSpec.trim()
    if (!expr || !FORMULA_ALLOWED_REGEX.test(expr) || !SPEC_ABC_REGEX.test(spec)) return '-'
    const parts = spec.split('*').map((p) => p.trim())
    if (parts.length !== 3) return '-'
    const aMatch = (parts[0] || '').match(A_NUMBER_REGEX)
    const aNum = aMatch ? Number(aMatch[0]) : Number.NaN
    const b = Number(parts[1])
    const c = Number(parts[2])
    if (Number.isNaN(b) || Number.isNaN(c)) return '-'
    const replaced = expr
      .replace(/\bB\b/gi, `(${String(b)})`)
      .replace(/\bC\b/gi, `(${String(c)})`)
      .replace(/\bA\b/gi, Number.isNaN(aNum) ? 'NaN' : `(${String(aNum)})`)
    try {
      // eslint-disable-next-line no-new-func
      const baseResult = Function(`"use strict"; return (${replaced});`)()
      if (typeof baseResult !== 'number' || Number.isNaN(baseResult) || !Number.isFinite(baseResult)) return '-'
      if (form.use_lami_for_calc) {
        const lamiFactor = Number(form.lami_calc_value)
        if (Number.isNaN(lamiFactor) || !Number.isFinite(lamiFactor)) return '-'
        return String(baseResult + lamiFactor)
      }
      return String(baseResult)
    } catch {
      return '-'
    }
  }

  const groupedOptions = useMemo(() => {
    return unitWeightOptions.reduce<Record<string, UnitWeightOption[]>>((acc, row) => {
      const key = row.option_group || '-'
      if (!acc[key]) acc[key] = []
      acc[key].push(row)
      return acc
    }, {})
  }, [unitWeightOptions])


  const remove = async () => {
    if (!pendingDelete) return
    try {
      await api(`/api/material-groups/${pendingDelete.id}`, 'DELETE', undefined, token)
      await load()
      notify(t('materialGroupDeleted'), 'success')
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

  const deleteSelectedMaterialGroups = async () => {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    try {
      const results = await Promise.allSettled(ids.map((id) => api(`/api/material-groups/${id}`, 'DELETE', undefined, token)))
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

  const renderLamiIcon = (hasLami?: boolean) => (
    hasLami ? <CheckCircle2 size={16} className="status-icon yes" /> : <XCircle size={16} className="status-icon no" />
  )
  const format5 = (value?: number | null) => {
    if (value == null || Number.isNaN(Number(value))) return '-'
    const n = Number(value)
    const fixed = n.toFixed(5)
    const trimmed = fixed.replace(/(\.\d*?[1-9])0+$/g, '$1').replace(/\.0+$/g, '')
    return trimmed === '-0' ? '0' : trimmed
  }

  return (
    <div className="page-content">
      <div className="row toolbar-row">
        <input className="toolbar-search-input" placeholder={`${t('search')} ${t('materialGroup')}`} value={search} onChange={(e) => setSearch(e.target.value)} />
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
            setEditingId(null)
            setForm({
              material_group_name: '',
              spec_label: '',
              has_lami: false,
              use_lami_for_calc: false,
              lami_calc_value: '',
              pcs_ea_label: '',
              unit_weight_mode: 'fixed',
              unit_weight_value: '',
              unit_weight_formula: '',
              unit_weight_option_id: '',
              unit_weight_note: '',
            })
            setPreviewSpec('')
            setShowForm(true)
          }}
        >
          <Plus size={15} /> {t('addMaterialGroup')}
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th><input type="checkbox" checked={allPageSelected} onChange={(e) => toggleSelectAllPage(e.target.checked)} /></th>
              <th>{t('colMaterialGroup')}</th>
              <th>{t('fldSpec')}</th>
              <th>{t('fldLami')}</th>
              <th>{t('fldLamiCalcValue')}</th>
              <th>{t('fldPcsEa')}</th>
              <th>{t('fldUnitWeightFormula')}</th>
              <th>{t('fldUnitWeightValue')}</th>
              <th>Giá trị cố định</th>
              <th>Unit Weight(kg)</th>
              <th>{t('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {paged.length > 0 ? paged.map((mg) => (
              <tr key={mg.id}>
                <td><input type="checkbox" checked={selectedIds.has(mg.id)} onChange={(e) => toggleSelectRow(mg.id, e.target.checked)} /></td>
                <td>{mg.material_group_name}</td>
                <td>{mg.spec_label}</td>
                <td>{renderLamiIcon(mg.has_lami)}</td>
                <td>{mg.use_lami_for_calc ? format5(mg.lami_calc_value) : '-'}</td>
                <td>{mg.pcs_ea_label}</td>
                <td>{mg.unit_weight_mode === 'formula' ? (mg.unit_weight_formula || mg.unit_weight_formula_code || '-') : '-'}</td>
                <td>{mg.unit_weight_mode === 'fixed' ? format5(mg.unit_weight_value) : '-'}</td>
                <td>
                  {mg.unit_weight_mode === 'choice'
                    ? `${mg.unit_weight_option_group || '-'} / ${mg.unit_weight_option_label || '-'} (${format5(mg.unit_weight_value)})`
                    : '-'}
                </td>
                <td>{format5(mg.unit_weight_computed)}</td>
                <td>
                  <div className="row action-row">
                    <button type="button" className="icon-btn" title={t('edit')} aria-label={t('edit')} onClick={() => startEdit(mg)}><Pencil size={14} /></button>
                    <button type="button" className="danger-light icon-btn" title={t('delete')} aria-label={t('delete')} onClick={() => setPendingDelete(mg)}><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            )) : <tr><td className="empty-cell" colSpan={11}>{t('noData')}</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="table-pagination">
        <div className="row action-row">
          <span>{t('rowsPerPage')}</span>
          <select value={pageSize} onChange={(e) => { const n = Math.min(50, Math.max(10, Number(e.target.value) || 10)); setPageSize(n); setPage(1) }}>
            {PAGE_SIZE_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        </div>
        <div className="row action-row">
          <button type="button" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>{t('prev')}</button>
          <span>{t('page')} {safePage}/{totalPages}</span>
          <button type="button" disabled={safePage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>{t('next')}</button>
        </div>
      </div>

      <FormModal
        open={showForm}
        title={editingId ? `${t('edit')}: ${form.material_group_name || ''}` : t('addMaterialGroup')}
        onClose={() => { setShowForm(false); setEditingId(null) }}
      >
        <form onSubmit={save}>
          <div className="grid-2">
            <div className="form-field full-width"><label>{t('addMaterialGroup')}</label><input value={form.material_group_name} onChange={(e) => setForm({ ...form, material_group_name: e.target.value })} required /></div>
            <div className="form-field">
              <label>{t('fldSpec')}</label>
              <input value={form.spec_label} onChange={(e) => setForm({ ...form, spec_label: e.target.value })} />
            </div>
            <div className="form-field">
              <label>{t('fldLami')}</label>
              <label className="choice-radio-item">
                <input
                  type="checkbox"
                  checked={form.has_lami}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      has_lami: e.target.checked,
                      use_lami_for_calc: e.target.checked ? prev.use_lami_for_calc : false,
                      lami_calc_value: e.target.checked ? prev.lami_calc_value : '',
                    }))
                  }
                />
                <span>{t('fldLami')}</span>
              </label>
              <label className="choice-radio-item">
                <input
                  type="checkbox"
                  checked={form.use_lami_for_calc}
                  disabled={!form.has_lami}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      use_lami_for_calc: e.target.checked,
                      lami_calc_value: e.target.checked ? prev.lami_calc_value : '',
                    }))
                  }
                />
                <span>{t('fldUseLamiForCalc')}</span>
              </label>
            </div>
            {form.use_lami_for_calc ? (
              <div className="form-field">
                <label>{t('fldLamiCalcValue')}</label>
                <input
                  type="number"
                  step="any"
                  value={form.lami_calc_value}
                  onChange={(e) => setForm({ ...form, lami_calc_value: e.target.value })}
                />
              </div>
            ) : null}
            <div className="form-field"><label>{t('fldPcsEa')}</label><input type="number" step="any" value={form.pcs_ea_label} onChange={(e) => setForm({ ...form, pcs_ea_label: e.target.value })} /></div>
            <div className="form-field">
              <label>{t('fldUnitWeightMode')}</label>
              <select
                value={form.unit_weight_mode}
                onChange={(e) => setForm({ ...form, unit_weight_mode: e.target.value as 'fixed' | 'formula' | 'choice' })}
              >
                <option value="fixed">{t('modeFixed')}</option>
                <option value="formula">{t('modeFormula')}</option>
                <option value="choice">{t('modeChoice')}</option>
              </select>
            </div>
            {form.unit_weight_mode === 'fixed' ? (
              <div className="form-field">
                <label>{t('fldUnitWeightValue')}</label>
                <input
                  type="number"
                  step="any"
                  value={form.unit_weight_value}
                  onChange={(e) => setForm({ ...form, unit_weight_value: e.target.value })}
                  required
                />
              </div>
            ) : null}
            {form.unit_weight_mode === 'formula' ? (
              <div className="form-field">
                <label>{t('fldUnitWeightFormula')}</label>
                <input
                  placeholder={t('phUnitWeightFormula')}
                  value={form.unit_weight_formula}
                  onChange={(e) => setForm({ ...form, unit_weight_formula: e.target.value })}
                  required
                />
                <div className="small">Biến hỗ trợ: A, B, C. Toán tử: + - * / ( )</div>
              </div>
            ) : null}
            {form.unit_weight_mode === 'choice' ? (
              <div className="form-field full-width">
                <label>{t('fldUnitWeightChoice')}</label>
                <div className="choice-radio-list">
                  {Object.keys(groupedOptions).length === 0 ? <div className="small">{t('noData')}</div> : null}
                  {Object.entries(groupedOptions).map(([group, list]) => (
                    <div key={group} className="choice-radio-group">
                      <div className="small"><strong>{group}</strong></div>
                      <div className="choice-radio-items">
                        {list.map((opt) => (
                          <label key={opt.id} className="choice-radio-item">
                            <input
                              type="radio"
                              name="unit_weight_option_id"
                              value={opt.id}
                              checked={form.unit_weight_option_id === String(opt.id)}
                              onChange={(e) => setForm({ ...form, unit_weight_option_id: e.target.value })}
                            />
                            <span>{opt.option_label} ({opt.unit_weight_value})</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {form.unit_weight_mode === 'formula' ? (
              <>
                <div className="form-field">
                  <label>{t('lblFormulaPreviewSpec')}</label>
                  <input
                    placeholder="A*B*C"
                    value={previewSpec}
                    onChange={(e) => setPreviewSpec(e.target.value)}
                  />
                </div>
                <div className="form-field">
                  <label>{t('lblFormulaPreviewResult')}</label>
                  <input value={computeFormulaPreview()} readOnly />
                </div>
              </>
            ) : null}
            <div className="form-field full-width">
              <label>{t('fldUnitWeightNote')}</label>
              <input className="material-note-input" value={form.unit_weight_note} onChange={(e) => setForm({ ...form, unit_weight_note: e.target.value })} />
            </div>
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
        message={`${t('confirmDeleteMaterialGroup')} ${pendingDelete?.material_group_name ?? ''}?`}
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
        onConfirm={() => void deleteSelectedMaterialGroups()}
        onCancel={() => setShowBulkDeleteConfirm(false)}
      />
    </div>
  )
}
