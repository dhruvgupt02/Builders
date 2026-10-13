import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Creator } from '../lib/types'
import CreatorCard from '../components/CreatorCard'
import { Spinner } from '../components/ui'

const PILLARS = [
  ['See the workflow', 'Every portfolio piece shows the tools and steps used — Midjourney to Kling to Premiere Pro.'],
  ['Trust the work', 'Tool, workflow and past-work verification badges help you hire with confidence.'],
  ['Rights made clear', 'Briefs specify platforms, territory, exclusivity and AI likeness/voice permissions.'],
]

export default function Home() {
  const [featured, setFeatured] = useState<Creator[] | null>(null)

  useEffect(() => {
    supabase
      .from('creators')
      .select('*, verifications(id,type,label,status)')
      .order('created_at', { ascending: true })
      .limit(6)
      .then(({ data }) => setFeatured((data as Creator[]) ?? []))
  }, [])

  return (
    <>
      <section className="bg-gradient-to-b from-brand-light to-white">
        <div className="max-w-6xl mx-auto px-4 py-20 text-center">
          <p className="text-sm font-semibold text-brand uppercase tracking-wider">AI-native creative marketplace</p>
          <h1 className="mt-3 text-4xl sm:text-5xl font-extrabold tracking-tight text-gray-900">
            Hire AI filmmakers, animators<br className="hidden sm:block" /> and generative artists
          </h1>
          <p className="mt-5 text-lg text-gray-600 max-w-2xl mx-auto">
            Browse AI portfolios with the exact tools, models and workflows behind every piece —
            then brief creators with clear commercial-use rights.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/creators" className="px-6 py-3 rounded-xl bg-brand text-white font-semibold hover:bg-brand-dark">
              Discover creators
            </Link>
            <Link to="/briefs/new" className="px-6 py-3 rounded-xl border border-gray-300 font-semibold text-gray-800 hover:border-brand hover:text-brand">
              Create a brief
            </Link>
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 py-14">
        <div className="grid sm:grid-cols-3 gap-6">
          {PILLARS.map(([t, b]) => (
            <div key={t} className="rounded-2xl border border-gray-200 p-6">
              <h3 className="font-semibold text-gray-900">{t}</h3>
              <p className="mt-2 text-sm text-gray-600">{b}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 pb-20">
        <div className="flex items-end justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Featured creators</h2>
          <Link to="/creators" className="text-sm font-semibold text-brand hover:underline">View all →</Link>
        </div>
        {featured === null ? (
          <Spinner />
        ) : featured.length === 0 ? (
          <p className="text-sm text-gray-500">No creators to show yet.</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {featured.map((c) => <CreatorCard key={c.id} creator={c} />)}
          </div>
        )}
      </section>
    </>
  )
}
