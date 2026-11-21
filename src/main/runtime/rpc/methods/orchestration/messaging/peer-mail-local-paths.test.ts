import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { localPathWarning } from './peer-mail-local-paths'

describe('local paths in mail to another computer', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'orca-local-paths-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('names a file cited with a line number', async () => {
    const file = join(dir, 'send-queue.ts')
    writeFileSync(file, '')
    expect(
      (await localPathWarning(`See ${file}:42:7 for it.`, 'bot:Docs', 'm4'))?.message
    ).toContain(`names ${file} on this computer`)
  })

  it('names no bare home or temp folder', async () => {
    expect(
      await localPathWarning(`Scratch lives in ${tmpdir()} and ~/ here.`, 'bot:Docs', 'm4')
    ).toBeNull()
  })

  it('still finds a file after a long run of other slashes', async () => {
    const file = join(dir, 'brief.md')
    writeFileSync(file, '')
    const noise = ' a / b </div>'.repeat(5000)
    expect(await localPathWarning(`${noise} ${file}`, 'bot:Docs', 'm4')).toBeNull()
    expect(await localPathWarning(`${file} ${noise}`, 'bot:Docs', 'm4')).not.toBeNull()
  })
})
