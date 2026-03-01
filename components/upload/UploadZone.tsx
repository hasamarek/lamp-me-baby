'use client'
import { useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { MobileCameraButton } from './MobileCameraButton'
import { QualityTips } from './QualityTips'

interface Props {
  onFileSelected: (file: File) => void
}

export function UploadZone({ onFileSelected }: Props) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles[0]) onFileSelected(acceptedFiles[0])
    },
    [onFileSelected]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    multiple: false,
    noClick: true, // explicit buttons handle clicks; zone is drag-target only
  })

  return (
    <div
      {...getRootProps()}
      className={`w-full flex-1 flex flex-col items-center justify-center gap-6 border-4 border-dashed transition-colors duration-150 px-6 py-12 ${
        isDragActive
          ? 'border-[var(--color-lamp-yellow)] bg-[var(--color-lamp-yellow)]/5'
          : 'border-white/20'
      }`}
    >
      {/* Dropzone hidden input for drag-and-drop */}
      <input {...getInputProps()} />

      {/* Bold headline */}
      <p className="font-black text-4xl md:text-6xl text-center uppercase tracking-tighter leading-none text-white">
        {isDragActive ? 'Drop it.' : 'Find the light\ninside you.'}
      </p>

      {/* Mobile: Take Photo (primary CTA) */}
      <MobileCameraButton onFileSelected={onFileSelected} />

      {/* Desktop: Browse Files */}
      <label className="hidden md:flex items-center gap-3 cursor-pointer px-6 py-3 border-2 border-[var(--color-lamp-yellow)] text-[var(--color-lamp-yellow)] font-black text-lg uppercase tracking-tight rounded-lg hover:bg-[var(--color-lamp-yellow)] hover:text-black transition-colors">
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onFileSelected(file)
          }}
        />
        Browse Files
      </label>

      {/* Desktop: drag hint */}
      <p className="hidden md:block text-white/40 text-sm font-medium">
        or drag and drop here
      </p>

      {/* Quality tips — on-demand, bottom of zone */}
      <div className="flex items-center gap-2 text-white/40 text-xs">
        <QualityTips />
        <span>Photo tips</span>
      </div>
    </div>
  )
}
