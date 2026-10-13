import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'

const CONTROL =
  'mt-1.5 w-full h-11 rounded-btn bg-cream px-3.5 text-sm text-ink placeholder:text-ink-soft/60 ring-[1.5px] ring-inset ring-ink/25 ' +
  'focus:outline-none focus:ring-2 focus:ring-brand transition'

function Label({ label, hint, children }: { label?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      {label && <span className="text-xs font-bold uppercase tracking-wider text-ink">{label}</span>}
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-soft">{hint}</span>}
    </label>
  )
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
}

export function Input({ label, hint, className = '', ...rest }: InputProps) {
  return (
    <Label label={label} hint={hint}>
      <input className={`${CONTROL} ${className}`} {...rest} />
    </Label>
  )
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  hint?: string
  options: readonly string[] | readonly { value: string; label: string }[]
  placeholder?: string
}

export function Select({ label, hint, options, placeholder, className = '', ...rest }: SelectProps) {
  return (
    <Label label={label} hint={hint}>
      <select className={`${CONTROL} pr-8 ${className}`} {...rest}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => {
          const opt = typeof o === 'string' ? { value: o, label: o } : o
          return <option key={opt.value} value={opt.value}>{opt.label}</option>
        })}
      </select>
    </Label>
  )
}
