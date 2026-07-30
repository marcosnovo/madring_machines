/**
 * Offline stand-in for the Colyseus multiplayer layer.
 *
 * The upstream fork (colyseus/react-racing-game) refused to boot at all without
 * a Colyseus server on ws://localhost:2567 — `main.tsx` waited on a room join
 * before rendering anything. This project ships no server, so the room is
 * replaced with a local single-player one that exposes the same surface the
 * rest of the code already uses: `gameRoom.sessionId`, `gameRoom.state.players`
 * (a map with `onAdd`/`onRemove` hooks) and `gameRoom.send()`, which is a no-op.
 *
 * The opponent-vehicle plumbing therefore renders nothing: the players map only
 * ever holds the local driver. See ../../NOTICE section 3.
 */

export interface AxisData {
  x: number
  y: number
  z: number
  w: number
}

export interface Player {
  etc: number
  sessionId: string
  position: AxisData
  rotation: AxisData
  direction: AxisData
}

const axis = (x = 0, y = 0, z = 0, w = 0): AxisData => ({ x, y, z, w })

/** The subset of Colyseus' MapSchema the UI touches. */
class PlayerMap {
  private readonly map = new Map<string, Player>()
  onAdd?: (player: Player, sessionId: string) => void
  onRemove?: (player: Player, sessionId: string) => void

  get size(): number {
    return this.map.size
  }
  get(sessionId: string): Player | undefined {
    return this.map.get(sessionId)
  }
  set(sessionId: string, player: Player): void {
    this.map.set(sessionId, player)
    this.onAdd?.(player, sessionId)
  }
  forEach(callback: (player: Player, sessionId: string) => void): void {
    this.map.forEach(callback)
  }
  values(): IterableIterator<Player> {
    return this.map.values()
  }
}

export interface MyRoomState {
  players: PlayerMap
}

export interface LocalRoom {
  sessionId: string
  state: MyRoomState
  send: (type: string, message?: unknown) => void
  leave: () => void
}

const LOCAL_SESSION = 'local'

const createRoom = (): LocalRoom => {
  const players = new PlayerMap()
  players.set(LOCAL_SESSION, {
    etc: Infinity,
    sessionId: LOCAL_SESSION,
    position: axis(),
    rotation: axis(),
    direction: axis(),
  })
  return {
    sessionId: LOCAL_SESSION,
    state: { players },
    send: () => undefined,
    leave: () => undefined,
  }
}

export const gameRoom: LocalRoom = createRoom()

export const joinGame = async (): Promise<LocalRoom> => gameRoom

/** Kept so `main.tsx` reads the same; resolves immediately, never rejects. */
export const initializeNetwork = (): Promise<void> => Promise.resolve()
