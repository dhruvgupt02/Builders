import { useEffect, useState, type ReactNode } from 'react'
import {
  BUDGET_MAX, BUDGET_MIN, BUDGET_STEP, GROUP_LABELS, TAXONOMY_OPTIONS, toggleValue, type Facets, type Filters, type Group,
} from '../../lib/search'
import { formatINR } from '../../lib/format'
import Switch from '../ui/Switch'

interface Props {
  filters: Filters
  /** null while the counts are loading */
  facets: Facets | null
  onChange: (next: Filters) => void
}

const heading = 'text-xs font-bold uppercase tracking-wider'

function Option({ label, count, selected, onClick }: { label: string; count: number | undefined; selected: boolean; onClick: () => void }) {
  // Zero-count options stay visible but cannot be switched on. A selected option can always be switched off.
  const dead = !selected && count === 0
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={dead}
      onClick={onClick}
      title={dead ? 'No creators would match with this added' : undefined}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold leading-5 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue ${
        selected ? 'bg-ink text-cream' : dead ? 'bg-ink/[0.04] text-ink/35 cursor-not-allowed' : 'bg-cream text-ink ring-1 ring-inset ring-line hover:ring-[1.5px] hover:ring-ink'
      }`}
    >
      {selected && <span className="text-brand" aria-hidden>✓</span>}
      {label}
      <span className={`tabular-nums ${selected ? 'text-cream/60' : dead ? '' : 'text-ink-soft'}`}>{count ?? '·'}</span>
    </button>
  )
}

function GroupSection({ group, options, filters, facets, onChange, children }: Props & { group: Group; options: readonly string[]; children?: ReactNode }) {
  const selected = filters[group]
  return (
    <section>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className={heading}>{GROUP_LABELS[group]}</h3>
        {selected.length > 0 && (
          <button type="button" onClick={() => onChange({ ...filters, [group]: [] })} className="text-xs font-semibold text-ink-soft underline underline-offset-2 hover:text-brand">
            Clear
          </button>
        )}
      </div>
      {children}
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {options.map((o) => (
          <Option key={o} label={o} count={facets?.[group]?.[o]} selected={selected.includes(o)} onClick={() => onChange(toggleValue(filters, group, o))} />
        ))}
      </div>
    </section>
  )
}

function BudgetSlider({ value, onCommit }: { value: number | null; onCommit: (v: number | null) => void }) {
  const [draft, setDraft] = useState(value ?? BUDGET_MAX)
  useEffect(() => setDraft(value ?? BUDGET_MAX), [value])
  // The far right of the slider means "no limit".
  const commit = (v: number) => onCommit(v >= BUDGET_MAX ? null : v)
  return (
    <section>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className={heading}>Max budget</h3>
        <output className="text-sm font-bold tabular-nums">{draft >= BUDGET_MAX ? 'Any budget' : `up to ${formatINR(draft)}`}</output>
      </div>
      <input
        type="range"
        aria-label="Maximum budget in INR"
        min={BUDGET_MIN}
        max={BUDGET_MAX}
        step={BUDGET_STEP}
        value={draft}
        onChange={(e) => setDraft(Number(e.target.value))}
        onPointerUp={() => commit(draft)}
        onKeyUp={() => commit(draft)}
        onBlur={() => draft !== (value ?? BUDGET_MAX) && commit(draft)}
        className="mt-3 w-full accent-brand"
      />
      <div className="flex justify-between text-[11px] font-semibold text-ink-soft tabular-nums">
        <span>{formatINR(BUDGET_MIN)}</span>
        <span>Any</span>
      </div>
      <p className="mt-1 text-xs text-ink-soft">Shows creators whose starting price is within your budget.</p>
    </section>
  )
}

/** All search filters. Rendered in the desktop sidebar and inside the mobile drawer. */
export default function FilterPanel({ filters, facets, onChange }: Props) {
  const cities = Object.keys(facets?.cities ?? {}).sort((a, b) => a.localeCompare(b))
  const shared = { filters, facets, onChange }
  return (
    <div className="space-y-7">
      <p className="text-xs text-ink-soft">The number beside each option is how many creators you would see with it switched on.</p>

      <GroupSection group="specializations" options={TAXONOMY_OPTIONS.specializations} {...shared} />
      <GroupSection group="skills" options={TAXONOMY_OPTIONS.skills} {...shared} />
      <GroupSection group="tools" options={TAXONOMY_OPTIONS.tools} {...shared}>
        <div className="mt-2">
          <Switch
            checked={filters.match_all_tools}
            onChange={(v) => onChange({ ...filters, match_all_tools: v })}
            label={<>Match all tools <span className="font-normal text-ink-soft">({filters.tools.length < 2 ? 'pick two or more tools' : filters.match_all_tools ? 'must use every selected tool' : 'any selected tool'})</span></>}
            disabled={filters.tools.length < 2 && !filters.match_all_tools}
          />
        </div>
      </GroupSection>
      <GroupSection group="content_types" options={TAXONOMY_OPTIONS.content_types} {...shared} />
      <GroupSection group="aspect_ratios" options={TAXONOMY_OPTIONS.aspect_ratios} {...shared} />
      <GroupSection group="cities" options={cities.length ? cities : filters.cities} {...shared} />

      <BudgetSlider value={filters.budget_max} onCommit={(v) => onChange({ ...filters, budget_max: v })} />

      <section className="space-y-1">
        <h3 className={heading}>Trust</h3>
        <Switch
          checked={filters.commercial_ready}
          onChange={(v) => onChange({ ...filters, commercial_ready: v })}
          label="Commercial-ready"
          hint={facets?.commercial_ready}
          disabled={!filters.commercial_ready && facets?.commercial_ready === 0}
        />
        <Switch
          checked={filters.verified_only}
          onChange={(v) => onChange({ ...filters, verified_only: v })}
          label="Verified only"
          hint={facets?.verified_only}
          disabled={!filters.verified_only && facets?.verified_only === 0}
        />
        <p className="text-xs text-ink-soft">Commercial-ready creators have licensed or client-delivered work.</p>
      </section>
    </div>
  )
}
