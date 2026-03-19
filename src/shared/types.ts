export type CellState = 'empty' | 'x' | 'o'
export type Player = 'x' | 'o'

export interface GameState {
  id: string
  cells: Record<string, CellState>  // Serialized from Map
  currentPlayer: Player
  movesThisTurn: number
  firstMoveKey: string | null
  lastTurnMoves: { first: string; second: string } | null
  winner: Player | 'closed' | null  // 'closed' means opponent left
  winningCells: string[]  // Serialized from Set
  startingPlayer: Player  // Who started this game (alternates on reset)
  players: {
    x: string | null  // Player token
    o: string | null  // Player token
  }
  createdAt: number
  updatedAt: number
}

export interface CreateGameResponse {
  gameId: string
  playerToken: string
  player: Player
}

export interface JoinGameResponse {
  playerToken: string
  player: Player
}

export interface MoveRequest {
  col: number
  row: number
  playerToken: string
}

export interface UndoRequest {
  playerToken: string
}

export interface GameError {
  error: string
}
