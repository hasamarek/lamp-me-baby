# Visualization Flow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** After photo analysis completes, auto-navigate to `/project/[id]` and generate a Gemini lamp render that displays alongside analysis attributes.

**Architecture:** `PhotoPreview` navigates to `/project/[id]` after analysis. The new `ResultsView` component reads the project from Zustand, auto-triggers `POST /api/visualize` on mount, and shows the render + attributes. The visualize API route already exists and needs no changes.

**Tech Stack:** Next.js 16 App Router, React 19, Zustand v5, Tailwind v4, `@google/generative-ai`

---

### Task 1: Commit existing in-progress work

All uncommitted changes from the analyze flow need to be staged first.

**Files:**
- Modify: `components/upload/PhotoPreview.tsx` (uncommitted)
- Modify: `components/upload/UploadZone.tsx` (uncommitted)
- Modify: `lib/ratelimit.ts` (uncommitted)
- Create: `app/api/visualize/route.ts` (untracked)

**Step 1: Stage and commit**

```bash
cd lamp-me-baby
git add components/upload/PhotoPreview.tsx \
        components/upload/UploadZone.tsx \
        lib/ratelimit.ts \
        app/api/visualize/route.ts
git commit -m "feat(analyze): save+analyze flow, visualize API route, ratelimit passthrough"
```

Expected: clean working tree for the files above.

---

### Task 2: Add 'visualized' to ProjectStatus

The project type needs to track when a render has been saved.

**Files:**
- Modify: `types/project.ts`

**Step 1: Add the new status**

In `types/project.ts`, extend `ProjectStatus`:

```ts
export type ProjectStatus =
  | 'idle'
  | 'confirmed'
  | 'analyzing'
  | 'analyzed'
  | 'visualized'   // ← add this
```

**Step 2: Commit**

```bash
git add types/project.ts
git commit -m "feat(types): add visualized status"
```

---

### Task 3: Navigate to results page after analysis

`PhotoPreview` currently sets `status === 'analyzed'` and shows an attributes card but stays on the home page. We need it to navigate away.

**Files:**
- Modify: `components/upload/PhotoPreview.tsx`

**Step 1: Import useRouter**

Add to imports at the top of `PhotoPreview.tsx`:

```tsx
import { useRouter } from 'next/navigation'
```

**Step 2: Instantiate the router**

Inside the `PhotoPreview` function body, after the existing hooks:

```tsx
const router = useRouter()
```

**Step 3: Capture projectId in state**

The current code declares `let projectId: string` as a local variable inside `handleConfirm`. Move it to component state so it's accessible across renders:

```tsx
const [projectId, setProjectId] = useState<string | null>(null)
```

Then inside `handleConfirm`, in the save `try` block, replace:
```tsx
projectId = addProject(name)
```
with:
```tsx
const id = addProject(name)
setProjectId(id)
```

And update all subsequent `projectId` references in that function to use `id` instead.

**Step 4: Navigate after analysis succeeds**

At the end of the analyze `try` block, after `setStatus('analyzed')`, add:

```tsx
router.push(`/project/${id}`)
```

The full analyze try block should look like:

```tsx
try {
  const form = new FormData()
  form.append('image', file)
  const res = await fetch('/api/analyze', { method: 'POST', body: form })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }

  const { attributes: attrs } = await res.json()
  setAttributes(attrs)
  updateProject(id, { status: 'analyzed', attributes: attrs })
  setStatus('analyzed')
  router.push(`/project/${id}`)
} catch (err) {
  console.error('[PhotoPreview] analyze failed:', err)
  setErrorMsg('Analysis failed. Your photo is saved — try again later.')
  setStatus('error')
  updateProject(id, { status: 'confirmed' })
}
```

**Step 5: Remove the attributes display from PhotoPreview**

The results page will show attributes — no need to show them in `PhotoPreview` too. Remove the `status === 'analyzed' && attributes` block:

