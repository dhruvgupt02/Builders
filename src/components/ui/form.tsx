import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import Chip from './Chip'

/** Multi-select from a fixed list (taxonomy values), shown as toggle chips. */
export function ChipPicker<T extends string>({ options, value, onChange }: { options: readonly T[]; value: T[]; onChange: (next: T[]) => void }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o)
        return (
          <Chip key={o} tone="white" selected={on} onClick={() => onChange(on ? value.filter((v) => v !== o) : [...value, o])}>
            {on && <span className="mr-1 text-brand" aria-hidden>✓</span>}
            {o}
          </Chip>
        )
      })}
    </div>
  )
}

/** Free-text chips: type, then Enter or comma. Used for style tags and languages. */
export function TagInput({ value, onChange, placeholder, max = 12 }: { value: string[]; onChange: (next: string[]) => void; placeholder?: string; max?: number }) {
  const [draft, setDraft] = useState('')
  const id = useId()

  function add() {
    const tag = draft.trim().replace(/,+$/, '').slice(0, 30)
    if (tag && value.length < max && !value.some((v) => v.toLowerCase() === tag.toLowerCase())) onChange([...value, tag])
    setDraft('')
  }
  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      add()
    } else if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1))
  }

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 rounded-btn bg-cream p-2 ring-[1.5px] ring-inset ring-ink/25 focus-within:ring-2 focus-within:ring-brand">
      {value.map((tag) => (
        <span key={tag} className="inline-flex items-center gap-1 rounded-lg bg-ink text-cream pl-2.5 pr-1 py-1 text-xs font-semibold">
          {tag}
          <button type="button" aria-label={`Remove ${tag}`} onClick={() => onChange(value.filter((v) => v !== tag))} className="h-5 w-5 rounded hover:bg-cream/20">×</button>
        </span>
      ))}
      <input
        id={id}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={add}
        placeholder={value.length ? '' : placeholder}
        className="flex-1 min-w-[8rem] h-7 bg-transparent px-1.5 text-sm placeholder:text-ink-soft/60 focus:outline-none"
      />
    </div>
  )
}

interface FileDropProps {
  accept: string
  onFile: (file: File) => void
  title: string
  hint: string
  /** Shown instead of the prompt once something is chosen. */
  preview?: ReactNode
  compact?: boolean
  busy?: boolean
}

/** Click or drag-and-drop file picker, styled after the "upload" card in the design reference. */
export function FileDrop({ accept, onFile, title, hint, preview, compact, busy }: FileDropProps) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const file = e.dataTransfer.files[0]
        if (file) onFile(file)
      }}
      className={`mt-1.5 rounded-card border-2 border-dashed transition-colors ${over ? 'border-brand bg-brand/5' : 'border-ink/25 bg-cream'} ${compact ? 'p-3' : 'p-4 sm:p-6'}`}
    >
      {preview}
      <div className={`flex flex-col items-center text-center ${preview ? 'mt-3' : compact ? 'py-1' : 'py-6'}`}>
        {!preview && !compact && <div className="dots h-9 w-9 mb-3" aria-hidden />}
        {!preview && <p className={compact ? 'text-sm font-semibold' : 'display text-sm'}>{title}</p>}
        <p className="mt-1 text-xs text-ink-soft">{hint}</p>
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="mt-3 h-9 px-4 rounded-btn bg-ink text-cream display tracking-normal text-[11px] hover:bg-bark disabled:opacity-60"
        >
          {busy ? 'Uploading…' : preview ? 'Replace file' : 'Choose file'}
        </button>
      </div>
      <input
        ref={input}
        type="file"
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onFile(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}

const NOTICE = {
  error: 'bg-brand/10 text-brand-dark ring-brand/30',
  success: 'bg-lime/60 text-ink ring-ink/15',
  info: 'bg-ink/[0.06] text-ink ring-ink/10',
}

/** Inline message for errors, confirmations and tips. */
export function Notice({ tone = 'info', children }: { tone?: keyof typeof NOTICE; children: ReactNode }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-btn px-3.5 py-2.5 text-sm font-medium ring-1 ring-inset ${NOTICE[tone]}`}>
      {children}
    </div>
  )
}
