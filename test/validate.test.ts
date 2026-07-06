import { describe, it, expect } from 'vitest'
import { validatePersonal, validatePersonalPartial } from '@/lib/validate'

describe('validatePersonal', () => {
  it('accepte un payload valide complet (note /20, platiné, périodes)', () => {
    const result = validatePersonal({
      status: 'FINISHED',
      rating: 16,
      mastered: true,
      periods: [{ startYear: 1998 }, { startYear: 2015, endYear: 2017 }],
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.rating).toBe(16)
      expect(result.value.mastered).toBe(true)
      expect(result.value.periods).toEqual([
        { startYear: 1998, endYear: null },
        { startYear: 2015, endYear: 2017 },
      ])
    }
  })

  it("rejette les propriétés du prototype ('constructor', 'toString'...) comme statut", () => {
    expect(validatePersonal({ status: 'constructor' })).toEqual({
      ok: false,
      error: 'Statut invalide.',
    })
    expect(validatePersonal({ status: 'toString' })).toEqual({
      ok: false,
      error: 'Statut invalide.',
    })
  })

  it('rejette un statut inconnu', () => {
    expect(validatePersonal({ status: 'NIMPORTE' })).toEqual({
      ok: false,
      error: 'Statut invalide.',
    })
  })

  it('accepte le statut Collection (OWNED)', () => {
    const result = validatePersonal({ status: 'OWNED' })
    expect(result.ok).toBe(true)
  })

  it('accepte une note jusqu’à 20 et rejette au-delà', () => {
    expect(validatePersonal({ status: 'FINISHED', rating: 20 }).ok).toBe(true)
    expect(validatePersonal({ status: 'FINISHED', rating: 21 }).ok).toBe(false)
    expect(validatePersonal({ status: 'FINISHED', rating: -1 }).ok).toBe(false)
    expect(validatePersonal({ status: 'FINISHED', rating: 15.5 }).ok).toBe(false)
  })

  it('rejette des périodes invalides', () => {
    expect(
      validatePersonal({ status: 'FINISHED', periods: [{ startYear: 1800 }] }).ok,
    ).toBe(false)
    expect(
      validatePersonal({
        status: 'FINISHED',
        periods: [{ startYear: 2010, endYear: 2005 }],
      }).ok,
    ).toBe(false)
    expect(
      validatePersonal({ status: 'FINISHED', periods: [{ startYear: 'abc' }] }).ok,
    ).toBe(false)
  })

  it('mastered non booléen → false', () => {
    const result = validatePersonal({ status: 'FINISHED', mastered: 'oui' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.mastered).toBe(false)
  })
})

describe('validatePersonalPartial', () => {
  it('accepte un objet vide (aucun champ à modifier)', () => {
    expect(validatePersonalPartial({})).toEqual({ ok: true, value: {} })
  })

  it("rejette les propriétés du prototype comme statut", () => {
    expect(validatePersonalPartial({ status: 'constructor' })).toEqual({
      ok: false,
      error: 'Statut invalide.',
    })
  })

  it('rejette une note hors bornes (/20)', () => {
    expect(validatePersonalPartial({ rating: 42 }).ok).toBe(false)
    expect(validatePersonalPartial({ rating: 20 }).ok).toBe(true)
  })

  it('valide les périodes quand présentes', () => {
    expect(validatePersonalPartial({ periods: [{ startYear: 2020 }] }).ok).toBe(true)
    expect(validatePersonalPartial({ periods: [{ startYear: 3000 }] }).ok).toBe(false)
  })
})
