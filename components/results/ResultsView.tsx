'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getImage } from '@/lib/db'
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

    const { attributes, imageDbKey } = current
    try {
      const form = new FormData()
      form.append('conversionConcept', attributes.conversionConcept ?? '')
      form.append('objectDescription', `${attributes.object} made of ${attributes.material}`)

      if (imageDbKey != null) {
        const blob = await getImage(imageDbKey)
        if (blob) form.append('image', blob, 'object.jpg')
      }

      const res = await fetch('/api/visualize', {
        method: 'POST',
        body: form,
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
