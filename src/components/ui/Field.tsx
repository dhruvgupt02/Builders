import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

const BASE =
  'mt-1.5 w-full rounded-btn bg-cream px-3.5 text-sm text-ink placeholder:text-ink-soft/60 ring-[1.5px] ring-inset ' +
  'focus:outline-none focus:ring-2 focus:ring-brand transition'
const control = (error?: string) => `${BASE} ${error ? 'ring-brand-dark' : 'ring-ink/25'}`

interface FieldProps {
  label?: ReactNode
  hint?: string
  /** Validation message; shown in place of the hint and announced to screen readers. */
  error?: string
}

/** Label + hint/error wrapper. Also used on its own around chip pickers and uploads. */
export function Field({ label, hint, error, children, as = 'label' }: FieldProps & { children: ReactNode; as?: 'label' | 'div' }) {
  const Tag = as
  return (
    <Tag className="block">
      {label && <span className="block text-xs font-bold uppercase tracking-wider text-ink">{label}</span>}
      {children}
      {error ? (
        <span role="alert" className="mt-1.5 block text-xs font-semibold text-brand-dark">{error}</span>
      ) : (
        hint && <span className="mt-1.5 block text-xs text-ink-soft">{hint}</span>
      )}
    </Tag>
  )
}

export function Input({ label, hint, error, className = '', ...rest }: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Field label={label} hint={hint} error={error}>
      <input aria-invalid={!!error} className={`${control(error)} h-11 ${className}`} {...rest} />
    </Field>
  )
}

export function Textarea({ label, hint, error, className = '', rows = 4, ...rest }: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Field label={label} hint={hint} error={error}>
      <textarea aria-invalid={!!error} rows={rows} className={`${control(error)} py-2.5 leading-relaxed ${className}`} {...rest} />
    </Field>
  )
}

interface SelectProps extends FieldProps, SelectHTMLAttributes<HTMLSelectElement> {
  options: readonly string[] | readonly { value: string; label: string }[]
  placeholder?: string
}

export function Select({ label, hint, error, options, placeholder, className = '', ...rest }: SelectProps) {
  return (
    <Field label={label} hint={hint} error={error}>
      <select aria-invalid={!!error} className={`${control(error)} h-11 pr-8 ${className}`} {...rest}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => {
          const opt = typeof o === 'string' ? { value: o, label: o } : o
          return <option key={opt.value} value={opt.value}>{opt.label}</option>
        })}
      </select>
    </Field>
  )
}
