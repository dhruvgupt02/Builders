import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { callAi } from '../lib/ai'
import { readImage, uploadFile, validateFile } from '../lib/storage'
import { useCreatorGate } from '../lib/useCreatorGate'
import { SKILLS, SPECIALIZATIONS, TOOLS, type Skill, type Specialization, type Tool } from '../lib/taxonomy'
import {
  ArrowIcon, Avatar, Button, Card, ChipPicker, Field, Input, Notice, PageContainer, PageHeader, Select, Spinner, Tabs, TagInput, Textarea,
} from '../components/ui'

const AVAILABILITY = ['Available now', 'Booking 2 weeks out', 'Limited availability', 'Not taking new work'] as const

const STEPS = [
  { id: 'about', label: '1. About you' },
  { id: 'craft', label: '2. Your craft' },
] as const
type StepId = (typeof STEPS)[number]['id']

interface Form {
  name: string
  headline: string
  bio: string
  city: string
  languages: string[]
  priceMin: string
  priceMax: string
  availability: string
  avatarUrl: string | null
  specializations: Specialization[]
  skills: Skill[]
  tools: Tool[]
}

const EMPTY: Form = {
  name: '', headline: '', bio: '', city: '', languages: [], priceMin: '', priceMax: '', availability: AVAILABILITY[0],
  avatarUrl: null, specializations: [], skills: [], tools: [],
}

type Errors = Partial<Record<keyof Form | 'price', string>>

function validateAbout(f: Form): Errors {
  const e: Errors = {}
  if (f.name.trim().length < 2) e.name = 'Enter the name brands should see.'
  if (f.headline.trim().length < 10) e.headline = 'Add a one-line headline (at least 10 characters).'
  else if (f.headline.length > 120) e.headline = 'Keep the headline under 120 characters.'
  if (f.bio.trim().length < 40) e.bio = 'Write at least a couple of sentences (40 characters or more).'
  if (!f.city.trim()) e.city = 'Enter your city.'
  if (!f.languages.length) e.languages = 'Add at least one language you work in.'
  const min = Number(f.priceMin)
  const max = Number(f.priceMax)
  if (!f.priceMin || !f.priceMax || !Number.isFinite(min) || !Number.isFinite(max)) e.price = 'Enter both a minimum and a maximum price in INR.'
  else if (min < 500) e.price = 'Minimum price must be at least ₹500.'
  else if (max < min) e.price = 'Maximum price must be the same as or higher than the minimum.'
  return e
}

function validateCraft(f: Form): Errors {
  const e: Errors = {}
  if (!f.specializations.length) e.specializations = 'Choose at least one specialization.'
  if (!f.skills.length) e.skills = 'Choose at least one skill.'
  if (!f.tools.length) e.tools = 'Choose at least one tool you work with.'
  return e
}

