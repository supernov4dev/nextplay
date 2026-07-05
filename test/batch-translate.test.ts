import { describe, it, expect } from 'vitest'
import { chunk, buildPrompt, parseTranslations } from '@/lib/batch-translate'

describe('chunk', () => {
  it('découpe en lots de taille fixe', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })
  it('tableau vide → aucun lot', () => {
    expect(chunk([], 10)).toEqual([])
  })
})

describe('buildPrompt', () => {
  it('contient les consignes et le JSON des jeux', () => {
    const prompt = buildPrompt([{ id: 'g1', summary: 'A great game.' }])
    expect(prompt).toContain('français')
    expect(prompt).toContain('"id":"g1"')
    expect(prompt).toContain('A great game.')
    expect(prompt).toContain('[{"id": "...", "fr": "..."}]')
  })
})

describe('parseTranslations', () => {
  it('parse un tableau JSON simple', () => {
    const map = parseTranslations('[{"id":"g1","fr":"Un super jeu."}]')
    expect(map.get('g1')).toBe('Un super jeu.')
  })

  it('tolère un bloc de code markdown et du texte autour', () => {
    const raw = 'Voici :\n```json\n[{"id":"g1","fr":"Traduit."}]\n```\n'
    expect(parseTranslations(raw).get('g1')).toBe('Traduit.')
  })

  it('ignore les entrées malformées mais garde les valides', () => {
    const map = parseTranslations(
      '[{"id":"g1","fr":"OK"},{"id":"g2"},{"fr":"sans id"},{"id":"g3","fr":"  "}]',
    )
    expect(map.size).toBe(1)
    expect(map.get('g1')).toBe('OK')
  })

  it('lève une erreur si aucun tableau JSON', () => {
    expect(() => parseTranslations('désolé, je ne peux pas')).toThrow()
  })
})
