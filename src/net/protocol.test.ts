import { describe, expect, it } from 'vitest'
import { parseClientMessage } from './protocol'

const parse = (message: unknown) => parseClientMessage(JSON.stringify(message))

describe('parseClientMessage', () => {
  it('accepts well-formed messages, cleaning them up', () => {
    expect(parse({ t: 'create', name: ' Ana ', color: '#ff6b6b' })).toEqual({
      t: 'create',
      name: 'Ana',
      color: '#ff6b6b',
    })
    expect(parse({ t: 'join', code: 'abcd', name: 'Ben', color: '#5ad1ff' })).toMatchObject({
      code: 'ABCD',
    })
    expect(parse({ t: 'submit', round: 2, pin: [10, -20] })).toEqual({
      t: 'submit',
      round: 2,
      pin: [10, -20],
      answerId: undefined,
      hintUsed: false,
    })
    expect(parse({ t: 'ready' })).toEqual({ t: 'ready' })
  })

  it('rejects anything malformed or out of range', () => {
    expect(parseClientMessage('{nope')).toBeNull()
    expect(parse({ t: 'create', name: '', color: '#ff6b6b' })).toBeNull()
    expect(parse({ t: 'create', name: 'x'.repeat(30), color: '#ff6b6b' })).toBeNull()
    expect(parse({ t: 'create', name: 'Ana', color: 'red' })).toBeNull()
    expect(parse({ t: 'submit', round: 1, pin: [500, 0] })).toBeNull()
    expect(parse({ t: 'submit', round: 1, answerId: 'drop table' })).toBeNull()
    expect(
      parse({
        t: 'configure',
        settings: { format: 'chess', content: 'pinpoint', bots: 0, botSkill: 'novice' },
      }),
    ).toBeNull()
    expect(
      parse({
        t: 'configure',
        settings: { format: 'duel', content: 'pinpoint', bots: 99, botSkill: 'novice' },
      }),
    ).toBeNull()
    expect(parse({ t: 'hack' })).toBeNull()
  })
})
