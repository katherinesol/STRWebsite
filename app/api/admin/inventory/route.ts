import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { INVENTORY_CATEGORIES } from '@/lib/expense-categories'

export async function GET() {
  if (!await isAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createAdminClient()

  const { data } = await supabase
    .from('expenses')
    .select('id, vendor, date, property_id, category, receipt_path, line_items')
    .not('line_items', 'is', null)
    .in('category', INVENTORY_CATEGORIES)
    .order('date', { ascending: false })

  const items: any[] = []
  for (const e of data || []) {
    const li = Array.isArray(e.line_items) ? e.line_items : []
    for (const item of li) {
      if (!item?.name) continue
      items.push({
        name: item.name,
        amount: item.amount ?? null,
        qty: item.qty ?? 1,
        vendor: e.vendor,
        date: e.date,
        property_id: e.property_id,
        category: e.category,
        receipt_path: e.receipt_path,
        expense_id: e.id,
      })
    }
  }

  return NextResponse.json({ items })
}
