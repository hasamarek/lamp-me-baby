'use client'
import { useRef } from 'react'

interface Props {
  onFileSelected: (file: File) => void
}

export function MobileCameraButton({ onFileSelected }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <>
      {/* Unstyled hidden input — DO NOT add className with visual styles, Android 14 bug */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onFileSelected(file)
          // Reset so the same file can be selected again
          e.target.value = ''
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="md:hidden px-8 py-5 bg-[var(--color-lamp-yellow)] text-black font-black text-2xl rounded-full uppercase tracking-tight shadow-lg active:scale-95 transition-transform"
      >
        Take Photo
      </button>
    </>
  )
}
