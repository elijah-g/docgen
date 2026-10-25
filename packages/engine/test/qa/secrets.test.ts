import { describe, expect, it } from 'vitest'
import { checkSecrets, scanSecrets } from '../../src/qa/secrets.js'

describe('scanSecrets', () => {
  it('flags an AWS access key', () => {
    expect(scanSecrets('key = AKIAABCDEFGHIJKLMNOP')).toHaveLength(1)
  })

  it('flags an Anthropic key', () => {
    expect(scanSecrets('ANTHROPIC_API_KEY=sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789')).toHaveLength(1)
  })

  it('flags an OpenAI key', () => {
    expect(scanSecrets('OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz0123456789')).toHaveLength(1)
  })

  it('flags a GitHub token', () => {
    expect(scanSecrets('token: ghp_abcdefghijklmnopqrstuvwxyz0123456789')).toHaveLength(1)
  })

  it('flags a JWT-like token', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
    expect(scanSecrets(jwt)).toHaveLength(1)
  })

  it('flags a generic high-entropy KEY= assignment', () => {
    expect(scanSecrets('STRIPE_SECRET_KEY=zQ8pL2vN9xR4tK7mB1cW6fH3jD0sA5e')).toHaveLength(1)
  })

  it('does not flag plain prose or low-entropy placeholder values', () => {
    expect(scanSecrets('This paragraph talks about API keys and secret tokens, in general terms.')).toEqual([])
    expect(scanSecrets('API_KEY=your-api-key-here')).toEqual([])
  })

  it('respects an allowlist', () => {
    expect(scanSecrets('key = AKIAABCDEFGHIJKLMNOP', { allowlist: ['AKIAABCDEFGHIJKLMNOP'] })).toEqual([])
  })

  it('redacts the value in the problem string', () => {
    const [problem] = scanSecrets('key = AKIAABCDEFGHIJKLMNOP')
    expect(problem).not.toContain('AKIAABCDEFGHIJKLMNOP')
  })
})

describe('checkSecrets', () => {
  it('passes clean text', () => {
    expect(checkSecrets('Nothing sensitive here.').ok).toBe(true)
  })

  it('fails text with a secret', () => {
    expect(checkSecrets('AKIAABCDEFGHIJKLMNOP').ok).toBe(false)
  })
})
