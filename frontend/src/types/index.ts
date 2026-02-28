export type Customer = {
  id: number
  customer_code: string
  customer_name: string
  address?: string
  contact_person?: string
  phone?: string
  email?: string
  level?: string
  production_2025?: number
  production_2026?: number
  in_production?: number
  updated_at?: string
}

export type Product = {
  id: number
  customer_id: number
  product_code: string
  product_name: string
  type?: string
  sewing_type?: string
  print?: string
  swl?: string
  spec_other?: string
  spec_inner?: string
  color?: string
  liner?: string
  top?: string
  bottom?: string
  packing?: string
  other_note?: string
  has_print_assets: boolean
  updated_at?: string
}

export type ProductionPlan = {
  id: number
  customer_id: number
  product_id: number
  lot_no: string
  etd?: string
  eta?: string
  contp_date?: string
  order_qty_pcs: number
  status: string
  update_person?: string
  updated_at?: string
}

export type ProductSpec = {
  id: number
  line_no: number
  item_name: string
  material_group?: string
  spec?: string
  item_size?: string
  lami?: string
  item_color?: string
  unit_weight_kg?: number
  qty_m_or_m2?: number
  pcs_ea?: number
  wt_kg?: number
  other_note?: string
}

export type PrintVersion = {
  id: number
  version_no: number
  created_at?: string
  created_by?: string
  image_count?: number
}

export type PrintImage = {
  id: number
  image_url: string
  file_name?: string
  sort_order: number
}

export type MaterialGroup = {
  id: number
  material_group_name: string
  spec_label?: string
  has_lami?: boolean
  use_lami_for_calc?: boolean
  lami_calc_value?: number
  pcs_ea_label?: string
  unit_weight_mode?: 'fixed' | 'formula' | 'choice'
  unit_weight_value?: number
  unit_weight_formula_code?: string
  unit_weight_formula?: string
  unit_weight_option_id?: number
  unit_weight_option_label?: string
  unit_weight_option_group?: string
  unit_weight_computed?: number
  unit_weight_note?: string
}

export type UnitWeightOption = {
  id: number
  option_group: string
  option_label: string
  unit_weight_value: number
  updated_at?: string
}

export type Item = {
  id: number
  item_name: string
  item_color?: string
  updated_at?: string
}

export type AppUser = {
  id: number
  username: string
  full_name?: string
  avatar_url?: string
  role: 'admin' | 'manager' | 'staff'
  is_active?: boolean
  created_at?: string
  updated_at?: string
}
