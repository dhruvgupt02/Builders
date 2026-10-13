import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Creator } from '../lib/types'
import { searchLink } from '../lib/search'
import CreatorCard from '../components/CreatorCard'
import { ArrowIcon, Button, Card, Chip, Media, Spinner } from '../components/ui'

const PILLARS = [
  ['01', 'See the workflow', 'Every portfolio piece shows the tools and steps behind it.'],
  ['02', 'Trust the work', 'Tool, workflow and past-work verification badges.'],
  ['03', 'Rights made clear', 'Platforms, territory, exclusivity and AI likeness terms.'],
]

// Each link opens the search page with these filters already applied (they are plain URL parameters).
const POPULAR_SEARCHES = [
  { label: 'AI ads in 9:16', to: searchLink({ specializations: ['AI ads'], aspect_ratios: ['9:16'] }) },
  { label: 'Product visuals with Kling', to: searchLink({ specializations: ['Product visuals'], tools: ['Kling'] }) },
  { label: 'Music videos', to: searchLink({ specializations: ['Music videos'] }) },
  { label: 'Verified explainer videos', to: searchLink({ specializations: ['Explainer videos'], verified_only: true }) },
  { label: 'Commercial-ready social reels', to: searchLink({ specializations: ['Social reels'], commercial_ready: true }) },
  { label: 'Under ₹10,000', to: searchLink({ budget_max: 10000 }) },
]

const SAMPLE_WORKFLOW = [
  ['Midjourney', 'Key frames and style references', 90],
  ['Kling', 'Stills turned into motion', 75],
  ['ElevenLabs', 'Voiceover in a brand voice', 60],
  ['Premiere Pro', 'Final cut for every platform', 100],
] as const

function GridIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <circle cx="6" cy="6" r="2.2" /><circle cx="14" cy="6" r="2.2" /><circle cx="6" cy="14" r="2.2" /><path d="M14 11.5v5M11.5 14h5" />
    </svg>
  )
}

/** Rotating circular stamp from the reference ("new videos daily"). */
function Stamp() {
  return (
    <div className="relative h-24 w-24 sm:h-28 sm:w-28 rounded-full bg-cream text-blue shrink-0" aria-hidden>
      <svg viewBox="0 0 100 100" className="absolute inset-0 motion-safe:animate-[spin-slow_18s_linear_infinite]">
        <defs><path id="stamp-circle" d="M50,50 m-38,0 a38,38 0 1,1 76,0 a38,38 0 1,1 -76,0" /></defs>
        <text fontSize="10.5" fontWeight="700" fill="currentColor" fontFamily="Onest, sans-serif">
          <textPath href="#stamp-circle" textLength="232" lengthAdjust="spacing">NEW AI WORK DAILY • VERIFIED •</textPath>
        </text>
      </svg>
      <div className="absolute inset-[26%] rounded-full bg-blue text-cream flex items-center justify-center">
        <svg viewBox="0 0 24 24" className="w-3/5 h-3/5" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18" />
        </svg>
      </div>
    </div>
  )
}

