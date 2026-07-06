import { SteamImportCard } from '@/components/SteamImportCard'

export default function ReglagesPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Réglages</h1>
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Sources d&apos;import</h2>
        <SteamImportCard />
        {/* Emplacements prévus par le spec — API non officielles, post-v1 */}
        <div className="rounded-lg border border-zinc-800 p-4 text-sm text-zinc-600">
          PlayStation Network — bientôt
        </div>
        <div className="rounded-lg border border-zinc-800 p-4 text-sm text-zinc-600">
          Xbox — bientôt
        </div>
      </section>
    </div>
  )
}
