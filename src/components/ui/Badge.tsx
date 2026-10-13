import type { ReactNode } from 'react'

type Tone = 'blue' | 'orange' | 'ink' | 'muted'

const TONES: Record<Tone, string> = {
  blue: 'bg-blue text-white',
  orange: 'bg-brand text-white',
  ink: 'bg-ink text-cream',
  muted: 'bg-ink/10 text-ink-soft',
}

export default function Badge({ children, tone = 'ink' }: { children: ReactNode; tone?: Tone }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${TONES[tone]}`}>
      {children}
    </span>
  )
}

export function VerifiedBadge() {
  return (
    <Badge tone="blue">
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3" aria-hidden>
        <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 111.4-1.4L8 12.6l7.3-7.3a1 1 0 011.4 0z" clipRule="evenodd" />
      </svg>
      Verified
    </Badge>
  )
}
