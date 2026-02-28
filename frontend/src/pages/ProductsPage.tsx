import { ChangeEvent, DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Select from 'react-select'
import { CheckCircle2, Eye, Pencil, Plus, Trash2, Upload, XCircle } from 'lucide-react'
import { api } from '../lib/api'
import { Customer, Item, MaterialGroup, PrintImage, PrintVersion, Product, ProductSpec } from '../types'
import { I18nKey } from '../lib/i18n'
import ConfirmModal from '../components/ConfirmModal'
import FormModal from '../components/FormModal'

type Props = { token: string; notify: (message: string, type: 'success' | 'error') => void; t: (key: I18nKey) => string }

type Option = { value: number; label: string }
type BulkSpecRow = {
  key: number
  item_id: number
  item_name: string
  material_group_id?: number
  material_group?: string
  lami: string
  spec: string
  item_color: string
  pcs_ea: string
  unit_weight_kg: string
  qty_m_or_m2: string
  wt_kg: string
}

const PRODUCT_TYPES = [
  'BELT UPANEL',
  'ROPE UPANEL',
  'BELT TUBULAR',
  'ROPE TUBULAR',
  '4 PANEL',
  'BELT CIRCULAR',
  'ROPE CIRCULAR',
  'BAO CUỐN',
]

const SEWING_TYPES = ['INSIDE', 'OUTSIDE']
const SPEC_ABC_REGEX = /^\s*[^*]+\s*\*\s*\d+(\.\d+)?\s*\*\s*\d+(\.\d+)?\s*$/
const FORMULA_ALLOWED_REGEX = /^[A-Za-z0-9_+\-*/().\s]+$/
const A_NUMBER_REGEX = /[-+]?\d+(\.\d+)?/

const productInit = {
  customer_id: '',
  product_code: '',
  product_name: '',
  type: PRODUCT_TYPES[0],
  type_other: '',
  sewing_type: SEWING_TYPES[0],
  sewing_type_other: '',
  print: 'yes',
  swl: '',
  spec_other: '',
  spec_inner: '',
  color: '',
  liner: '',
  top: '',
  bottom: '',
  packing: '',
  other_note: '',
}

export default function ProductsPage({ token, notify, t }: Props) {
  const navigate = useNavigate()
  const location = useLocation()
  const detailMatch = location.pathname.match(/^\/products\/(\d+)$/)
  const detailProductId = detailMatch ? Number(detailMatch[1]) : null
  const isDetailPage = !!detailProductId
  const PAGE_SIZE_OPTIONS = [5, 10]
  const [customers, setCustomers] = useState<Customer[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [materialGroups, setMaterialGroups] = useState<MaterialGroup[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [form, setForm] = useState(productInit)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [specs, setSpecs] = useState<ProductSpec[]>([])
  const [showBulkSpecModal, setShowBulkSpecModal] = useState(false)
  const [bulkSpecItems, setBulkSpecItems] = useState<Option[]>([])
  const [bulkSpecRows, setBulkSpecRows] = useState<BulkSpecRow[]>([])
  const [selectedSpecIds, setSelectedSpecIds] = useState<Set<number>>(new Set())
  const [showBulkSpecDeleteConfirm, setShowBulkSpecDeleteConfirm] = useState(false)
  const [images, setImages] = useState<PrintImage[]>([])
  const [pendingDelete, setPendingDelete] = useState<Product | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const firstSearchRunRef = useRef(true)
  const printImageUploadRef = useRef<HTMLInputElement | null>(null)

  const customerOptions: Option[] = customers.map((c) => ({
    value: c.id,
    label: `${c.customer_code} - ${c.customer_name}`,
  }))
  const itemOptions: Option[] = items.map((it) => ({ value: it.id, label: it.item_name }))
  const customerNameById = useMemo(
    () => new Map(customers.map((c) => [c.id, c.customer_name || c.customer_code || String(c.id)])),
    [customers],
  )
  const itemById = useMemo(() => new Map(items.map((it) => [it.id, it])), [items])
  const materialGroupById = useMemo(() => new Map(materialGroups.map((m) => [m.id, m])), [materialGroups])

  const selectedCustomerOption = customerOptions.find((o) => String(o.value) === form.customer_id) || null
  const typeMode = PRODUCT_TYPES.includes(form.type) ? form.type : (form.type ? 'OTHER' : PRODUCT_TYPES[0])
  const sewingMode = SEWING_TYPES.includes(form.sewing_type) ? form.sewing_type : (form.sewing_type ? 'OTHER' : SEWING_TYPES[0])

  const loadBase = async () => {
    const [cus, prod, it, mg] = await Promise.all([
      api<Customer[]>('/api/customers', 'GET', undefined, token),
      api<Product[]>(`/api/products?search=${encodeURIComponent(search)}`, 'GET', undefined, token),
      api<Item[]>('/api/items', 'GET', undefined, token),
      api<MaterialGroup[]>('/api/material-groups', 'GET', undefined, token),
    ])
    setCustomers(cus)
    setProducts(prod)
    setItems(it)
    setMaterialGroups(mg)
    setPage(1)
  }

  const loadSpecs = async (productId: number) => {
    const data = await api<ProductSpec[]>(`/api/products/${productId}/specs`, 'GET', undefined, token)
    setSpecs(data)
  }

  const loadVersions = async (productId: number) => {
    const data = await api<PrintVersion[]>(`/api/products/${productId}/print-versions`, 'GET', undefined, token)
    if (data.length > 0) {
      const latest = data[0]
      const detail = await api<{ version: PrintVersion; images: PrintImage[] }>(`/api/print-versions/${latest.id}`, 'GET', undefined, token)
      setImages(detail.images)
      return
    }
    setImages([])
  }

  const loadDetail = async (productId: number) => {
    const data = await api<Product>(`/api/products/${productId}`, 'GET', undefined, token)
    setSelectedProduct(data)
  }

  useEffect(() => {
    void loadBase()
  }, [])

  useEffect(() => {
    if (firstSearchRunRef.current) {
      firstSearchRunRef.current = false
      return
    }
    if (isDetailPage) return
    const timer = window.setTimeout(() => {
      void loadBase()
    }, 250)
    return () => window.clearTimeout(timer)
  }, [search, isDetailPage])

  useEffect(() => {
    const valid = new Set(products.map((r) => r.id))
    setSelectedIds((prev) => new Set([...prev].filter((id) => valid.has(id))))
  }, [products])

  useEffect(() => {
    if (!detailProductId) return
    void loadBase()
    void loadDetail(detailProductId)
    void loadSpecs(detailProductId)
    void loadVersions(detailProductId)
  }, [detailProductId])

  useEffect(() => {
    const valid = new Set(specs.map((s) => s.id))
    setSelectedSpecIds((prev) => new Set([...prev].filter((id) => valid.has(id))))
  }, [specs])

  const saveProduct = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      const payload = {
        ...form,
        customer_id: Number(form.customer_id),
        type: (typeMode === 'OTHER' ? form.type_other : (form.type || PRODUCT_TYPES[0])).toUpperCase(),
        sewing_type: (sewingMode === 'OTHER' ? form.sewing_type_other : (form.sewing_type || SEWING_TYPES[0])).toUpperCase(),
      }
      if (editingId) {
        await api(`/api/products/${editingId}`, 'PUT', payload, token)
      } else {
        await api('/api/products', 'POST', payload, token)
      }
      setForm(productInit)
      setEditingId(null)
      setShowForm(false)
      await loadBase()
      notify(editingId ? t('productUpdated') : t('productCreated'), 'success')
    } catch (err) {
      const message = (err as Error).message
      setError(message)
      notify(message, 'error')
    }
  }

  const startEditProduct = (p: Product) => {
    setEditingId(p.id)
    setForm({
      customer_id: String(p.customer_id),
      product_code: p.product_code || '',
      product_name: p.product_name || '',
      type: (p.type || PRODUCT_TYPES[0]).toUpperCase(),
      type_other: PRODUCT_TYPES.includes((p.type || '').toUpperCase()) ? '' : ((p.type || '').toUpperCase()),
      sewing_type: (p.sewing_type || SEWING_TYPES[0]).toUpperCase(),
      sewing_type_other: SEWING_TYPES.includes((p.sewing_type || '').toUpperCase()) ? '' : ((p.sewing_type || '').toUpperCase()),
      print: p.print || 'yes',
      swl: p.swl || '',
      spec_other: p.spec_other || '',
      spec_inner: p.spec_inner || '',
      color: p.color || '',
      liner: p.liner || '',
      top: p.top || '',
      bottom: p.bottom || '',
      packing: p.packing || '',
      other_note: p.other_note || '',
    })
    setError('')
    setShowForm(true)
  }

  const deleteProduct = async () => {
    if (!pendingDelete) return
    try {
      await api(`/api/products/${pendingDelete.id}`, 'DELETE', undefined, token)
      if (detailProductId === pendingDelete.id) {
        navigate('/products')
        setImages([])
        setSpecs([])
        setSelectedProduct(null)
      }
      await loadBase()
      notify(t('productDeleted'), 'success')
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

  const deleteSelectedProducts = async () => {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    try {
      const results = await Promise.allSettled(ids.map((id) => api(`/api/products/${id}`, 'DELETE', undefined, token)))
      const successCount = results.filter((r) => r.status === 'fulfilled').length
      if (successCount > 0) {
        notify(`${t('deleteSelected')}: ${successCount}/${ids.length}`, 'success')
      } else {
        notify(`${t('deleteSelected')}: 0/${ids.length}`, 'error')
      }
      setSelectedIds(new Set())
      setShowBulkDeleteConfirm(false)
      await loadBase()
    } catch (err) {
      notify((err as Error).message, 'error')
    }
  }

  const openBulkSpecForm = () => {
    setBulkSpecItems([])
    setBulkSpecRows([])
    setShowBulkSpecModal(true)
  }

  const renderLamiIcon = (value?: string | null) => {
    const normalized = (value || '').trim().toLowerCase()
    const isYes = normalized === 'yes' || normalized === 'y' || normalized === 'true' || normalized === '1'
    return isYes
      ? <CheckCircle2 size={16} className="status-icon yes" />
      : <XCircle size={16} className="status-icon no" />
  }
  const formatDiameter = (value?: string | null) => {
    const raw = (value || '').trim()
    if (!raw) return '-'
    const cleaned = raw.replace(/^(?:phi|ø|Ø)\s*/i, '').trim()
    return cleaned ? `Ø${cleaned}` : '-'
  }

  const resolveItemColor = (itemId: number) => {
    const itemColor = (itemById.get(itemId)?.item_color || '').trim()
    if (itemColor) return itemColor
    const productColor = (selectedProduct?.color || '').trim()
    if (productColor) return productColor
    return '-'
  }

  const onBulkItemsChange = (opts: readonly Option[]) => {
    const selectedOpts = [...opts]
    setBulkSpecItems(selectedOpts)
    const prevMap = new Map(bulkSpecRows.map((r) => [r.item_id, r]))
    setBulkSpecRows(
      selectedOpts.map((opt, idx) => {
        const existing = prevMap.get(opt.value)
        if (existing) return existing
        return {
          key: Date.now() + idx,
          item_id: opt.value,
          item_name: opt.label,
          lami: '-',
          spec: '',
          item_color: resolveItemColor(opt.value),
          pcs_ea: '-',
          unit_weight_kg: '-',
          qty_m_or_m2: '-',
          wt_kg: '-',
        }
      }),
    )
  }

  const computeUnitWeightByMaterialGroup = (mg: MaterialGroup | undefined, specValue: string) => {
    if (!mg) return '-'
    const applyLamiCalc = (base: number) => {
      if (!mg.use_lami_for_calc) return base
      if (mg.lami_calc_value == null || Number.isNaN(Number(mg.lami_calc_value))) return Number.NaN
      return base + Number(mg.lami_calc_value)
    }
    if ((mg.unit_weight_mode || 'fixed') === 'fixed') {
      if (mg.unit_weight_value == null || Number.isNaN(Number(mg.unit_weight_value))) return '-'
      const result = applyLamiCalc(Number(mg.unit_weight_value))
      return Number.isNaN(result) ? '-' : String(result)
    }
    if ((mg.unit_weight_mode || '').toLowerCase() === 'choice') {
      if (mg.unit_weight_value == null || Number.isNaN(Number(mg.unit_weight_value))) return '-'
      const result = applyLamiCalc(Number(mg.unit_weight_value))
      return Number.isNaN(result) ? '-' : String(result)
    }
    const expr = (mg.unit_weight_formula || mg.unit_weight_formula_code || '').trim()
    if (!expr || !FORMULA_ALLOWED_REGEX.test(expr) || !SPEC_ABC_REGEX.test(specValue || '')) return '-'
    const parts = (specValue || '').split('*').map((p) => p.trim())
    if (parts.length !== 3) return '-'
    const aMatch = (parts[0] || '').match(A_NUMBER_REGEX)
    const a = aMatch ? Number(aMatch[0]) : Number.NaN
    const b = Number(parts[1])
    const c = Number(parts[2])
    if (Number.isNaN(b) || Number.isNaN(c)) return '-'
    const replaced = expr
      .replace(/\bB\b/gi, `(${String(b)})`)
      .replace(/\bC\b/gi, `(${String(c)})`)
      .replace(/\bA\b/gi, Number.isNaN(a) ? 'NaN' : `(${String(a)})`)
    try {
      // eslint-disable-next-line no-new-func
      const rawResult = Function(`"use strict"; return (${replaced});`)()
      if (typeof rawResult !== 'number' || Number.isNaN(rawResult) || !Number.isFinite(rawResult)) return '-'
      const result = applyLamiCalc(rawResult)
      if (Number.isNaN(result) || !Number.isFinite(result)) return '-'
      return String(result)
    } catch {
      return '-'
    }
  }

  const onBulkRowMaterialGroupChange = (rowKey: number, value: string) => {
    const mgId = value ? Number(value) : undefined
    const mg = mgId ? materialGroupById.get(mgId) : undefined
    setBulkSpecRows((prev) =>
      prev.map((row) => {
        if (row.key !== rowKey) return row
        return {
          ...row,
          material_group_id: mg?.id,
          material_group: mg?.material_group_name,
          lami: mg?.has_lami ? 'Yes' : '-',
          spec: mg?.spec_label || row.spec || '',
          item_color: resolveItemColor(row.item_id),
          pcs_ea: mg?.pcs_ea_label || '-',
          unit_weight_kg: computeUnitWeightByMaterialGroup(mg, mg?.spec_label || row.spec || ''),
          qty_m_or_m2: '-',
          wt_kg: '-',
        }
      }),
    )
  }

  const onBulkRowSpecChange = (rowKey: number, value: string) => {
    setBulkSpecRows((prev) =>
      prev.map((row) => {
        if (row.key !== rowKey) return row
        const mg = row.material_group_id ? materialGroupById.get(row.material_group_id) : undefined
        return {
          ...row,
          spec: value,
          unit_weight_kg: computeUnitWeightByMaterialGroup(mg, value),
        }
      }),
    )
  }

  const saveBulkSpecs = async () => {
    if (!detailProductId) return
    if (bulkSpecRows.length === 0) {
      notify('Vui lòng chọn item để tạo Product Specs', 'error')
      return
    }
    const invalidRow = bulkSpecRows.find((r) => !r.material_group_id)
    if (invalidRow) {
      notify(`Vui lòng chọn Material Group cho item ${invalidRow.item_name}`, 'error')
      return
    }
    try {
      const maxLineNo = specs.reduce((max, s) => Math.max(max, s.line_no || 0), 0)
      await Promise.all(
        bulkSpecRows.map((row, idx) => {
          const resolvedColor = resolveItemColor(row.item_id)
          return api(`/api/products/${detailProductId}/specs`, 'POST', {
            item_id: row.item_id,
            material_group_id: row.material_group_id,
            line_no: maxLineNo + idx + 1,
            lami: row.lami !== '-' ? row.lami : null,
            spec: row.spec || null,
            item_color: resolvedColor !== '-' ? resolvedColor : null,
            pcs_ea: row.pcs_ea !== '-' && row.pcs_ea !== '' && !Number.isNaN(Number(row.pcs_ea)) ? Number(row.pcs_ea) : null,
            unit_weight_kg: row.unit_weight_kg !== '-' && row.unit_weight_kg !== '' && !Number.isNaN(Number(row.unit_weight_kg)) ? Number(row.unit_weight_kg) : null,
            qty_m_or_m2: null,
            wt_kg: null,
          }, token)
        }),
      )
      await loadSpecs(detailProductId)
      setShowBulkSpecModal(false)
      setBulkSpecItems([])
      setBulkSpecRows([])
      notify(t('productSpecAdded'), 'success')
    } catch (err) {
      notify((err as Error).message, 'error')
    }
  }

  const toggleSelectSpecRow = (id: number, checked: boolean) => {
    setSelectedSpecIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const deleteSelectedSpecs = async () => {
    if (!detailProductId) return
    const ids = [...selectedSpecIds]
    if (ids.length === 0) return
    try {
      const results = await Promise.allSettled(ids.map((id) => api(`/api/product-specs/${id}`, 'DELETE', undefined, token)))
      const successCount = results.filter((r) => r.status === 'fulfilled').length
      if (successCount > 0) {
        notify(`${t('deleteSelected')}: ${successCount}/${ids.length}`, 'success')
      } else {
        notify(`${t('deleteSelected')}: 0/${ids.length}`, 'error')
      }
      setSelectedSpecIds(new Set())
      setShowBulkSpecDeleteConfirm(false)
      await loadSpecs(detailProductId)
    } catch (err) {
      notify((err as Error).message, 'error')
    }
  }

  const uploadImages = async (picked: FileList | File[] | null) => {
    if (!detailProductId || !picked || picked.length === 0) return
    const fd = new FormData()
    for (const f of Array.from(picked)) {
      fd.append('images', f)
    }
    try {
      await api(`/api/products/${detailProductId}/print-versions/upload`, 'POST', fd, token)
      await loadVersions(detailProductId)
      notify(t('imageUploaded'), 'success')
    } catch (err) {
      notify((err as Error).message, 'error')
    }
  }

  const openDetail = (product: Product) => {
    navigate(`/products/${product.id}`)
  }

  const onPrintImageInput = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files
    e.currentTarget.value = ''
    if (picked && picked.length > 0) {
      void uploadImages(picked)
    }
  }

  const onPrintDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      void uploadImages(e.dataTransfer.files)
      e.dataTransfer.clearData()
    }
  }

  if (isDetailPage) {
    const specPageIds = specs.map((s) => s.id)
    const allSpecsSelected = specPageIds.length > 0 && specPageIds.every((id) => selectedSpecIds.has(id))
    const toggleSelectAllSpecs = (checked: boolean) => {
      setSelectedSpecIds((prev) => {
        const next = new Set(prev)
        specPageIds.forEach((id) => {
          if (checked) next.add(id)
          else next.delete(id)
        })
        return next
      })
    }
    return (
      <div className="page-content">
        <div className="row toolbar-row">
          <strong>{selectedProduct ? `${t('productDetail')}: ${selectedProduct.product_code}` : t('productDetail')}</strong>
          <button type="button" className="toolbar-add-btn" onClick={() => navigate('/products')}>{t('close')}</button>
        </div>

        {selectedProduct ? (
          <div className="grid-2 product-detail-info-grid">
            <div className="form-field"><label>{t('lblProductCode')}</label><div className="readonly-value">{selectedProduct.product_code || '-'}</div></div>
            <div className="form-field"><label>{t('lblProductName')}</label><div className="readonly-value">{selectedProduct.product_name || '-'}</div></div>
            <div className="form-field"><label>{t('lblCustomer')}</label><div className="readonly-value">{customerNameById.get(selectedProduct.customer_id) || String(selectedProduct.customer_id)}</div></div>
            <div className="form-field"><label>{t('lblType')}</label><div className="readonly-value">{selectedProduct.type || '-'}</div></div>
            <div className="form-field"><label>{t('lblSewingType')}</label><div className="readonly-value">{selectedProduct.sewing_type || '-'}</div></div>
            <div className="form-field"><label>{t('lblPrint')}</label><div className="readonly-value">{selectedProduct.print ? t(selectedProduct.print === 'yes' ? 'yes' : 'no') : '-'}</div></div>
            <div className="form-field"><label>{t('lblSwl')}</label><div className="readonly-value">{selectedProduct.swl || '-'}</div></div>
            <div className="form-field"><label>{t('lblColor')}</label><div className="readonly-value">{selectedProduct.color || '-'}</div></div>
            <div className="form-field"><label>{t('lblLiner')}</label><div className="readonly-value">{selectedProduct.liner || '-'}</div></div>
            <div className="form-field"><label>{t('lblTop')}</label><div className="readonly-value">{formatDiameter(selectedProduct.top)}</div></div>
            <div className="form-field"><label>{t('lblBottom')}</label><div className="readonly-value">{formatDiameter(selectedProduct.bottom)}</div></div>
            <div className="form-field"><label>{t('lblPacking')}</label><div className="readonly-value">{selectedProduct.packing || '-'}</div></div>
            <div className="form-field"><label>{t('lblSpecOther')}</label><div className="readonly-value">{selectedProduct.spec_other || '-'}</div></div>
            <div className="form-field"><label>{t('lblSpecInner')}</label><div className="readonly-value">{selectedProduct.spec_inner || '-'}</div></div>
            <div className="form-field note-last"><label>{t('lblOtherNote')}</label><div className="readonly-value multiline">{selectedProduct.other_note || '-'}</div></div>
          </div>
        ) : <div className="small">{t('noData')}</div>}

        <div className="product-detail-layout">
          <div className="product-detail-specs">
            <div className="row toolbar-row">
              <button
                type="button"
                className="danger-light"
                disabled={selectedSpecIds.size === 0}
                onClick={() => setShowBulkSpecDeleteConfirm(true)}
              >
                {t('deleteSelected')}
              </button>
              <button type="button" className="primary-light toolbar-add-btn" onClick={() => openBulkSpecForm()}>
                <Plus size={15} /> {t('addProductSpec')}
              </button>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th><input type="checkbox" checked={allSpecsSelected} onChange={(e) => toggleSelectAllSpecs(e.target.checked)} /></th>
                    <th>{t('colItemName')}</th><th>{t('colMaterialGroup')}</th><th>{t('fldLami')}</th><th>{t('fldSpec')}</th><th>{t('fldItemColor')}</th><th>{t('fldPcsEa')}</th><th>{t('colUnitWeightKg')}</th><th>{t('colQtyMOrM2')}</th><th>{t('colWtKg')}</th>
                  </tr>
                </thead>
                <tbody>
                  {specs.length > 0 ? specs.map((s) => (
                    <tr key={s.id}><td><input type="checkbox" checked={selectedSpecIds.has(s.id)} onChange={(e) => toggleSelectSpecRow(s.id, e.target.checked)} /></td><td>{s.item_name}</td><td>{s.material_group || '-'}</td><td>{renderLamiIcon(s.lami)}</td><td>{s.spec || '-'}</td><td>{s.item_color || '-'}</td><td>{s.pcs_ea ?? '-'}</td><td>{s.unit_weight_kg ?? '-'}</td><td>{s.qty_m_or_m2 ?? '-'}</td><td>{s.wt_kg ?? '-'}</td></tr>
                  )) : <tr><td className="empty-cell" colSpan={10}>{t('noData')}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          <div className="product-detail-print">
            <div className="small" style={{ marginBottom: 8 }}><strong>{t('tabPrintImages')}</strong></div>
            <input ref={printImageUploadRef} type="file" multiple accept="image/*" style={{ display: 'none' }} onChange={onPrintImageInput} />
            {images.length > 0 ? (
              <div className="product-detail-print-gallery">
                {images.map((img) => <img key={img.id} src={img.image_url} alt={img.file_name} style={{ width: 86, height: 86, objectFit: 'cover', borderRadius: 8, border: '1px solid #cbd5e1' }} />)}
              </div>
            ) : (
              <div className="product-detail-upload-dropzone" onDragOver={(e) => e.preventDefault()} onDrop={onPrintDrop} onClick={() => printImageUploadRef.current?.click()}>
                <Upload size={18} />
                <span>{t('dropOrClickUpload')}</span>
              </div>
            )}
          </div>
        </div>

        <FormModal
          open={showBulkSpecModal && !!selectedProduct}
          title={`${t('addProductSpec')} - ${selectedProduct?.product_code || ''}`}
          onClose={() => setShowBulkSpecModal(false)}
          modalClassName="bulk-spec-modal"
        >
          <div className="form-field">
            <label>{t('colItemName')}</label>
            <Select
              classNamePrefix="select2"
              options={itemOptions}
              value={bulkSpecItems}
              onChange={(opts: readonly Option[] | null) => onBulkItemsChange(opts || [])}
              placeholder={t('phSelectItem')}
              isMulti
              isSearchable
              closeMenuOnSelect={false}
              hideSelectedOptions={false}
            />
          </div>
          <div className="table-wrap bulk-spec-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('colItemName')}</th><th>{t('colMaterialGroup')}</th><th>{t('fldLami')}</th><th>{t('fldSpec')}</th><th>{t('fldItemColor')}</th><th>{t('fldPcsEa')}</th><th>{t('colUnitWeightKg')}</th><th>{t('colQtyMOrM2')}</th><th>{t('colWtKg')}</th>
                </tr>
              </thead>
              <tbody>
                {bulkSpecRows.length > 0 ? bulkSpecRows.map((row) => (
                  <tr key={row.key}>
                    <td>{row.item_name}</td>
                    <td><select value={row.material_group_id || ''} onChange={(e) => onBulkRowMaterialGroupChange(row.key, e.target.value)}><option value="">--</option>{materialGroups.map((mg) => <option key={mg.id} value={mg.id}>{mg.material_group_name}</option>)}</select></td>
                    <td>{renderLamiIcon(row.lami)}</td>
                    <td><input value={row.spec} onChange={(e) => onBulkRowSpecChange(row.key, e.target.value)} /></td>
                    <td>{row.item_color || '-'}</td>
                    <td>{row.pcs_ea || '-'}</td>
                    <td>{row.unit_weight_kg}</td>
                    <td>{row.qty_m_or_m2}</td>
                    <td>{row.wt_kg}</td>
                  </tr>
                )) : <tr><td className="empty-cell" colSpan={9}>{t('noData')}</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="row form-actions">
            <button className="primary" type="button" onClick={() => void saveBulkSpecs()}>{t('save')}</button>
            <button type="button" onClick={() => setShowBulkSpecModal(false)}>{t('cancel')}</button>
          </div>
        </FormModal>
        <ConfirmModal
          open={showBulkSpecDeleteConfirm}
          title={t('confirmTitle')}
          message={`${t('confirmDeleteSelected')} (${selectedSpecIds.size})?`}
          confirmLabel={t('delete')}
          cancelLabel={t('cancel')}
          onConfirm={() => void deleteSelectedSpecs()}
          onCancel={() => setShowBulkSpecDeleteConfirm(false)}
        />
      </div>
    )
  }

  const totalPages = Math.max(1, Math.ceil(products.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * pageSize
  const pagedProducts = products.slice(start, start + pageSize)
  const pageIds = pagedProducts.map((r) => r.id)
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
        <input className="toolbar-search-input" placeholder={t('searchProduct')} value={search} onChange={(e) => setSearch(e.target.value)} />
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
          onClick={() => {
            setForm(productInit)
            setError('')
            setShowForm(true)
          }}
        >
          <Plus size={15} /> {t('addProduct')}
        </button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th><input type="checkbox" checked={allPageSelected} onChange={(e) => toggleSelectAllPage(e.target.checked)} /></th>
              <th>{t('colProductCode')}</th>
              <th>{t('colProductName')}</th>
              <th>{t('colCustomerName')}</th>
              <th>{t('colType')}</th>
              <th>{t('lblSewingType')}</th>
              <th>{t('lblPrint')}</th>
              <th>{t('lblSwl')}</th>
              <th>{t('lblSpecInner')}</th>
              <th>{t('lblSpecOther')}</th>
              <th>{t('lblColor')}</th>
              <th>{t('lblLiner')}</th>
              <th>{t('lblTop')}</th>
              <th>{t('lblBottom')}</th>
              <th>{t('lblPacking')}</th>
              <th>{t('lblOtherNote')}</th>
              <th>{t('colHasPrintAssets')}</th>
              <th>{t('colUpdatedAt')}</th>
              <th>{t('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {pagedProducts.length > 0 ? pagedProducts.map((p) => (
              <tr key={p.id}>
                <td><input type="checkbox" checked={selectedIds.has(p.id)} onChange={(e) => toggleSelectRow(p.id, e.target.checked)} /></td>
                <td>{p.product_code}</td>
                <td>{p.product_name}</td>
                <td>{customerNameById.get(p.customer_id) || p.customer_id}</td>
                <td>{p.type}</td>
                <td>{p.sewing_type || '-'}</td>
                <td>{p.print ? t(p.print === 'yes' ? 'yes' : 'no') : '-'}</td>
                <td>{p.swl || '-'}</td>
                <td>{p.spec_inner || '-'}</td>
                <td>{p.spec_other || '-'}</td>
                <td>{p.color || '-'}</td>
                <td>{p.liner || '-'}</td>
                <td>{formatDiameter(p.top)}</td>
                <td>{formatDiameter(p.bottom)}</td>
                <td>{p.packing ? `${p.packing} PCS` : '-'}</td>
                <td>{p.other_note || '-'}</td>
                <td>{p.has_print_assets ? 'Yes' : 'No'}</td>
                <td>{p.updated_at}</td>
                <td>
                  <div className="row action-row">
                    <button
                      type="button"
                      className="icon-btn"
                      title={t('detail')}
                      aria-label={t('detail')}
                      onClick={() => void openDetail(p)}
                    >
                      <Eye size={14} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      title={t('edit')}
                      aria-label={t('edit')}
                      onClick={() => startEditProduct(p)}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      className="danger-light icon-btn"
                      title={t('delete')}
                      aria-label={t('delete')}
                      onClick={() => setPendingDelete(p)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            )) : (
              <tr><td className="empty-cell" colSpan={19}>{t('noData')}</td></tr>
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
      <ConfirmModal
        open={!!pendingDelete}
        title={t('confirmTitle')}
        message={`${t('confirmDeleteProduct')} ${pendingDelete?.product_code ?? ''}?`}
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        onConfirm={() => void deleteProduct()}
        onCancel={() => setPendingDelete(null)}
      />
      <ConfirmModal
        open={showBulkDeleteConfirm}
        title={t('confirmTitle')}
        message={`${t('confirmDeleteSelected')} (${selectedIds.size})?`}
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        onConfirm={() => void deleteSelectedProducts()}
        onCancel={() => setShowBulkDeleteConfirm(false)}
      />
      <FormModal
        open={showForm}
        title={editingId ? t('edit') : t('addProduct')}
        onClose={() => { setShowForm(false); setForm(productInit); setEditingId(null); setError('') }}
      >
        <form onSubmit={saveProduct}>
          <div className="grid-2">
            <div className="form-field">
              <label>{t('lblCustomer')}</label>
              <Select
                classNamePrefix="select2"
                options={customerOptions}
                value={selectedCustomerOption}
                onChange={(opt: Option | null) => setForm({ ...form, customer_id: opt ? String(opt.value) : '' })}
                placeholder={t('phSelectCustomer')}
                isClearable
              />
            </div>
            <div className="form-field"><label>{t('lblProductCode')}</label><input placeholder={t('phProductCode')} value={form.product_code} onChange={(e) => setForm({ ...form, product_code: e.target.value })} required /></div>
            <div className="form-field"><label>{t('lblProductName')}</label><input placeholder={t('phProductName')} value={form.product_name} onChange={(e) => setForm({ ...form, product_name: e.target.value })} required /></div>
            <div className="form-field">
              <label>{t('lblType')}</label>
              <select
                value={typeMode}
                onChange={(e) => {
                  const next = e.target.value
                  if (next === 'OTHER') {
                    setForm({ ...form, type: form.type_other || '', type_other: form.type_other || '' })
                  } else {
                    setForm({ ...form, type: next, type_other: '' })
                  }
                }}
              >
                {PRODUCT_TYPES.map((tp) => <option key={tp} value={tp}>{tp}</option>)}
                <option value="OTHER">{t('other').toUpperCase()}</option>
              </select>
            </div>
            {typeMode === 'OTHER' ? (
              <div className="form-field">
                <label>{t('other').toUpperCase()}</label>
                <input value={form.type_other} onChange={(e) => setForm({ ...form, type_other: e.target.value.toUpperCase(), type: e.target.value.toUpperCase() })} />
              </div>
            ) : null}
            <div className="form-field">
              <label>{t('lblSewingType')}</label>
              <select
                value={sewingMode}
                onChange={(e) => {
                  const next = e.target.value
                  if (next === 'OTHER') {
                    setForm({ ...form, sewing_type: form.sewing_type_other || '', sewing_type_other: form.sewing_type_other || '' })
                  } else {
                    setForm({ ...form, sewing_type: next, sewing_type_other: '' })
                  }
                }}
              >
                {SEWING_TYPES.map((tp) => <option key={tp} value={tp}>{tp}</option>)}
                <option value="OTHER">{t('other').toUpperCase()}</option>
              </select>
            </div>
            {sewingMode === 'OTHER' ? (
              <div className="form-field">
                <label>{t('other').toUpperCase()}</label>
                <input value={form.sewing_type_other} onChange={(e) => setForm({ ...form, sewing_type_other: e.target.value.toUpperCase(), sewing_type: e.target.value.toUpperCase() })} />
              </div>
            ) : null}
            <div className="form-field">
              <label>{t('lblPrint')}</label>
              <select value={form.print} onChange={(e) => setForm({ ...form, print: e.target.value })}>
                <option value="yes">{t('yes')}</option>
                <option value="no">{t('no')}</option>
              </select>
            </div>
            <div className="form-field"><label>{t('lblSwl')}</label><input placeholder={t('phSwl')} value={form.swl} onChange={(e) => setForm({ ...form, swl: e.target.value })} /></div>
            <div className="form-field"><label>{t('lblColor')}</label><input placeholder={t('phColor')} value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} /></div>
            <div className="form-field"><label>{t('lblLiner')}</label><input placeholder={t('phLiner')} value={form.liner} onChange={(e) => setForm({ ...form, liner: e.target.value })} /></div>
            <div className="form-field">
              <label>{t('lblTop')}</label>
              <div className="input-adorn">
                <span>Ø</span>
                <input placeholder={t('phTop')} value={form.top} onChange={(e) => setForm({ ...form, top: e.target.value })} />
              </div>
            </div>
            <div className="form-field">
              <label>{t('lblBottom')}</label>
              <div className="input-adorn">
                <span>Ø</span>
                <input placeholder={t('phBottom')} value={form.bottom} onChange={(e) => setForm({ ...form, bottom: e.target.value })} />
              </div>
            </div>
            <div className="form-field">
              <label>{t('lblPacking')}</label>
              <div className="input-adorn">
                <input placeholder={t('phPacking')} value={form.packing} onChange={(e) => setForm({ ...form, packing: e.target.value })} />
                <span>PCS</span>
              </div>
            </div>
            <div className="form-field"><label>{t('lblSpecOther')}</label><input placeholder={t('phSpecOther')} value={form.spec_other} onChange={(e) => setForm({ ...form, spec_other: e.target.value })} /></div>
            <div className="form-field"><label>{t('lblSpecInner')}</label><input placeholder={t('phSpecInner')} value={form.spec_inner} onChange={(e) => setForm({ ...form, spec_inner: e.target.value })} /></div>
            <div className="form-field full-width"><label>{t('lblOtherNote')}</label><textarea placeholder={t('phOtherNote')} value={form.other_note} onChange={(e) => setForm({ ...form, other_note: e.target.value })} /></div>
          </div>
          {error ? <div className="error">{error}</div> : null}
          <div className="row form-actions">
            <button className="primary" type="submit">{t('save')}</button>
            <button type="button" onClick={() => { setShowForm(false); setForm(productInit); setEditingId(null); setError('') }}>{t('cancel')}</button>
          </div>
        </form>
      </FormModal>
    </div>
  )
}
