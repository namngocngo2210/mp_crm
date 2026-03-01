import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { Customer, Product } from '../types'
import { I18nKey } from '../lib/i18n'

type Props = { token: string; notify: (message: string, type: 'success' | 'error') => void; t: (key: I18nKey) => string }

type Row = {
  customer_id: number
  customer_code: string
  customer_name: string
  product_count: number
}

export default function StatisticsPage({ token, notify, t }: Props) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [products, setProducts] = useState<Product[]>([])

  useEffect(() => {
    const load = async () => {
      try {
        const [cus, prod] = await Promise.all([
          api<Customer[]>('/api/customers', 'GET', undefined, token),
          api<Product[]>('/api/products', 'GET', undefined, token),
        ])
        setCustomers(cus)
        setProducts(prod)
      } catch (err) {
        notify((err as Error).message, 'error')
      }
    }
    void load()
  }, [token, notify])

  const rows = useMemo<Row[]>(() => {
    const customerMap = new Map(customers.map((c) => [c.id, c]))
    const countMap = new Map<number, number>()
    products.forEach((p) => {
      countMap.set(p.customer_id, (countMap.get(p.customer_id) || 0) + 1)
    })
    return [...countMap.entries()]
      .map(([customerId, productCount]) => {
        const customer = customerMap.get(customerId)
        return {
          customer_id: customerId,
          customer_code: customer?.customer_code || String(customerId),
          customer_name: customer?.customer_name || String(customerId),
          product_count: productCount,
        }
      })
      .sort((a, b) => b.product_count - a.product_count || a.customer_name.localeCompare(b.customer_name))
  }, [customers, products])

  const totalProducts = rows.reduce((sum, r) => sum + r.product_count, 0)

  return (
    <div className="page-content">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>{t('statsProductsByCustomer')}</strong>
        <span className="small">{t('total')}: {totalProducts}</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('colCustomerCode')}</th>
              <th>{t('colCustomerName')}</th>
              <th>{t('colProductCount')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? rows.map((r) => (
              <tr key={r.customer_id}>
                <td>{r.customer_code}</td>
                <td>{r.customer_name}</td>
                <td>{r.product_count}</td>
              </tr>
            )) : (
              <tr><td className="empty-cell" colSpan={3}>{t('noData')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

