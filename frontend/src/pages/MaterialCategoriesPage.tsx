import { FormEvent, useEffect, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { MaterialCategory } from '../types'
import { I18nKey } from '../lib/i18n'
import FormModal from '../components/FormModal'
import ConfirmModal from '../components/ConfirmModal'

type Props = { token: string; notify: (message: string, type: 'success' | 'error') => void; t: (key: I18nKey) => string }

export default function MaterialCategoriesPage({ token, notify, t }: Props) {
  const [rows, setRows] = useState<MaterialCategory[]>([])
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<MaterialCategory | null>(null)
  const [name, setName] = useState('')
  const [specFormat, setSpecFormat] = useState<'size' | 'text'>('text')
  const [formatValue, setFormatValue] = useState('')
  const [pendingDelete, setPendingDelete] = useState<MaterialCategory | null>(null)
  const specFormatLabel = (value?: string) => (value === 'size' ? 'Kích thước' : 'Text')

  const load = async () => {
    try {
      const data = await api<MaterialCategory[]>(`/api/material-categories?search=${encodeURIComponent(search)}`, 'GET', undefined, token)
      setRows(data)
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
    if (specFormat === 'size' && !formatValue.trim()) {
      notify('Vui lòng nhập format khi chọn spec_format = size', 'error')
      return
    }
    try {
      if (editing) {
        await api(`/api/material-categories/${editing.id}`, 'PUT', {
          material_category_name: name.trim(),
          spec_format: specFormat,
          format: specFormat === 'size' ? formatValue.trim() : null,
        }, token)
        notify('Cập nhật material category thành công', 'success')
      } else {
        await api('/api/material-categories', 'POST', {
          material_category_name: name.trim(),
          spec_format: specFormat,
          format: specFormat === 'size' ? formatValue.trim() : null,
        }, token)
        notify('Tạo material category thành công', 'success')
      }
      setShowForm(false)
      setEditing(null)
      setName('')
      setSpecFormat('text')
      setFormatValue('')
      await load()
    } catch (err) {
      notify((err as Error).message, 'error')
    }
  }

  const deleteOne = async () => {
    if (!pendingDelete) return
    try {
      await api(`/api/material-categories/${pendingDelete.id}`, 'DELETE', undefined, token)
      setPendingDelete(null)
      notify('Xóa material category thành công', 'success')
      await load()
    } catch (err) {
      notify((err as Error).message, 'error')
    }
  }

  return (
    <div className="page-content">
      <div className="row toolbar-row">
        <input className="toolbar-search-input" placeholder="Tìm category" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button
          className="primary-light toolbar-add-btn"
          type="button"
          onClick={() => {
            setEditing(null)
            setName('')
            setSpecFormat('text')
            setFormatValue('')
            setShowForm(true)
          }}
        >
          <Plus size={15} /> Thêm category
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Material Category</th>
              <th>Spec Format</th>
              <th>Format</th>
              <th>{t('colCreatedAt')}</th>
              <th>{t('colUpdatedAt')}</th>
              <th>{t('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? rows.map((r) => (
              <tr key={r.id}>
                <td>{r.id}</td>
                <td>{r.material_category_name}</td>
                <td>{specFormatLabel(r.spec_format)}</td>
                <td>{r.format || '-'}</td>
                <td>{r.created_at || '-'}</td>
                <td>{r.updated_at || '-'}</td>
                <td>
                  <div className="row action-row">
                    <button type="button" className="icon-btn" title={t('edit')} aria-label={t('edit')} onClick={() => {
                      setEditing(r)
                      setName(r.material_category_name)
                      setSpecFormat((r.spec_format || 'text') as 'size' | 'text')
                      setFormatValue(r.format || '')
                      setShowForm(true)
                    }}><Pencil size={14} /></button>
                    <button type="button" className="danger-light icon-btn" title={t('delete')} aria-label={t('delete')} onClick={() => setPendingDelete(r)}><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            )) : (
              <tr><td className="empty-cell" colSpan={7}>{t('noData')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <FormModal open={showForm} title={editing ? 'Sửa Material Category' : 'Thêm Material Category'} onClose={() => setShowForm(false)}>
        <form onSubmit={save}>
          <div className="form-field">
            <label>Material Category</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="form-field">
            <label>Spec Format</label>
            <select value={specFormat} onChange={(e) => setSpecFormat(e.target.value as 'size' | 'text')}>
              <option value="text">Text</option>
              <option value="size">Kích thước</option>
            </select>
          </div>
          {specFormat === 'size' ? (
            <div className="form-field">
              <label>Format</label>
              <input value={formatValue} onChange={(e) => setFormatValue(e.target.value)} placeholder="Format của spec material" required />
            </div>
          ) : null}
          <div className="row form-actions">
            <button className="primary" type="submit">{t('save')}</button>
            <button type="button" onClick={() => setShowForm(false)}>{t('cancel')}</button>
          </div>
        </form>
      </FormModal>

      <ConfirmModal
        open={!!pendingDelete}
        title={t('confirmTitle')}
        message={`Bạn có chắc muốn xóa ${pendingDelete?.material_category_name || ''}?`}
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        onConfirm={() => void deleteOne()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
