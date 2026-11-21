// `send --on <server>` carries words, not this computer's disk: a body naming a file here (a
// scratchpad, a report under the home folder) reaches an agent that can't open it. Warn, never refuse.
import { stat } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { isPathInsideOrEqual } from '../../../../../../shared/file-access/cross-platform-path'
import type { SendRecipientWarning } from './recipient-routing'

// A long body is checked for its first few paths only: the warning names a handful at most.
const STARTS_MAX = 10
// A folder name can hold spaces ("Application Support"): each path is also tried this many words on.
const EXTRA_WORDS_MAX = 4
const NAMED_MAX = 3
const LINE_MAX = 1024
const PATH_START = /(?:^|[\s"'`(<[=])((?:~|[A-Za-z]:)?[\\/])/g
const TRAILING = /[.,;:!?"'`)>\]]+$/

/** Folders that are this computer's own: another computer's paths there are some other user's or
 *  temporary. Paths elsewhere (/usr, /etc, a checkout both share) may well exist there too. */
function localRoots(): string[] {
  return [homedir(), tmpdir(), '/tmp', '/private/tmp', '/var/folders', '/private/var/folders']
}

/** Each path start's readings, shortest first: through the first space, then each word after it. */
function candidates(body: string): string[][] {
  const home = homedir()
  const roots = localRoots()
  const starts: string[][] = []
  for (const match of body.matchAll(PATH_START)) {
    const from = match.index + match[0].length - match[1].length
    // Only the rest of this line, bounded: a long body (a pasted diff) has many path-like starts.
    const end = body.indexOf('\n', from)
    const line = body.slice(from, Math.min(end === -1 ? body.length : end, from + LINE_MAX))
    const words = line.split(/[ \t]+/).slice(0, EXTRA_WORDS_MAX + 1)
    const readings = words
      .map((_, count) =>
        words
          .slice(0, count + 1)
          .join(' ')
          .replace(TRAILING, '')
      )
      .filter((raw) => raw.length > 1)
      .map((raw) => resolve(raw.startsWith('~') ? `${home}${raw.slice(1)}` : raw))
      .filter((path) => roots.some((root) => isPathInsideOrEqual(root, path)))
    if (readings.length > 0) {
      starts.push(readings)
    }
    if (starts.length >= STARTS_MAX) {
      break
    }
  }
  return starts
}

const exists = (path: string): Promise<boolean> =>
  stat(path).then(
    () => true,
    () => false
  )

/** The warning for paths in `body` that exist on this computer, or none. */
export async function localPathWarning(
  body: string | undefined,
  recipient: string,
  serverName: string
): Promise<SendRecipientWarning | null> {
  const starts = body ? candidates(body) : []
  if (starts.length === 0) {
    return null
  }
  const found = await Promise.all(
    starts.map(async (readings) => {
      const real = await Promise.all(readings.map(exists))
      // The longest reading that exists is the path the body names.
      return readings.findLast((_, index) => real[index]) ?? null
    })
  )
  const local = [...new Set(found.filter((path) => path !== null))]
  if (local.length === 0) {
    return null
  }
  const named = local.slice(0, NAMED_MAX).join(', ')
  const more = local.length > NAMED_MAX ? ` and ${local.length - NAMED_MAX} more` : ''
  return {
    code: 'local_paths_unreadable',
    recipient,
    message: `The body names ${named}${more} on this computer, which ${serverName} can't open. The message went as written; to share the contents, put the text in the body (--body-file reads a file into it), or attach the file with --file on a bot's item.`
  }
}
