import type { ReactNode } from 'react'

interface Props {
  checked: boolean
  onChange: (next: boolean) => void
  label: ReactNode
  /** Shown on the right, e.g. a result count. */
  hint?: ReactNode
  disabled?: boolean
}

/** On/off toggle with a text label; the whole row is the click target. */
export default function Switch({ checked, onChange, label, hint, disabled }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="group flex w-full items-center gap-3 rounded-btn py-1.5 text-left text-sm font-semibold disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
    >
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-brand' : 'bg-ink/20 group-hover:bg-ink/30'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-cream shadow transition-all ${checked ? 'left-[1.375rem]' : 'left-0.5'}`} />
      </span>
      <span className="flex-1">{label}</span>
      {hint != null && <span className="text-xs font-bold text-ink-soft tabular-nums">{hint}</span>}
    </button>
  )
}
