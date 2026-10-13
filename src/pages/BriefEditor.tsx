import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'
import { loadBrief, myBrandName, saveBrief } from '../lib/briefs-db'
import {
  completeness, deliverableProblem, emptyBrief, needsDuration, newDeliverable, publishProblems, rightsSentence, ruleChecks, STEPS, today, validateStep,
  type Assumption, type BriefDraft, type BriefField, type BuilderResult, type CheckItem, type DeliverableDraft, type Question, type StepId,
} from '../lib/brief'
import {
  CONTENT_TYPES, IP_OWNERSHIP, IP_OWNERSHIP_LABELS, MUSIC_SOURCES, MUSIC_SOURCE_LABELS, REAL_PEOPLE_LIKENESS, REAL_PEOPLE_LIKENESS_LABELS,
  RESOLUTIONS, RIGHTS_DURATIONS, TERRITORIES, TOOLS, USAGE_PLATFORMS,
} from '../lib/taxonomy'
import { AspectPicker } from '../components/brief/AspectShape'
import BriefSummary from '../components/brief/BriefSummary'
import {
  ArrowIcon, Badge, Button, Card, ChipPicker, EmptyState, Field, Input, Notice, PageContainer, Select, Spinner, Switch, TagInput, Textarea,
} from '../components/ui'

const DEMO_BRAND = { email: 'demo.brand@brivio.app', password: 'BrivioDemo123!' }
const IDEA_PLACEHOLDER = '30-sec Diwali reel for my candle brand, cosy and warm, for Instagram ads'
const BUILD_STAGES = ['Reading your idea…', 'Choosing formats and deliverables…', 'Working out usage rights…', 'Estimating budget and timeline…']

const options = <T extends string>(values: readonly T[], labels: Record<T, string>) => values.map((value) => ({ value, label: labels[value] }))

async function authedPost(path: string, body: unknown) {
  const { data } = await supabase.auth.getSession()
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(40000),
  })
  return { ok: res.ok, json: (await res.json().catch(() => null)) as Record<string, any> | null }
}

/** Fields of an AI result that carry a value, i.e. the ones to mark "AI suggested". */
function filledFields(b: BriefDraft): BriefField[] {
  return (Object.keys(b) as BriefField[]).filter((k) => {
    if (k === 'raw_idea' || k === 'status') return false
    const v = b[k]
    return Array.isArray(v) ? v.length > 0 : typeof v === 'boolean' ? true : v != null && v !== ''
  })
}

