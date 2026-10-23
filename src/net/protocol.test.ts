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
    expect(parse({ t: 'set-ready', ready: true })).toEqual({ t: 'set-ready', ready: true })
    expect(parse({ t: 'team', team: 'B' })).toEqual({ t: 'team', team: 'B' })
    // Settings from before regions and round lengths existed get the defaults.
    expect(
      parse({
        t: 'configure',
        settings: { format: 'duel', content: 'pinpoint', bots: 1, botSkill: 'novice' },
      }),
    ).toMatchObject({ settings: { region: 'World', roundMs: 25_000 } })
  })

  it('cleans names and accepts only known looks', () => {
    // Direction overrides and zero-width characters can disguise a name.
    expect(parse({ t: 'create', name: 'A\u202Ena\u200B  B', color: '#ff6b6b' })).toMatchObject({
      name: 'Ana B',
    })
    expect(parse({ t: 'create', name: '\u200B', color: '#ff6b6b' })).toBeNull()
    expect(
      parse({ t: 'create', name: 'Ana', color: '#ff6b6b', shape: 'ring', title: 'speedster' }),
    ).toMatchObject({ shape: 'ring', title: 'speedster' })
    expect(parse({ t: 'create', name: 'Ana', color: '#ff6b6b', shape: 'skull' })).toBeNull()
    // A title outside the list is dropped, so titles cannot carry messages.
    expect(parse({ t: 'create', name: 'Ana', color: '#ff6b6b', title: 'buy gold' })).toEqual({
      t: 'create',
      name: 'Ana',
      color: '#ff6b6b',
    })
  })

  it('rejects anything malformed or out of range', () => {
    const base = { format: 'duel', content: 'pinpoint', bots: 1, botSkill: 'novice' }
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
    expect(
      parse({
        t: 'configure',
        settings: { ...base, region: 'Atlantis' },
      }),
    ).toBeNull()
    expect(parse({ t: 'configure', settings: { ...base, roundMs: 1 } })).toBeNull()
  })
})

describe('Quick Duel messages', () => {
  it('parses queue requests with a cleaned name and looks', () => {
    expect(
      parseClientMessage('{"t":"queue","name":"  Ana  ","color":"#ff6b6b","shape":"ring"}'),
    ).toEqual({
      t: 'queue',
      name: 'Ana',
      color: '#ff6b6b',
      shape: 'ring',
    })
    expect(parseClientMessage('{"t":"queue-leave"}')).toEqual({ t: 'queue-leave' })
    expect(parseClientMessage('{"t":"queue-bot"}')).toEqual({ t: 'queue-bot' })
  })

  it('rejects queue requests without a usable name or colour', () => {
    expect(parseClientMessage('{"t":"queue","name":"","color":"#ff6b6b"}')).toBeNull()
    expect(parseClientMessage('{"t":"queue","name":"Ana","color":"red"}')).toBeNull()
  })
})
