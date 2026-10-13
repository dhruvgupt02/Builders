const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

export function formatINR(n: number | null | undefined) {
  return n == null ? '' : inr.format(n)
}

export function formatPriceRange(min: number | null, max: number | null) {
  if (min == null && max == null) return 'Price on request'
  if (min != null && max != null) return `${formatINR(min)} – ${formatINR(max)}`
  return formatINR(min ?? max)
}

export function formatDuration(sec: number | null | undefined) {
  if (!sec) return null
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return m ? `${m}m ${s.toString().padStart(2, '0')}s` : `${s}s`
}

// Tailwind aspect classes for the fixed aspect ratios.
export function aspectClass(ratio: string | null | undefined) {
  switch (ratio) {
    case '9:16': return 'aspect-[9/16]'
    case '1:1': return 'aspect-square'
    case '4:5': return 'aspect-[4/5]'
    default: return 'aspect-video'
  }
}
