import type { ReactNode } from 'react'
import { deliverableTotal, ipLabel, likenessLabel, musicLabel, rightsSentence, type BriefDraft } from '../../lib/brief'
import { formatDuration, formatINR } from '../../lib/format'
import { Card, ChipList } from '../ui'
import { AspectShape } from './AspectShape'

const heading = 'display text-lg'
const label = 'text-[11px] font-bold uppercase tracking-wider text-ink-soft'

function Fact({ name, children }: { name: string; children: ReactNode }) {
  if (children == null || children === '' || children === false) return null
  return (
    <div className="min-w-0">
      <dt className={label}>{name}</dt>
      <dd className="mt-0.5 font-semibold break-words">{children}</dd>
    </div>
  )
}

const yesNo = (v: boolean) => (v ? 'Yes' : 'No')
const formatDate = (d: string) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '')

/** The whole brief, laid out for reading. Used on the brief page and as the review step of the editor. */
export default function BriefSummary({ brief: b }: { brief: BriefDraft }) {
  const total = deliverableTotal(b)
  return (
    <div className="space-y-6">
      {/* Overview */}
      <section>
        <h2 className={heading}>Overview</h2>
        <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
          <Fact name="Product">{b.product}</Fact>
          <Fact name="Target audience">{b.target_audience}</Fact>
          <div className="sm:col-span-2"><Fact name="Campaign goal">{b.goal}</Fact></div>
          <div className="sm:col-span-2"><Fact name="Key message">{b.key_message}</Fact></div>
          {b.raw_idea && <div className="sm:col-span-2"><Fact name="Original idea"><span className="font-normal italic">“{b.raw_idea}”</span></Fact></div>}
        </dl>
      </section>

      {/* Creative */}
      <section className="border-t border-line pt-6">
        <h2 className={heading}>Creative direction</h2>
        <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
          <Fact name="Content type">{b.content_type}</Fact>
          <Fact name="Mood">{b.mood}</Fact>
          <div className="sm:col-span-2">
            <dt className={label}>Style</dt>
            <dd className="mt-1.5"><ChipList items={b.style_tags} /></dd>
          </div>
          <Fact name="Must include">{b.mandatory_elements}</Fact>
          <Fact name="Avoid">{b.avoid}</Fact>
          {b.required_tools.length > 0 && (
            <div><dt className={label}>Required tools</dt><dd className="mt-1.5"><ChipList items={b.required_tools} tone="ink" /></dd></div>
          )}
          {b.excluded_tools.length > 0 && (
            <div><dt className={label}>Do not use</dt><dd className="mt-1.5"><ChipList items={b.excluded_tools} tone="white" /></dd></div>
          )}
          {b.style_references.length > 0 && (
            <div className="sm:col-span-2">
              <dt className={label}>Style references</dt>
              <dd className="mt-1 space-y-0.5">
                {b.style_references.map((u) => (
                  <a key={u} href={u} target="_blank" rel="noreferrer noopener" className="block truncate text-sm font-semibold underline underline-offset-2 hover:text-brand">{u}</a>
                ))}
              </dd>
            </div>
          )}
        </dl>
      </section>

      {/* Deliverables */}
      <section className="border-t border-line pt-6">
        <h2 className={heading}>Deliverables <span className="font-sans text-sm font-semibold normal-case tracking-normal text-ink-soft">· {total} in total</span></h2>
        <div className="mt-3 overflow-x-auto rounded-xl ring-1 ring-line">
          <table className="w-full min-w-[30rem] text-sm">
            <thead className="bg-ink text-cream text-left text-[11px] uppercase tracking-wider">
              <tr><th className="px-3 py-2 font-bold">Qty</th><th className="px-3 py-2 font-bold">Format</th><th className="px-3 py-2 font-bold">Type</th><th className="px-3 py-2 font-bold">Length</th><th className="px-3 py-2 font-bold">Notes</th></tr>
            </thead>
            <tbody className="divide-y divide-line bg-white">
              {b.deliverables.map((d) => (
                <tr key={d.key}>
                  <td className="px-3 py-2.5 display text-base">{d.quantity}×</td>
                  <td className="px-3 py-2.5"><span className="inline-flex items-center gap-2 font-bold">{d.aspect_ratio && <AspectShape ratio={d.aspect_ratio} size={24} />}{d.aspect_ratio || '—'}</span></td>
                  <td className="px-3 py-2.5 font-semibold">{d.content_type || '—'}</td>
                  <td className="px-3 py-2.5">{formatDuration(d.duration_sec) ?? '—'}</td>
                  <td className="px-3 py-2.5 text-ink-soft">{d.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4">
          <Fact name="Resolution">{b.resolution}</Fact>
          <Fact name="Revision rounds">{b.revision_rounds != null ? String(b.revision_rounds) : ''}</Fact>
        </dl>
      </section>

      {/* Commercial use */}
      <section className="border-t border-line pt-6">
        <h2 className={heading}>Commercial use</h2>
        <Card tone="ink" className="mt-3 !p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-brand">In plain English</p>
          <p className="mt-2 text-base leading-relaxed">{rightsSentence(b)}</p>
        </Card>
        <dl className="mt-4 grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
          <div className="col-span-2 lg:col-span-3"><dt className={label}>Usage platforms</dt><dd className="mt-1.5"><ChipList items={b.usage_platforms} tone="orange" /></dd></div>
          <Fact name="Territory">{b.territory}</Fact>
          <Fact name="Rights duration">{b.rights_duration}</Fact>
          <Fact name="Exclusive">{yesNo(b.exclusivity)}</Fact>
          <Fact name="Ownership">{b.ip_ownership && ipLabel(b.ip_ownership)}</Fact>
          <Fact name="Real people">{b.real_people_likeness && likenessLabel(b.real_people_likeness)}</Fact>
          <Fact name="AI voice allowed">{yesNo(b.ai_voice_allowed)}</Fact>
          <Fact name="Music">{b.music_source && musicLabel(b.music_source)}</Fact>
          <Fact name="AI disclosure required">{yesNo(b.ai_disclosure_required)}</Fact>
          <Fact name="Creator credit required">{yesNo(b.credit_required)}</Fact>
          <Fact name="Licensed tools required">{yesNo(b.requires_tool_commercial_licence)}</Fact>
          <div className="col-span-2 lg:col-span-3"><Fact name="Notes">{b.rights_notes}</Fact></div>
        </dl>
      </section>

      {/* Budget and timeline */}
      <section className="border-t border-line pt-6">
        <h2 className={heading}>Budget and timeline</h2>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-4">
          <div>
            <dt className={label}>Budget</dt>
            <dd className="mt-0.5 display text-xl text-brand">{b.budget_min && b.budget_max ? `${formatINR(b.budget_min)} – ${formatINR(b.budget_max)}` : 'Not set'}</dd>
          </div>
          <div>
            <dt className={label}>Deadline</dt>
            <dd className="mt-0.5 display text-xl">{formatDate(b.deadline) || 'Not set'}</dd>
          </div>
        </dl>
      </section>
    </div>
  )
}
