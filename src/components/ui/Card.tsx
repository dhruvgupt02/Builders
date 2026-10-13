import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'

type Tone = 'cream' | 'ink' | 'outline'

const TONES: Record<Tone, string> = {
  cream: 'bg-cream text-ink shadow-card',
  ink: 'bg-ink text-cream shadow-card',
  outline: 'border-[1.5px] border-line text-ink',
}

interface Props {
  children: ReactNode
  tone?: Tone
  /** Ticket-stub notches on both sides. `notchY` sets their vertical position (default 50%). */
  ticket?: boolean
  notchY?: string
  /** Makes the whole card a link with a hover lift. */
  to?: string
  padded?: boolean
  className?: string
}

export default function Card({ children, tone = 'cream', ticket, notchY, to, padded = true, className = '' }: Props) {
  const cls = `block rounded-card ${TONES[tone]} ${padded ? 'p-5 sm:p-6' : ''} ${ticket ? 'ticket' : ''} ${className}`
  const style = notchY ? ({ '--notch-y': notchY } as CSSProperties) : undefined
  if (to)
    return (
      <Link to={to} style={style} className={`${cls} transition-transform duration-200 hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue`}>
        {children}
      </Link>
    )
  return <div style={style} className={cls}>{children}</div>
}
