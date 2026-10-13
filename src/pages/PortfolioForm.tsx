import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { callAi, embedRow } from '../lib/ai'
import { MAX_MEDIA_MB, nearestAspect, readImage, readVideo, uploadFile, validateFile } from '../lib/storage'
import { useCreatorGate } from '../lib/useCreatorGate'
import {
  ASPECT_RATIOS, COMMERCIAL_USE_LABELS, COMMERCIAL_USE_STATUSES, CONTENT_TYPES, TOOLS, type CommercialUseStatus, type Tool,
} from '../lib/taxonomy'
import type { PortfolioItem } from '../lib/types'
import {
  ArrowIcon, Button, Card, ChipPicker, EmptyState, Field, FileDrop, Input, Notice, PageContainer, PageHeader, Select, Spinner, TagInput, Textarea,
} from '../components/ui'

interface StepDraft {
  key: string
  id?: string // set for steps that already exist in the database
  tool: string
  action: string
  note: string
  imageUrl: string | null
  busy?: boolean
}

const newStep = (): StepDraft => ({ key: crypto.randomUUID(), tool: '', action: '', note: '', imageUrl: null })

interface Form {
  title: string
  description: string
  contentType: string
  aspectRatio: string
  duration: string
  resolution: string
  styleTags: string[]
  tools: Tool[]
  clientName: string
  commercial: CommercialUseStatus | ''
}

const EMPTY: Form = {
  title: '', description: '', contentType: '', aspectRatio: '', duration: '', resolution: '', styleTags: [], tools: [], clientName: '', commercial: '',
}

type Errors = Partial<Record<keyof Form | 'media' | 'thumbnail' | 'steps', string>>

const COMMERCIAL_OPTIONS = COMMERCIAL_USE_STATUSES.map((value) => ({ value, label: COMMERCIAL_USE_LABELS[value] }))