export default function CreatorOnboarding() {
  const navigate = useNavigate()
  const { gate, userId, creatorId, refresh } = useCreatorGate({ needProfile: false })
  const [form, setForm] = useState<Form>(EMPTY)
  const [loaded, setLoaded] = useState(false)
  const [step, setStep] = useState<StepId>('about')
  const [errors, setErrors] = useState<Errors>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [ai, setAi] = useState<{ busy: boolean; suggestion?: string; error?: string }>({ busy: false })

  const editing = !!creatorId
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }))

  // Edit mode: load the existing creator row. New creators start from their account name.
  useEffect(() => {
    if (gate || !userId) return
    let cancelled = false
    ;(async () => {
      if (creatorId) {
        const { data } = await supabase.from('creators').select('*').eq('id', creatorId).maybeSingle()
        if (data && !cancelled)
          setForm({
            name: data.name ?? '', headline: data.headline ?? '', bio: data.bio ?? '', city: data.city ?? '',
            languages: data.languages ?? [], priceMin: data.price_min?.toString() ?? '', priceMax: data.price_max?.toString() ?? '',
            availability: data.availability ?? AVAILABILITY[0], avatarUrl: data.avatar_url ?? null,
            specializations: data.specializations ?? [], skills: data.skills ?? [], tools: data.tools ?? [],
          })
      } else {
        const { data } = await supabase.from('profiles').select('name, city').eq('id', userId).maybeSingle()
        if (data && !cancelled) setForm((f) => ({ ...f, name: data.name ?? '', city: data.city ?? '' }))
      }
      if (!cancelled) setLoaded(true)
    })()
    return () => {
      cancelled = true
    }
  }, [gate, userId, creatorId])

  if (gate) return gate
  if (!loaded) return <Spinner label="Loading your profile…" />

  async function onAvatar(file: File) {
    const problem = validateFile(file, ['image'], 5)
    if (problem) return setErrors((e) => ({ ...e, avatarUrl: problem }))
    setAvatarBusy(true)
    try {
      const { thumbnail } = await readImage(file, 400)
      set('avatarUrl', await uploadFile('portfolio-media', thumbnail, userId!, 'jpg'))
      setErrors((e) => ({ ...e, avatarUrl: undefined }))
    } catch (err) {
      setErrors((e) => ({ ...e, avatarUrl: (err as Error).message }))
    }
    setAvatarBusy(false)
  }

  async function polishBio() {
    setAi({ busy: true })
    const res = await callAi('polish-bio', {
      bio: form.bio, name: form.name, headline: form.headline, specializations: form.specializations, tools: form.tools, skills: form.skills,
    })
    setAi(res.ok ? { busy: false, suggestion: res.text } : { busy: false, error: res.error })
  }

  function goToCraft() {
    const e = validateAbout(form)
    setErrors(e)
    if (!Object.keys(e).length) {
      setStep('craft')
      window.scrollTo({ top: 0 })
    }
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault()
    const about = validateAbout(form)
    const craft = validateCraft(form)
    setErrors({ ...about, ...craft })
    if (Object.keys(about).length) return setStep('about')
    if (Object.keys(craft).length) return

    setSaving(true)
    setSaveError(null)
    const row = {
      name: form.name.trim(), headline: form.headline.trim(), bio: form.bio.trim(), city: form.city.trim(), languages: form.languages,
      price_min: Math.round(Number(form.priceMin)), price_max: Math.round(Number(form.priceMax)), availability: form.availability,
      avatar_url: form.avatarUrl, specializations: form.specializations, skills: form.skills, tools: form.tools,
      embedding: null, // text changed: `npm run embed` re-embeds rows without an embedding
    }
    const result = creatorId
      ? await supabase.from('creators').update(row).eq('id', creatorId)
      : await supabase.from('creators').insert({ ...row, profile_id: userId, is_sample: false })
    if (result.error) {
      setSaving(false)
      return setSaveError(`Your profile could not be saved: ${result.error.message}`)
    }
    await supabase.from('profiles').update({ name: row.name, city: row.city, avatar_url: row.avatar_url }).eq('id', userId!)
    await refresh()
    navigate('/dashboard/creator')
  }

  return (
    <PageContainer className="!max-w-3xl">
      <PageHeader
        eyebrow="For creators"
        title={editing ? 'Edit your profile' : 'Create your profile'}
        subtitle="This is what brands see when they discover you on BRIVIO."
      />

      <div className="mt-6">
        <Tabs tabs={STEPS} active={step} onChange={(id) => (id === 'craft' ? goToCraft() : setStep('about'))} />
      </div>

      <form onSubmit={onSubmit} noValidate className="mt-5">
        {step === 'about' ? (
          <Card className="space-y-5">
            <div className="flex items-center gap-4">
              <Avatar src={form.avatarUrl} name={form.name || 'B'} size="lg" />
              <div>
                <label className="inline-flex h-9 cursor-pointer items-center rounded-btn bg-ink px-4 text-cream display tracking-normal text-[11px] hover:bg-bark">
                  {avatarBusy ? 'Uploading…' : form.avatarUrl ? 'Change photo' : 'Add a photo'}
                  <input type="file" accept="image/*" className="sr-only" disabled={avatarBusy} onChange={(e) => e.target.files?.[0] && onAvatar(e.target.files[0])} />
                </label>
                <p className={`mt-1.5 text-xs ${errors.avatarUrl ? 'font-semibold text-brand-dark' : 'text-ink-soft'}`}>
                  {errors.avatarUrl ?? 'Optional. Square image, up to 5 MB.'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Input label="Name" value={form.name} onChange={(e) => set('name', e.target.value)} error={errors.name} autoComplete="name" />
              <Input label="City" value={form.city} onChange={(e) => set('city', e.target.value)} error={errors.city} placeholder="Mumbai" />
            </div>
            <Input
              label="Headline" value={form.headline} onChange={(e) => set('headline', e.target.value)} error={errors.headline}
              placeholder="AI ad films for D2C brands, from prompt to final cut" hint={`${form.headline.length}/120`} maxLength={140}
            />

            <div>
              <Textarea
                label="Bio" rows={5} value={form.bio} onChange={(e) => set('bio', e.target.value)} error={errors.bio}
                placeholder="What you make, who you make it for, and what brands can expect from working with you."
              />
              <div className="mt-2.5 flex flex-wrap items-center gap-3">
                <Button type="button" size="sm" variant="outline" onClick={polishBio} disabled={ai.busy || form.bio.trim().length < 20}>
                  {ai.busy ? 'Polishing…' : '✦ Polish my bio with AI'}
                </Button>
                {form.bio.trim().length < 20 && <span className="text-xs text-ink-soft">Write a draft first, then let AI tidy it.</span>}
              </div>
              {ai.error && <div className="mt-3"><Notice tone="error">{ai.error}</Notice></div>}
              {ai.suggestion && (
                <div className="mt-3 rounded-card bg-ink text-cream p-4">
                  <p className="display text-[10px] text-brand">AI suggestion</p>
                  <p className="mt-2 text-sm leading-relaxed whitespace-pre-line">{ai.suggestion}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button type="button" size="sm" onClick={() => { set('bio', ai.suggestion!); setAi({ busy: false }) }}>Use this bio</Button>
                    <Button type="button" size="sm" variant="light" onClick={() => setAi({ busy: false })}>Discard</Button>
                  </div>
                </div>
              )}
            </div>

            <Field as="div" label="Languages" error={errors.languages} hint="Type a language and press Enter.">
              <TagInput value={form.languages} onChange={(v) => set('languages', v)} placeholder="English, Hindi…" max={8} />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <Input label="Min price (INR)" type="number" inputMode="numeric" min={0} step={500} value={form.priceMin} onChange={(e) => set('priceMin', e.target.value)} placeholder="5000" aria-invalid={!!errors.price} />
              <Input label="Max price (INR)" type="number" inputMode="numeric" min={0} step={500} value={form.priceMax} onChange={(e) => set('priceMax', e.target.value)} placeholder="40000" aria-invalid={!!errors.price} />
              <Select label="Availability" options={AVAILABILITY} value={form.availability} onChange={(e) => set('availability', e.target.value)} />
            </div>
            {errors.price ? <Notice tone="error">{errors.price}</Notice> : <p className="text-xs text-ink-soft">Your typical price range for one project.</p>}

            <div className="flex justify-end border-t border-line pt-5">
              <Button type="button" variant="dark" icon={<ArrowIcon />} onClick={goToCraft}>Next: your craft</Button>
            </div>
          </Card>
        ) : (
          <Card className="space-y-7">
            <Field as="div" label="Specializations" error={errors.specializations} hint="The kinds of work you want to be hired for.">
              <ChipPicker options={SPECIALIZATIONS} value={form.specializations} onChange={(v) => set('specializations', v)} />
            </Field>
            <Field as="div" label="Skills" error={errors.skills}>
              <ChipPicker options={SKILLS} value={form.skills} onChange={(v) => set('skills', v)} />
            </Field>
            <Field as="div" label="Tools and models" error={errors.tools} hint="Only pick tools you can show work for. You can request verification from your dashboard.">
              <ChipPicker options={TOOLS} value={form.tools} onChange={(v) => set('tools', v)} />
            </Field>

            {saveError && <Notice tone="error">{saveError}</Notice>}
            <div className="flex flex-wrap justify-between gap-3 border-t border-line pt-5">
              <Button type="button" variant="outline" onClick={() => setStep('about')}>Back</Button>
              <Button type="submit" icon={<ArrowIcon />} disabled={saving}>{saving ? 'Saving…' : editing ? 'Save profile' : 'Create profile'}</Button>
            </div>
          </Card>
        )}
      </form>
    </PageContainer>
  )
}
