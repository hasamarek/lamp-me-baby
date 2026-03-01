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