```tsx
// DELETE this entire block:
{status === 'analyzed' && attributes && (
  <div className="w-full max-w-sm bg-white/5 ...">
    ...
  </div>
)}
```

Also remove the `attributes` state since it's no longer displayed here:

```tsx
// DELETE:
const [attributes, setAttributes] = useState<Record<string, string> | null>(null)

// DELETE from analyze success:
setAttributes(attrs)
```

**Step 6: Commit**

```bash
git add components/upload/PhotoPreview.tsx
git commit -m "feat(upload): navigate to results page after analysis"
```

---

### Task 4: Create the results page

**Files:**
- Create: `app/project/[id]/page.tsx`

**Step 1: Create directory and file**

```bash
mkdir -p app/project/[id]
```

Create `app/project/[id]/page.tsx`:

```tsx
import { ResultsView } from '@/components/results/ResultsView'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ProjectPage({ params }: Props) {
  const { id } = await params
  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-lamp-black)]">
      <ResultsView id={id} />
    </div>
  )
}
```

Note: `params` is a Promise in Next.js 16 — always `await` it.

**Step 2: Commit**

```bash
git add app/project/
git commit -m "feat(pages): add project results page route"
```

---

### Task 5: Create ResultsView component

**Files:**
- Create: `components/results/ResultsView.tsx`

**Step 1: Create directory**

```bash
mkdir -p components/results
```

**Step 2: Create `components/results/ResultsView.tsx`**

```tsx
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useProjectStore } from '@/store/useProjectStore'

interface Props {
  id: string
}

type RenderStatus = 'idle' | 'rendering' | 'done' | 'error'

const ATTR_LABELS: Record<string, string> = {
  object: 'Object',
  material: 'Material',
  conversionConcept: 'Concept',
  estimatedDifficulty: 'Difficulty',
  suitability: 'Suitability',
}

export function ResultsView({ id }: Props) {
  const [hydrated, setHydrated] = useState(false)
  const [renderStatus, setRenderStatus] = useState<RenderStatus>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const { projects, updateProject } = useProjectStore()
  const router = useRouter()

  // SSR hydration guard — prevents mismatch from localStorage-backed store
  useEffect(() => setHydrated(true), [])

  const project = projects.find((p) => p.id === id)

  useEffect(() => {
    if (!hydrated || !project) return
    if (project.visualizationDataUrl) {
      setRenderStatus('done')
      return
    }
    triggerVisualize()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, id])

  async function triggerVisualize() {
    const current = projects.find((p) => p.id === id)
    if (!current?.attributes) {
      setErrorMsg('No analysis data found.')
      setRenderStatus('error')
      return
    }

    setRenderStatus('rendering')
    setErrorMsg(null)

    const { attributes } = current
    try {
      const res = await fetch('/api/visualize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversionConcept: attributes.conversionConcept,
          objectDescription: `${attributes.object} made of ${attributes.material}`,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }

      const { imageBase64 } = await res.json()
      updateProject(id, { visualizationDataUrl: imageBase64, status: 'visualized' })
      setRenderStatus('done')
    } catch (err) {
      console.error('[ResultsView] visualize failed:', err)
      setErrorMsg(err instanceof Error ? err.message : 'Render failed.')
      setRenderStatus('error')
    }
  }

  if (!hydrated) return null

  if (!project) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-white/40 text-sm">Project not found.</p>
      </div>
    )
  }

  const { attributes, visualizationDataUrl } = project

  return (
    <div className="w-full flex-1 flex flex-col">

      {/* Render area */}
      <div className="w-full bg-white/5 flex items-center justify-center min-h-[50dvh]">
        {renderStatus === 'rendering' && (
          <div className="flex flex-col items-center gap-4 py-20">
            <div className="animate-spin w-10 h-10 border-4 border-[var(--color-lamp-yellow)] border-t-transparent rounded-full" />
            <p className="text-[var(--color-lamp-yellow)] text-sm font-medium uppercase tracking-tight animate-pulse">
              Rendering your lamp…
            </p>
          </div>
        )}

        {renderStatus === 'done' && visualizationDataUrl && (
          <img
            src={visualizationDataUrl}
            alt="AI-rendered lamp"
            className="w-full max-h-[65dvh] object-contain"
          />
        )}

        {renderStatus === 'error' && (
          <div className="flex flex-col items-center gap-4 py-20">
            <p className="text-red-400 text-sm text-center px-6">{errorMsg}</p>
            <button
              onClick={triggerVisualize}
              className="px-6 py-2 bg-[var(--color-lamp-yellow)] text-black font-bold uppercase tracking-tight rounded-lg hover:opacity-90 active:scale-95 transition-all"
            >
              Retry
            </button>
          </div>
        )}
      </div>

      {/* Attributes */}
      {attributes && (
        <div className="px-6 py-8 flex flex-col gap-4 max-w-lg">
          {attributes.summary && (
            <p className="text-white text-base font-medium leading-snug">
              {attributes.summary}
            </p>
          )}
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {Object.entries(ATTR_LABELS).map(([key, label]) =>
              attributes[key] ? (
                <div key={key} className={key === 'conversionConcept' ? 'col-span-2' : ''}>
                  <span className="text-white/40 uppercase tracking-tight text-xs">{label}: </span>
                  <span className="text-white/80">{attributes[key]}</span>
                </div>
              ) : null
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="px-6 pb-12 flex gap-4 mt-auto">
        <button
          onClick={() => router.push('/')}
          className="px-6 py-3 border-2 border-white/40 text-white/60 font-bold uppercase tracking-tight rounded-lg hover:border-white hover:text-white transition-colors"
        >
          ← Try another
        </button>
        <button
          onClick={triggerVisualize}
          disabled={renderStatus === 'rendering'}
          className="px-6 py-3 bg-white/10 text-white font-bold uppercase tracking-tight rounded-lg hover:bg-white/20 transition-colors disabled:opacity-40"
        >
          Regenerate
        </button>
      </div>

    </div>
  )
}
```

