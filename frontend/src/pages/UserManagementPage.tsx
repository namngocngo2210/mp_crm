import { FormEvent, useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { AppUser } from '../types'
import { I18nKey } from '../lib/i18n'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import ConfirmModal from '../components/ConfirmModal'
import FormModal from '../components/FormModal'

type Props = {
  token: string
  notify: (message: string, type: 'success' | 'error') => void
  currentUser: AppUser
  t: (key: I18nKey) => string
}

const initForm = {
  username: '',
  password: '',
  full_name: '',
  avatar_url: '',
  role: 'staff',
}

export default function UserManagementPage({ token, notify, currentUser, t }: Props) {
  const PAGE_SIZE_OPTIONS = [10, 20, 50]
  const [rows, setRows] = useState<AppUser[]>([])
  const [search, setSearch] = useState('')
  const [form, setForm] = useState(initForm)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [pendingDelete, setPendingDelete] = useState<AppUser | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const firstSearchRunRef = useRef(true)

  const load = async () => {
    try {
      const data = await api<AppUser[]>(`/api/users?search=${encodeURIComponent(search)}`, 'GET', undefined, token)
      setRows(data)
      setPage(1)
    } catch (err) {
      notify((err as Error).message, 'error')
    }
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

  const createUser = async (e: FormEvent) => {
    e.preventDefault()
    try {
      if (editingId) {
        const payload: Record<string, unknown> = {
          username: form.username,
          full_name: form.full_name,
          avatar_url: form.avatar_url,
          role: form.role,
        }
        if (form.password) {
          payload.password = form.password
        }
        await api(`/api/users/${editingId}`, 'PUT', payload, token)
      } else {
        await api('/api/users', 'POST', form, token)
      }
      setForm(initForm)
      setShowForm(false)
      setEditingId(null)
      await load()
      notify(t(editingId ? 'userUpdated' : 'userCreated'), 'success')
    } catch (err) {
      notify((err as Error).message, 'error')
    }
  }

  const startEditUser = (item: AppUser) => {
    setForm({
      username: item.username || '',
      password: '',
      full_name: item.full_name || '',
      avatar_url: item.avatar_url || '',
      role: item.role || 'staff',
    })
    setEditingId(item.id)
    setShowForm(true)
  }

  const deleteUser = async () => {
    if (!pendingDelete) return
    try {
      await api(`/api/users/${pendingDelete.id}`, 'DELETE', undefined, token)
      await load()
      notify(t('userDeleted'), 'success')
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

  const deleteSelectedUsers = async () => {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    try {
      const results = await Promise.allSettled(ids.map((id) => api(`/api/users/${id}`, 'DELETE', undefined, token)))
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

  if (currentUser.role !== 'admin') {
    return <div className="page-content">{t('noPermissionUserMgmt')}</div>
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
    <>
      <div className="page-content">
        <div className="row toolbar-row">
          <input className="toolbar-search-input" placeholder={`${t('search')} ${t('colUsername')}/${t('colFullName')}`} value={search} onChange={(e) => setSearch(e.target.value)} />
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
              setForm(initForm)
              setShowForm(true)
            }}
          >
            <Plus size={15} /> {t('createUser')}
          </button>
        </div>
      </div>

      <div className="page-content table-wrap">
        <table>
          <thead>
            <tr>
              <th><input type="checkbox" checked={allPageSelected} onChange={(e) => toggleSelectAllPage(e.target.checked)} /></th>
              <th>{t('colUsername')}</th>
              <th>{t('colFullName')}</th>
              <th>{t('colRole')}</th>
              <th>{t('colUpdatedAt')}</th>
              <th>{t('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {pagedRows.length > 0 ? pagedRows.map((u) => (
              <tr key={u.id}>
                <td><input type="checkbox" checked={selectedIds.has(u.id)} onChange={(e) => toggleSelectRow(u.id, e.target.checked)} /></td>
                <td>{u.username}</td>
                <td>{u.full_name}</td>
                <td>{u.role}</td>
                <td>{u.updated_at}</td>
                <td>
                  <div className="row action-row">
                    <button type="button" className="icon-btn" title={t('edit')} aria-label={t('edit')} onClick={() => startEditUser(u)}><Pencil size={14} /></button>
                    <button type="button" className="danger-light icon-btn" title={t('delete')} aria-label={t('delete')} onClick={() => setPendingDelete(u)}><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            )) : (
              <tr><td className="empty-cell" colSpan={6}>{t('noData')}</td></tr>
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
      <ConfirmModal
        open={!!pendingDelete}
        title={t('confirmTitle')}
        message={`${t('confirmDeleteUser')} ${pendingDelete?.username ?? ''}?`}
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        onConfirm={() => void deleteUser()}
        onCancel={() => setPendingDelete(null)}
      />
      <ConfirmModal
        open={showBulkDeleteConfirm}
        title={t('confirmTitle')}
        message={`${t('confirmDeleteSelected')} (${selectedIds.size})?`}
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        onConfirm={() => void deleteSelectedUsers()}
        onCancel={() => setShowBulkDeleteConfirm(false)}
      />
      <FormModal
        open={showForm}
        title={editingId ? `${t('edit')}: ${form.username || ''}` : t('createUser')}
        onClose={() => { setShowForm(false); setEditingId(null); setForm(initForm) }}
      >
        <form onSubmit={createUser}>
          <div className="grid-2">
            <div className="form-field"><label>{t('colUsername')}</label><input placeholder={t('phUsername')} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required /></div>
            <div className="form-field"><label>{t('password')}</label><input placeholder={t('phPassword')} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required={!editingId} /></div>
            <div className="form-field"><label>{t('lblFullName')}</label><input placeholder={t('phFullName')} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
            <div className="form-field"><label>{t('lblAvatarUrl')}</label><input placeholder={t('phAvatarUrl')} value={form.avatar_url} onChange={(e) => setForm({ ...form, avatar_url: e.target.value })} /></div>
            <div className="form-field">
              <label>{t('lblRole')}</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as 'admin' | 'manager' | 'staff' })}>
                <option value="staff">staff</option>
                <option value="manager">manager</option>
                <option value="admin">admin</option>
              </select>
            </div>
          </div>
          <div className="row form-actions">
            <button type="submit" className="primary">{t('save')}</button>
            <button type="button" onClick={() => { setShowForm(false); setEditingId(null); setForm(initForm) }}>{t('cancel')}</button>
          </div>
        </form>
      </FormModal>
    </>
  )
}
