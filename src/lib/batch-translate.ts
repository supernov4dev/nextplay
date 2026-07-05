// Logique pure du batch de traduction (scripts/translate-summaries.ts).
// La sortie de `claude -p` n'est pas garantie propre : parseTranslations
// tolère les blocs de code markdown et le texte parasite autour du JSON.

export type UntranslatedGame = { id: string; summary: string }

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export function buildPrompt(games: UntranslatedGame[]): string {
  return [
    'Traduis en français les résumés de jeux vidéo suivants (rédigés en anglais).',
    'Conserve les noms propres (titres de jeux, personnages, lieux) tels quels.',
    'Réponds UNIQUEMENT avec un tableau JSON de la forme [{"id": "...", "fr": "..."}],',
    'sans aucun texte autour et sans bloc de code.',
    '',
    JSON.stringify(games),
  ].join('\n')
}

export function parseTranslations(raw: string): Map<string, string> {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
  const start = cleaned.indexOf('[')
  const end = cleaned.lastIndexOf(']')
  if (start === -1 || end === -1 || end < start)
    throw new Error(`Réponse inattendue de claude : tableau JSON introuvable\n${raw.slice(0, 200)}`)
  const parsed = JSON.parse(cleaned.slice(start, end + 1)) as unknown
  if (!Array.isArray(parsed))
    throw new Error('Réponse inattendue de claude : pas un tableau JSON')
  const map = new Map<string, string>()
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue
    const { id, fr } = item as Record<string, unknown>
    if (typeof id === 'string' && typeof fr === 'string' && fr.trim())
      map.set(id, fr.trim())
  }
  return map
}
