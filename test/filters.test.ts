import { describe, it, expect } from 'vitest'
import { parseFilters } from '@/lib/filters'

describe('parseFilters', () => {
  it('valeurs par défaut : tri "recent", aucun filtre', () => {
    expect(parseFilters({})).toEqual({ sort: 'recent' })
  })

  it('parse tous les paramètres valides', () => {
    expect(
      parseFilters({
        status: 'FINISHED', platform: 'PC', genre: 'RPG',
        decade: '1990', minRating: '8', q: 'zelda', sort: 'rating',
      }),
    ).toEqual({
      status: 'FINISHED', platform: 'PC', genre: 'RPG',
      decade: 1990, minRating: 8, search: 'zelda', sort: 'rating',
    })
  })

  it('ignore les valeurs invalides (statut inconnu, tri inconnu, décennie non numérique)', () => {
    expect(
      parseFilters({ status: 'NIMPORTE', sort: 'hack', decade: 'abc' }),
    ).toEqual({ sort: 'recent' })
  })
})
