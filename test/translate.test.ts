import { describe, it, expect, vi, beforeEach } from 'vitest'

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }))

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: createMock }
  },
}))

import { translateSummary, resetTranslationCache } from '@/lib/translate'

beforeEach(() => {
  resetTranslationCache()
  createMock.mockReset()
  process.env.ANTHROPIC_API_KEY = 'test-key'
})

describe('translateSummary', () => {
  it('traduit le résumé en français via l’API', async () => {
    createMock.mockResolvedValue({
      content: [{ type: 'text', text: 'Un rogue-lite infernal.' }],
    })
    const result = await translateSummary(1, 'A hellish rogue-lite.')
    expect(result).toBe('Un rogue-lite infernal.')
    expect(createMock).toHaveBeenCalledTimes(1)
  })

  it('met en cache la traduction par igdbId (un seul appel API)', async () => {
    createMock.mockResolvedValue({ content: [{ type: 'text', text: 'FR' }] })
    await translateSummary(2, 'EN')
    await translateSummary(2, 'EN')
    expect(createMock).toHaveBeenCalledTimes(1)
  })

  it("retourne l'original si aucune clé API n'est configurée", async () => {
    delete process.env.ANTHROPIC_API_KEY
    const result = await translateSummary(3, 'Original text.')
    expect(result).toBe('Original text.')
    expect(createMock).not.toHaveBeenCalled()
  })

  it("retourne l'original si l'API échoue (dégradation douce)", async () => {
    createMock.mockRejectedValue(new Error('boom'))
    const result = await translateSummary(4, 'Original text.')
    expect(result).toBe('Original text.')
  })

  it("retourne l'original si la réponse est vide ou inattendue", async () => {
    createMock.mockResolvedValue({ content: [] })
    expect(await translateSummary(5, 'Original.')).toBe('Original.')
  })

  it('ne traduit pas un texte vide', async () => {
    expect(await translateSummary(6, '  ')).toBe('  ')
    expect(createMock).not.toHaveBeenCalled()
  })
})
