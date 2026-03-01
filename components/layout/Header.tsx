import Link from 'next/link'

export function Header() {
  return (
    <header className="w-full flex items-center justify-between px-4 md:px-8 py-3 border-b border-white/10">
      <Link
        href="/"
        className="font-black text-2xl md:text-3xl uppercase tracking-tighter text-[var(--color-lamp-yellow)] hover:opacity-80 transition-opacity"
      >
        Lamp Me Baby
      </Link>

      <Link
        href="/projects"
        className="text-sm font-bold uppercase tracking-tight text-white/60 hover:text-white transition-colors"
      >
        My Lamps
      </Link>
    </header>
  )
}
