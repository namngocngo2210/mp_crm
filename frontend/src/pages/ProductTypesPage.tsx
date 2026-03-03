import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { I18nKey } from '../lib/i18n'
import { ItemTypeFormula, ProductType } from '../types'
import FormModal from '../components/FormModal'
import ConfirmModal from '../components/ConfirmModal'

type Props = { token: string; notify: (message: string, type: 'success' | 'error') => void; t: (key: I18nKey) => string }
type FormulaMatrixPayload = {
  items: Array<{ id: number; item_name: string }>
  product_types: ProductType[]
  formulas: ItemTypeFormula[]
}

export default function ProductTypesPage({ token, notify, t }: Props) {
  const [tab, setTab] = useState<'config' | 'formula'>('config')
  const [rows, setRows] = useState<ProductType[]>([])
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<ProductType | null>(null)
  const [name, setName] = useState('')
  const [pendingDelete, setPendingDelete] = useState<ProductType | null>(null)

  const [formulaItems, setFormulaItems] = useState<Array<{ id: number; item_name: string }>>([])
  const [formulaTypes, setFormulaTypes] = useState<ProductType[]>([])
  const [formulaMap, setFormulaMap] = useState<Record<string, string>>({})
  const [savingCellKey, setSavingCellKey] = useState('')

  const matrixKey = (itemId: number, typeId: number) => `${itemId}:${typeId}`

  const loadConfig = async () => {
    try {
      const data = await api<ProductType[]>('/api/product-types', 'GET', undefined, token)
      const keyword = search.trim().toLowerCase()
      setRows(
        keyword ? data.filter((r) => (r.product_type_name || '').toLowerCase().includes(keyword)) : data,
      )
    } catch (err) {
      notify((err as Error).message, 'error')
    }
  }

  const loadFormulaMatrix = async () => {
    try {
      const data = await api<FormulaMatrixPayload>('/api/item-type-formulas', 'GET', undefined, token)
      setFormulaItems(data.items || [])
      setFormulaTypes(data.product_types || [])
      const nextMap: Record<string, string> = {}
      ;(data.formulas || []).forEach((f) => {
        nextMap[matrixKey(f.item_id, f.product_type_id)] = f.formula || ''
      })
      setFormulaMap(nextMap)
    } catch (err) {
      notify((err as Error).message, 'error')
    }
  }

  useEffect(() => { void loadConfig() }, [])
  useEffect(() => {
    const timer = window.setTimeout(() => void loadConfig(), 250)
    return () => window.clearTimeout(timer)
  }, [search])
  useEffect(() => {
    if (tab === 'formula') {
      void loadFormulaMatrix()
    }
  }, [tab])

  const saveConfig = async (e: FormEvent) => {
    e.preventDefault()
    const normalized = name.trim().toUpperCase()
    if (!normalized) return
    try {
      if (editing) {
        await api(`/api/product-types/${editing.id}`, 'PUT', { product_type_name: normalized }, token)
        notify(t('productTypeUpdated'), 'success')
      } else {
        await api('/api/product-types', 'POST', { product_type_name: normalized }, token)
        notify(t('productTypeCreated'), 'success')
      }
      setShowForm(false)
      setEditing(null)
      setName('')
      await loadConfig()
      await loadFormulaMatrix()
    } catch (err) {
      notify((err as Error).message, 'error')
    }
  }

  const deleteOne = async () => {
    if (!pendingDelete) return
    try {
      await api(`/api/product-types/${pendingDelete.id}`, 'DELETE', undefined, token)
      setPendingDelete(null)
      notify(t('productTypeDeleted'), 'success')
      await loadConfig()
      await loadFormulaMatrix()
    } catch (err) {
      notify((err as Error).message, 'error')
    }
  }

  const sortedRows = useMemo(() => rows.slice().sort((a, b) => a.id - b.id), [rows])

  const updateFormulaCell = (itemId: number, productTypeId: number, value: string) => {
    setFormulaMap((prev) => ({ ...prev, [matrixKey(itemId, productTypeId)]: value }))
  }

  const saveFormulaCell = async (itemId: number, productTypeId: number) => {
    const key = matrixKey(itemId, productTypeId)
    const formula = (formulaMap[key] || '').trim()
    setSavingCellKey(key)
    try {
      await api(
        '/api/item-type-formulas',
        'PUT',
        { item_id: itemId, product_type_id: productTypeId, formula: formula || null },
        token,
      )
    } catch (err) {
      notify((err as Error).message, 'error')
      await loadFormulaMatrix()
    } finally {
      setSavingCellKey('')
    }
  }

  return (
    <div className="page-content">
      <div className="row toolbar-row">
        <div className="row action-row">
          <button type="button" className={tab === 'config' ? 'primary-light' : ''} onClick={() => setTab('config')}>Cấu hình</button>
          <button type="button" className={tab === 'formula' ? 'primary-light' : ''} onClick={() => setTab('formula')}>Công thức</button>
        </div>
      </div>

      {tab === 'config' ? (
        <>
          <div className="row toolbar-row">
            <input className="toolbar-search-input" placeholder={t('searchProductType')} value={search} onChange={(e) => setSearch(e.target.value)} />
            <button
              className="primary-light toolbar-add-btn"
              type="button"
              onClick={() => {
                setEditing(null)
                setName('')
                setShowForm(true)
              }}
            >
              <Plus size={15} /> {t('addProductType')}
            </button>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>{t('lblProductTypeName')}</th>
                  <th>{t('colCreatedAt')}</th>
                  <th>{t('colUpdatedAt')}</th>
                  <th>{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.length > 0 ? sortedRows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.id}</td>
                    <td>{r.product_type_name}</td>
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
                            setName(r.product_type_name || '')
                            setShowForm(true)
                          }}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          className="danger-light icon-btn"
                          title={t('delete')}
                          aria-label={t('delete')}
                          onClick={() => setPendingDelete(r)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr><td className="empty-cell" colSpan={5}>{t('noData')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="table-wrap formula-matrix-wrap">
          <table className="formula-matrix-table">
            <thead>
              <tr>
                <th className="formula-matrix-item-col">Item</th>
                {formulaTypes.map((pt) => (
                  <th key={pt.id} className="formula-matrix-head">{pt.product_type_name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {formulaItems.length > 0 ? formulaItems.map((it) => (
                <tr key={it.id}>
                  <td>{it.item_name}</td>
                  {formulaTypes.map((pt) => {
                    const key = matrixKey(it.id, pt.id)
                    return (
                      <td key={key}>
                        <input
                          className="formula-cell-input"
                          value={formulaMap[key] || ''}
                          onChange={(e) => updateFormulaCell(it.id, pt.id, e.target.value)}
                          onBlur={() => void saveFormulaCell(it.id, pt.id)}
                          placeholder="A x B"
                          disabled={savingCellKey === key}
                        />
                      </td>
                    )
                  })}
                </tr>
              )) : (
                <tr><td className="empty-cell" colSpan={Math.max(2, formulaTypes.length + 1)}>{t('noData')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <FormModal open={showForm} title={editing ? t('edit') : t('addProductType')} onClose={() => setShowForm(false)}>
        <form onSubmit={saveConfig}>
          <div className="form-field">
            <label>{t('lblProductTypeName')}</label>
            <input value={name} onChange={(e) => setName(e.target.value.toUpperCase())} required />
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
        message={`${t('confirmDeleteProductType')} ${pendingDelete?.product_type_name || ''}?`}
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        onConfirm={() => void deleteOne()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
