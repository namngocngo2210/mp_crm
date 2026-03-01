import { FormEvent, MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Select from 'react-select'
import { CheckCircle2, Eye, FileSpreadsheet, Pencil, Plus, Trash2, Upload, X, XCircle } from 'lucide-react'
import { api, API_BASE } from '../lib/api'
import { Customer, Item, MaterialGroup, PrintImage, Product, ProductSpec } from '../types'
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
  item_size: string
  item_color: string
  other_note: string
  pcs_ea: string
  unit_weight_kg: string
  qty_m_or_m2: string
  wt_kg: string
}
type SpecEditRow = {
  lami: string
  spec: string
  item_size: string
  item_color: string
  pcs_ea: string
  other_note: string
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
const SPEC_AB_REGEX = /^\s*[^*]+\s*\*\s*\d+(\.\d+)?\s*$/

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
  const [specEdits, setSpecEdits] = useState<Record<number, SpecEditRow>>({})
  const [showBulkSpecModal, setShowBulkSpecModal] = useState(false)
  const [bulkSpecItems, setBulkSpecItems] = useState<Option[]>([])
  const [bulkSpecRows, setBulkSpecRows] = useState<BulkSpecRow[]>([])
  const [selectedSpecIds, setSelectedSpecIds] = useState<Set<number>>(new Set())
  const [showBulkSpecDeleteConfirm, setShowBulkSpecDeleteConfirm] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [exportMode, setExportMode] = useState<'form_product' | 'form_specification'>('form_specification')
  const [selectedExportSpecIds, setSelectedExportSpecIds] = useState<Set<number>>(new Set())
  const [images, setImages] = useState<PrintImage[]>([])
  const [activeImage, setActiveImage] = useState<PrintImage | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Product | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const firstSearchRunRef = useRef(true)

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

  const loadReferenceData = async () => {
    const [cus, it, mg] = await Promise.all([
      api<Customer[]>('/api/customers', 'GET', undefined, token),
      api<Item[]>('/api/items', 'GET', undefined, token),
      api<MaterialGroup[]>('/api/material-groups', 'GET', undefined, token),
    ])
    setCustomers(cus)
    setItems(it)
    setMaterialGroups(mg)
  }

  const loadProductList = async () => {
    const prod = await api<Product[]>(`/api/products?search=${encodeURIComponent(search)}`, 'GET', undefined, token)
    setProducts(prod)
    setPage(1)
  }

  const loadBase = async () => {
    await Promise.all([loadReferenceData(), loadProductList()])
  }

  const loadSpecs = async (productId: number) => {
    const data = await api<ProductSpec[]>(`/api/products/${productId}/specs`, 'GET', undefined, token)
    setSpecs(data)
  }

  const loadPrintImages = async (productId: number) => {
    try {
      const data = await api<PrintImage[]>(`/api/products/${productId}/print-images`, 'GET', undefined, token)
      setImages(data)
      return
    } catch {
      const versions = await api<{ id: number; version_no: number }[]>(`/api/products/${productId}/print-versions`, 'GET', undefined, token)
      const imageRows: PrintImage[] = []
      for (const v of versions) {
        const detail = await api<{ images: PrintImage[] }>(`/api/print-versions/${v.id}`, 'GET', undefined, token)
        for (const img of detail.images || []) {
          imageRows.push({ ...img, version_no: v.version_no, product_id: productId })
        }
      }
      setImages(imageRows)
    }
  }

  const loadDetail = async (productId: number) => {
    const data = await api<Product>(`/api/products/${productId}`, 'GET', undefined, token)
    setSelectedProduct(data)
  }

  useEffect(() => {
    if (isDetailPage) {
      void loadReferenceData()
      return
    }
    void loadBase()
  }, [isDetailPage])

  useEffect(() => {
    if (firstSearchRunRef.current) {
      firstSearchRunRef.current = false
      return
    }
    if (isDetailPage) return
    const timer = window.setTimeout(() => {
      void loadProductList()
    }, 250)
    return () => window.clearTimeout(timer)
  }, [search, isDetailPage])

  useEffect(() => {
    const valid = new Set(products.map((r) => r.id))
    setSelectedIds((prev) => new Set([...prev].filter((id) => valid.has(id))))
  }, [products])

  useEffect(() => {
    if (!detailProductId) return
    void loadReferenceData()
    void loadDetail(detailProductId)
    void loadSpecs(detailProductId)
    void loadPrintImages(detailProductId)
  }, [detailProductId])

  useEffect(() => {
    const valid = new Set(specs.map((s) => s.id))
    setSelectedSpecIds((prev) => new Set([...prev].filter((id) => valid.has(id))))
    setSpecEdits((prev) => {
      const next: Record<number, SpecEditRow> = {}
      specs.forEach((s) => {
        next[s.id] = prev[s.id] || {
          lami: s.lami || '-',
          spec: s.spec || '',
          item_size: s.item_size || '',
          item_color: s.item_color || '',
          pcs_ea: s.pcs_ea != null ? String(s.pcs_ea) : '',
          other_note: s.other_note || '',
        }
      })
      return next
    })
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
      if (detailProductId) {
        await loadDetail(detailProductId)
        await loadSpecs(detailProductId)
      }
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
        const initialSpec = (selectedProduct?.spec_inner || '').trim()
        const initialItemSize = computeItemSizeByItem(itemById.get(opt.value), initialSpec)
        return {
          key: Date.now() + idx,
          item_id: opt.value,
          item_name: opt.label,
          lami: '-',
          spec: '',
          item_size: initialItemSize,
          item_color: resolveItemColor(opt.value),
          other_note: '',
          pcs_ea: '1',
          unit_weight_kg: '-',
          qty_m_or_m2: computeQtyFromItemSize(initialItemSize),
          wt_kg: computeWtTextFromValues(computeQtyFromItemSize(initialItemSize), '-', '-'),
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

  const splitTopLevelStar = (expr: string) => {
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

  const resolveItemSizeSourceValue = (itemRow: Item | undefined, fallbackSpec: string) => {
    const source = (itemRow?.item_size_source_field || 'spec_inner').toLowerCase()
    if (source === 'spec_inner') return (selectedProduct?.spec_inner || fallbackSpec || '').trim()
    if (source === 'top') return (selectedProduct?.top || '').trim()
    if (source === 'bottom') return (selectedProduct?.bottom || '').trim()
    if (source === 'liner') return (selectedProduct?.liner || '').trim()
    return (selectedProduct?.spec_inner || fallbackSpec || '').trim()
  }

  const computeItemSizeByItem = (itemRow: Item | undefined, fallbackSpec: string) => {
    if (!itemRow) return '-'
    const mode = (itemRow.item_size_mode || 'fixed').toLowerCase()
    if (mode === 'fixed') {
      if ((itemRow.item_size_fixed_type || 'number') === 'ab') {
        return itemRow.item_size_value_text || '-'
      }
      if (itemRow.item_size_value == null || Number.isNaN(Number(itemRow.item_size_value))) return '-'
      return String(itemRow.item_size_value)
    }
    const sourceValue = resolveItemSizeSourceValue(itemRow, fallbackSpec)
    const formula = (itemRow.item_size_formula || itemRow.item_size_formula_code || '').trim()
    if ((itemRow.item_size_source_field || '').toLowerCase() === 'liner' && !formula) {
      return sourceValue || '-'
    }
    if (!formula || !FORMULA_ALLOWED_REGEX.test(formula)) return '-'
    const pair = splitTopLevelStar(formula)
    if (!pair) return '-'
    const sourceIsAB = ['top', 'bottom'].includes((itemRow.item_size_source_field || '').toLowerCase())
    if (sourceIsAB && !SPEC_AB_REGEX.test(sourceValue || '')) return '-'
    if (!sourceIsAB && !SPEC_ABC_REGEX.test(sourceValue || '')) return '-'
    const parts = (sourceValue || '').split('*').map((p) => p.trim())
    const aMatch = (parts[0] || '').match(A_NUMBER_REGEX)
    const a = aMatch ? Number(aMatch[0]) : Number.NaN
    const b = parts.length >= 2 ? Number(parts[1]) : Number.NaN
    const c = parts.length >= 3 ? Number(parts[2]) : Number.NaN
    const replaceVars = (expr: string) => expr
      .replace(/\bA\b/gi, Number.isNaN(a) ? 'NaN' : `(${String(a)})`)
      .replace(/\bB\b/gi, Number.isNaN(b) ? 'NaN' : `(${String(b)})`)
      .replace(/\bC\b/gi, Number.isNaN(c) ? 'NaN' : `(${String(c)})`)
    try {
      // eslint-disable-next-line no-new-func
      const left = Function(`"use strict"; return (${replaceVars(pair.left)});`)()
      // eslint-disable-next-line no-new-func
      const right = Function(`"use strict"; return (${replaceVars(pair.right)});`)()
      if (typeof left !== 'number' || Number.isNaN(left) || !Number.isFinite(left)) return '-'
      if (typeof right !== 'number' || Number.isNaN(right) || !Number.isFinite(right)) return '-'
      return `${left}*${right}`
    } catch {
      return '-'
    }
  }

  const computeQtyFromItemSize = (itemSize: string) => {
    const text = (itemSize || '').trim()
    if (!text || text === '-') return '-'
    const parts = text.split('*').map((p) => p.trim())
    let out = 1
    for (const p of parts) {
      const m = p.match(A_NUMBER_REGEX)
      if (!m) return '-'
      const n = Number(m[0])
      if (Number.isNaN(n)) return '-'
      out *= n
    }
    if (parts.length === 2) {
      out /= 10000
    }
    return String(out)
  }

  const toFiniteNumber = (value: unknown): number | null => {
    if (value == null) return null
    const asNumber = typeof value === 'number' ? value : Number(String(value).replace(/,/g, '').trim())
    if (Number.isNaN(asNumber) || !Number.isFinite(asNumber)) return null
    return asNumber
  }

  const computeWtFromValues = (qty: unknown, pcs: unknown, unitWeight: unknown): number | null => {
    const qtyNum = toFiniteNumber(qty)
    const pcsNum = toFiniteNumber(pcs)
    const unitWeightNum = toFiniteNumber(unitWeight)
    if (qtyNum == null || pcsNum == null || unitWeightNum == null) return null
    return qtyNum * pcsNum * unitWeightNum
  }

  const computeWtTextFromValues = (qty: unknown, pcs: unknown, unitWeight: unknown): string => {
    const result = computeWtFromValues(qty, pcs, unitWeight)
    return result == null ? '-' : String(result)
  }

  const formatNumber2 = (value: number | null | undefined) => {
    if (value == null || Number.isNaN(value) || !Number.isFinite(value)) return '-'
    return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const onBulkRowMaterialGroupChange = (rowKey: number, value: string) => {
    const mgId = value ? Number(value) : undefined
    const mg = mgId ? materialGroupById.get(mgId) : undefined
    setBulkSpecRows((prev) =>
      prev.map((row) => {
        if (row.key !== rowKey) return row
        const nextSpec = mg?.spec_label || row.spec || (selectedProduct?.spec_inner || '')
        const nextItemSize = computeItemSizeByItem(itemById.get(row.item_id), nextSpec)
        const nextPcs = mg?.pcs_ea_label || '1'
        return {
          ...row,
          material_group_id: mg?.id,
          material_group: mg?.material_group_name,
          lami: mg?.has_lami ? 'Yes' : '-',
          spec: nextSpec,
          item_size: nextItemSize,
          item_color: resolveItemColor(row.item_id),
          pcs_ea: nextPcs,
          unit_weight_kg: computeUnitWeightByMaterialGroup(mg, nextSpec),
          qty_m_or_m2: computeQtyFromItemSize(nextItemSize),
          wt_kg: computeWtTextFromValues(
            computeQtyFromItemSize(nextItemSize),
            nextPcs,
            computeUnitWeightByMaterialGroup(mg, nextSpec),
          ),
        }
      }),
    )
  }

  const onBulkRowSpecChange = (rowKey: number, value: string) => {
    setBulkSpecRows((prev) =>
      prev.map((row) => {
        if (row.key !== rowKey) return row
        const mg = row.material_group_id ? materialGroupById.get(row.material_group_id) : undefined
        const nextSpec = value || (selectedProduct?.spec_inner || '')
        const nextItemSize = computeItemSizeByItem(itemById.get(row.item_id), nextSpec)
        return {
          ...row,
          spec: value,
          item_size: nextItemSize,
          unit_weight_kg: computeUnitWeightByMaterialGroup(mg, nextSpec),
          qty_m_or_m2: computeQtyFromItemSize(nextItemSize),
          wt_kg: computeWtTextFromValues(
            computeQtyFromItemSize(nextItemSize),
            row.pcs_ea,
            computeUnitWeightByMaterialGroup(mg, nextSpec),
          ),
        }
      }),
    )
  }

  const onBulkRowLamiChange = (rowKey: number, value: string) => {
    setBulkSpecRows((prev) => prev.map((row) => (row.key === rowKey ? { ...row, lami: value || '-' } : row)))
  }

  const onBulkRowItemColorChange = (rowKey: number, value: string) => {
    setBulkSpecRows((prev) => prev.map((row) => (row.key === rowKey ? { ...row, item_color: value } : row)))
  }

  const onBulkRowNoteChange = (rowKey: number, value: string) => {
    setBulkSpecRows((prev) => prev.map((row) => (row.key === rowKey ? { ...row, other_note: value } : row)))
  }

  const onBulkRowPcsEaChange = (rowKey: number, value: string) => {
    setBulkSpecRows((prev) =>
      prev.map((row) => {
        if (row.key !== rowKey) return row
        return {
          ...row,
          pcs_ea: value,
          wt_kg: computeWtTextFromValues(row.qty_m_or_m2, value, row.unit_weight_kg),
        }
      }),
    )
  }

  const onBulkRowItemSizeChange = (rowKey: number, value: string) => {
    setBulkSpecRows((prev) =>
      prev.map((row) => {
        if (row.key !== rowKey) return row
        return {
          ...row,
          item_size: value,
          qty_m_or_m2: computeQtyFromItemSize(value),
          wt_kg: computeWtTextFromValues(computeQtyFromItemSize(value), row.pcs_ea, row.unit_weight_kg),
        }
      }),
    )
  }

  useEffect(() => {
    if (!showBulkSpecModal || bulkSpecRows.length === 0) return
    setBulkSpecRows((prev) =>
      prev.map((row) => {
        const needsInit = !row.item_size || row.item_size === '-'
        if (!needsInit) return row
        const nextSpec = row.spec || (selectedProduct?.spec_inner || '')
        const nextItemSize = computeItemSizeByItem(itemById.get(row.item_id), nextSpec)
        return {
          ...row,
          item_size: nextItemSize,
          qty_m_or_m2: computeQtyFromItemSize(nextItemSize),
          wt_kg: computeWtTextFromValues(computeQtyFromItemSize(nextItemSize), row.pcs_ea, row.unit_weight_kg),
          item_color: row.item_color || resolveItemColor(row.item_id),
          other_note: row.other_note || '',
        }
      }),
    )
  }, [showBulkSpecModal, bulkSpecRows.length, itemById, selectedProduct])

  const getSpecWt = (s: ProductSpec): number | null => {
    const direct = toFiniteNumber(s.wt_kg)
    if (direct != null) return direct
    return computeWtFromValues(s.qty_m_or_m2, s.pcs_ea, s.unit_weight_kg)
  }

  const totalSpecWt = specs.reduce((sum, s) => {
    const wt = getSpecWt(s)
    return sum + (wt ?? 0)
  }, 0)

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
      for (const row of bulkSpecRows) {
        const resolvedColor = resolveItemColor(row.item_id)
        await api(`/api/products/${detailProductId}/specs`, 'POST', {
          item_id: row.item_id,
          material_group_id: row.material_group_id,
          lami: row.lami !== '-' ? row.lami : null,
          spec: row.spec || null,
          item_color: resolvedColor !== '-' ? resolvedColor : null,
          other_note: row.other_note || null,
          pcs_ea: row.pcs_ea !== '-' && row.pcs_ea !== '' && !Number.isNaN(Number(row.pcs_ea)) ? Number(row.pcs_ea) : null,
          unit_weight_kg: row.unit_weight_kg !== '-' && row.unit_weight_kg !== '' && !Number.isNaN(Number(row.unit_weight_kg)) ? Number(row.unit_weight_kg) : null,
          qty_m_or_m2: null,
          item_size: row.item_size !== '-' ? row.item_size : null,
          wt_kg: null,
        }, token)
      }
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

  const updateSpecEditField = (specId: number, field: keyof SpecEditRow, value: string) => {
    setSpecEdits((prev) => ({
      ...prev,
      [specId]: {
        lami: prev[specId]?.lami ?? '-',
        spec: prev[specId]?.spec ?? '',
        item_size: prev[specId]?.item_size ?? '',
        item_color: prev[specId]?.item_color ?? '',
        pcs_ea: prev[specId]?.pcs_ea ?? '',
        other_note: prev[specId]?.other_note ?? '',
        [field]: value,
      },
    }))
  }

  const saveSpecInline = async (specRow: ProductSpec) => {
    const draft = specEdits[specRow.id]
    if (!draft) return
    const normalizedCurrent = {
      lami: specRow.lami || '-',
      spec: specRow.spec || '',
      item_size: specRow.item_size || '',
      item_color: specRow.item_color || '',
      pcs_ea: specRow.pcs_ea != null ? String(specRow.pcs_ea) : '',
      other_note: specRow.other_note || '',
    }
    if (
      draft.lami === normalizedCurrent.lami
      && draft.spec === normalizedCurrent.spec
      && draft.item_size === normalizedCurrent.item_size
      && draft.item_color === normalizedCurrent.item_color
      && draft.pcs_ea === normalizedCurrent.pcs_ea
      && draft.other_note === normalizedCurrent.other_note
    ) return

    try {
      await api(`/api/product-specs/${specRow.id}`, 'PUT', {
        lami: draft.lami !== '-' ? draft.lami : null,
        spec: draft.spec || null,
        item_size: draft.item_size || null,
        item_color: draft.item_color || null,
        pcs_ea: draft.pcs_ea !== '' && !Number.isNaN(Number(draft.pcs_ea)) ? Number(draft.pcs_ea) : null,
        other_note: draft.other_note || null,
      }, token)
      if (detailProductId) await loadSpecs(detailProductId)
    } catch (err) {
      notify((err as Error).message, 'error')
      if (detailProductId) await loadSpecs(detailProductId)
    }
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

  const openExportExcelModal = () => {
    setExportMode('form_specification')
    setSelectedExportSpecIds(new Set(specs.map((s) => s.id)))
    setShowExportModal(true)
  }

  const toggleExportSpec = (specId: number, checked: boolean) => {
    setSelectedExportSpecIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(specId)
      else next.delete(specId)
      return next
    })
  }

  const exportExcel = async () => {
    if (!detailProductId) return
    if (exportMode === 'form_product' && selectedExportSpecIds.size === 0) {
      notify(t('exportNeedSpec'), 'error')
      return
    }
    try {
      const res = await fetch(`${API_BASE}/api/products/${detailProductId}/export-excel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Token ${token}`,
        },
        body: JSON.stringify({
          mode: exportMode,
          spec_ids: exportMode === 'form_product' ? [...selectedExportSpecIds] : [],
        }),
      })
      if (!res.ok) {
        const txt = await res.text()
        let detail = txt
        try {
          const parsed = txt ? JSON.parse(txt) : {}
          detail = parsed.detail || txt
        } catch {}
        throw new Error(detail || `HTTP ${res.status}`)
      }
      const blob = await res.blob()
      const contentDisposition = res.headers.get('Content-Disposition') || ''
      const matched = /filename=\"?([^\";]+)\"?/i.exec(contentDisposition)
      const fileName = matched?.[1] || `${selectedProduct?.product_code || 'product'}_${exportMode}.xlsx`
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
      setShowExportModal(false)
      notify(t('exportSuccess'), 'success')
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
      await loadPrintImages(detailProductId)
      notify(t('imageUploaded'), 'success')
    } catch (err) {
      notify((err as Error).message, 'error')
    }
  }

  const deletePrintImage = async (image: PrintImage) => {
    if (!detailProductId) return
    try {
      await api(`/api/print-images/${image.id}`, 'DELETE', undefined, token)
      if (activeImage?.id === image.id) setActiveImage(null)
      await loadPrintImages(detailProductId)
      await loadBase()
      await loadDetail(detailProductId)
      notify(t('delete'), 'success')
    } catch (err) {
      notify((err as Error).message, 'error')
    }
  }

  const openDetail = (product: Product, newTab = false) => {
    const path = `/products/${product.id}`
    if (newTab) {
      window.open(path, '_blank', 'noopener')
      return
    }
    navigate(path)
  }

  const openPrintImagePicker = () => {
    const picker = document.createElement('input')
    picker.type = 'file'
    picker.accept = 'image/*'
    picker.multiple = true
    picker.onchange = () => {
      const picked = picker.files
      if (picked && picked.length > 0) {
        void uploadImages(picked)
      }
    }
    picker.click()
  }

  const productFormModal = (
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
  )

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
          <div className="row action-row toolbar-add-btn">
            {selectedProduct ? (
              <button type="button" className="primary-light" onClick={openExportExcelModal}>
                <FileSpreadsheet size={15} /> {t('exportExcel')}
              </button>
            ) : null}
            {selectedProduct ? (
              <button type="button" className="primary-light" onClick={() => startEditProduct(selectedProduct)}>
                <Pencil size={15} /> {t('edit')}
              </button>
            ) : null}
            <button type="button" onClick={() => navigate('/products')}>{t('close')}</button>
          </div>
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
                    <th>{t('colItemName')}</th><th>{t('colMaterialGroup')}</th><th className="col-lami">{t('fldLami')}</th><th className="col-spec">{t('fldSpec')}</th><th className="col-item-size">{t('fldItemSize')}</th><th className="col-item-color">{t('fldItemColor')}</th><th>{t('fldPcsEa')}</th><th>{t('colUnitWeightKg')}</th><th>{t('colQtyMOrM2')}</th><th>{t('colWtKg')}</th>
                  </tr>
                </thead>
                <tbody>
                  {specs.length > 0 ? specs.flatMap((s) => ([
                    <tr key={`${s.id}-main`}>
                        <td><input type="checkbox" checked={selectedSpecIds.has(s.id)} onChange={(e) => toggleSelectSpecRow(s.id, e.target.checked)} /></td>
                        <td>{s.item_name}</td>
                        <td>{s.material_group || '-'}</td>
                        <td className="spec-edit-lami">
                          <select
                            value={specEdits[s.id]?.lami ?? (s.lami || '-')}
                            onChange={(e) => updateSpecEditField(s.id, 'lami', e.target.value)}
                            onBlur={() => void saveSpecInline(s)}
                          >
                            <option value="-">-</option>
                            <option value="Yes">Yes</option>
                            <option value="No">No</option>
                          </select>
                        </td>
                        <td className="spec-edit-spec">
                          <input
                            value={specEdits[s.id]?.spec ?? (s.spec || '')}
                            onChange={(e) => updateSpecEditField(s.id, 'spec', e.target.value)}
                            onBlur={() => void saveSpecInline(s)}
                          />
                        </td>
                        <td className="spec-edit-size">
                          <input
                            value={specEdits[s.id]?.item_size ?? (s.item_size || '')}
                            onChange={(e) => updateSpecEditField(s.id, 'item_size', e.target.value)}
                            onBlur={() => void saveSpecInline(s)}
                            placeholder={t('fldItemSize')}
                          />
                        </td>
                        <td className="spec-edit-color">
                          <input
                            value={specEdits[s.id]?.item_color ?? (s.item_color || '')}
                            onChange={(e) => updateSpecEditField(s.id, 'item_color', e.target.value)}
                            onBlur={() => void saveSpecInline(s)}
                            placeholder={t('phColor')}
                          />
                        </td>
                        <td>
                          <input
                            value={specEdits[s.id]?.pcs_ea ?? (s.pcs_ea != null ? String(s.pcs_ea) : '')}
                            onChange={(e) => updateSpecEditField(s.id, 'pcs_ea', e.target.value)}
                            onBlur={() => void saveSpecInline(s)}
                            placeholder={t('fldPcsEa')}
                          />
                        </td>
                        <td>{formatNumber2(toFiniteNumber(s.unit_weight_kg))}</td>
                        <td>{formatNumber2(toFiniteNumber(s.qty_m_or_m2))}</td>
                        <td>{formatNumber2(getSpecWt(s))}</td>
                    </tr>,
                    <tr className="spec-note-row" key={`${s.id}-note`}>
                        <td colSpan={5}>
                          <div className="spec-note-wrap">
                            <span>{t('lblOtherNote')}:</span>
                            <input
                              value={specEdits[s.id]?.other_note ?? (s.other_note || '')}
                              onChange={(e) => updateSpecEditField(s.id, 'other_note', e.target.value)}
                              onBlur={() => void saveSpecInline(s)}
                              placeholder={t('lblOtherNote')}
                            />
                          </div>
                        </td>
                        <td colSpan={6} />
                    </tr>,
                  ])) : <tr><td className="empty-cell" colSpan={11}>{t('noData')}</td></tr>}
                  {specs.length > 0 ? (
                    <tr className="summary-row">
                      <td colSpan={10} className="summary-label">{t('totalWtKg')}</td>
                      <td className="summary-value">{formatNumber2(totalSpecWt)}</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div className="product-detail-print product-detail-print-below">
          <div className="row toolbar-row">
            <strong>{t('tabPrintImages')}</strong>
            <button type="button" className="primary-light" onClick={openPrintImagePicker}>
              <Upload size={15} /> Upload
            </button>
          </div>
          {images.length > 0 ? (
            <div className="product-detail-print-gallery-grid">
              {images.map((img) => (
                <div key={img.id} className="print-gallery-item">
                  <button
                    type="button"
                    className="print-gallery-delete-btn"
                    onClick={() => void deletePrintImage(img)}
                    title={t('delete')}
                    aria-label={t('delete')}
                  >
                    <Trash2 size={14} />
                  </button>
                  <button
                    type="button"
                    className="print-gallery-open-btn"
                    onClick={() => setActiveImage(img)}
                    title={t('detail')}
                    aria-label={t('detail')}
                  >
                    <img src={img.image_url} alt={img.file_name || `image-${img.id}`} className="print-gallery-thumb" />
                  </button>
                  <div className="print-gallery-meta">
                    <span>{`V${img.version_no ?? '-'}`}</span>
                    <span title={img.file_name || ''}>{img.file_name || '-'}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : <div className="small">{t('noData')}</div>}
        </div>
        {activeImage ? (
          <div className="image-lightbox-overlay" onClick={() => setActiveImage(null)}>
            <button
              type="button"
              className="image-lightbox-close"
              onClick={(e) => { e.stopPropagation(); setActiveImage(null) }}
              aria-label={t('close')}
              title={t('close')}
            >
              <X size={20} />
            </button>
            <img
              src={activeImage.image_url}
              alt={activeImage.file_name || `image-${activeImage.id}`}
              className="image-lightbox-content"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        ) : null}

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
                  <th>{t('colItemName')}</th><th>{t('colMaterialGroup')}</th><th>{t('fldLami')}</th><th>{t('fldSpec')}</th><th>{t('fldItemSize')}</th><th>{t('fldItemColor')}</th><th>{t('fldPcsEa')}</th><th>{t('colUnitWeightKg')}</th><th>{t('colQtyMOrM2')}</th><th>{t('colWtKg')}</th>
                </tr>
              </thead>
              <tbody>
                {bulkSpecRows.length > 0 ? bulkSpecRows.flatMap((row) => ([
                  <tr key={`${row.key}-main`}>
                      <td>{row.item_name}</td>
                      <td><select value={row.material_group_id || ''} onChange={(e) => onBulkRowMaterialGroupChange(row.key, e.target.value)}><option value="">--</option>{materialGroups.map((mg) => <option key={mg.id} value={mg.id}>{mg.material_group_name}</option>)}</select></td>
                      <td>
                        <select value={row.lami} onChange={(e) => onBulkRowLamiChange(row.key, e.target.value)}>
                          <option value="-">-</option>
                          <option value="Yes">Yes</option>
                          <option value="No">No</option>
                        </select>
                      </td>
                      <td><input value={row.spec} onChange={(e) => onBulkRowSpecChange(row.key, e.target.value)} /></td>
                      <td><input value={row.item_size} onChange={(e) => onBulkRowItemSizeChange(row.key, e.target.value)} placeholder={t('fldItemSize')} /></td>
                      <td><input value={row.item_color} onChange={(e) => onBulkRowItemColorChange(row.key, e.target.value)} placeholder={t('phColor')} /></td>
                      <td><input value={row.pcs_ea} onChange={(e) => onBulkRowPcsEaChange(row.key, e.target.value)} placeholder={t('fldPcsEa')} /></td>
                      <td>{formatNumber2(toFiniteNumber(row.unit_weight_kg))}</td>
                      <td>{formatNumber2(toFiniteNumber(row.qty_m_or_m2))}</td>
                      <td>{formatNumber2(toFiniteNumber(row.wt_kg))}</td>
                  </tr>,
                  <tr className="spec-note-row" key={`${row.key}-note`}>
                      <td colSpan={5}>
                        <div className="spec-note-wrap">
                          <span>{t('lblOtherNote')}:</span>
                          <input value={row.other_note} onChange={(e) => onBulkRowNoteChange(row.key, e.target.value)} placeholder={t('lblOtherNote')} />
                        </div>
                      </td>
                      <td colSpan={5} />
                  </tr>,
                ])) : <tr><td className="empty-cell" colSpan={10}>{t('noData')}</td></tr>}
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
        <FormModal
          open={showExportModal}
          title={t('exportExcel')}
          onClose={() => setShowExportModal(false)}
        >
          <div className="form-field">
            <label>{t('exportMode')}</label>
            <div className="row action-row">
              <label className="choice-radio-item">
                <input
                  type="radio"
                  name="export_mode"
                  checked={exportMode === 'form_product'}
                  onChange={() => setExportMode('form_product')}
                />
                <span>{t('exportFormProduct')}</span>
              </label>
              <label className="choice-radio-item">
                <input
                  type="radio"
                  name="export_mode"
                  checked={exportMode === 'form_specification'}
                  onChange={() => setExportMode('form_specification')}
                />
                <span>{t('exportFormSpecification')}</span>
              </label>
            </div>
          </div>
          {exportMode === 'form_product' ? (
            <div className="form-field">
              <label>{t('exportChooseSpecs')}</label>
              <div className="table-wrap" style={{ maxHeight: 260 }}>
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 40 }} />
                      <th>{t('colItemName')}</th>
                      <th>{t('fldSpec')}</th>
                      <th>{t('fldItemColor')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {specs.length > 0 ? specs.map((s) => (
                      <tr key={s.id}>
                        <td><input type="checkbox" checked={selectedExportSpecIds.has(s.id)} onChange={(e) => toggleExportSpec(s.id, e.target.checked)} /></td>
                        <td>{s.item_name}</td>
                        <td>{s.spec || '-'}</td>
                        <td>{s.item_color || '-'}</td>
                      </tr>
                    )) : <tr><td className="empty-cell" colSpan={4}>{t('noData')}</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
          <div className="row form-actions">
            <button className="primary" type="button" onClick={() => void exportExcel()}>{t('exportExcel')}</button>
            <button type="button" onClick={() => setShowExportModal(false)}>{t('cancel')}</button>
          </div>
        </FormModal>
        {productFormModal}
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
                      onAuxClick={(e: ReactMouseEvent<HTMLButtonElement>) => {
                        if (e.button !== 1) return
                        e.preventDefault()
                        void openDetail(p, true)
                      }}
                    >
                      <Eye size={14} />
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
      {productFormModal}
    </div>
  )
}
