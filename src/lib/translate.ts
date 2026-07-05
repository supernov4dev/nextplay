// Traduction des résumés IGDB (anglais → français) via l'API Claude.
// Dégradation douce : sans clé API ou en cas d'échec, le texte original
// est retourné — la bibliothèque fonctionne sans dépendance à l'IA.

import Anthropic from '@anthropic-ai/sdk'

const SYSTEM_PROMPT =
  "Tu traduis des résumés de jeux vidéo de l'anglais vers le français. " +
  'Réponds uniquement avec la traduction, sans préambule ni commentaire. ' +
  'Conserve les noms propres (titres de jeux, personnages, lieux) tels quels.'

// Cache en mémoire par jeu : la sélection dans l'écran d'ajout et
// l'enregistrement en base réutilisent la même traduction.
const cache = new Map<number, string>()

export function resetTranslationCache(): void {
  cache.clear()
}

export async function translateSummary(
  igdbId: number,
  summary: string,
): Promise<string> {
  if (!summary.trim()) return summary
  if (!process.env.ANTHROPIC_API_KEY) return summary

  const cached = cache.get(igdbId)
  if (cached) return cached

  try {
    const client = new Anthropic()
    const response = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-8',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: summary }],
    })
    const block = response.content[0]
    if (!block || block.type !== 'text' || !block.text.trim()) return summary
    const translated = block.text.trim()
    cache.set(igdbId, translated)
    return translated
  } catch (err) {
    console.error('Traduction du résumé en échec :', err)
    return summary
  }
}
