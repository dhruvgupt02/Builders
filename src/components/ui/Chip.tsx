import type { ReactNode } from 'react'

export type ChipTone = 'paper' | 'white' | 'ink' | 'orange' | 'blue'

const TONES: Record<ChipTone, string> = {
  paper: 'bg-ink/[0.07] text-ink',
  white: 'bg-cream text-ink ring-1 ring-inset ring-line',
  ink: 'bg-ink text-cream',
  orange: 'bg-brand text-white',
  blue: 'bg-blue text-white',
}

interface Props {
  children: ReactNode
  tone?: ChipTone
  /** Makes the chip a toggle button (for filters and multi-select forms). */
  onClick?: () => void
  selected?: boolean
}

export default function Chip({ children, tone = 'paper', onClick, selected }: Props) {
  const cls = `inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-semibold leading-5 ${TONES[selected ? 'ink' : tone]}`
  if (onClick)
    return (
      <button type="button" aria-pressed={selected} onClick={onClick} className={`${cls} hover:ring-[1.5px] hover:ring-inset hover:ring-ink transition`}>
        {children}
      </button>
    )
  return <span className={cls}>{children}</span>
}

export function ChipList({ items, tone }: { items: string[] | null | undefined; tone?: ChipTone }) {
  if (!items?.length) return <p className="text-sm text-ink-soft">None listed</p>
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((i) => <Chip key={i} tone={tone}>{i}</Chip>)}
    </div>
  )
}
