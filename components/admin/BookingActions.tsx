'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Booking = {
  id: string
  status: string
  payment_method: string
  deposit_paid_at: string | null
  second_paid_at: string | null
  final_paid_at: string | null
  security_deposit_status: string
  total: number
  deposit_amount: number
  second_payment_amount: number
  final_payment_amount: number
  plates_pending: boolean
}

function ActionButton({
  label, onClick, variant = 'default', disabled = false,
}: {
  label: string
  onClick: () => void
  variant?: 'default' | 'success' | 'danger' | 'warning'
  disabled?: boolean
}) {
  const colors = {
    default:  { bg: '#2A2A28', color: '#F0EDE6' },
    success:  { bg: '#0a1f0f', color: '#2ecc71' },
    danger:   { bg: '#1f0a0a', color: '#e74c3c' },
    warning:  { bg: '#2a1f0a', color: '#f39c12' },
  }
  const c = colors[variant]
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%', padding: '12px 16px', textAlign: 'left',
        background: disabled ? '#1A1A18' : c.bg,
        color: disabled ? '#333330' : c.color,
        border: '0.5px solid #2A2A28',
        fontFamily: 'var(--sans)', fontSize: '12px',
        letterSpacing: '.06em', cursor: disabled ? 'not-allowed' : 'pointer',
        marginBottom: '1px',
      }}
    >
      {label}
    </button>
  )
}

export default function BookingActions({ booking }: { booking: Booking }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [refundAmount, setRefundAmount] = useState('')
  const [showRefund, setShowRefund] = useState(false)
  const [note, setNote] = useState('')

  async function updateBooking(updates: Record<string, unknown>) {
    setLoading(true)
    try {
      await fetch(`/api/admin/bookings/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      router.refresh()
    } catch {}
    finally { setLoading(false) }
  }

  const isPending = booking.status === 'pending_payment'
  const isConfirmed = booking.status === 'confirmed'
  const isActive = booking.status === 'active'
  const isCancelled = booking.status === 'cancelled'

  return (
    <div style={{ background: '#1A1A18', border: '0.5px solid #2A2A28', padding: '24px' }}>
      <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '16px' }}>
        Actions
      </div>

      {/* mark payments received */}
      {!booking.deposit_paid_at && (
        <ActionButton
          label={`✓ Mark deposit received ($${booking.deposit_amount})`}
          variant="success"
          disabled={loading}
          onClick={() => updateBooking({ deposit_paid_at: new Date().toISOString(), status: 'confirmed' })}
        />
      )}
      {booking.deposit_paid_at && !booking.second_paid_at && (
        <ActionButton
          label={`✓ Mark 2nd payment received ($${booking.second_payment_amount})`}
          variant="success"
          disabled={loading}
          onClick={() => updateBooking({ second_paid_at: new Date().toISOString() })}
        />
      )}
      {booking.second_paid_at && !booking.final_paid_at && (
        <ActionButton
          label={`✓ Mark final payment received ($${booking.final_payment_amount})`}
          variant="success"
          disabled={loading}
          onClick={() => updateBooking({ final_paid_at: new Date().toISOString() })}
        />
      )}

      {/* status transitions */}
      {isConfirmed && (
        <ActionButton
          label="Mark as active (guest checked in)"
          variant="default"
          disabled={loading}
          onClick={() => updateBooking({ status: 'active' })}
        />
      )}
      {isActive && (
        <ActionButton
          label="Mark as completed (guest checked out)"
          variant="default"
          disabled={loading}
          onClick={() => updateBooking({ status: 'completed' })}
        />
      )}

      {/* security deposit */}
      {booking.security_deposit_status === 'held' && (
        <>
          <ActionButton
            label="Release security deposit"
            variant="success"
            disabled={loading}
            onClick={() => updateBooking({ security_deposit_status: 'released' })}
          />
          <ActionButton
            label="Claim security deposit"
            variant="warning"
            disabled={loading}
            onClick={() => updateBooking({ security_deposit_status: 'claimed' })}
          />
        </>
      )}

      {/* plates reminder */}
      {booking.plates_pending && (
        <ActionButton
          label="Send licence plate reminder email"
          variant="warning"
          disabled={loading}
          onClick={() => updateBooking({ _action: 'send_plate_reminder' })}
        />
      )}

      {/* refund */}
      {!isCancelled && (
        <>
          <ActionButton
            label="Issue refund →"
            variant="warning"
            disabled={loading}
            onClick={() => setShowRefund(r => !r)}
          />
          {showRefund && (
            <div style={{ padding: '12px', background: '#2A2A28', marginBottom: '1px' }}>
              <div style={{ fontSize: '11px', color: '#888880', marginBottom: '8px' }}>Refund amount</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="number"
                  value={refundAmount}
                  onChange={e => setRefundAmount(e.target.value)}
                  placeholder="0.00"
                  style={{ flex: 1, padding: '8px', background: '#1A1A18', border: '0.5px solid #3A3A38', color: '#F0EDE6', fontFamily: 'var(--sans)', fontSize: '13px', outline: 'none' }}
                />
                <button
                  onClick={() => updateBooking({ _action: 'refund', amount: parseFloat(refundAmount) })}
                  disabled={!refundAmount || loading}
                  style={{ padding: '8px 16px', background: 'var(--amber)', color: '#1A1A18', border: 'none', fontFamily: 'var(--sans)', fontSize: '11px', cursor: 'pointer', letterSpacing: '.06em' }}
                >
                  Issue
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* cancel */}
      {!isCancelled && (
        <>
          <ActionButton
            label="Cancel booking →"
            variant="danger"
            disabled={loading}
            onClick={() => setConfirmCancel(c => !c)}
          />
          {confirmCancel && (
            <div style={{ padding: '12px', background: '#1f0a0a', border: '0.5px solid #3a1a1a', marginBottom: '1px' }}>
              <div style={{ fontSize: '12px', color: '#e74c3c', marginBottom: '10px' }}>
                This will cancel the booking and notify the guest.
              </div>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Cancellation reason (sent to guest)"
                rows={2}
                style={{ width: '100%', padding: '8px', background: '#1A1A18', border: '0.5px solid #3A3A38', color: '#F0EDE6', fontFamily: 'var(--sans)', fontSize: '12px', outline: 'none', resize: 'none', boxSizing: 'border-box', marginBottom: '8px' }}
              />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setConfirmCancel(false)}
                  style={{ flex: 1, padding: '8px', background: '#2A2A28', color: '#888880', border: 'none', fontFamily: 'var(--sans)', fontSize: '11px', cursor: 'pointer' }}
                >
                  Keep booking
                </button>
                <button
                  onClick={() => updateBooking({ status: 'cancelled', cancellation_reason: note, cancelled_at: new Date().toISOString() })}
                  disabled={loading}
                  style={{ flex: 1, padding: '8px', background: '#e74c3c', color: '#fff', border: 'none', fontFamily: 'var(--sans)', fontSize: '11px', cursor: 'pointer' }}
                >
                  Confirm cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <div style={{ fontSize: '11px', color: '#333330', marginTop: '16px', lineHeight: 1.5 }}>
        Booking ID: {booking.id.slice(0, 8)}...
      </div>
    </div>
  )
}