export default function PortfolioForm() {
  const { id } = useParams()
  const editing = !!id
  const navigate = useNavigate()
  const { gate, userId, creatorId } = useCreatorGate()

  const [form, setForm] = useState<Form>(EMPTY)
  const [steps, setSteps] = useState<StepDraft[]>([newStep()])
  const [removedStepIds, setRemovedStepIds] = useState<string[]>([])
  const [media, setMedia] = useState<{ type: 'image' | 'video'; file: File | null; preview: string } | null>(null)
  const [thumb, setThumb] = useState<{ blob: Blob | null; preview: string | null }>({ blob: null, preview: null })
  const [mediaBusy, setMediaBusy] = useState(false)
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'forbidden'>(editing ? 'loading' : 'ready')
  const [errors, setErrors] = useState<Errors>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [ai, setAi] = useState<{ busy: boolean; suggestion?: string; error?: string }>({ busy: false })

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }))
  const patchStep = (key: string, patch: Partial<StepDraft>) => setSteps((all) => all.map((s) => (s.key === key ? { ...s, ...patch } : s)))

  // Edit mode: load the item and make sure it belongs to this creator.
  useEffect(() => {
    if (!id || gate) return
    let cancelled = false
    supabase
      .from('portfolio_items')
      .select('*, workflow_steps(*)')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        const item = data as PortfolioItem | null
        if (!item) return setState('missing')
        if (item.creator_id !== creatorId) return setState('forbidden')
        setForm({
          title: item.title, description: item.description ?? '', contentType: item.content_type ?? '', aspectRatio: item.aspect_ratio ?? '',
          duration: item.duration_sec?.toString() ?? '', resolution: item.resolution ?? '', styleTags: item.style_tags ?? [],
          tools: (item.tools ?? []).filter((t): t is Tool => (TOOLS as readonly string[]).includes(t)),
          clientName: item.client_name ?? '', commercial: item.commercial_use_status ?? '',
        })
        const existing = [...(item.workflow_steps ?? [])].sort((a, b) => a.step_order - b.step_order)
        setSteps(existing.length ? existing.map((s) => ({ key: s.id, id: s.id, tool: s.tool, action: s.action, note: s.note ?? '', imageUrl: s.step_media_url })) : [newStep()])
        if (item.media_url) setMedia({ type: item.media_type, file: null, preview: item.media_url })
        setThumb({ blob: null, preview: item.thumbnail_url })
        setState('ready')
      })
    return () => {
      cancelled = true
    }
  }, [id, gate, creatorId])

  if (gate) return gate
  if (state === 'loading') return <Spinner label="Loading portfolio piece…" />
  if (state === 'missing') return <EmptyState title="Portfolio piece not found" action={{ to: '/dashboard/creator', label: 'Back to dashboard' }} />
  if (state === 'forbidden')
    return <EmptyState title="Not your piece" body="You can only edit portfolio pieces that belong to your own profile." action={{ to: '/dashboard/creator', label: 'Back to dashboard' }} />

  async function onMedia(file: File) {
    const problem = validateFile(file, ['image', 'video'])
    if (problem) return setErrors((e) => ({ ...e, media: problem }))
    setMediaBusy(true)
    try {
      const isVideo = file.type.startsWith('video/')
      const info = isVideo ? await readVideo(file) : await readImage(file)
      const still = 'thumbnail' in info ? info.thumbnail : info.poster
      setMedia({ type: isVideo ? 'video' : 'image', file, preview: URL.createObjectURL(file) })
      setThumb({ blob: still, preview: still ? URL.createObjectURL(still) : null })
      setForm((f) => ({
        ...f,
        resolution: info.width ? `${info.width}x${info.height}` : f.resolution,
        aspectRatio: info.width ? nearestAspect(info.width, info.height) : f.aspectRatio,
        duration: 'duration' in info && info.duration ? String(Math.max(1, Math.round(info.duration))) : isVideo ? f.duration : '',
        contentType: f.contentType || (isVideo ? 'Video' : 'Image'),
      }))
      setErrors((e) => ({ ...e, media: undefined, thumbnail: undefined }))
    } catch (err) {
      setErrors((e) => ({ ...e, media: (err as Error).message }))
    }
    setMediaBusy(false)
  }

  async function onThumbnail(file: File) {
    const problem = validateFile(file, ['image'], 5)
    if (problem) return setErrors((e) => ({ ...e, thumbnail: problem }))
    try {
      const { thumbnail } = await readImage(file)
      setThumb({ blob: thumbnail, preview: URL.createObjectURL(thumbnail) })
      setErrors((e) => ({ ...e, thumbnail: undefined }))
    } catch (err) {
      setErrors((e) => ({ ...e, thumbnail: (err as Error).message }))
    }
  }

  async function onStepImage(key: string, file: File) {
    const problem = validateFile(file, ['image'], 5)
    if (problem) return setErrors((e) => ({ ...e, steps: problem }))
    patchStep(key, { busy: true })
    try {
      const { thumbnail } = await readImage(file, 1200)
      patchStep(key, { imageUrl: await uploadFile('portfolio-media', thumbnail, userId!, 'jpg'), busy: false })
      setErrors((e) => ({ ...e, steps: undefined }))
    } catch (err) {
      patchStep(key, { busy: false })
      setErrors((e) => ({ ...e, steps: (err as Error).message }))
    }
  }

  function setStepTool(key: string, tool: string) {
    patchStep(key, { tool })
    // Keep "tools used" in sync with the workflow.
    if (tool && !form.tools.includes(tool as Tool)) set('tools', [...form.tools, tool as Tool])
  }

  function moveStep(index: number, by: -1 | 1) {
    setSteps((all) => {
      const next = [...all]
      const target = index + by
      if (target < 0 || target >= next.length) return all
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  function removeStep(step: StepDraft) {
    if (step.id) setRemovedStepIds((ids) => [...ids, step.id!])
    setSteps((all) => all.filter((s) => s.key !== step.key))
  }

  async function describeWithAi() {
    setAi({ busy: true })
    const res = await callAi('describe-item', {
      title: form.title, contentType: form.contentType, tools: form.tools, styleTags: form.styleTags,
      workflow: steps.filter((s) => s.tool || s.action).map((s) => ({ tool: s.tool, action: s.action, note: s.note })),
    })
    setAi(res.ok ? { busy: false, suggestion: res.text } : { busy: false, error: res.error })
  }

  function validate(): Errors {
    const e: Errors = {}
    if (form.title.trim().length < 3) e.title = 'Give the piece a title (at least 3 characters).'
    if (form.description.trim().length < 20) e.description = 'Describe the piece in a sentence or two (20 characters or more), or use the AI button.'
    if (!media) e.media = `Upload the image or video for this piece (up to ${MAX_MEDIA_MB} MB).`
    if (media?.type === 'video' && !thumb.preview) e.thumbnail = 'Add a thumbnail image for this video.'
    if (!form.contentType) e.contentType = 'Choose a content type.'
    if (!form.aspectRatio) e.aspectRatio = 'Choose an aspect ratio.'
    if (media?.type === 'video' && !(Number(form.duration) > 0)) e.duration = 'Enter the video length in seconds.'
    if (form.resolution && !/^\d{3,5}x\d{3,5}$/.test(form.resolution.trim())) e.resolution = 'Use width x height, for example 1920x1080.'
    if (!form.tools.length) e.tools = 'Choose at least one tool used to make this piece.'
    if (!form.commercial) e.commercial = 'Choose the commercial-use status.'
    if (form.commercial === 'client_delivered' && !form.clientName.trim()) e.clientName = 'Enter the client this was delivered to.'
    if (!steps.length) e.steps = 'Add at least one workflow step so brands can see how it was made.'
    else if (steps.some((s) => !s.tool || s.action.trim().length < 3)) e.steps = 'Every workflow step needs a tool and a short description of what you did.'
    else if (steps.some((s) => s.busy)) e.steps = 'Wait for the step image to finish uploading.'
    return e
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault()
    const e = validate()
    setErrors(e)
    if (Object.keys(e).length) {
      document.querySelector('[data-error-summary]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setSaveError(null)
    try {
      setSaving('Uploading media…')
      const mediaUrl = media!.file ? await uploadFile('portfolio-media', media!.file, userId!) : media!.preview
      const thumbnailUrl = thumb.blob ? await uploadFile('portfolio-media', thumb.blob, userId!, 'jpg') : thumb.preview

      setSaving('Saving…')
      const row = {
        title: form.title.trim(), description: form.description.trim(), media_type: media!.type, media_url: mediaUrl, thumbnail_url: thumbnailUrl,
        content_type: form.contentType, aspect_ratio: form.aspectRatio,
        duration_sec: Number(form.duration) > 0 ? Math.round(Number(form.duration)) : null,
        resolution: form.resolution.trim() || null, style_tags: form.styleTags, tools: form.tools,
        client_name: form.clientName.trim() || null, commercial_use_status: form.commercial,
        embedding: null, // text changed: `npm run embed` re-embeds rows without an embedding
      }
      let itemId = id
      if (itemId) {
        const { error } = await supabase.from('portfolio_items').update(row).eq('id', itemId)
        if (error) throw new Error(error.message)
      } else {
        const { data, error } = await supabase.from('portfolio_items').insert({ ...row, creator_id: creatorId }).select('id').single()
        if (error) throw new Error(error.message)
        itemId = data.id as string
      }

      // Workflow: update steps that exist, insert new ones, delete removed ones.
      const stepRow = (s: StepDraft, i: number) => ({
        portfolio_item_id: itemId, step_order: i + 1, tool: s.tool, action: s.action.trim(), note: s.note.trim() || null, step_media_url: s.imageUrl,
      })
      for (const [i, s] of steps.entries()) {
        if (!s.id) continue
        const { error } = await supabase.from('workflow_steps').update(stepRow(s, i)).eq('id', s.id)
        if (error) throw new Error(error.message)
      }
      const fresh = steps.flatMap((s, i) => (s.id ? [] : [stepRow(s, i)]))
      if (fresh.length) {
        const { error } = await supabase.from('workflow_steps').insert(fresh)
        if (error) throw new Error(error.message)
      }
      if (removedStepIds.length) {
        // Row-level security turns a delete it does not allow into "0 rows deleted" rather than an error.
        const { data: gone, error } = await supabase.from('workflow_steps').delete().in('id', removedStepIds).select('id')
        if (error || (gone?.length ?? 0) < removedStepIds.length) {
          setSaving(null)
          return setSaveError(
            'Your changes were saved, but the workflow steps you removed could not be deleted. ' +
              (error?.message ?? 'Step deletion is not switched on for this database yet (run supabase/migrations/003_creator_delete.sql).'),
          )
        }
      }

      void embedRow('portfolio_items', itemId!) // searchable right away; never blocks the save
      navigate(`/portfolio/${itemId}`)
    } catch (err) {
      setSaving(null)
      setSaveError(`This piece could not be saved: ${(err as Error).message}`)
    }
  }

  const errorList = Object.values(errors).filter(Boolean)

  return (
    <PageContainer className="!max-w-4xl">
      <Link to="/dashboard/creator" className="text-sm font-semibold text-ink-soft hover:text-brand">← Dashboard</Link>
      <div className="mt-4">
        <PageHeader
          eyebrow="Portfolio"
          title={editing ? 'Edit piece' : 'Add a piece'}
          subtitle="Show the work, the tools behind it and how it was made. Brands hire on BRIVIO because they can see the workflow."
        />
      </div>

      <form onSubmit={onSubmit} noValidate className="mt-6 space-y-6">
        {/* Media */}
        <Card ticket notchY="3.6rem">
          <h2 className="display text-lg text-center">Upload your work</h2>
          <p className="text-center text-sm text-ink-soft mt-1">Image or video, up to {MAX_MEDIA_MB} MB</p>
          <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-5 border-t border-dashed border-ink/25 pt-5">
            <div className="md:col-span-2">
              <Field as="div" label="Media" error={errors.media}>
                <FileDrop
                  accept="image/*,video/mp4,video/webm,video/quicktime"
                  onFile={onMedia}
                  busy={mediaBusy}
                  title="Drag and drop"
                  hint={media ? (media.file ? `${media.file.name} · ${(media.file.size / 1024 / 1024).toFixed(1)} MB` : 'Current file') : 'JPG, PNG, WebP, MP4 or WebM'}
                  preview={
                    media && (
                      <div className="overflow-hidden rounded-xl bg-ink">
                        {media.type === 'video' ? (
                          <video src={media.preview} controls className="mx-auto max-h-80 max-w-full" />
                        ) : (
                          <img src={media.preview} alt="Selected media" className="mx-auto max-h-80 max-w-full object-contain" />
                        )}
                      </div>
                    )
                  }
                />
              </Field>
            </div>
            <div>
              <Field
                as="div"
                label="Thumbnail"
                error={errors.thumbnail}
                hint={media?.type === 'video' ? 'Taken from the video. Upload your own to replace it.' : 'Made automatically from your image.'}
              >
                {media?.type === 'video' ? (
                  <FileDrop
                    compact
                    accept="image/*"
                    onFile={onThumbnail}
                    title="Thumbnail image"
                    hint="JPG or PNG, up to 5 MB"
                    preview={thumb.preview && <img src={thumb.preview} alt="Thumbnail" className="mx-auto max-h-36 rounded-lg" />}
                  />
                ) : (
                  <div className="mt-1.5 flex min-h-28 items-center justify-center rounded-card border-2 border-dashed border-ink/25 bg-cream p-3">
                    {thumb.preview ? <img src={thumb.preview} alt="Thumbnail" className="max-h-36 rounded-lg" /> : <p className="text-xs text-ink-soft">Appears after you add media</p>}
                  </div>
                )}
              </Field>
            </div>
          </div>
        </Card>

        {/* Details */}
        <Card className="space-y-5">
          <h2 className="display text-lg">Details</h2>
          <Input label="Title" value={form.title} onChange={(e) => set('title', e.target.value)} error={errors.title} placeholder="Monsoon chai — 30s brand spot" maxLength={120} />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Select label="Content type" options={CONTENT_TYPES} placeholder="Choose…" value={form.contentType} onChange={(e) => set('contentType', e.target.value)} error={errors.contentType} />
            <Select label="Aspect ratio" options={ASPECT_RATIOS} placeholder="Choose…" value={form.aspectRatio} onChange={(e) => set('aspectRatio', e.target.value)} error={errors.aspectRatio} />
            <Input
              label="Duration (seconds)" type="number" inputMode="numeric" min={1} value={form.duration} onChange={(e) => set('duration', e.target.value)} error={errors.duration}
              hint={media?.type === 'video' ? 'Read from your video.' : 'For video and animation only.'}
            />
            <Input label="Resolution" value={form.resolution} onChange={(e) => set('resolution', e.target.value)} error={errors.resolution} placeholder="1920x1080" hint="Width x height in pixels." />
          </div>

          <Field as="div" label="Tools used" error={errors.tools}>
            <ChipPicker options={TOOLS} value={form.tools} onChange={(v) => set('tools', v)} />
          </Field>

          <Field as="div" label="Style tags" hint="Type a tag and press Enter, e.g. cinematic, pastel, festive.">
            <TagInput value={form.styleTags} onChange={(v) => set('styleTags', v)} placeholder="cinematic" max={8} />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Select
              label="Commercial-use status" options={COMMERCIAL_OPTIONS} placeholder="Choose…" value={form.commercial}
              onChange={(e) => set('commercial', e.target.value as CommercialUseStatus | '')} error={errors.commercial}
            />
            <Input label="Client name" value={form.clientName} onChange={(e) => set('clientName', e.target.value)} error={errors.clientName} placeholder="Optional" hint="Shown publicly. Leave empty for personal work." />
          </div>
        </Card>

        {/* Workflow */}
        <Card>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="display text-lg">Workflow</h2>
              <p className="mt-1 text-sm text-ink-soft">The steps you took, in order. This is what sets a BRIVIO portfolio apart.</p>
            </div>
            <Button type="button" size="sm" variant="dark" onClick={() => setSteps((all) => [...all, newStep()])} disabled={steps.length >= 10}>+ Add step</Button>
          </div>

          <ol className="mt-5 space-y-3">
            {steps.map((s, i) => (
              <li key={s.key} className="rounded-xl bg-white p-3 sm:p-4 ring-1 ring-line">
                <div className="flex items-center justify-between gap-2">
                  <span className="display flex h-9 w-9 items-center justify-center rounded-lg bg-ink text-cream text-xs">{i + 1}</span>
                  <div className="flex gap-1">
                    <button type="button" aria-label={`Move step ${i + 1} up`} disabled={i === 0} onClick={() => moveStep(i, -1)} className="h-9 w-9 rounded-lg bg-ink/[0.07] hover:bg-ink/15 disabled:opacity-30">↑</button>
                    <button type="button" aria-label={`Move step ${i + 1} down`} disabled={i === steps.length - 1} onClick={() => moveStep(i, 1)} className="h-9 w-9 rounded-lg bg-ink/[0.07] hover:bg-ink/15 disabled:opacity-30">↓</button>
                    <button type="button" aria-label={`Remove step ${i + 1}`} onClick={() => removeStep(s)} className="h-9 px-3 rounded-lg bg-ink/[0.07] text-xs font-bold hover:bg-brand hover:text-white">Remove</button>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Select label="Tool" options={TOOLS} placeholder="Choose tool…" value={s.tool} onChange={(e) => setStepTool(s.key, e.target.value)} />
                  <div className="sm:col-span-2">
                    <Input label="What you did" value={s.action} onChange={(e) => patchStep(s.key, { action: e.target.value })} placeholder="Generated key frames and style references" maxLength={160} />
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                  <div className="sm:col-span-2">
                    <Input label="Note (optional)" value={s.note} onChange={(e) => patchStep(s.key, { note: e.target.value })} placeholder="About 40 prompt iterations to lock the look" maxLength={200} />
                  </div>
                  <div className="flex items-center gap-2">
                    {s.imageUrl && <img src={s.imageUrl} alt={`Step ${i + 1}`} className="h-11 w-16 rounded-lg object-cover" />}
                    <label className="inline-flex h-11 flex-1 cursor-pointer items-center justify-center rounded-btn bg-ink/[0.07] px-3 text-xs font-bold hover:bg-ink/15">
                      {s.busy ? 'Uploading…' : s.imageUrl ? 'Replace image' : '+ Step image'}
                      <input type="file" accept="image/*" className="sr-only" disabled={s.busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) onStepImage(s.key, f); e.target.value = '' }} />
                    </label>
                    {s.imageUrl && <button type="button" aria-label={`Remove image from step ${i + 1}`} onClick={() => patchStep(s.key, { imageUrl: null })} className="h-11 w-9 rounded-lg bg-ink/[0.07] hover:bg-ink/15">×</button>}
                  </div>
                </div>
              </li>
            ))}
          </ol>
          {errors.steps && <div className="mt-3"><Notice tone="error">{errors.steps}</Notice></div>}
        </Card>

        {/* Description */}
        <Card>
          <h2 className="display text-lg">Description</h2>
          <Textarea
            rows={4} value={form.description} onChange={(e) => set('description', e.target.value)} error={errors.description}
            placeholder="What the piece is, its look and feel, and how you made it." aria-label="Description"
          />
          <div className="mt-2.5 flex flex-wrap items-center gap-3">
            <Button type="button" size="sm" variant="outline" onClick={describeWithAi} disabled={ai.busy || !form.title.trim()}>
              {ai.busy ? 'Writing…' : '✦ Describe this piece with AI'}
            </Button>
            <span className="text-xs text-ink-soft">{form.title.trim() ? 'Uses your title, tools, style tags and workflow.' : 'Add a title first.'}</span>
          </div>
          {ai.error && <div className="mt-3"><Notice tone="error">{ai.error}</Notice></div>}
          {ai.suggestion && (
            <div className="mt-3 rounded-card bg-ink text-cream p-4">
              <p className="display text-[10px] text-brand">AI suggestion</p>
              <p className="mt-2 text-sm leading-relaxed whitespace-pre-line">{ai.suggestion}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={() => { set('description', ai.suggestion!); setAi({ busy: false }) }}>Use this description</Button>
                <Button type="button" size="sm" variant="light" onClick={() => setAi({ busy: false })}>Discard</Button>
              </div>
            </div>
          )}
        </Card>

        {errorList.length > 0 && (
          <div data-error-summary>
            <Notice tone="error">
              <p className="font-bold">Please fix {errorList.length === 1 ? 'this' : `these ${errorList.length} things`} before saving:</p>
              <ul className="mt-1.5 list-disc pl-5 space-y-0.5">{errorList.map((m) => <li key={m}>{m}</li>)}</ul>
            </Notice>
          </div>
        )}
        {saveError && <Notice tone="error">{saveError}</Notice>}

        <div className="flex flex-wrap justify-between gap-3">
          <Button to="/dashboard/creator" variant="outline">Cancel</Button>
          <Button type="submit" size="lg" icon={<ArrowIcon />} disabled={!!saving || mediaBusy}>{saving ?? (editing ? 'Save changes' : 'Publish piece')}</Button>
        </div>
      </form>
    </PageContainer>
  )
}
