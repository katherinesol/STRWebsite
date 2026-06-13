'use client'
import { useState, useRef, useEffect } from 'react'
import { DayPicker, DateRange } from 'react-day-picker'
import { format, differenceInDays, isWithinInterval, isBefore, isAfter, isSameDay, startOfDay } from 'date-fns'
import 'react-day-picker/dist/style.css'

type Props = {
  blockedDates: { start: string; end: string }[]
  minStay: number
  onRangeChange: (checkIn: string, checkOut: string) => void
}

export default function DateRangePicker({ blockedDates, minStay, onRangeChange }: Props) {
  const [range, setRange] = useState<DateRange | undefined>()
  const [selecting, setSelecting] = useState<'checkin' | 'checkout'>('checkin')
  const [open, setOpen] = useState(false)
  const [minStayError, setMinStayError] = useState(false)
  const [months, setMonths] = useState(2)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMonths(window.innerWidth < 700 ? 1 : 2)
  }, [])

  // close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  const today = startOfDay(new Date())

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
      return (isSameDay(date, s) || isAfter(date, s)) && isBefore(date, e)
    })
  }

  function handleSelect(selected: DateRange | undefined) {
    if (!selected) return

    if (selecting === 'checkin' || !selected.from) {
      setRange({ from: selected.from, to: undefined })
      setSelecting('checkout')
      setMinStayError(false)
      if (selected.from) onRangeChange(format(selected.from, 'yyyy-MM-dd'), '')
      return
    }

    const { from, to } = selected
    if (!from || !to) return

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
    setOpen(false)
    onRangeChange(format(from, 'yyyy-MM-dd'), format(to, 'yyyy-MM-dd'))
  }

  function clear() {
    setRange(undefined)
    setSelecting('checkin')
    setMinStayError(false)
    setOpen(false)
    onRangeChange('', '')
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* date display — click to open */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          gap: '1px', cursor: 'pointer',
        }}
      >
        {[
          { label: 'Check in', value: range?.from ? format(range.from, 'MMM d, yyyy') : null, active: open && selecting === 'checkin' },
          { label: 'Check out', value: range?.to ? format(range.to, 'MMM d, yyyy') : null, active: open && selecting === 'checkout' },
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
              {value || 'Select date'}
            </div>
          </div>
        ))}
      </div>

      {/* hint / error */}
      <div style={{ fontSize: '11px', color: minStayError ? '#c0392b' : 'var(--muted)', padding: '6px 0', minHeight: '24px' }}>
        {minStayError
          ? `${minStay} night minimum — please select a later checkout date`
          : open
            ? selecting === 'checkin' ? 'Select your check-in date' : `Select check-out — ${minStay} night minimum`
            : range?.from && range?.to ? (
              <span>
                {differenceInDays(range.to, range.from)} nights ·{' '}
                <button onClick={clear} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 0, fontSize: '11px', textDecoration: 'underline' }}>
                  Clear
                </button>
              </span>
            ) : 'Select dates to see pricing'
        }
      </div>

      {/* popover calendar */}
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          background: 'white', border: '0.5px solid var(--sand)',
          zIndex: 50, boxShadow: '0 8px 32px rgba(0,0,0,.12)',
          overflowX: 'auto', overflowY: 'auto',
          maxHeight: 'min(420px, 60vh)',
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
            .rdp-root { padding: 12px; }
          `}</style>
          <DayPicker
            mode="range"
            selected={range}
            onSelect={handleSelect}
            disabled={disabledDays}
            numberOfMonths={months}
            pagedNavigation
            showOutsideDays={false}
          />
        </div>
      )}
    </div>
  )
}
