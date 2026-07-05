import { describe, it, expect } from 'vitest'
import { validatePersonal, validatePersonalPartial } from '@/lib/validate'

describe('validatePersonal', () => {
  it('accepte un payload valide', () => {
    const result = validatePersonal({ status: 'FINISHED', rating: 8 })
    expect(result.ok).toBe(true)
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

  it('rejette une note hors bornes', () => {
    expect(validatePersonal({ status: 'FINISHED', rating: 15 }).ok).toBe(false)
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

  it('rejette une note hors bornes', () => {
    expect(validatePersonalPartial({ rating: 42 }).ok).toBe(false)
  })
})
