import { FormEvent, useEffect, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { I18nKey } from '../lib/i18n'
import { ProductType } from '../types'
import FormModal from '../components/FormModal'
import ConfirmModal from '../components/ConfirmModal'

type Props = { token: string; notify: (message: string, type: 'success' | 'error') => void; t: (key: I18nKey) => string }

export default function ProductTypesPage({ token, notify, t }: Props) {
  const [rows, setRows] = useState<ProductType[]>([])
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<ProductType | null>(null)
  const [name, setName] = useState('')
  const [formula, setFormula] = useState('')
  const [pendingDelete, setPendingDelete] = useState<ProductType | null>(null)

  const load = async () => {
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

  useEffect(() => { void load() }, [])
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250)
    return () => window.clearTimeout(timer)
  }, [search])

  const save = async (e: FormEvent) => {
    e.preventDefault()
    const normalized = name.trim().toUpperCase()
    if (!normalized) return
    try {
      if (editing) {
        await api(`/api/product-types/${editing.id}`, 'PUT', { product_type_name: normalized, formula: formula.trim() || null }, token)
        notify(t('productTypeUpdated'), 'success')
      } else {
        await api('/api/product-types', 'POST', { product_type_name: normalized, formula: formula.trim() || null }, token)
        notify(t('productTypeCreated'), 'success')
      }
      setShowForm(false)
      setEditing(null)
      setName('')
      setFormula('')
      await load()
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
      await load()
    } catch (err) {
      notify((err as Error).message, 'error')
    }
  }

  return (
    <div className="page-content">
      <div className="row toolbar-row">
        <input className="toolbar-search-input" placeholder={t('searchProductType')} value={search} onChange={(e) => setSearch(e.target.value)} />
        <button
          className="primary-light toolbar-add-btn"
          type="button"
          onClick={() => {
            setEditing(null)
            setName('')
            setFormula('')
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
              <th>Formula</th>
              <th>{t('colCreatedAt')}</th>
              <th>{t('colUpdatedAt')}</th>
              <th>{t('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? rows.map((r) => (
              <tr key={r.id}>
                <td>{r.id}</td>
                <td>{r.product_type_name}</td>
                <td>{r.formula || '-'}</td>
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
                        setFormula(r.formula || '')
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
              <tr><td className="empty-cell" colSpan={6}>{t('noData')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <FormModal open={showForm} title={editing ? t('edit') : t('addProductType')} onClose={() => setShowForm(false)}>
        <form onSubmit={save}>
          <div className="form-field">
            <label>{t('lblProductTypeName')}</label>
            <input value={name} onChange={(e) => setName(e.target.value.toUpperCase())} required />
          </div>
          <div className="form-field">
            <label>Formula</label>
            <input value={formula} onChange={(e) => setFormula(e.target.value)} />
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
