'use client'
import { useState } from 'react'
import { DayPicker, DateRange } from 'react-day-picker'
import { format, differenceInDays, isWithinInterval, isBefore, startOfDay } from 'date-fns'
import 'react-day-picker/dist/style.css'

type Props = {
  blockedDates: { start: string; end: string }[]
  minStay: number
  onRangeChange: (checkIn: string, checkOut: string) => void
}

export default function DateRangePicker({ blockedDates, minStay, onRangeChange }: Props) {
  const [range, setRange] = useState<DateRange | undefined>()
  const [selecting, setSelecting] = useState<'checkin' | 'checkout'>('checkin')
  const [minStayError, setMinStayError] = useState(false)

  const today = startOfDay(new Date())

  // convert blocked ranges to individual disabled dates
  const disabledDays = [
    { before: today },
    ...blockedDates.map(({ start, end }) => ({
      from: new Date(start + 'T00:00:00'),
      to: new Date(end + 'T00:00:00'),
    })),
  ]

  function isBlocked(date: Date): boolean {
    return blockedDates.some(({ start, end }) => {
      const s = new Date(start + 'T00:00:00')
      const e = new Date(end + 'T00:00:00')
      return isWithinInterval(date, { start: s, end: e }) || date >= s && date < e
    })
  }

  function handleSelect(selected: DateRange | undefined) {
    if (!selected) return

    if (selecting === 'checkin' || !selected.from) {
      setRange({ from: selected.from, to: undefined })
      setSelecting('checkout')
      if (selected.from) onRangeChange(format(selected.from, 'yyyy-MM-dd'), '')
      return
    }

    const { from, to } = selected
    if (!from || !to) return

    // check no blocked dates in range
    const nights = differenceInDays(to, from)
    let hasBlocked = false
    for (let i = 0; i <= nights; i++) {
      const d = new Date(from)
      d.setDate(d.getDate() + i)
      if (isBlocked(d)) { hasBlocked = true; break }
    }

    if (hasBlocked) {
      setRange({ from: to, to: undefined })
      setSelecting('checkout')
      setMinStayError(false)
      onRangeChange(format(to, 'yyyy-MM-dd'), '')
      return
    }
    if (nights < minStay) {
      setMinStayError(true)
      setRange({ from, to: undefined })
      setSelecting('checkout')
      onRangeChange(format(from, 'yyyy-MM-dd'), '')
      return
    }
    setMinStayError(false)

    setRange({ from, to })
    setSelecting('checkin')
    onRangeChange(format(from, 'yyyy-MM-dd'), format(to, 'yyyy-MM-dd'))
  }

  return (
    <div>
      {/* check-in / check-out display */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px', marginBottom: '1px' }}>
        {[
          { label: 'Check in', value: range?.from ? format(range.from, 'MMM d, yyyy') : null, active: selecting === 'checkin' },
          { label: 'Check out', value: range?.to ? format(range.to, 'MMM d, yyyy') : null, active: selecting === 'checkout' },
        ].map(({ label, value, active }) => (
          <div key={label} style={{
            background: active ? '#fff' : 'var(--linen)',
            padding: '12px 14px',
            border: `0.5px solid ${active ? 'var(--noir)' : 'var(--sand)'}`,
          }}>
            <div style={{ fontSize: '9px', fontWeight: 500, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '5px' }}>
              {label}
            </div>
            <div style={{ fontSize: '13px', color: value ? 'var(--noir)' : 'var(--muted)' }}>
              {value || (active ? 'Select date' : '—')}
            </div>
          </div>
        ))}
      </div>

      {/* calendar */}
      <div style={{
        background: 'white',
        border: '0.5px solid var(--sand)',
        padding: '8px',
      }}>
        <style>{`
          .rdp { --rdp-accent-color: #1A1A18; --rdp-background-color: #F0EDE6; margin: 0; font-family: var(--sans); }
          .rdp-day_selected { background: #1A1A18 !important; color: #FAFAF8 !important; border-radius: 2px !important; }
          .rdp-day_range_middle { background: #F0EDE6 !important; color: #1A1A18 !important; border-radius: 0 !important; }
          .rdp-day_range_start, .rdp-day_range_end { background: #1A1A18 !important; color: #FAFAF8 !important; border-radius: 2px !important; }
          .rdp-day_disabled { color: #D4CFC5 !important; text-decoration: line-through; cursor: not-allowed !important; }
          .rdp-day:hover:not(.rdp-day_disabled) { background: #E8E4DC !important; border-radius: 2px !important; }
          .rdp-caption_label { font-family: 'Cormorant Garamond', serif; font-size: 16px; font-weight: 300; }
          .rdp-head_cell { font-size: 10px; letter-spacing: .08em; color: #888880; font-weight: 500; }
          .rdp-nav_button { color: #1A1A18; }
        `}</style>
        <DayPicker
          mode="range"
          selected={range}
          onSelect={handleSelect}
          disabled={disabledDays}
          numberOfMonths={2}
          pagedNavigation
          showOutsideDays={false}
        />
      </div>

      {/* hint */}
      <div style={{ fontSize: '11px', color: 'var(--muted)', padding: '8px 0', letterSpacing: '.04em' }}>
        {minStayError
        ? <span style={{ color: 'var(--fail, #c0392b)', fontWeight: 500 }}>This property requires a minimum {minStay}-night stay — please select a later checkout date.</span>
        : selecting === 'checkin' ? 'Select your check-in date' : `Select check-out — ${minStay} night minimum`}
      </div>

      {/* reset */}
      {range?.from && (
        <button
          onClick={() => { setRange(undefined); setSelecting('checkin'); setMinStayError(false); onRangeChange('', '') }}
          style={{ fontSize: '11px', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, letterSpacing: '.06em', textDecoration: 'underline' }}
        >
          Clear dates
        </button>
      )}
    </div>
  )
}