**Step 3: Commit**

```bash
git add components/results/ResultsView.tsx
git commit -m "feat(results): add ResultsView with lamp render and attributes"
```

---

### Task 6: Verify end-to-end

**Step 1: Ensure env vars are set**

The dev server needs `ANTHROPIC_API_KEY` and `GOOGLE_AI_API_KEY` in `lamp-me-baby/.env.local`:

```
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_AI_API_KEY=AIza...
```

**Step 2: Start the dev server**

```bash
cd lamp-me-baby
npm run dev
```

**Step 3: Test the happy path**

1. Open `http://localhost:3000`
2. Upload a photo of an object (a vase, bottle, etc.)
3. Click Confirm
4. Verify: status shows "Saving photo…" then "Analyzing lamp…"
5. Verify: app navigates to `/project/[id]`
6. Verify: spinner shows "Rendering your lamp…"
7. Verify: lamp render image appears
8. Verify: attributes (object, material, concept, difficulty, suitability, summary) appear below

**Step 4: Test regenerate**

Click "Regenerate" — verify a new render request fires and replaces the image.

**Step 5: Test "Try another"**

Click "← Try another" — verify navigation back to `/` with upload zone visible.

**Step 6: Test revisit**

Reload the `/project/[id]` URL — verify render appears immediately from store (no re-fetch).

> ⚠️ **If `/api/visualize` returns an error about the model name:** The route uses `gemini-2.5-flash-image` — verify this is the correct model ID for the installed `@google/generative-ai` version. The image-generation-capable model may be `gemini-2.0-flash-preview-image-generation` depending on Google's current API. Update `app/api/visualize/route.ts` accordingly.

---

### Task 7: Final commit

```bash
git add -A
git status  # confirm nothing unexpected is staged
git commit -m "feat: complete visualization flow — analyze → render → results page"
```
