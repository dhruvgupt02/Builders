import { Link } from 'react-router-dom'
import { PART_HELP, PART_LABELS, WEIGHTS, type Part } from '../lib/matching'
import { Badge, Button, Card, PageContainer, PageHeader } from '../components/ui'

const BADGES = [
  {
    name: 'Verified tool',
    how: 'AI-checked screenshot',
    what: 'The creator really works with a tool they list, such as Runway or Midjourney.',
    steps: [
      'The creator uploads a screenshot of their own account, plan page or generation history in that tool.',
      'An AI model looks at the image. It passes only if it is clearly a screenshot of that tool, the tool’s name is readable, and it shows an account or their own work.',
      'High confidence gives the badge straight away. Anything less waits for a person at BRIVIO to look at it.',
    ],
    limits: 'It shows the creator has access to the tool. It does not prove a particular piece was made with it, and a screenshot can be faked, so treat it as a good sign rather than proof.',
  },
  {
    name: 'Workflow verified',
    how: 'Documented workflow, checked by AI',
    what: 'The step-by-step making-of shown on a portfolio piece holds together.',
    steps: [
      'A piece counts as “workflow documented” when it has at least three workflow steps and every step has an image.',
      'An AI model then compares the step images with the finished piece and checks they look like stages of making it, in a sensible order.',
      'If they do, the piece gets “Workflow verified”. If not, it stays “documented” and can be reviewed by a person.',
    ],
    limits: 'It checks that the story is plausible, not that every step happened exactly as described.',
  },
  {
    name: 'Past work verified',
    how: 'Client-confirmed',
    what: 'A client confirms they commissioned a piece from this creator.',
    steps: [
      'The creator generates a one-time link for a piece they made for a client and sends it to that client.',
      'The client opens the link, sees the piece, enters their name and company, and confirms they commissioned it.',
      'Each link works once and expires after 14 days. The creator cannot confirm their own work.',
    ],
    limits: 'BRIVIO does not check who opens the link, so it relies on the creator sending it to the real client. The client’s name and company are recorded with the confirmation.',
  },
]

/** Public page: what each trust badge means and how matching scores are worked out. */
export default function Trust() {
  return (
    <PageContainer className="!max-w-4xl">
      <PageHeader
        eyebrow="Trust on BRIVIO"
        title="What the badges mean"
        subtitle="Anyone can say they are an AI filmmaker. These three badges show what has actually been checked, how, and what each check can and cannot tell you."
      />

      <div className="mt-8 space-y-5">
        {BADGES.map((b) => (
          <Card key={b.name}>
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone="blue">✓ {b.name}</Badge>
              <span className="text-xs font-bold uppercase tracking-wider text-ink-soft">{b.how}</span>
            </div>
            <h2 className="display mt-3 text-xl">{b.what}</h2>
            <ol className="mt-4 space-y-2">
              {b.steps.map((s, i) => (
                <li key={s} className="flex gap-3 text-sm">
                  <span className="display flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-ink text-cream text-[10px]">{i + 1}</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
            <p className="mt-4 rounded-btn bg-ink/[0.05] p-3 text-sm"><span className="font-bold">What it does not tell you: </span>{b.limits}</p>
          </Card>
        ))}
      </div>

      <Card className="mt-5">
        <h2 className="display text-xl">Other labels you will see</h2>
        <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
          <div><dt className="font-bold">Workflow documented</dt><dd className="text-ink-soft">The piece has three or more steps with an image on each, but has not been through the AI check yet.</dd></div>
          <div><dt className="font-bold">Commercial-ready</dt><dd className="text-ink-soft">The creator has at least one piece that is licensed for commercial use or was delivered to a client. Stated by the creator.</dd></div>
          <div><dt className="font-bold">Pending</dt><dd className="text-ink-soft">A check was requested and is waiting for review. Pending items never show a badge.</dd></div>
          <div><dt className="font-bold">Reviewed by BRIVIO</dt><dd className="text-ink-soft">A person on the BRIVIO team checked the evidence. Sample profiles in this demo use this.</dd></div>
        </dl>
      </Card>

      <section id="matching" className="mt-10 scroll-mt-6 border-t border-line pt-8">
        <h2 className="display text-2xl sm:text-3xl">How matching scores work</h2>
        <p className="mt-3 max-w-2xl text-ink-soft">When a brand opens the matches for a brief, every creator gets a score out of 100. It is the sum of six parts, and each card shows the parts so you can see why someone ranks where they do.</p>
        <div className="mt-5 overflow-x-auto rounded-xl ring-1 ring-line">
          <table className="w-full min-w-[32rem] text-sm">
            <thead className="bg-ink text-cream text-left text-[11px] uppercase tracking-wider">
              <tr><th className="px-3 py-2 font-bold">Part</th><th className="px-3 py-2 font-bold">Points</th><th className="px-3 py-2 font-bold">How it is worked out</th></tr>
            </thead>
            <tbody className="divide-y divide-line bg-white">
              {(Object.keys(WEIGHTS) as Part[]).map((p) => (
                <tr key={p}><td className="px-3 py-2.5 font-bold">{PART_LABELS[p]}</td><td className="px-3 py-2.5 display text-base">{WEIGHTS[p]}</td><td className="px-3 py-2.5 text-ink-soft">{PART_HELP[p]}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-ink-soft">The sentence under “Why this match” is written from these numbers. A score is a starting point for a conversation, not a guarantee of fit.</p>
      </section>

      <div className="mt-10 flex flex-wrap gap-3">
        <Button to="/creators?verified=1">Browse verified creators</Button>
        <Link to="/creators" className="self-center text-sm font-bold underline underline-offset-4 hover:text-brand">All creators</Link>
      </div>
    </PageContainer>
  )
}
