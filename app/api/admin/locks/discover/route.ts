import { NextResponse } from 'next/server'
import { hasRole } from '@/lib/auth'
import { Seam } from 'seam'

export async function GET() {
  if (!await hasRole('owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const apiKey = process.env.SEAM_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'SEAM_API_KEY not set' }, { status: 500 })
  const seam = new Seam({ apiKey })
  try {
    const devices = await seam.devices.list()
    const locks = devices.map((d: any) => ({
      device_id: d.device_id,
      name: d.properties?.name || d.properties?.schlage_metadata?.device_name || 'Unnamed',
      manufacturer: d.properties?.manufacturer,
      online: d.properties?.online,
      battery: d.properties?.battery_level,
      code_length: d.properties?.schlage_metadata?.access_code_length,
      capabilities: d.capabilities_supported,
    }))
    return NextResponse.json({ count: locks.length, locks })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Seam call failed' }, { status: 500 })
  }
}
