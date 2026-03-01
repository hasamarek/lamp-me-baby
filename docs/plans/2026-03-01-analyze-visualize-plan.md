# Analyze + Visualize Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the broken lamp-analysis flow with a correct object-assessment flow, add Gemini 2.0 Flash lamp visualization, and add Claude-generated DIY build steps.

**Architecture:** Three API routes (analyze rewritten, visualize new, build-steps new) called sequentially from PhotoPreview after the user confirms their photo. The UI runs saving → analyzing → visualizing → build-steps in sequence, showing progressive feedback. "Try a different approach" re-runs all three with a hint to pick a different conversion concept.

**Tech Stack:** Next.js 16 App Router, `claude-haiku-4-5` (Anthropic SDK), `gemini-2.0-flash-exp` (`@google/generative-ai`), Tailwind CSS 4, Zustand v5, TypeScript.

**Design doc:** `docs/plans/2026-03-01-analyze-visualize-design.md`

---

## Task 1: Get Google AI API key + install SDK

**Files:**
- Modify: `.env.local`
- Modify: `.env.local.example`

**Step 1: Get the key**

Go to https://aistudio.google.com → sign in → click "Get API key" → "Create API key" → copy it.

**Step 2: Install the SDK**

```bash
cd "/Users/hasamarek1/Desktop/Lamp Me Baby/lamp-me-baby"
npm install @google/generative-ai
```

Expected: `added N packages`

**Step 3: Add to .env.local**

Add this line to `.env.local`:
```
GOOGLE_AI_API_KEY=YOUR_KEY_HERE
```

**Step 4: Update .env.local.example**

Add this line to `.env.local.example`:
```
GOOGLE_AI_API_KEY=your-google-ai-studio-key
```

**Step 5: Commit**

```bash
git add .env.local.example package.json package-lock.json
git commit -m "feat: install @google/generative-ai, document GOOGLE_AI_API_KEY"
```

---

## Task 2: Update Project type

**Files:**
- Modify: `types/project.ts`

**Step 1: Add new fields**

Replace the `Project` interface with:

```ts
export interface Project {
  id: string
  name: string
  imageDbKey: number | null
  status: ProjectStatus
  createdAt: number
  // Phase 2 fields
  attributes?: Record<string, string>   // raw analyze response
  conversionConcept?: string
  visualizationDataUrl?: string         // base64 data URL from Gemini
  buildSteps?: string[]
}
```

**Step 2: Commit**

```bash
git add types/project.ts
git commit -m "feat(types): add conversionConcept, visualizationDataUrl, buildSteps to Project"
```

---

## Task 3: Rewrite /api/analyze

**Files:**
- Modify: `app/api/analyze/route.ts`

**Step 1: Replace the entire file**

```ts
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { ratelimit } from '@/lib/ratelimit'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? '127.0.0.1'
  const { success, limit, remaining, reset } = await ratelimit.limit(ip)

  if (!success) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. You can submit up to 5 requests per hour.' },
      { status: 429, headers: {
        'X-RateLimit-Limit': String(limit),
        'X-RateLimit-Remaining': String(remaining),
        'X-RateLimit-Reset': String(reset),
      }}
    )
  }

  const formData = await request.formData()
  const imageFile = formData.get('image') as File | null
  const previousConcept = formData.get('previousConcept') as string | null

  if (!imageFile) {
    return NextResponse.json({ error: 'No image provided.' }, { status: 400 })
  }

  const arrayBuffer = await imageFile.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString('base64')
  const mediaType = (imageFile.type || 'image/jpeg') as
    | 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

  const differentAngleHint = previousConcept
    ? `\n\nIMPORTANT: A previous analysis suggested: "${previousConcept}". You MUST propose a completely different conversion approach.`
    : ''

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data: base64 },
        },
        {
          type: 'text',
          text: `You are an expert at identifying DIY upcycling potential in second-hand objects.

Analyze this photo of a found object and evaluate its potential to be converted into a lamp.

Return ONLY a JSON object with these fields:
- object: what the object is (e.g. "vintage bowling ball", "ceramic vase", "driftwood piece")
- material: primary material(s) (e.g. "ceramic", "wood", "metal")
- suitability: "high" | "medium" | "low" — how suitable it is for lamp conversion
- conversionConcept: one sentence describing a creative way to turn it into a lamp (e.g. "Drill through the centre and thread a cord, mount a simple socket on top")
- estimatedDifficulty: "easy" | "medium" | "hard"
- summary: one enthusiastic sentence about its lamp potential${differentAngleHint}

Respond with only the JSON object, no markdown.`,
        },
      ],
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''

  let attributes: Record<string, string>
  try {
    const cleaned = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    attributes = JSON.parse(cleaned)
  } catch {
    attributes = { summary: text }
  }

  return NextResponse.json({ attributes })
}
```

