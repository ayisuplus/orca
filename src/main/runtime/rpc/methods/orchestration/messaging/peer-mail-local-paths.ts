// `send --on <server>` carries words, not this computer's disk: a body naming a file here (a
// scratchpad, a report under the home folder) reaches an agent that can't open it. Warn, never refuse.
import { stat } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { isPathInsideOrEqual } from '../../../../../../shared/file-access/cross-platform-path'
import type { SendRecipientWarning } from './recipient-routing'

// A long body is checked for its first few paths only: the warning names a handful at most.
const CANDIDATES_MAX = 10
const NAMED_MAX = 3
const PATH_TOKEN = /(?:^|[\s"'`(<[=])((?:~|[A-Za-z]:)?[\\/][^\s"'`)<>\]|]+)/g
const TRAILING_PUNCTUATION = /[.,;:!?]+$/

/** Folders that are this computer's own: another computer's paths there are some other user's or
 *  temporary. Paths elsewhere (/usr, /etc, a checkout both share) may well exist there too. */
function localRoots(): string[] {
  return [homedir(), tmpdir(), '/tmp', '/private/tmp', '/var/folders', '/private/var/folders']
}

function candidates(body: string): string[] {
  const home = homedir()
  const found = new Set<string>()
  for (const match of body.matchAll(PATH_TOKEN)) {
    const raw = match[1].replace(TRAILING_PUNCTUATION, '')
    const path = raw.startsWith('~') ? `${home}${raw.slice(1)}` : raw
    if (raw.length > 1 && localRoots().some((root) => isPathInsideOrEqual(root, path))) {
      found.add(path)
    }
    if (found.size >= CANDIDATES_MAX) {
      break
    }
  }
  return [...found]
}

/** The warning for paths in `body` that exist on this computer, or none. */
export async function localPathWarning(
  body: string | undefined,
  recipient: string,
  serverName: string
): Promise<SendRecipientWarning | null> {
  const paths = body ? candidates(body) : []
  if (paths.length === 0) {
    return null
  }
  const exists = await Promise.all(
    paths.map((path) =>
      stat(path).then(
        () => true,
        () => false
      )
    )
  )
  const local = paths.filter((_, index) => exists[index])
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
