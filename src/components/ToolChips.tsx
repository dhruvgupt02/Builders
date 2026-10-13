import type { ChipTone } from './ui/Chip'
import { Chip } from './ui'

function Tick() {
  return (
    <span className="mr-1.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-blue text-white" aria-hidden>
      <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="m2.5 6.2 2.3 2.3 4.7-5" /></svg>
    </span>
  )
}

/** Tool chips where tools backed by a verified "tool" verification carry a blue tick. */
export default function ToolChips({ tools, verified, tone = 'ink' }: { tools: string[] | null | undefined; verified?: Set<string>; tone?: ChipTone }) {
  if (!tools?.length) return <p className="text-sm text-ink-soft">None listed</p>
  return (
    <ul className="flex flex-wrap gap-1.5">
      {tools.map((t) => {
        const ok = verified?.has(t)
        return (
          <li key={t} title={ok ? `${t}: verified tool` : undefined}>
            <Chip tone={tone}>
              {ok && <Tick />}
              {t}
              {ok && <span className="sr-only"> (verified)</span>}
            </Chip>
          </li>
        )
      })}
    </ul>
  )
}
