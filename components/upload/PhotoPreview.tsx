'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
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

type Status = 'idle' | 'saving' | 'analyzing' | 'analyzed' | 'error'

export function PhotoPreview({ file, onReplace }: Props) {
  const router = useRouter()
  const [previewUrl, setPreviewUrl] = useState<string>('')
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const { addProject, updateProject } = useProjectStore()
  useEffect(() => {
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  async function handleConfirm() {
    setStatus('saving')
    setErrorMsg(null)

    let id: string
    try {
      const blob = await toJpegBlob(file)
      const name = file.name.replace(/\.[^.]+$/, '') || `lamp-${Date.now()}`
      id = addProject(name)
      const dbKey = await putImage(id, blob)
      updateProject(id, { imageDbKey: dbKey, status: 'confirmed' })
    } catch (err) {
      console.error('[PhotoPreview] save failed:', err)
      setErrorMsg('Could not save photo. Try again.')
      setStatus('error')
      return
    }

    setStatus('analyzing')
    updateProject(id, { status: 'analyzing' })

    try {
      const form = new FormData()
      form.append('image', file)
      const res = await fetch('/api/analyze', { method: 'POST', body: form })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }

      const { attributes: attrs } = await res.json()
      updateProject(id, { status: 'analyzed', attributes: attrs })
      setStatus('analyzed')
      router.push(`/project/${id}`)
    } catch (err) {
      console.error('[PhotoPreview] analyze failed:', err)
      setErrorMsg('Analysis failed. Your photo is saved — try again later.')
      setStatus('error')
      updateProject(id, { status: 'confirmed' })
    }
  }

  const isBusy = status === 'saving' || status === 'analyzing'

  return (
    <div className="w-full flex-1 flex flex-col items-center justify-center gap-6 px-6 py-12">
      {previewUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewUrl}
          alt="Your photo preview"
          className="max-h-[40dvh] max-w-full object-contain rounded-xl border-4 border-white/20"
        />
      )}

      {status === 'saving' && (
        <p className="text-white/60 text-sm font-medium animate-pulse">Saving photo…</p>
      )}

      {status === 'analyzing' && (
        <p className="text-[var(--color-lamp-yellow)] text-sm font-medium animate-pulse uppercase tracking-tight">
          Analyzing lamp…
        </p>
      )}

      {errorMsg && (
        <p className="text-red-400 text-sm font-medium">{errorMsg}</p>
      )}

      <div className="flex gap-4">
        <button
          type="button"
          onClick={onReplace}
          disabled={isBusy}
          className="px-6 py-3 border-2 border-white/40 text-white/60 font-bold uppercase tracking-tight rounded-lg hover:border-white hover:text-white transition-colors disabled:opacity-40"
        >
          Replace
        </button>

        {status !== 'analyzed' && (
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isBusy}
            className="px-8 py-3 bg-[var(--color-lamp-yellow)] text-black font-black text-lg uppercase tracking-tight rounded-lg shadow-lg hover:opacity-90 active:scale-95 transition-all disabled:opacity-40"
          >
            {status === 'saving' ? 'Saving…' : status === 'analyzing' ? 'Analyzing…' : 'Confirm'}
          </button>
        )}
      </div>
    </div>
  )
}
