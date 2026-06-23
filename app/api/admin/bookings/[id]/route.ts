import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { isAuthed } from '@/lib/auth'


export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await request.json()
  const supabase = createAdminClient()

  // clean empty strings for numeric fields
  const numericFields = ['accommodation', 'cleaning_fee', 'hst', 'mat', 'total', 'deposit_amount', 'second_payment_amount', 'final_payment_amount', 'vehicle_count', 'guests', 'guests_adults', 'guests_children']
  const cleaned = { ...body }
  for (const key of numericFields) {
    if (cleaned[key] === '' || cleaned[key] === null) cleaned[key] = null
    else if (cleaned[key] !== undefined && cleaned[key] !== null) cleaned[key] = parseFloat(cleaned[key])
  }

  // clean empty date strings
  const dateFields = ['deposit_paid_at', 'second_paid_at', 'final_paid_at']
  for (const key of dateFields) {
    if (cleaned[key] === '') cleaned[key] = null
  }

  // update guests total
  if (cleaned.guests_adults != null || cleaned.guests_children != null) {
    cleaned.guests = (cleaned.guests_adults || 0) + (cleaned.guests_children || 0)
  }

  const { error } = await supabase.from('bookings').update(cleaned).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