export default function Home() {
  const [featured, setFeatured] = useState<Creator[] | null>(null)
  const [query, setQuery] = useState('')
  const navigate = useNavigate()

  function onSearch(ev: FormEvent) {
    ev.preventDefault()
    navigate(searchLink({ q: query }))
  }

  useEffect(() => {
    supabase
      .from('creators')
      .select('*, verifications(id,type,label,status)')
      .order('created_at', { ascending: true })
      .limit(6)
      .then(({ data }) => setFeatured((data as Creator[]) ?? []))
  }, [])

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6">
      {/* Hero */}
      <section className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-10 lg:gap-12 items-center pt-6 sm:pt-12 pb-12 sm:pb-16">
        <div>
          <h1 className="display text-[clamp(2rem,10vw,4.875rem)] lg:text-[clamp(2.5rem,5.5vw,4.4rem)]">
            AI Creators
            <br />
            <span className="inline-flex items-start gap-[0.2em] whitespace-nowrap">
              That Build
              <span className="dots inline-block h-[0.6em] w-[0.6em] mt-[0.08em]" aria-hidden />
            </span>
            <br />Brands
          </h1>
          <p className="mt-6 text-lg leading-snug max-w-md">
            Hire AI filmmakers, animators and generative artists — with the workflow shown.
          </p>

          {/* Main call to action: search */}
          <form onSubmit={onSearch} role="search" className="mt-6 flex flex-col sm:flex-row gap-2 max-w-xl">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search AI creators"
              placeholder="Search by tool, skill, city or style"
              className="h-14 flex-1 min-w-0 rounded-btn bg-cream px-4 text-base ring-[1.5px] ring-inset ring-ink/25 placeholder:text-ink-soft/60 focus:outline-none focus:ring-2 focus:ring-brand"
            />
            <Button type="submit" size="lg" icon={<GridIcon />}>Find creators</Button>
          </form>

          <div className="mt-5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-ink-soft">Popular searches</h2>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {POPULAR_SEARCHES.map((p) => (
                <Link key={p.label} to={p.to} className="rounded-lg bg-ink text-cream px-3 py-1.5 text-xs font-semibold hover:bg-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue">
                  {p.label}
                </Link>
              ))}
              <Link to="/creators?mode=semantic" className="rounded-lg bg-cream px-3 py-1.5 text-xs font-semibold ring-1 ring-inset ring-line hover:ring-ink">
                ✦ Describe what you need
              </Link>
            </div>
          </div>
        </div>

        <div className="relative rounded-card bg-cream p-2 shadow-card max-w-md w-full mx-auto lg:mx-0 lg:justify-self-end">
          <Media
            src="https://picsum.photos/seed/brivio-hero-studio/720/860"
            alt="Sample AI-generated campaign visual"
            className="w-full aspect-[5/6] object-cover rounded-[0.9rem] bg-paper-deep"
          />
          <div className="absolute inset-x-0 bottom-0 rounded-card bg-ink text-cream p-5 sm:p-6 flex items-center justify-between gap-4">
            <p className="display text-xl sm:text-2xl">Creator +<br />Brand</p>
            <Stamp />
          </div>
        </div>
      </section>

      {/* Pillars */}
      <section className="grid grid-cols-1 sm:grid-cols-3 border-y border-line divide-y sm:divide-y-0 sm:divide-x divide-line">
        {PILLARS.map(([n, t, b]) => (
          <div key={t} className="flex gap-4 py-6 sm:px-6 first:sm:pl-0 last:sm:pr-0">
            <span className="display text-sm text-brand pt-1">{n}</span>
            <div>
              <h3 className="font-bold text-lg leading-tight">{t}</h3>
              <p className="mt-1 text-sm text-ink-soft">{b}</p>
            </div>
          </div>
        ))}
      </section>

      {/* Feature row */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 py-12 sm:py-16 items-stretch">
        <Card tone="ink" ticket notchY="72%" className="flex flex-col justify-between gap-10">
          <div className="flex flex-wrap gap-2">
            <Chip tone="blue">Tools</Chip><Chip tone="white">Workflow</Chip><Chip tone="orange">Rights</Chip>
          </div>
          <div>
            <div className="dots h-9 w-9 mb-4" aria-hidden />
            <h2 className="display text-2xl sm:text-3xl">The marketplace for AI-native creative work</h2>
          </div>
        </Card>

        <Card ticket notchY="24%" className="text-center">
          <h2 className="display text-lg">How a piece is made</h2>
          <p className="text-sm text-ink-soft mt-1">Shown on every portfolio item</p>
          <ul className="mt-6 space-y-2.5 text-left">
            {SAMPLE_WORKFLOW.map(([tool, action, pct], i) => (
              <li key={tool} className="flex items-center gap-3 rounded-xl bg-white p-2.5 ring-1 ring-line">
                <span className="display text-xs h-9 w-9 shrink-0 rounded-lg bg-ink text-cream flex items-center justify-center">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{tool} <span className="font-normal text-ink-soft">· {action}</span></p>
                  <div className="mt-1.5 h-1.5 rounded-full bg-ink/10"><div className="h-full rounded-full bg-lime ring-1 ring-ink/10" style={{ width: `${pct}%` }} /></div>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <div className="md:col-span-2 lg:col-span-1 flex flex-col justify-center lg:pl-4">
          <h2 className="display text-2xl sm:text-3xl">Are you an AI creator?</h2>
          <p className="mt-3 text-ink-soft">Show your films, animation and generative art with the workflow behind them, get verified and get briefed by brands.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button variant="dark" to="/onboarding/creator" icon={<ArrowIcon />}>Join as creator</Button>
            <Button variant="outline" to="/briefs/new">Create a brief</Button>
          </div>
        </div>
      </section>

      {/* Featured creators */}
      <section className="pb-8">
        <div className="flex items-end justify-between gap-4 border-t border-line pt-8 mb-7">
          <h2 className="display text-2xl sm:text-4xl">Featured creators</h2>
          <Link to="/creators" className="display text-xs tracking-normal underline underline-offset-4 decoration-2 hover:text-brand whitespace-nowrap">View all</Link>
        </div>
        {featured === null ? (
          <Spinner />
        ) : featured.length === 0 ? (
          <p className="text-sm text-ink-soft">No creators to show yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {featured.map((c) => <CreatorCard key={c.id} creator={c} />)}
          </div>
        )}
      </section>
    </div>
  )
}