**Step 2: Smoke-test locally**

```bash
curl -s -X POST http://localhost:3000/api/analyze \
  -F "image=@/Users/hasamarek1/Desktop/Lamp Me Baby/lamp-me-baby/test-image.png" \
  | python3 -m json.tool
```

Expected: JSON with `object`, `material`, `suitability`, `conversionConcept`, `estimatedDifficulty`, `summary` — no lamp-specific fields.

**Step 3: Commit**

```bash
git add app/api/analyze/route.ts
git commit -m "feat(analyze): rewrite prompt to assess object lamp-conversion potential"
```

---

## Task 4: Add /api/visualize (Gemini image generation)

**Files:**
- Create: `app/api/visualize/route.ts`

**Step 1: Create the route**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY ?? '')

export async function POST(request: NextRequest) {
  const { conversionConcept, objectDescription } = await request.json()

  if (!conversionConcept || !objectDescription) {
    return NextResponse.json({ error: 'Missing conversionConcept or objectDescription.' }, { status: 400 })
  }

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash-exp',
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
    } as never,
  })

  const prompt = `Create a photorealistic product-style studio photograph of a finished DIY lamp.
The lamp base is made from: ${objectDescription}.
Conversion method: ${conversionConcept}.
Style: warm studio lighting, white background, professional product photography.
The lamp should look handcrafted but beautiful, with a simple fabric shade on top.`

  const result = await model.generateContent(prompt)
  const response = result.response

  for (const part of response.candidates?.[0]?.content?.parts ?? []) {
    if (part.inlineData?.mimeType?.startsWith('image/')) {
      return NextResponse.json({
        imageBase64: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
      })
    }
  }

  return NextResponse.json({ error: 'No image generated.' }, { status: 500 })
}
```

**Step 2: Smoke-test locally**

```bash
curl -s -X POST http://localhost:3000/api/visualize \
  -H "Content-Type: application/json" \
  -d '{"conversionConcept":"Drill through the centre and thread a cord","objectDescription":"a ceramic vase"}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('imageBase64','ERROR')[:80])"
```

Expected: `data:image/png;base64,....` (long string)

**Step 3: Commit**

```bash
git add app/api/visualize/route.ts
git commit -m "feat(visualize): add Gemini 2.0 Flash lamp visualization route"
```

---

## Task 5: Add /api/build-steps

**Files:**
- Create: `app/api/build-steps/route.ts`

**Step 1: Create the route**

```ts
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(request: NextRequest) {
  const { conversionConcept, object, material } = await request.json()

  if (!conversionConcept || !object) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
  }

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `You are a practical DIY expert. Write clear step-by-step instructions for converting a ${object} (material: ${material}) into a lamp.

Conversion concept: ${conversionConcept}

Return ONLY a JSON array of strings, each being one numbered step. Include tools needed in the first step.
Example format: ["Step 1: Gather tools — you'll need a drill...", "Step 2: ...", ...]

Keep it to 6-8 steps. Be specific and practical. No markdown, just the JSON array.`,
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '[]'

  let steps: string[]
  try {
    const cleaned = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    steps = JSON.parse(cleaned)
  } catch {
    steps = [text]
  }

  return NextResponse.json({ steps })
}
```

**Step 2: Smoke-test locally**

```bash
curl -s -X POST http://localhost:3000/api/build-steps \
  -H "Content-Type: application/json" \
  -d '{"conversionConcept":"Drill through centre and thread cord","object":"ceramic vase","material":"ceramic"}' \
  | python3 -m json.tool
```

Expected: `{ "steps": ["Step 1: ...", "Step 2: ...", ...] }`

**Step 3: Commit**

```bash
git add app/api/build-steps/route.ts
git commit -m "feat(build-steps): add Claude Haiku DIY instructions route"
```

---

## Task 6: Rewrite PhotoPreview

**Files:**
- Modify: `components/upload/PhotoPreview.tsx`

**Step 1: Replace the entire file**

```tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { putImage } from '@/lib/db'
import { useProjectStore } from '@/store/useProjectStore'

interface Props {
  file: File
  onReplace: () => void
}

async function toJpegBlob(file: File): Promise<Blob> {
  const isHeic =
    file.type === 'image/heic' ||
    file.type === 'image/heif' ||
    /\.(heic|heif)$/i.test(file.name)
  if (!isHeic) return file
  const heic2any = (await import('heic2any')).default
  const result = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 })
  return Array.isArray(result) ? result[0] : result
}

type Status = 'idle' | 'saving' | 'analyzing' | 'visualizing' | 'building' | 'done' | 'error'

interface Analysis {
  object: string
  material: string
  suitability: string
  conversionConcept: string
  estimatedDifficulty: string
  summary: string
}

