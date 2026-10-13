import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router-dom'

type Variant = 'primary' | 'dark' | 'light' | 'outline'
type Size = 'sm' | 'md' | 'lg'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  /** Render as a router link instead of a button. */
  to?: string
  /** Trailing icon shown in its own square, like the split buttons in the reference. */
  icon?: ReactNode
  full?: boolean
}

const FILL: Record<Variant, string> = {
  primary: 'bg-brand text-white group-hover:bg-brand-dark',
  dark: 'bg-ink text-cream group-hover:bg-bark',
  light: 'bg-cream text-ink group-hover:bg-white',
  outline: 'bg-transparent text-ink ring-[1.5px] ring-inset ring-ink group-hover:bg-ink group-hover:text-cream',
}
const PAD: Record<Size, string> = { sm: 'h-9 px-3.5 text-[11px]', md: 'h-11 px-5 text-xs', lg: 'h-14 px-7 text-sm' }
const SQUARE: Record<Size, string> = { sm: 'h-9 w-9', md: 'h-11 w-11', lg: 'h-14 w-14' }

export const ArrowIcon = () => (
  <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
    <path d="M4 12 12 4M5.5 4H12v6.5" />
  </svg>
)

export default function Button({ variant = 'primary', size = 'md', to, icon, full, className = '', children, ...rest }: Props) {
  const wrap = `group inline-flex items-stretch gap-0.5 select-none align-middle disabled:opacity-60 disabled:pointer-events-none
    focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue rounded-btn ${full ? 'w-full' : ''} ${className}`
  const seg = `inline-flex items-center justify-center rounded-btn transition-colors ${FILL[variant]}`
  const body = (
    <>
      <span className={`${seg} ${PAD[size]} display tracking-normal whitespace-nowrap ${full ? 'flex-1' : ''}`}>{children}</span>
      {icon && <span className={`${seg} ${SQUARE[size]} shrink-0`}>{icon}</span>}
    </>
  )
  if (to) return <Link to={to} className={wrap}>{body}</Link>
  return <button className={wrap} {...rest}>{body}</button>
}
