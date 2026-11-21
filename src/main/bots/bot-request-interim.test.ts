import { describe, expect, it } from 'vitest'
import { botRequestInterimLine } from './bot-request-interim'

describe('a turn that ends on an interim status', () => {
  it('reads a queued or accepted status as pending, with its line', () => {
    expect(
      botRequestInterimLine(
        'Read the brief. Accepted as item 77; queued FIFO behind two reviews. Verdict follows when a seat frees up.'
      )
    ).toBe('Accepted as item 77; queued FIFO behind two reviews.')
    expect(botRequestInterimLine('Took over the review.\nNo verdict yet: seat 1 is running.')).toBe(
      'No verdict yet: seat 1 is running.'
    )
    expect(botRequestInterimLine('You are 3rd in the queue.')).toBe('You are 3rd in the queue.')
  })

  it('reads a refusal, a verdict, silence or the quiet marker as no interim status', () => {
    expect(botRequestInterimLine("I can't take this review; it isn't queued.")).toBeNull()
    expect(botRequestInterimLine('Declined: out of scope for this bot.')).toBeNull()
    expect(botRequestInterimLine('Verdict: PASS, no P1 or P2 findings.')).toBeNull()
    expect(botRequestInterimLine('')).toBeNull()
    expect(botRequestInterimLine('NO_REPLY')).toBeNull()
  })

  it('reads a verdict written in chat as no interim status, whatever else it says', () => {
    expect(botRequestInterimLine('Verdict: PASS. All findings accepted.')).toBeNull()
    expect(botRequestInterimLine('Done; nothing is queued.')).toBeNull()
    expect(
      botRequestInterimLine('Technical scope PASSED; I picked it up from the queue.')
    ).toBeNull()
    expect(
      botRequestInterimLine('CHANGES REQUIRED: two P2 findings, queued behind nothing.')
    ).toBeNull()
  })

  it('reads a refusal with a typographic apostrophe as one', () => {
    expect(botRequestInterimLine('I can’t take this; it is queued elsewhere.')).toBeNull()
  })

  it('cuts a long status line', () => {
    const line = botRequestInterimLine(`Queued behind ${'x'.repeat(400)}`)
    expect(line?.length).toBe(240)
    expect(line?.endsWith('…')).toBe(true)
  })
})