const SUITABILITY_COLOR: Record<string, string> = {
  high: 'bg-green-500/20 text-green-300',
  medium: 'bg-yellow-500/20 text-yellow-300',
  low: 'bg-red-500/20 text-red-300',
}

const DIFFICULTY_COLOR: Record<string, string> = {
  easy: 'bg-blue-500/20 text-blue-300',
  medium: 'bg-orange-500/20 text-orange-300',
  hard: 'bg-red-500/20 text-red-300',
}

export function PhotoPreview({ file, onReplace }: Props) {
  const [previewUrl, setPreviewUrl] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [vizUrl, setVizUrl] = useState<string | null>(null)
  const [buildSteps, setBuildSteps] = useState<string[]>([])
  const [stepsOpen, setStepsOpen] = useState(false)
  const { addProject, updateProject } = useProjectStore()
  const projectIdRef = useRef<string | null>(null)
  const urlRef = useRef('')

  useEffect(() => {
    const url = URL.createObjectURL(file)
    urlRef.current = url
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  async function runFlow(previousConcept?: string) {
    setErrorMsg(null)
    setVizUrl(null)
    setBuildSteps([])
    setStepsOpen(false)

    // 1. Save (only on first run)
    if (!projectIdRef.current) {
      setStatus('saving')
      try {
        const blob = await toJpegBlob(file)
        const name = file.name.replace(/\.[^.]+$/, '') || `find-${Date.now()}`
        const id = addProject(name)
        projectIdRef.current = id
        const dbKey = await putImage(id, blob)
        updateProject(id, { imageDbKey: dbKey, status: 'confirmed' })
      } catch {
        setErrorMsg('Could not save photo. Try again.')
        setStatus('error')
        return
      }
    }

    const projectId = projectIdRef.current!

    // 2. Analyze
    setStatus('analyzing')
    updateProject(projectId, { status: 'analyzing' })
    let attrs: Analysis
    try {
      const form = new FormData()
      form.append('image', file)
      if (previousConcept) form.append('previousConcept', previousConcept)
      const res = await fetch('/api/analyze', { method: 'POST', body: form })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const { attributes } = await res.json()
      attrs = attributes as Analysis
      setAnalysis(attrs)
      updateProject(projectId, { attributes, conversionConcept: attrs.conversionConcept })
    } catch {
      setErrorMsg('Analysis failed. Try again.')
      setStatus('error')
      updateProject(projectId, { status: 'confirmed' })
      return
    }

    // 3. Visualize
    setStatus('visualizing')
    try {
      const res = await fetch('/api/visualize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversionConcept: attrs.conversionConcept,
          objectDescription: `${attrs.object} made of ${attrs.material}`,
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const { imageBase64 } = await res.json()
      setVizUrl(imageBase64)
      updateProject(projectId, { visualizationDataUrl: imageBase64 })
    } catch {
      // Visualization failure is non-fatal — continue to build steps
      setVizUrl(null)
    }

    // 4. Build steps
    setStatus('building')
    try {
      const res = await fetch('/api/build-steps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversionConcept: attrs.conversionConcept,
          object: attrs.object,
          material: attrs.material,
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const { steps } = await res.json()
      setBuildSteps(steps)
      updateProject(projectId, { buildSteps: steps, status: 'analyzed' })
    } catch {
      updateProject(projectId, { status: 'analyzed' })
    }

    setStatus('done')
  }

  const isBusy = ['saving', 'analyzing', 'visualizing', 'building'].includes(status)

  const statusLabel: Record<string, string> = {
    saving: 'Saving photo…',
    analyzing: 'Analyzing your find…',
    visualizing: 'Imagining your lamp…',
    building: 'Writing build steps…',
  }

  return (
    <div className="w-full flex-1 flex flex-col items-center gap-6 px-6 py-8 overflow-y-auto">
      {/* Original photo */}
      {previewUrl && status !== 'done' && (
        <img
          src={previewUrl}
          alt="Your find"
          className="max-h-[35dvh] max-w-full object-contain rounded-xl border-4 border-white/20"
        />
      )}

      {/* Loading states */}
      {isBusy && (
        <p className="text-[var(--color-lamp-yellow)] text-sm font-bold uppercase tracking-tight animate-pulse">
          {statusLabel[status]}
        </p>
      )}

      {/* Error */}
      {errorMsg && (
        <p className="text-red-400 text-sm font-medium">{errorMsg}</p>
      )}

      {/* Done state */}
      {status === 'done' && analysis && (
        <div className="w-full max-w-sm flex flex-col gap-5">
          {/* Visualization */}
          {vizUrl && (
            <img
              src={vizUrl}
              alt="AI lamp visualization"
              className="w-full rounded-xl border-2 border-white/10 shadow-lg"
            />
          )}

          {/* Analysis card */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col gap-3">
            <p className="text-white font-medium text-sm leading-snug">{analysis.summary}</p>
            <div className="flex flex-wrap gap-2">
              <span className={`text-xs font-bold px-2 py-1 rounded-full uppercase tracking-tight ${SUITABILITY_COLOR[analysis.suitability] ?? 'bg-white/10 text-white/60'}`}>
                {analysis.suitability} suitability
              </span>
              <span className={`text-xs font-bold px-2 py-1 rounded-full uppercase tracking-tight ${DIFFICULTY_COLOR[analysis.estimatedDifficulty] ?? 'bg-white/10 text-white/60'}`}>
                {analysis.estimatedDifficulty}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <div><span className="text-white/40">Object: </span><span className="text-white/80">{analysis.object}</span></div>
              <div><span className="text-white/40">Material: </span><span className="text-white/80">{analysis.material}</span></div>
            </div>
            <p className="text-white/60 text-xs italic">"{analysis.conversionConcept}"</p>
          </div>

          {/* Build steps accordion */}
          {buildSteps.length > 0 && (
            <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setStepsOpen((o) => !o)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-bold uppercase tracking-tight text-white/80 hover:text-white transition-colors"
              >
                Build steps
                <span className="text-white/40">{stepsOpen ? '↑' : '↓'}</span>
              </button>
              {stepsOpen && (
                <ol className="px-4 pb-4 flex flex-col gap-2">
                  {buildSteps.map((step, i) => (
                    <li key={i} className="text-xs text-white/70 leading-relaxed">{step}</li>
                  ))}
                </ol>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onReplace}
              className="flex-1 px-4 py-3 border-2 border-white/40 text-white/60 font-bold uppercase tracking-tight rounded-lg hover:border-white hover:text-white transition-colors text-sm"
            >
              New photo
            </button>
            <button
              type="button"
              onClick={() => runFlow(analysis.conversionConcept)}
              className="flex-1 px-4 py-3 border-2 border-[var(--color-lamp-yellow)] text-[var(--color-lamp-yellow)] font-bold uppercase tracking-tight rounded-lg hover:bg-[var(--color-lamp-yellow)] hover:text-black transition-colors text-sm"
            >
              Different idea
            </button>
          </div>
        </div>
      )}

      {/* Initial confirm buttons */}
      {status === 'idle' && (
        <div className="flex gap-4">
          <button
            type="button"
            onClick={onReplace}
            className="px-6 py-3 border-2 border-white/40 text-white/60 font-bold uppercase tracking-tight rounded-lg hover:border-white hover:text-white transition-colors"
          >
            Replace
          </button>
          <button
            type="button"
            onClick={() => runFlow()}
            className="px-8 py-3 bg-[var(--color-lamp-yellow)] text-black font-black text-lg uppercase tracking-tight rounded-lg shadow-lg hover:opacity-90 active:scale-95 transition-all"
          >
            Confirm
          </button>
        </div>
      )}

      {/* Retry on error */}
      {status === 'error' && (
        <button
          type="button"
          onClick={() => runFlow()}
          className="px-8 py-3 bg-[var(--color-lamp-yellow)] text-black font-black uppercase tracking-tight rounded-lg"
        >
          Try again
        </button>
      )}
    </div>
  )
}
```

**Step 2: Test in browser**

```bash
# Server should already be running on localhost:3000
# Upload test-image.png → click Confirm
# Expected sequence:
#   "Saving photo…" → "Analyzing your find…" → "Imagining your lamp…" → "Writing build steps…" → done screen
```

**Step 3: Commit**

```bash
git add components/upload/PhotoPreview.tsx
git commit -m "feat(ui): rewrite PhotoPreview with analyze→visualize→build-steps flow"
```

---

## Task 7: Add GOOGLE_AI_API_KEY to Vercel + redeploy

**Step 1: Add env var**

```bash
cd "/Users/hasamarek1/Desktop/Lamp Me Baby/lamp-me-baby"
echo "YOUR_GOOGLE_AI_KEY" | vercel env add GOOGLE_AI_API_KEY production
```

**Step 2: Deploy**

```bash
vercel --prod
```

Expected: `Aliased: https://lamp-me-baby.vercel.app`

**Step 3: Smoke-test production**

Open https://lamp-me-baby.vercel.app, upload a photo, confirm the full flow works end-to-end.

**Step 4: Commit any remaining changes**

```bash
git add -A
git status  # verify nothing sensitive (no .env.local)
git commit -m "chore: post-deploy cleanup" --allow-empty
```

---

## Summary

| Task | What it does |
|------|-------------|
| 1 | Google AI key + install SDK |
| 2 | Extend Project type |
| 3 | Rewrite /api/analyze prompt |
| 4 | New /api/visualize (Gemini) |
| 5 | New /api/build-steps (Claude) |
| 6 | Rewrite PhotoPreview UI |
| 7 | Deploy to Vercel |
