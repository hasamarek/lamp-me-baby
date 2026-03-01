'use client'
import { useState } from 'react'
import { Header } from '@/components/layout/Header'
import { UploadZone } from '@/components/upload/UploadZone'
import { PhotoPreview } from '@/components/upload/PhotoPreview'

export default function HomePage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-lamp-black)]">
      <Header />

      <main className="flex-1 flex flex-col">
        {selectedFile ? (
          <PhotoPreview
            file={selectedFile}
            onReplace={() => setSelectedFile(null)}
          />
        ) : (
          <UploadZone onFileSelected={setSelectedFile} />
        )}
      </main>
    </div>
  )
}
