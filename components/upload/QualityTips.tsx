'use client'
import { useState } from 'react'

export function QualityTips() {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Photo quality tips"
        aria-expanded={open}
        className="w-8 h-8 rounded-full border-2 border-[var(--color-lamp-yellow)] text-[var(--color-lamp-yellow)] font-black text-sm flex items-center justify-center hover:bg-[var(--color-lamp-yellow)] hover:text-black transition-colors"
      >
        i
      </button>

      {open && (
        <div
          role="tooltip"
          className="absolute bottom-10 left-1/2 -translate-x-1/2 w-64 bg-white text-black rounded-xl p-4 shadow-2xl border-2 border-black text-sm z-10"
        >
          <p className="font-black text-base mb-2 uppercase tracking-tight">
            Better photos = better results
          </p>
          <ul className="space-y-1 list-none">
            <li>Plain or simple background</li>
            <li>Full object visible — no cropping</li>
            <li>Include a scale reference (coin, hand, ruler)</li>
          </ul>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-3 text-xs font-bold underline"
          >
            Got it
          </button>
        </div>
      )}
    </div>
  )
}
