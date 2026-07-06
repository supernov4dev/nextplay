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

  it("ignore les propriétés du prototype ('constructor', 'toString'...) comme statut", () => {
    expect(parseFilters({ status: 'constructor' })).toEqual({ sort: 'recent' })
    expect(parseFilters({ status: 'toString' })).toEqual({ sort: 'recent' })
  })
})

describe('parseFilters — temps de jeu', () => {
  it('parse le tri hours et minHours', () => {
    expect(parseFilters({ sort: 'hours', minHours: '50' })).toEqual({
      sort: 'hours',
      minHours: 50,
    })
  })

  it('ignore un minHours non numérique', () => {
    expect(parseFilters({ minHours: 'abc' })).toEqual({ sort: 'recent' })
  })
})

describe('parseFilters — qualifiés', () => {
  it('qualified=1 → filtre qualifiés ; autre valeur → ignoré', () => {
    expect(parseFilters({ qualified: '1' }).qualified).toBe(true)
    expect(parseFilters({ qualified: '0' }).qualified).toBeUndefined()
    expect(parseFilters({}).qualified).toBeUndefined()
  })
})
