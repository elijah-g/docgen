import { describe, expect, it } from 'vitest'
import { applyPronunciation } from '../../src/voice/pronunciation.js'

describe('applyPronunciation', () => {
  it('replaces whole-word matches with their spoken form', () => {
    const map = { version: '1', replacements: { TallyUp: 'Tally Up' } }
    expect(applyPronunciation('Welcome to TallyUp!', map)).toBe('Welcome to Tally Up!')
  })

  it('does not touch substrings that are not whole-word matches', () => {
    const map = { version: '1', replacements: { Tally: 'Tally Ho' } }
    expect(applyPronunciation('TallyUp is great', map)).toBe('TallyUp is great')
  })

  it('prefers longer keys over shorter overlapping ones', () => {
    const map = { version: '1', replacements: { Tally: 'nope', TallyUp: 'Tally Up' } }
    expect(applyPronunciation('TallyUp', map)).toBe('Tally Up')
  })

  it('returns text unchanged with an empty or missing map', () => {
    expect(applyPronunciation('hello', { version: '1', replacements: {} })).toBe('hello')
    expect(applyPronunciation('hello', undefined)).toBe('hello')
  })

  it('replaces every occurrence', () => {
    const map = { version: '1', replacements: { foo: 'bar' } }
    expect(applyPronunciation('foo and foo again', map)).toBe('bar and bar again')
  })
})
