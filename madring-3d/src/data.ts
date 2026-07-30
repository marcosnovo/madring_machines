/**
 * Local score storage.
 *
 * Upstream this file talked to a hosted Supabase project (URL and anon key were
 * hard-coded into the source) for a global leaderboard, with Google/GitHub
 * OAuth sign-in. That is somebody else's backend and we do not run it, so it is
 * replaced with `localStorage`: times stay on the machine that set them and no
 * request leaves the page. The sign-in UI has been removed entirely.
 */

interface IScore {
  name: string
  time: number
}

export interface SavedScore extends IScore {
  id: string
}

const KEY = 'madring-3d.scores'

const read = (): SavedScore[] => {
  try {
    const raw = window.localStorage.getItem(KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as SavedScore[]) : []
  } catch {
    return []
  }
}

const write = (scores: SavedScore[]): void => {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(scores))
  } catch {
    // private browsing, quota — a leaderboard is not worth throwing over
    return
  }
}

export const getScores = (limit = 50): Promise<SavedScore[]> =>
  Promise.resolve(
    read()
      .filter((score) => score.time > 1337)
      .sort((a, b) => a.time - b.time)
      .slice(0, limit),
  )

export const insertScore = ({ name, time }: IScore): Promise<SavedScore[]> => {
  const score: SavedScore = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name, time }
  write([...read(), score].sort((a, b) => a.time - b.time).slice(0, 100))
  return Promise.resolve([score])
}
