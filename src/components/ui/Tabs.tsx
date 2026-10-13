interface Props<T extends string> {
  tabs: readonly { id: T; label: string; count?: number }[]
  active: T
  onChange: (id: T) => void
}

/** Controlled tab strip: pills on paper, the active one filled with ink. */
export default function Tabs<T extends string>({ tabs, active, onChange }: Props<T>) {
  return (
    <div role="tablist" className="flex gap-1.5 overflow-x-auto pb-1 -mb-1">
      {tabs.map((t) => {
        const on = t.id === active
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.id)}
            className={`display tracking-normal text-[11px] h-9 px-4 rounded-btn whitespace-nowrap transition-colors ${
              on ? 'bg-ink text-cream' : 'bg-ink/[0.07] text-ink hover:bg-ink/15'
            }`}
          >
            {t.label}
            {t.count != null && <span className={`ml-1.5 ${on ? 'text-brand' : 'text-ink-soft'}`}>{t.count}</span>}
          </button>
        )
      })}
    </div>
  )
}
