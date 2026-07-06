'use client'

import { useEffect, useState } from 'react'

type Config = {
  configured: boolean
  accountId: string | null
  lastImportAt: string | null
}

type Report = {
  total: number
  added: number
  updated: number
  unmatched: number
  unmatchedTitles: string[]
}

type Action = 'save' | 'test' | 'import'

export function SteamImportCard() {
  const [config, setConfig] = useState<Config | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [accountId, setAccountId] = useState('')
  const [busy, setBusy] = useState<Action | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<Report | null>(null)

  useEffect(() => {
    fetch('/api/settings/steam')
      .then((r) => r.json())
      .then((c: Config) => {
        setConfig(c)
        setAccountId(c.accountId ?? '')
      })
      .catch(() => setError('Impossible de charger la configuration.'))
  }, [])

  async function run(action: Action) {
    setBusy(action)
    setError(null)
    setMessage(null)
    try {
      if (action === 'save') {
        const res = await fetch('/api/settings/steam', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey: apiKey || undefined, accountId }),
        })
        const body = await res.json()
        if (!res.ok) return setError(body.error)
        setConfig(body)
        setApiKey('') // la clé ne reste jamais affichée
        setMessage('Configuration enregistrée.')
      } else if (action === 'test') {
        const res = await fetch('/api/import/steam/test', { method: 'POST' })
        const body = await res.json()
        if (!res.ok) return setError(body.error)
        setMessage(`Connexion réussie — ${body.gameCount} jeux possédés sur Steam.`)
      } else {
        setReport(null)
        const res = await fetch('/api/import/steam', { method: 'POST' })
        const body = await res.json()
        if (!res.ok) return setError(body.error)
        setReport(body)
        // L'import a réussi : un échec du rafraîchissement de la config ne doit pas
        // afficher une fausse erreur — seule la date du dernier import serait périmée.
        try {
          setConfig(await (await fetch('/api/settings/steam')).json())
        } catch {
          /* silencieux */
        }
      }
    } catch {
      setError('Erreur réseau — réessayez.')
    } finally {
      setBusy(null)
    }
  }

  if (!config) {
    return (
      <div className="rounded-lg border border-zinc-800 p-4 text-sm text-zinc-500">
        Steam — chargement…
      </div>
    )
  }

  const inputClass =
    'w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm placeholder:text-zinc-600'
  const buttonClass =
    'rounded border border-zinc-700 px-3 py-1.5 text-sm hover:border-zinc-500 disabled:opacity-50'

  return (
    <div className="space-y-4 rounded-lg border border-zinc-800 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Steam</h3>
        {config.lastImportAt && (
          <span className="text-xs text-zinc-500">
            Dernier import : {new Date(config.lastImportAt).toLocaleString('fr-FR')}
          </span>
        )}
      </div>
      <p className="text-sm text-zinc-400">
        Importe vos jeux possédés et leurs temps de jeu réels. Obtenez une clé Web API
        (gratuite) sur{' '}
        <a
          href="https://steamcommunity.com/dev/apikey"
          target="_blank"
          rel="noreferrer"
          className="text-emerald-400 hover:underline"
        >
          steamcommunity.com/dev/apikey
        </a>{' '}
        ; votre SteamID64 (17 chiffres) figure sur la même page. Le profil doit être
        public (Confidentialité → Détails de jeu) le temps de l&apos;import.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-zinc-400">Clé Web API</span>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={config.configured ? 'Enregistrée (laisser vide pour conserver)' : ''}
            className={inputClass}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-zinc-400">SteamID64</span>
          <input
            type="text"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            placeholder="76561198…"
            className={inputClass}
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-3">
        <button onClick={() => run('save')} disabled={busy !== null} className={buttonClass}>
          {busy === 'save' ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <button
          onClick={() => run('test')}
          disabled={busy !== null || !config.configured}
          className={buttonClass}
        >
          {busy === 'test' ? 'Test…' : 'Tester la connexion'}
        </button>
        <button
          onClick={() => run('import')}
          disabled={busy !== null || !config.configured}
          className={`${buttonClass} border-emerald-800 text-emerald-300 hover:border-emerald-600`}
        >
          {busy === 'import' ? 'Import en cours… (peut prendre une minute)' : 'Importer'}
        </button>
      </div>
      {message && <p className="text-sm text-emerald-400">{message}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}
      {report && (
        <div className="space-y-2 rounded border border-zinc-800 bg-zinc-900 p-3 text-sm">
          <p>
            {report.total} jeux sur Steam : <strong>{report.added} ajoutés</strong> (statut
            « À trier »), {report.updated} mis à jour, {report.unmatched} introuvables sur
            IGDB (fiches manuelles créées).
          </p>
          {report.unmatchedTitles.length > 0 && (
            <p className="text-zinc-500">
              Non trouvés : {report.unmatchedTitles.join(', ')}
              {report.unmatched > report.unmatchedTitles.length && '…'}
            </p>
          )}
          <p className="text-zinc-500">
            Les résumés importés sont en anglais — lancez <code>npm run translate:fr</code>{' '}
            pour les traduire.
          </p>
        </div>
      )}
    </div>
  )
}