export default function BriefEditor() {
  const { id: routeId } = useParams()
  const navigate = useNavigate()
  const { session, userId, role, loading: authLoading } = useAuth()

  const [phase, setPhase] = useState<'loading' | 'choose' | 'idea' | 'form' | 'missing' | 'forbidden'>(routeId ? 'loading' : 'choose')
  const [brief, setBrief] = useState<BriefDraft>(emptyBrief)
  const [briefId, setBriefId] = useState<string | null>(routeId ?? null)
  const [step, setStep] = useState<StepId>('basics')
  const [errors, setErrors] = useState<Partial<Record<BriefField, string>>>({})

  // AI builder state
  const [idea, setIdea] = useState('')
  const [ideaBrand, setIdeaBrand] = useState('')
  const [ideaBudget, setIdeaBudget] = useState('')
  const [building, setBuilding] = useState<number | null>(null) // index into BUILD_STAGES while a call is running
  const [aiNotice, setAiNotice] = useState<string | null>(null)
  const [aiFields, setAiFields] = useState<Set<BriefField>>(new Set())
  const [edited, setEdited] = useState<Set<BriefField>>(new Set())
  const [assumptions, setAssumptions] = useState<Assumption[]>([])
  const [questions, setQuestions] = useState<Question[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [pending, setPending] = useState<BuilderResult | null>(null) // an AI result waiting for "keep my edits?"
  const [confirmReset, setConfirmReset] = useState(false)

  // Save + check state
  const [save, setSave] = useState<{ state: 'idle' | 'saving' | 'saved' | 'error'; at?: Date; message?: string }>({ state: 'idle' })
  const [check, setCheck] = useState<{ busy: boolean; items?: CheckItem[]; aiAvailable?: boolean }>({ busy: false })
  const [publishing, setPublishing] = useState(false)
  const [demoBusy, setDemoBusy] = useState(false)
  const [demoError, setDemoError] = useState<string | null>(null)

  const meter = useMemo(() => completeness(brief), [brief])

  // ── load (edit mode) or prefill the brand name (new brief) ──
  useEffect(() => {
    if (authLoading || !userId) return
    let cancelled = false
    if (routeId) {
      loadBrief(routeId, userId).then((loaded) => {
        if (cancelled) return
        if (!loaded) return setPhase('missing')
        if (!loaded.isOwner) return setPhase('forbidden')
        setBrief(loaded.draft)
        setPhase('form')
        setSave({ state: 'saved', at: new Date(loaded.updated_at) })
      })
    } else {
      myBrandName(userId).then((name) => {
        if (cancelled || !name) return
        setIdeaBrand((v) => v || name)
        setBrief((b) => (b.brand_name ? b : { ...b, brand_name: name }))
      })
    }
    return () => {
      cancelled = true
    }
  }, [routeId, userId, authLoading])

  // ── editing ──
  const set = useCallback(<K extends BriefField>(field: K, value: BriefDraft[K]) => {
    setBrief((b) => ({ ...b, [field]: value }))
    setEdited((s) => new Set(s).add(field))
    setAiFields((s) => {
      if (!s.has(field)) return s
      const next = new Set(s)
      next.delete(field)
      return next
    })
    setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e))
  }, [])

  const setDeliverable = (key: string, patch: Partial<DeliverableDraft>) =>
    set('deliverables', brief.deliverables.map((d) => (d.key === key ? { ...d, ...patch, ...(patch.content_type && !needsDuration(patch.content_type) ? { duration_sec: null } : {}) } : d)))

  // ── autosave as a draft ──
  const latest = useRef({ brief, briefId, saving: false, dirty: false })
  latest.current.brief = brief
  latest.current.briefId = briefId

  const persist = useCallback(async (): Promise<string | null> => {
    const ref = latest.current
    if (!userId || ref.brief.title.trim().length < 2) return ref.briefId
    if (ref.saving) {
      ref.dirty = true // a save is running; run once more when it finishes
      return ref.briefId
    }
    ref.saving = true
    setSave((s) => ({ ...s, state: 'saving' }))
    try {
      const savedId = await saveBrief(ref.brief, ref.briefId, userId)
      if (!ref.briefId) {
        ref.briefId = savedId
        setBriefId(savedId)
        // Reflect the draft in the address bar without remounting the form, so a refresh reopens it.
        window.history.replaceState(window.history.state, '', `/briefs/${savedId}/edit`)
      }
      setSave({ state: 'saved', at: new Date() })
      return savedId
    } catch (err) {
      setSave({ state: 'error', message: (err as Error).message })
      return ref.briefId
    } finally {
      ref.saving = false
      if (ref.dirty) {
        ref.dirty = false
        void persist()
      }
    }
  }, [userId])

  const firstRender = useRef(true)
  useEffect(() => {
    if (phase !== 'form') return
    if (firstRender.current) {
      firstRender.current = false
      if (routeId) return // just loaded from the database; nothing to save yet
    }
    const timer = setTimeout(() => void persist(), 1800)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brief, phase])

  // ── AI builder ──
  function applyResult(result: BuilderResult, keepEdits: boolean) {
    const next: BriefDraft = { ...result.brief, status: brief.status }
    const kept = keepEdits ? [...edited] : []
    for (const f of kept) (next as any)[f] = brief[f]
    setBrief(next)
    // The brand name is only "AI suggested" if the AI actually came up with it.
    const typedBrand = (ideaBrand || brief.brand_name).trim()
    setAiFields(new Set(filledFields(result.brief).filter((f) => !kept.includes(f) && !(f === 'brand_name' && typedBrand === result.brief.brand_name))))
    setEdited(new Set(kept))
    setAssumptions(result.assumptions.filter((a) => !kept.includes(a.field as BriefField)))
    setQuestions(result.questions)
    setAnswers({})
    setPending(null)
    setErrors({})
    setCheck({ busy: false })
    setPhase('form')
    setStep('basics')
    window.scrollTo({ top: 0 })
  }

  async function build(withAnswers?: { question: string; answer: string }[]) {
    const text = (phase === 'idea' ? idea : brief.raw_idea || idea).trim()
    if (text.length < 10) return setAiNotice('Describe your idea in at least a few words first.')
    setAiNotice(null)
    setBuilding(0)
    const ticker = setInterval(() => setBuilding((s) => (s == null ? s : Math.min(s + 1, BUILD_STAGES.length - 1))), 2200)
    let result: BuilderResult | null = null
    let message = 'The AI could not build the brief this time. Your idea is kept below, so you can fill the rest in yourself or try again.'
    try {
      const { ok, json } = await authedPost('/api/ai/brief-builder', {
        idea: text,
        brandName: phase === 'idea' ? ideaBrand : brief.brand_name || ideaBrand,
        budget: phase === 'idea' ? Number(ideaBudget) || null : null,
        answers: withAnswers ?? [],
      })
      if (ok && json?.brief) result = json as unknown as BuilderResult
      else if (json?.error) message = json.error
    } catch {
      // network error or timeout: fall through to the manual form
    }
    clearInterval(ticker)
    setBuilding(null)

    if (!result) {
      // Graceful failure: never lose the idea, open the manual form.
      if (phase === 'idea') {
        setBrief((b) => ({ ...b, raw_idea: text, brand_name: b.brand_name || ideaBrand, budget_max: b.budget_max ?? (Number(ideaBudget) || null) }))
        setPhase('form')
      }
      return setAiNotice(message)
    }
    // Never overwrite what the user typed without asking.
    if (phase === 'form' && edited.size > 0) return setPending(result)
    applyResult(result, false)
  }

  function startOver() {
    setBrief({ ...emptyBrief(), brand_name: ideaBrand })
    setAiFields(new Set())
    setEdited(new Set())
    setAssumptions([])
    setQuestions([])
    setAnswers({})
    setErrors({})
    setCheck({ busy: false })
    setAiNotice(null)
    setConfirmReset(false)
    setStep('basics')
    setPhase('choose')
  }

  // ── navigation between steps ──
  const stepIndex = STEPS.findIndex((s) => s.id === step)
  function goTo(target: StepId) {
    const targetIndex = STEPS.findIndex((s) => s.id === target)
    if (targetIndex > stepIndex) {
      // Moving forward: every step in between must be valid.
      for (const s of STEPS.slice(stepIndex, targetIndex)) {
        const problems = validateStep(brief, s.id)
        if (Object.keys(problems).length) {
          setErrors(problems)
          setStep(s.id)
          return
        }
      }
    }
    setErrors({})
    setStep(target)
    void persist()
    window.scrollTo({ top: 0 })
  }

  async function runCheck() {
    setCheck({ busy: true })
    try {
      const { json } = await authedPost('/api/ai/brief-check', { brief })
      if (json?.items) return setCheck({ busy: false, items: json.items as CheckItem[], aiAvailable: !!json.aiAvailable })
    } catch {
      // fall through
    }
    setCheck({ busy: false, items: ruleChecks(brief), aiAvailable: false })
  }

  async function finish(status: BriefDraft['status']) {
    if (status === 'open') {
      const problems = publishProblems(brief)
      if (problems.length) {
        setErrors(Object.fromEntries(problems.map((p) => [p.field, p.message])))
        setStep(problems[0].step)
        return window.scrollTo({ top: 0 })
      }
    }
    setPublishing(true)
    latest.current.brief = { ...brief, status }
    setBrief(latest.current.brief)
    const savedId = await persist()
    setPublishing(false)
    if (savedId && latest.current.saving === false) navigate(status === 'open' ? `/briefs/${savedId}` : '/dashboard/brand')
  }

  async function continueAsDemoBrand() {
    setDemoBusy(true)
    setDemoError(null)
    const { error } = await supabase.auth.signInWithPassword(DEMO_BRAND)
    setDemoBusy(false)
    if (error) setDemoError(error.message)
  }

  // ───────────── gates ─────────────
  if (authLoading) return <Spinner />
  if (!session || role !== 'brand')
    return (
      <PageContainer className="!max-w-2xl">
        <Card ticket notchY="6.5rem" className="!p-7 sm:!p-9 text-center">
          <div className="dots mx-auto h-9 w-9" aria-hidden />
          <h1 className="display mt-4 text-2xl sm:text-3xl">Create a creative brief</h1>
          <p className="mt-2 text-ink-soft">
            {session ? 'Briefs are written by brand accounts, and you are logged in as a creator.' : 'Describe a rough idea and BRIVIO turns it into a complete brief. You need a brand account to save it.'}
          </p>
          <div className="mt-7 border-t border-dashed border-ink/25 pt-6 flex flex-col items-center gap-3">
            <Button size="lg" icon={<ArrowIcon />} onClick={continueAsDemoBrand} disabled={demoBusy}>{demoBusy ? 'Signing in…' : 'Continue with demo brand'}</Button>
            <p className="text-xs text-ink-soft">One click, no sign-up. The demo brand already has sample briefs.</p>
            {!session && <Link to="/login" className="text-sm font-bold underline underline-offset-4 hover:text-brand">Log in or create a brand account</Link>}
            {session && <Link to="/briefs" className="text-sm font-bold underline underline-offset-4 hover:text-brand">Browse open briefs instead</Link>}
            {demoError && <Notice tone="error">{demoError}</Notice>}
          </div>
        </Card>
      </PageContainer>
    )
  if (phase === 'loading') return <Spinner label="Loading brief…" />
  if (phase === 'missing') return <EmptyState title="Brief not found" action={{ to: '/dashboard/brand', label: 'My briefs' }} />
  if (phase === 'forbidden') return <EmptyState title="Not your brief" body="Only the brand that wrote a brief can edit it." action={{ to: `/briefs/${routeId}`, label: 'View the brief' }} />

  // ───────────── start screen ─────────────
  if (phase === 'choose')
    return (
      <PageContainer className="!max-w-4xl">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand">New brief</p>
        <h1 className="display mt-2 text-3xl sm:text-5xl">How do you want to start?</h1>
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-5">
          <button type="button" onClick={() => setPhase('idea')} className="group rounded-card bg-ink p-7 text-left text-cream shadow-card transition-transform hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue">
            <Badge tone="orange">Recommended</Badge>
            <h2 className="display mt-4 text-2xl">✦ Start from a rough idea</h2>
            <p className="mt-3 text-cream/80">Type one or two sentences. AI drafts the whole brief: deliverables, formats, usage rights, budget. You review and edit everything.</p>
            <p className="mt-5 rounded-btn bg-cream/10 p-3 text-sm italic text-cream/70">“{IDEA_PLACEHOLDER}”</p>
            <span className="mt-6 inline-flex items-center gap-2 display text-xs tracking-normal text-brand">Use the AI builder <ArrowIcon /></span>
          </button>
          <button type="button" onClick={() => setPhase('form')} className="group rounded-card bg-cream p-7 text-left shadow-card transition-transform hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue">
            <Badge tone="muted">5 short steps</Badge>
            <h2 className="display mt-4 text-2xl">Fill it in myself</h2>
            <p className="mt-3 text-ink-soft">Go through basics, creative direction, deliverables, commercial use and budget. A completeness meter shows what is still missing.</p>
            <ul className="mt-5 space-y-1 text-sm font-semibold">{STEPS.map((s, i) => <li key={s.id}><span className="text-brand">{i + 1}.</span> {s.label}</li>)}</ul>
            <span className="mt-6 inline-flex items-center gap-2 display text-xs tracking-normal">Open the form <ArrowIcon /></span>
          </button>
        </div>
      </PageContainer>
    )

  // ───────────── AI: rough idea ─────────────
  if (phase === 'idea')
    return (
      <PageContainer className="!max-w-3xl">
        <button type="button" onClick={() => setPhase('choose')} className="text-sm font-semibold text-ink-soft hover:text-brand">← Back</button>
        <p className="mt-4 text-xs font-bold uppercase tracking-[0.18em] text-brand">AI brief builder</p>
        <h1 className="display mt-2 text-3xl sm:text-5xl">Tell us the rough idea</h1>
        <p className="mt-3 text-ink-soft">Write it the way you would say it. Mention the product, the length or format, the feel, and where it will run if you know.</p>

        <Card className="mt-6 space-y-5">
          <Textarea
            label="Your idea" rows={5} value={idea} onChange={(e) => setIdea(e.target.value)} placeholder={IDEA_PLACEHOLDER} maxLength={2000} disabled={building != null}
            className="!text-base" hint={`${idea.length}/2000 · any language is fine`}
          />
          <div className="flex flex-wrap gap-1.5">
            {[IDEA_PLACEHOLDER, '5 product photos of our vitamin C serum for our website, clean and minimal', 'Launch film for our electric scooter, 45 seconds for YouTube plus three vertical cutdowns'].map((e) => (
              <button key={e} type="button" disabled={building != null} onClick={() => setIdea(e)} className="rounded-lg bg-ink/[0.06] px-2.5 py-1 text-left text-xs font-semibold hover:bg-ink hover:text-cream">{e}</button>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Input label="Brand name (optional)" value={ideaBrand} onChange={(e) => setIdeaBrand(e.target.value)} disabled={building != null} />
            <Input label="Budget in INR (optional)" type="number" inputMode="numeric" min={0} step={1000} value={ideaBudget} onChange={(e) => setIdeaBudget(e.target.value)} placeholder="e.g. 25000" disabled={building != null} />
          </div>
          {aiNotice && <Notice tone="error">{aiNotice}</Notice>}
          {building != null ? (
            <div className="rounded-card bg-ink p-5 text-cream" role="status">
              <div className="flex items-center gap-3">
                <span className="h-5 w-5 rounded-full border-[3px] border-cream/25 border-t-brand animate-spin" />
                <span className="display text-sm">{BUILD_STAGES[building]}</span>
              </div>
              <div className="mt-4 h-1.5 rounded-full bg-cream/15"><div className="h-full rounded-full bg-brand transition-all duration-700" style={{ width: `${((building + 1) / BUILD_STAGES.length) * 92}%` }} /></div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button type="button" onClick={() => { setBrief((b) => ({ ...b, raw_idea: idea.trim() })); setPhase('form') }} className="text-sm font-bold underline underline-offset-4 hover:text-brand">Skip and fill it in myself</button>
              <Button size="lg" icon={<ArrowIcon />} onClick={() => build()} disabled={idea.trim().length < 10}>✦ Build my brief</Button>
            </div>
          )}
        </Card>
      </PageContainer>
    )

  // ───────────── the form ─────────────
  /** Field label with a required mark and, while untouched, an "AI suggested" marker. */
  const L = (text: string, field: BriefField, required = false): ReactNode => (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {text}
      {required && <span className="text-brand" title="Required">*</span>}
      {aiFields.has(field) && <span className="rounded bg-blue px-1.5 py-px text-[9px] font-bold normal-case tracking-normal text-white" title="Filled in by AI. Edit it to make it yours.">✦ AI suggested</span>}
    </span>
  )
  const hasAi = aiFields.size > 0 || assumptions.length > 0 || questions.length > 0
  const answered = questions.filter((q) => answers[q.question])

  return (
    <PageContainer>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/dashboard/brand" className="text-sm font-semibold text-ink-soft hover:text-brand">← My briefs</Link>
          <h1 className="display mt-2 text-2xl sm:text-4xl break-words">{brief.title.trim() || (routeId ? 'Edit brief' : 'New brief')}</h1>
        </div>
        <p className="text-xs font-semibold text-ink-soft" aria-live="polite">
          {save.state === 'saving' ? 'Saving draft…'
            : save.state === 'saved' ? `Saved ${brief.status === 'draft' ? 'as draft ' : ''}· ${save.at?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
            : save.state === 'error' ? <span className="text-brand-dark">Not saved: {save.message}</span>
            : 'Drafts save automatically once the brief has a title'}
        </p>
      </div>

      {/* Step progress */}
      <nav aria-label="Brief steps" className="mt-5">
        <ol className="flex gap-1.5 overflow-x-auto pb-1">
          {STEPS.map((s, i) => {
            const state = i === stepIndex ? 'current' : Object.keys(validateStep(brief, s.id)).length === 0 ? 'done' : 'todo'
            return (
              <li key={s.id} className="flex-1 min-w-[7.5rem]">
                <button type="button" onClick={() => goTo(s.id)} aria-current={state === 'current' ? 'step' : undefined} className="group block w-full text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue rounded">
                  <span className={`block h-1.5 rounded-full ${state === 'current' ? 'bg-brand' : state === 'done' ? 'bg-ink' : 'bg-ink/15'}`} />
                  <span className={`mt-1.5 block text-xs font-bold uppercase tracking-wider ${state === 'current' ? 'text-ink' : 'text-ink-soft group-hover:text-ink'}`}>
                    {state === 'done' ? '✓' : i + 1} {s.label}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </nav>

      {aiNotice && <div className="mt-4"><Notice tone="error">{aiNotice}</Notice></div>}

      {pending && (
        <Card tone="ink" className="mt-4 !p-5" >
          <h2 className="display text-lg">Keep your edits?</h2>
          <p className="mt-1 text-sm text-cream/80">The AI has a new version of the brief. You changed {edited.size} {edited.size === 1 ? 'field' : 'fields'} yourself. Nothing has been replaced yet.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => applyResult(pending, true)}>Keep my edits, update the rest</Button>
            <Button size="sm" variant="light" onClick={() => applyResult(pending, false)}>Replace everything</Button>
            <Button size="sm" variant="light" onClick={() => setPending(null)}>Cancel</Button>
          </div>
        </Card>
      )}

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem] gap-6 items-start">
        {/* ── step content ── */}
        <div className="min-w-0">
          <Card className="space-y-5">
            {step === 'basics' && (
              <>
                <h2 className="display text-xl">Basics</h2>
                <Input label={L('Brief title', 'title', true)} value={brief.title} onChange={(e) => set('title', e.target.value)} error={errors.title} placeholder="Diwali collection launch reel" maxLength={120} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <Input label={L('Brand name', 'brand_name', true)} value={brief.brand_name} onChange={(e) => set('brand_name', e.target.value)} error={errors.brand_name} maxLength={80} />
                  <Input label={L('Product or service', 'product')} value={brief.product} onChange={(e) => set('product', e.target.value)} placeholder="Diwali scented candle collection" maxLength={160} />
                </div>
                <Textarea label={L('Campaign goal', 'goal', true)} rows={2} value={brief.goal} onChange={(e) => set('goal', e.target.value)} error={errors.goal} placeholder="What should this campaign achieve?" maxLength={400} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <Input label={L('Target audience', 'target_audience')} value={brief.target_audience} onChange={(e) => set('target_audience', e.target.value)} placeholder="Women 25-40 who buy festive gifts online" maxLength={300} />
                  <Input label={L('Deadline', 'deadline', true)} type="date" min={today()} value={brief.deadline} onChange={(e) => set('deadline', e.target.value)} error={errors.deadline} />
                </div>
                <Input label={L('Key message', 'key_message')} value={brief.key_message} onChange={(e) => set('key_message', e.target.value)} placeholder="The one thing viewers should remember" maxLength={300} />
                {brief.raw_idea && (
                  <div className="rounded-btn bg-ink/[0.05] p-3.5">
                    <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">Your original idea</p>
                    <p className="mt-1 text-sm italic">“{brief.raw_idea}”</p>
                  </div>
                )}
              </>
            )}

            {step === 'creative' && (
              <>
                <h2 className="display text-xl">Creative direction</h2>
                <Field as="div" label={L('Main content type', 'content_type', true)} error={errors.content_type} hint="The deliverables in the next step can mix types.">
                  <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Main content type">
                    {CONTENT_TYPES.map((c) => (
                      <button key={c} type="button" role="radio" aria-checked={brief.content_type === c} onClick={() => set('content_type', c)}
                        className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${brief.content_type === c ? 'bg-ink text-cream' : 'bg-white ring-1 ring-inset ring-line hover:ring-[1.5px] hover:ring-ink'}`}>
                        {c}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field as="div" label={L('Style tags', 'style_tags', true)} error={errors.style_tags} hint="Type a tag and press Enter, e.g. cinematic, pastel, festive.">
                  <TagInput value={brief.style_tags} onChange={(v) => set('style_tags', v)} placeholder="cinematic" max={8} />
                </Field>
                <Input label={L('Mood', 'mood')} value={brief.mood} onChange={(e) => set('mood', e.target.value)} placeholder="Cosy and celebratory" maxLength={120} />
                <Field as="div" label={L('Style reference links', 'style_references')} hint="Paste a link and press Enter. Reels, films or images you like.">
                  <TagInput value={brief.style_references} onChange={(v) => set('style_references', v.filter((u) => /^https?:\/\/\S+\.\S+/.test(u)))} placeholder="https://…" max={5} />
                </Field>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <Textarea label={L('Must include', 'mandatory_elements')} rows={2} value={brief.mandatory_elements} onChange={(e) => set('mandatory_elements', e.target.value)} placeholder="Logo end card, tagline, product shot" maxLength={300} />
                  <Textarea label={L('Things to avoid', 'avoid')} rows={2} value={brief.avoid} onChange={(e) => set('avoid', e.target.value)} placeholder="Fireworks, crowded scenes" maxLength={300} />
                </div>
                <Field as="div" label={L('Required tools', 'required_tools')} hint="Only if a specific tool matters. Each one narrows who can apply.">
                  <ChipPicker options={TOOLS} value={brief.required_tools as (typeof TOOLS)[number][]} onChange={(v) => set('required_tools', v)} />
                </Field>
                <Field as="div" label={L('Tools not to use', 'excluded_tools')} error={errors.excluded_tools} hint="For example tools your legal team has not approved.">
                  <ChipPicker options={TOOLS} value={brief.excluded_tools as (typeof TOOLS)[number][]} onChange={(v) => set('excluded_tools', v)} />
                </Field>
              </>
            )}

            {step === 'format' && (
              <>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 className="display text-xl">{L('Format and deliverables', 'deliverables', true)}</h2>
                    <p className="mt-1 text-sm text-ink-soft">List every piece you need. For example one 30s 16:9 film plus three 15s 9:16 cutdowns.</p>
                  </div>
                  <Button size="sm" variant="dark" onClick={() => set('deliverables', [...brief.deliverables, newDeliverable({ content_type: brief.content_type })])} disabled={brief.deliverables.length >= 8}>+ Add deliverable</Button>
                </div>
                <ol className="space-y-3">
                  {brief.deliverables.map((d, i) => {
                    const problem = errors.deliverables ? deliverableProblem(d) : null
                    return (
                      <li key={d.key} className={`rounded-xl bg-white p-3.5 ring-1 ${problem ? 'ring-brand-dark' : 'ring-line'}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="display flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-cream text-xs">{i + 1}</span>
                          <button type="button" onClick={() => set('deliverables', brief.deliverables.filter((x) => x.key !== d.key))} disabled={brief.deliverables.length === 1} aria-label={`Remove deliverable ${i + 1}`}
                            className="h-8 px-3 rounded-lg bg-ink/[0.07] text-xs font-bold hover:bg-brand hover:text-white disabled:opacity-30 disabled:hover:bg-ink/[0.07] disabled:hover:text-ink">Remove</button>
                        </div>
                        <div className="mt-3 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-4">
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            <div className="col-span-2 sm:col-span-1"><Select label="Content type" options={CONTENT_TYPES} placeholder="Choose…" value={d.content_type} onChange={(e) => setDeliverable(d.key, { content_type: e.target.value })} /></div>
                            <Input label="Duration (sec)" type="number" inputMode="numeric" min={1} value={d.duration_sec ?? ''} disabled={!!d.content_type && !needsDuration(d.content_type)}
                              placeholder={d.content_type && !needsDuration(d.content_type) ? 'n/a' : '30'} onChange={(e) => setDeliverable(d.key, { duration_sec: e.target.value ? Number(e.target.value) : null })} />
                            <Input label="Quantity" type="number" inputMode="numeric" min={1} max={50} value={d.quantity} onChange={(e) => setDeliverable(d.key, { quantity: Math.max(1, Number(e.target.value) || 1) })} />
                          </div>
                          <div>
                            <span className="block text-xs font-bold uppercase tracking-wider mb-1.5">Aspect ratio</span>
                            <AspectPicker label={`Aspect ratio for deliverable ${i + 1}`} value={d.aspect_ratio} onChange={(r) => setDeliverable(d.key, { aspect_ratio: r })} />
                          </div>
                        </div>
                        <div className="mt-3"><Input label="Notes (optional)" value={d.notes} onChange={(e) => setDeliverable(d.key, { notes: e.target.value })} placeholder="Hero film, cutdowns for stories…" maxLength={200} /></div>
                        {problem && <p role="alert" className="mt-2 text-xs font-semibold text-brand-dark">Deliverable {i + 1}: {problem}.</p>}
                      </li>
                    )
                  })}
                </ol>
                {errors.deliverables && <Notice tone="error">{errors.deliverables}</Notice>}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 border-t border-line pt-5">
                  <Select label={L('Resolution', 'resolution')} options={RESOLUTIONS} placeholder="Choose…" value={brief.resolution} onChange={(e) => set('resolution', e.target.value)} hint="The quality you need the final files in." />
                  <Input label={L('Revision rounds', 'revision_rounds')} type="number" inputMode="numeric" min={0} max={10} value={brief.revision_rounds ?? ''} onChange={(e) => set('revision_rounds', e.target.value === '' ? null : Math.max(0, Math.min(10, Number(e.target.value))))} hint="How many rounds of changes are included in the price." />
                </div>
              </>
            )}

            {step === 'rights' && (
              <>
                <div>
                  <h2 className="display text-xl">Commercial use</h2>
                  <p className="mt-1 text-sm text-ink-soft">Where and how you will use the work. This is what creators price against, so be precise.</p>
                </div>
                <div className="rounded-card bg-ink p-4 text-cream">
                  <p className="text-xs font-bold uppercase tracking-wider text-brand">In plain English</p>
                  <p className="mt-1.5 text-sm leading-relaxed">{rightsSentence(brief)}</p>
                </div>
                <Field as="div" label={L('Usage platforms', 'usage_platforms', true)} error={errors.usage_platforms} hint="Everywhere the finished work will appear. Paid ads usually cost more than organic posts.">
                  <ChipPicker options={USAGE_PLATFORMS} value={brief.usage_platforms as (typeof USAGE_PLATFORMS)[number][]} onChange={(v) => set('usage_platforms', v)} />
                </Field>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <Select label={L('Territory', 'territory', true)} options={TERRITORIES} placeholder="Choose…" value={brief.territory} onChange={(e) => set('territory', e.target.value)} error={errors.territory} hint="The countries or regions where the work will be shown." />
                  <Select label={L('Rights duration', 'rights_duration', true)} options={RIGHTS_DURATIONS} placeholder="Choose…" value={brief.rights_duration} onChange={(e) => set('rights_duration', e.target.value)} error={errors.rights_duration} hint="How long you may keep using it. Perpetual means forever." />
                  <Select label={L('Who owns the work', 'ip_ownership', true)} options={options(IP_OWNERSHIP, IP_OWNERSHIP_LABELS)} placeholder="Choose…" value={brief.ip_ownership} onChange={(e) => set('ip_ownership', e.target.value)} error={errors.ip_ownership} hint="Owning it outright costs more than a licence to use it." />
                  <Select label={L('Real people in the work', 'real_people_likeness', true)} options={options(REAL_PEOPLE_LIKENESS, REAL_PEOPLE_LIKENESS_LABELS)} placeholder="Choose…" value={brief.real_people_likeness} onChange={(e) => set('real_people_likeness', e.target.value)} error={errors.real_people_likeness} hint="AI likenesses of real people need their written permission." />
                  <Select label={L('Music source', 'music_source', true)} options={options(MUSIC_SOURCES, MUSIC_SOURCE_LABELS)} placeholder="Choose…" value={brief.music_source} onChange={(e) => set('music_source', e.target.value)} error={errors.music_source} hint="Music has its own rights. Say where it should come from." />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 border-t border-line pt-4">
                  {([
                    ['exclusivity', 'Exclusive rights', 'The creator cannot reuse or resell this work to anyone else.'],
                    ['ai_voice_allowed', 'AI voice allowed', 'Voiceover may be generated or cloned with AI.'],
                    ['ai_disclosure_required', 'AI disclosure required', 'The work must be labelled as made with AI where it is shown.'],
                    ['credit_required', 'Creator credit required', 'You will credit the creator by name wherever you post it.'],
                    ['requires_tool_commercial_licence', 'Tool commercial licence required', 'The creator must use paid plans that allow commercial use.'],
                  ] as const).map(([field, title, help]) => (
                    <div key={field}>
                      <Switch checked={brief[field]} onChange={(v) => set(field, v)} label={L(title, field)} />
                      <p className="ml-14 text-xs text-ink-soft">{help}</p>
                    </div>
                  ))}
                </div>
                <Textarea label={L('Anything else about usage (optional)', 'rights_notes')} rows={2} value={brief.rights_notes} onChange={(e) => set('rights_notes', e.target.value)} placeholder="e.g. may be shown at trade events" maxLength={300} />
              </>
            )}

            {step === 'review' && (
              <>
                <h2 className="display text-xl">Budget</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <Input label={L('Minimum budget (INR)', 'budget_min', true)} type="number" inputMode="numeric" min={0} step={1000} value={brief.budget_min ?? ''} onChange={(e) => set('budget_min', e.target.value === '' ? null : Number(e.target.value))} error={errors.budget_min} placeholder="20000" />
                  <Input label={L('Maximum budget (INR)', 'budget_max', true)} type="number" inputMode="numeric" min={0} step={1000} value={brief.budget_max ?? ''} onChange={(e) => set('budget_max', e.target.value === '' ? null : Number(e.target.value))} error={errors.budget_max} placeholder="45000" hint="For all deliverables together." />
                </div>

                <div className="border-t border-line pt-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="display text-xl">Review</h2>
                    <Button size="sm" variant="outline" onClick={runCheck} disabled={check.busy}>{check.busy ? 'Checking…' : '✦ Check my brief'}</Button>
                  </div>
                  {check.items && (
                    <div className="mt-4 rounded-card bg-white p-4 ring-1 ring-line">
                      {check.items.length === 0 ? (
                        <p className="font-semibold">✓ No gaps or conflicts found. This brief is ready to publish.</p>
                      ) : (
                        <ul className="space-y-3">
                          {check.items.map((item, i) => (
                            <li key={i} className="flex gap-3">
                              <span className="mt-0.5 shrink-0"><Badge tone={item.kind === 'conflict' ? 'orange' : item.kind === 'gap' ? 'ink' : 'muted'}>{item.kind}</Badge></span>
                              <div className="min-w-0 flex-1">
                                <p className="font-bold leading-snug">{item.title}</p>
                                <p className="text-sm text-ink-soft">{item.detail}</p>
                              </div>
                              {item.step && item.step !== 'review' && <button type="button" onClick={() => goTo(item.step!)} className="shrink-0 self-start text-xs font-bold underline underline-offset-4 hover:text-brand">Fix</button>}
                            </li>
                          ))}
                        </ul>
                      )}
                      {check.aiAvailable === false && <p className="mt-3 text-xs text-ink-soft">The AI review was not available just now, so this list comes from BRIVIO's built-in checks.</p>}
                    </div>
                  )}
                  <div className="mt-5"><BriefSummary brief={brief} /></div>
                </div>
              </>
            )}

            {/* step footer */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
              {stepIndex > 0 ? <Button variant="outline" onClick={() => goTo(STEPS[stepIndex - 1].id)}>Back</Button> : <span />}
              {step !== 'review' ? (
                <Button variant="dark" icon={<ArrowIcon />} onClick={() => goTo(STEPS[stepIndex + 1].id)}>Next: {STEPS[stepIndex + 1].label}</Button>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => finish(brief.status === 'open' ? 'open' : 'draft')} disabled={publishing}>{brief.status === 'open' ? 'Save changes' : 'Save draft and exit'}</Button>
                  {brief.status !== 'open' && <Button icon={<ArrowIcon />} onClick={() => finish('open')} disabled={publishing}>{publishing ? 'Publishing…' : 'Publish brief'}</Button>}
                </div>
              )}
            </div>
            {step === 'review' && Object.values(errors).some(Boolean) && <Notice tone="error">Some required fields are missing. They are marked on the steps above.</Notice>}
          </Card>
        </div>

        {/* ── sidebar: completeness, AI panels ── */}
        <aside className="space-y-4 lg:sticky lg:top-6">
          <Card className="!p-5">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="display text-base">Completeness</h2>
              <span className="display text-2xl text-brand">{meter.percent}%</span>
            </div>
            <div className="mt-2 h-2.5 rounded-full bg-ink/10" role="progressbar" aria-valuenow={meter.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Brief completeness">
              <div className="h-full rounded-full bg-lime ring-1 ring-ink/15 transition-all" style={{ width: `${meter.percent}%` }} />
            </div>
            {meter.missing.length === 0 ? (
              <p className="mt-3 text-sm font-semibold">✓ Everything a creator needs is here.</p>
            ) : (
              <ul className="mt-3 space-y-1.5">
                {meter.missing.slice(0, 7).map((m) => (
                  <li key={m.field}>
                    <button type="button" onClick={() => goTo(m.step)} className="flex w-full items-start gap-2 text-left text-sm hover:text-brand">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
                      <span className="font-semibold">{m.todo}</span>
                    </button>
                  </li>
                ))}
                {meter.missing.length > 7 && <li className="text-xs text-ink-soft">and {meter.missing.length - 7} more</li>}
              </ul>
            )}
          </Card>

          {questions.length > 0 && (
            <Card tone="ink" className="!p-5">
              <h2 className="display text-base">Quick questions</h2>
              <p className="mt-1 text-xs text-cream/70">The AI had to guess these. Answer any of them to sharpen the brief.</p>
              <div className="mt-3 space-y-4">
                {questions.map((q) => (
                  <fieldset key={q.question}>
                    <legend className="text-sm font-semibold">{q.question}</legend>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {q.options.map((o) => {
                        const on = answers[q.question] === o
                        return (
                          <button key={o} type="button" aria-pressed={on} onClick={() => setAnswers((a) => ({ ...a, [q.question]: on ? '' : o }))}
                            className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${on ? 'bg-brand text-white' : 'bg-cream/15 hover:bg-cream/25'}`}>{o}</button>
                        )
                      })}
                    </div>
                  </fieldset>
                ))}
              </div>
              <div className="mt-4">
                <Button size="sm" full disabled={answered.length === 0 || building != null} onClick={() => build(answered.map((q) => ({ question: q.question, answer: answers[q.question] })))}>
                  {building != null ? 'Updating…' : `Update brief with ${answered.length || 'my'} ${answered.length === 1 ? 'answer' : 'answers'}`}
                </Button>
              </div>
            </Card>
          )}

          {assumptions.length > 0 && (
            <Card className="!p-5">
              <h2 className="display text-base">Assumptions</h2>
              <p className="mt-1 text-xs text-ink-soft">What the AI guessed because your idea did not say. Check each one.</p>
              <ul className="mt-3 space-y-2.5">
                {assumptions.map((a, i) => (
                  <li key={i} className="flex gap-2 text-sm"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue" aria-hidden /><span>{a.note}</span></li>
                ))}
              </ul>
            </Card>
          )}

          {(hasAi || brief.raw_idea) && (
            <Card className="!p-5">
              <h2 className="display text-base">AI builder</h2>
              {confirmReset ? (
                <>
                  <p className="mt-2 text-sm">Start over and clear this form? {briefId ? 'The saved draft stays in My briefs until you overwrite or delete it.' : ''}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" onClick={startOver}>Yes, start over</Button>
                    <Button size="sm" variant="outline" onClick={() => setConfirmReset(false)}>Cancel</Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="mt-1 text-xs text-ink-soft">{aiFields.size > 0 ? `${aiFields.size} fields are still as the AI suggested.` : 'Build this brief again from your original idea.'} Your own edits are never replaced without asking.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="dark" onClick={() => build()} disabled={building != null || brief.raw_idea.trim().length < 10}>{building != null ? 'Working…' : '✦ Regenerate'}</Button>
                    <Button size="sm" variant="outline" onClick={() => (edited.size > 0 || hasAi ? setConfirmReset(true) : startOver())}>Start over</Button>
                  </div>
                </>
              )}
            </Card>
          )}
        </aside>
      </div>
    </PageContainer>
  )
}
