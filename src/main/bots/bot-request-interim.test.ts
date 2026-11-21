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
      'Took over the review.'
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

  it('cuts a long status line', () => {
    const line = botRequestInterimLine(`Queued ${'x'.repeat(400)}`)
    expect(line?.length).toBe(240)
    expect(line?.endsWith('…')).toBe(true)
  })
})
