import { FormEvent, useEffect, useState } from 'react'
import { CheckCircle2, Pencil, Plus, Trash2, XCircle } from 'lucide-react'
import { api } from '../lib/api'
import { MaterialCategory, MaterialMaster } from '../types'
import { I18nKey } from '../lib/i18n'
import FormModal from '../components/FormModal'
import ConfirmModal from '../components/ConfirmModal'

type Props = { token: string; notify: (message: string, type: 'success' | 'error') => void; t: (key: I18nKey) => string }

export default function MaterialsPage({ token, notify, t }: Props) {
  const [rows, setRows] = useState<MaterialMaster[]>([])
  const [categories, setCategories] = useState<MaterialCategory[]>([])
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<MaterialMaster | null>(null)
  const [name, setName] = useState('')
  const [materialCategoryId, setMaterialCategoryId] = useState('')
  const [formula, setFormula] = useState('')
  const [lami, setLami] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<MaterialMaster | null>(null)
  const selectedCategory = categories.find((c) => String(c.id) === materialCategoryId) || null
  const showFormulaOnly = !!selectedCategory && /vải|vai/i.test(selectedCategory.material_category_name || '')

  const load = async () => {
    try {
      const [data, cats] = await Promise.all([
        api<MaterialMaster[]>(`/api/materials?search=${encodeURIComponent(search)}`, 'GET', undefined, token),
        api<MaterialCategory[]>('/api/material-categories', 'GET', undefined, token),
      ])
      setRows(data)
      setCategories(cats)
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
    if (!name.trim()) return
    if (!materialCategoryId) {
      notify('Vui lòng chọn material category', 'error')
      return
    }
    const payload = {
      material_name: name.trim(),
      material_category_id: Number(materialCategoryId),
      formula: formula.trim() || null,
      lami,
    }
    try {
      if (editing) {
        await api(`/api/materials/${editing.id}`, 'PUT', payload, token)
        notify('Cập nhật material thành công', 'success')
      } else {
        await api('/api/materials', 'POST', payload, token)
        notify('Tạo material thành công', 'success')
      }
      setShowForm(false)
      setEditing(null)
      setName('')
      setMaterialCategoryId('')
      setFormula('')
      setLami(false)
      await load()
    } catch (err) {
      notify((err as Error).message, 'error')
    }
  }

  const deleteOne = async () => {
    if (!pendingDelete) return
    try {
      await api(`/api/materials/${pendingDelete.id}`, 'DELETE', undefined, token)
      setPendingDelete(null)
      notify('Xóa material thành công', 'success')
      await load()
    } catch (err) {
      notify((err as Error).message, 'error')
    }
  }

  return (
    <div className="page-content">
      <div className="row toolbar-row">
        <input className="toolbar-search-input" placeholder="Tìm material" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button
          className="primary-light toolbar-add-btn"
          type="button"
          onClick={() => {
            setEditing(null)
            setName('')
            setMaterialCategoryId('')
            setFormula('')
            setLami(false)
            setShowForm(true)
          }}
        >
          <Plus size={15} /> Thêm material
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Material</th>
              <th>Material Category</th>
              <th>Formula</th>
              <th>Lami</th>
              <th>{t('colCreatedAt')}</th>
              <th>{t('colUpdatedAt')}</th>
              <th>{t('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? rows.map((r) => (
              <tr key={r.id}>
                <td>{r.id}</td>
                <td>{r.material_name}</td>
                <td>{r.material_category_name || '-'}</td>
                <td>{/vải|vai/i.test(r.material_category_name || '') ? (r.formula || '-') : '-'}</td>
                <td>{r.lami ? <CheckCircle2 size={16} className="status-icon yes" /> : <XCircle size={16} className="status-icon no" />}</td>
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
                        setName(r.material_name)
                        setMaterialCategoryId(r.material_category_id ? String(r.material_category_id) : '')
                        setFormula(r.formula || '')
                        setLami(!!r.lami)
                        setShowForm(true)
                      }}
                    ><Pencil size={14} /></button>
                    <button type="button" className="danger-light icon-btn" title={t('delete')} aria-label={t('delete')} onClick={() => setPendingDelete(r)}><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            )) : (
              <tr><td className="empty-cell" colSpan={8}>{t('noData')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <FormModal open={showForm} title={editing ? 'Sửa Material' : 'Thêm Material'} onClose={() => setShowForm(false)}>
        <form onSubmit={save}>
          <div className="grid-2">
            <div className="form-field">
              <label>Material</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="form-field">
              <label>Material Category</label>
              <select value={materialCategoryId} onChange={(e) => setMaterialCategoryId(e.target.value)} required>
                <option value="">--</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.material_category_name}</option>
                ))}
              </select>
            </div>
            {showFormulaOnly ? (
              <div className="form-field">
                <label>Formula</label>
                <input value={formula} onChange={(e) => setFormula(e.target.value)} />
              </div>
            ) : null}
            <div className="form-field">
              <label>Lami</label>
              <label className="check-field">
                <input type="checkbox" checked={lami} onChange={(e) => setLami(e.target.checked)} />
                <span>Bật lami</span>
              </label>
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
        message={`Bạn có chắc muốn xóa ${pendingDelete?.material_name || ''}?`}
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        onConfirm={() => void deleteOne()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
