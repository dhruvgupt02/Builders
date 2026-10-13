import { ASPECT_RATIOS } from '../../lib/taxonomy'

/** A small outline drawn at the real proportions of an aspect ratio, e.g. a tall box for 9:16. */
export function AspectShape({ ratio, size = 28, tone = 'ink' }: { ratio: string; size?: number; tone?: 'ink' | 'cream' | 'brand' }) {
  const [w, h] = ratio.split(':').map(Number)
  if (!w || !h) return null
  const scale = size / Math.max(w, h)
  const color = tone === 'cream' ? 'border-cream bg-cream/15' : tone === 'brand' ? 'border-brand bg-brand/15' : 'border-ink bg-ink/10'
  return (
    <span className="inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }} aria-hidden>
      <span className={`block rounded-[3px] border-2 ${color}`} style={{ width: Math.max(6, w * scale), height: Math.max(6, h * scale) }} />
    </span>
  )
}

const HINTS: Record<string, string> = { '16:9': 'Widescreen', '9:16': 'Vertical', '1:1': 'Square', '4:5': 'Portrait' }

/** Aspect ratio chooser shown as shapes. */
export function AspectPicker({ value, onChange, label }: { value: string; onChange: (ratio: string) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {ASPECT_RATIOS.map((r) => {
        const on = value === r
        return (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={on}
            title={`${r} ${HINTS[r]}`}
            onClick={() => onChange(r)}
            className={`flex h-[4.25rem] w-16 flex-col items-center justify-center gap-0.5 rounded-btn text-[11px] font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue ${
              on ? 'bg-ink text-cream' : 'bg-cream text-ink ring-1 ring-inset ring-line hover:ring-[1.5px] hover:ring-ink'
            }`}
          >
            <AspectShape ratio={r} size={26} tone={on ? 'cream' : 'ink'} />
            {r}
          </button>
        )
      })}
    </div>
  )
}
