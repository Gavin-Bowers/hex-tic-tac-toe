import type { CellState, Player, GameState } from './types'

export const WIN_LENGTH = 6
export const GRID_SIZE = 200
export const CENTER = Math.floor(GRID_SIZE / 2)

// Hex directions for odd-r offset coordinates
function getDirectionDelta(direction: string, row: number): [number, number] {
  const isOddRow = row % 2 === 1
  const directions: Record<string, [number, number]> = isOddRow
    ? { E: [1, 0], W: [-1, 0], NE: [1, -1], NW: [0, -1], SE: [1, 1], SW: [0, 1] }
    : { E: [1, 0], W: [-1, 0], NE: [0, -1], NW: [-1, -1], SE: [0, 1], SW: [-1, 1] }
  return directions[direction]
}

const AXES: [string, string][] = [
  ['E', 'W'],
  ['NE', 'SW'],
  ['NW', 'SE'],
]

function getWinningCells(
  col: number,
  row: number,
  direction: string,
  player: Player,
  cells: Record<string, CellState>
): string[] {
  const result: string[] = []
  let currentCol = col
  let currentRow = row

  while (true) {
    const [dc, dr] = getDirectionDelta(direction, currentRow)
    currentCol += dc
    currentRow += dr

    const key = `${currentCol},${currentRow}`
    if (cells[key] === player) {
      result.push(key)
    } else {
      break
    }
  }

  return result
}

export function checkWin(cells: Record<string, CellState>, player: Player): string[] | null {
  for (const [key, state] of Object.entries(cells)) {
    if (state !== player) continue

    const [colStr, rowStr] = key.split(',')
    const col = parseInt(colStr)
    const row = parseInt(rowStr)

    for (const [dir1, dir2] of AXES) {
      const cells1 = getWinningCells(col, row, dir1, player, cells)
      const cells2 = getWinningCells(col, row, dir2, player, cells)
      const total = 1 + cells1.length + cells2.length

      if (total >= WIN_LENGTH) {
        return [key, ...cells1, ...cells2]
      }
    }
  }

  return null
}

export function createInitialGameState(gameId: string, creatorToken: string): GameState {
  const centerKey = `${CENTER},${CENTER}`
  return {
    id: gameId,
    cells: { [centerKey]: 'x' },
    currentPlayer: 'o',
    movesThisTurn: 0,
    firstMoveKey: null,
    lastTurnMoves: null,
    winner: null,
    winningCells: [],
    players: {
      x: creatorToken,  // Creator plays as X
      o: null,          // Waiting for opponent
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

export function applyMove(
  game: GameState,
  col: number,
  row: number,
  playerToken: string
): { game: GameState; error?: string } {
  // Validate it's the player's turn
  const playerRole = game.players.x === playerToken ? 'x' : game.players.o === playerToken ? 'o' : null
  if (!playerRole) {
    return { game, error: 'Invalid player token' }
  }
  if (playerRole !== game.currentPlayer) {
    return { game, error: 'Not your turn' }
  }
  if (game.winner) {
    return { game, error: 'Game is over' }
  }

  const key = `${col},${row}`
  if (game.cells[key] && game.cells[key] !== 'empty') {
    return { game, error: 'Cell is already occupied' }
  }

  // Apply the move
  const newCells = { ...game.cells, [key]: game.currentPlayer }

  // Check for win
  const winCells = checkWin(newCells, game.currentPlayer)
  if (winCells) {
    return {
      game: {
        ...game,
        cells: newCells,
        winner: game.currentPlayer,
        winningCells: winCells,
        firstMoveKey: null,
        movesThisTurn: 0,
        lastTurnMoves: null,
        updatedAt: Date.now(),
      }
    }
  }

  // Update turn state
  if (game.movesThisTurn === 0) {
    return {
      game: {
        ...game,
        cells: newCells,
        firstMoveKey: key,
        movesThisTurn: 1,
        lastTurnMoves: null,  // Clear undo window for previous player
        updatedAt: Date.now(),
      }
    }
  } else {
    // Second move - switch players
    return {
      game: {
        ...game,
        cells: newCells,
        firstMoveKey: null,
        movesThisTurn: 0,
        lastTurnMoves: { first: game.firstMoveKey!, second: key },
        currentPlayer: game.currentPlayer === 'x' ? 'o' : 'x',
        updatedAt: Date.now(),
      }
    }
  }
}

export function applyUndo(
  game: GameState,
  playerToken: string
): { game: GameState; error?: string } {
  const playerRole = game.players.x === playerToken ? 'x' : game.players.o === playerToken ? 'o' : null
  if (!playerRole) {
    return { game, error: 'Invalid player token' }
  }

  // Can only undo if:
  // 1. It's not your turn (you just finished your turn)
  // 2. The other player hasn't moved yet (movesThisTurn === 0)
  // 3. There's a lastTurnMoves to undo
  const previousPlayer = game.currentPlayer === 'x' ? 'o' : 'x'
  if (playerRole !== previousPlayer) {
    return { game, error: 'Can only undo your own moves' }
  }
  if (game.movesThisTurn !== 0) {
    return { game, error: 'Cannot undo after opponent has moved' }
  }
  if (!game.lastTurnMoves) {
    return { game, error: 'Nothing to undo' }
  }
  if (game.winner) {
    return { game, error: 'Game is over' }
  }

  // Remove the second move
  const newCells = { ...game.cells }
  delete newCells[game.lastTurnMoves.second]

  return {
    game: {
      ...game,
      cells: newCells,
      firstMoveKey: game.lastTurnMoves.first,
      movesThisTurn: 1,
      lastTurnMoves: null,
      currentPlayer: previousPlayer,
      updatedAt: Date.now(),
    }
  }
}

export function applyUndoFirstMove(
  game: GameState,
  playerToken: string
): { game: GameState; error?: string } {
  const playerRole = game.players.x === playerToken ? 'x' : game.players.o === playerToken ? 'o' : null
  if (!playerRole) {
    return { game, error: 'Invalid player token' }
  }
  if (playerRole !== game.currentPlayer) {
    return { game, error: 'Not your turn' }
  }
  if (game.movesThisTurn !== 1 || !game.firstMoveKey) {
    return { game, error: 'No first move to undo' }
  }

  const newCells = { ...game.cells }
  delete newCells[game.firstMoveKey]

  return {
    game: {
      ...game,
      cells: newCells,
      firstMoveKey: null,
      movesThisTurn: 0,
      updatedAt: Date.now(),
    }
  }
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 10)
}

export function generateToken(): string {
  return Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2)
}
