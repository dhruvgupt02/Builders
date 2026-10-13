import type { Verification, VerificationType } from '../lib/types'
import { summarizeVerifications, VERIFICATION_INFO } from '../lib/verification'

const ICONS: Record<VerificationType, string> = {
  // wrench, flow, briefcase
  tool: 'M11.5 3a3.5 3.5 0 0 0-3.3 4.7L3 12.9 5.1 15l5.2-5.2A3.5 3.5 0 0 0 15 6.5l-2 2-1.5-1.5 2-2A3.5 3.5 0 0 0 11.5 3Z',
  workflow: 'M3 4h4v4H3zM11 10h4v4h-4zM7 6h3a2 2 0 0 1 2 2v2',
  past_work: 'M3 6.5h12v8H3zM6.5 6.5V4.5h5v2M3 10h12',
}

function Icon({ type }: { type: VerificationType }) {
  return (
    <svg viewBox="0 0 18 18" className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden>
      <path d={ICONS[type]} />
    </svg>
  )
}

interface Props {
  verifications: Verification[] | null | undefined
  /** Only count verifications attached to this portfolio item (workflow / past work), for item cards. */
  itemId?: string
  /** `compact` shows short labels for cards; `full` shows the full badge name. */
  size?: 'compact' | 'full'
  /** Set false inside links and cards, where the badge must not take keyboard focus of its own. */
  focusable?: boolean
  /** `native` uses the browser tooltip only; for tight layouts where a floating panel would be clipped. */
  tooltip?: 'rich' | 'native'
}

/**
 * The three BRIVIO trust badges: Verified tool, Workflow verified, Past work verified.
 * Each one explains itself in a tooltip on hover or keyboard focus. Renders nothing if there is nothing verified.
 */
export default function VerificationBadges({ verifications, itemId, size = 'full', focusable = true, tooltip = 'rich' }: Props) {
  const s = summarizeVerifications(verifications)
  const show: { type: VerificationType; detail: string }[] = []

  if (!itemId && s.counts.tool) {
    const tools = [...s.verifiedTools]
    show.push({ type: 'tool', detail: tools.length ? `Verified for: ${tools.join(', ')}.` : '' })
  }
  if (itemId ? s.workflowItems.has(itemId) : s.counts.workflow) show.push({ type: 'workflow', detail: '' })
  if (itemId ? s.pastWorkItems.has(itemId) : s.counts.past_work) show.push({ type: 'past_work', detail: '' })
  if (!show.length) return null

  return (
    <ul className="relative flex flex-wrap gap-1.5" aria-label="Verification badges">
      {show.map(({ type, detail }) => {
        const info = VERIFICATION_INFO[type]
        const count = type === 'tool' && s.counts.tool > 1 ? ` ×${s.counts.tool}` : ''
        const tip = `${info.explain}${detail ? ` ${detail}` : ''}`
        return (
          <li key={type} className="group/badge">
            <span
              tabIndex={focusable ? 0 : undefined}
              title={tooltip === 'native' ? `${info.label}: ${tip}` : undefined}
              aria-label={`${info.label}. ${tip}`}
              className="inline-flex items-center gap-1 rounded-full bg-blue text-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap cursor-help focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              <Icon type={type} />
              {size === 'compact' ? info.short : info.label}
              {count}
            </span>
            {tooltip === 'rich' && (
              <span
                role="tooltip"
                // Anchored to the badge row (not the badge) so it never runs off the right edge on phones,
                // and display:none while closed so it cannot widen the page.
                className="pointer-events-none absolute left-0 top-full z-30 mt-2 hidden w-60 max-w-[calc(100vw-4rem)] rounded-btn bg-ink p-3 text-xs font-medium normal-case leading-snug text-cream shadow-card ring-1 ring-cream/20 group-hover/badge:block group-focus-within/badge:block"
              >
                <span className="display block text-[10px] text-brand mb-1">{info.label}</span>
                {tip}
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
