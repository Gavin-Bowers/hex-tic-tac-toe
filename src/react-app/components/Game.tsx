import { useState, useEffect, useCallback, useRef } from 'react'
import HexGrid from './HexGrid'
import type { Player, CellState } from '../../shared/types'
import { checkWin } from '../../shared/gameLogic'

interface GameState {
  id: string
  cells: Record<string, CellState>
  currentPlayer: Player
  movesThisTurn: number
  firstMoveKey: string | null
  lastTurnMoves: { first: string; second: string } | null
  winner: Player | 'closed' | null
  winningCells: string[]
  players: {
    x: boolean
    o: boolean
  }
  updatedAt: number
}

interface GameProps {
  gameId: string
  playerToken: string
  myPlayer: Player
  onLeave: () => void
  onPlayerChange: (player: Player) => void
}

export default function Game({ gameId, playerToken, myPlayer, onLeave, onPlayerChange }: GameProps) {
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const lastUpdatedRef = useRef<number>(0)
  const pendingMoveRef = useRef<boolean>(false)

  const fetchGameState = useCallback(async () => {
    try {
      const res = await fetch(`/api/games/${gameId}?token=${playerToken}`)
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to fetch game')
        return
      }
      const data = await res.json()

      // Check if our player assignment changed (e.g. after reset)
      if (data.yourPlayer && data.yourPlayer !== myPlayer) {
        onPlayerChange(data.yourPlayer)
      }

      // Only update if the game state has changed
      if (data.updatedAt > lastUpdatedRef.current) {
        lastUpdatedRef.current = data.updatedAt
        setGameState(data)
      }
    } catch {
      setError('Failed to connect to server')
    }
  }, [gameId, playerToken, myPlayer, onPlayerChange])

  // Initial fetch
  useEffect(() => {
    fetchGameState()
  }, [fetchGameState])

  // Poll for updates
  useEffect(() => {
    const interval = setInterval(fetchGameState, 1000)
    return () => clearInterval(interval)
  }, [fetchGameState])

  const handleMove = useCallback(async (col: number, row: number) => {
    if (!gameState) return

    // Block if a move is already in flight
    if (pendingMoveRef.current) return
    pendingMoveRef.current = true

    const key = `${col},${row}`

    // Check if cell is already occupied
    if (gameState.cells[key] && gameState.cells[key] !== 'empty') {
      pendingMoveRef.current = false
      return
    }

    // Optimistic update - apply move locally immediately
    const newCells = { ...gameState.cells, [key]: myPlayer }

    // Check for win
    const winCells = checkWin(newCells, myPlayer)

    let optimisticState: GameState
    if (winCells) {
      optimisticState = {
        ...gameState,
        cells: newCells,
        winner: myPlayer,
        winningCells: winCells,
        firstMoveKey: null,
        movesThisTurn: 0,
        updatedAt: Date.now(),
      }
    } else if (gameState.movesThisTurn === 0) {
      // First move of turn
      optimisticState = {
        ...gameState,
        cells: newCells,
        firstMoveKey: key,
        movesThisTurn: 1,
        updatedAt: Date.now(),
      }
    } else {
      // Second move - switch players
      optimisticState = {
        ...gameState,
        cells: newCells,
        firstMoveKey: null,
        movesThisTurn: 0,
        lastTurnMoves: { first: gameState.firstMoveKey!, second: key },
        currentPlayer: gameState.currentPlayer === 'x' ? 'o' : 'x',
        updatedAt: Date.now(),
      }
    }

    // Apply optimistic update
    setGameState(optimisticState)
    lastUpdatedRef.current = optimisticState.updatedAt

    // Send to server
    try {
      const res = await fetch(`/api/games/${gameId}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ col, row, playerToken }),
      })
      if (!res.ok) {
        const data = await res.json()
        // Revert optimistic update on error
        lastUpdatedRef.current = 0
        await fetchGameState()
        setError(data.error || 'Failed to make move')
      }
    } catch {
      // Revert on network error
      lastUpdatedRef.current = 0
      await fetchGameState()
      setError('Failed to connect to server')
    } finally {
      pendingMoveRef.current = false
    }
  }, [gameId, playerToken, gameState, myPlayer, fetchGameState])

  const handleUndoFirst = useCallback(async () => {
    if (!gameState || !gameState.firstMoveKey) return
    if (pendingMoveRef.current) return
    pendingMoveRef.current = true

    // Optimistic update
    const newCells = { ...gameState.cells }
    delete newCells[gameState.firstMoveKey]

    const optimisticState: GameState = {
      ...gameState,
      cells: newCells,
      firstMoveKey: null,
      movesThisTurn: 0,
      updatedAt: Date.now(),
    }

    setGameState(optimisticState)
    lastUpdatedRef.current = optimisticState.updatedAt

    try {
      const res = await fetch(`/api/games/${gameId}/undo-first`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerToken }),
      })
      if (!res.ok) {
        const data = await res.json()
        lastUpdatedRef.current = 0
        await fetchGameState()
        setError(data.error || 'Failed to undo')
      }
    } catch {
      lastUpdatedRef.current = 0
      await fetchGameState()
      setError('Failed to connect to server')
    } finally {
      pendingMoveRef.current = false
    }
  }, [gameId, playerToken, gameState, fetchGameState])

  const handleUndo = useCallback(async () => {
    if (!gameState || !gameState.lastTurnMoves) return
    if (pendingMoveRef.current) return
    pendingMoveRef.current = true

    // Optimistic update - remove second move, restore first move state
    const newCells = { ...gameState.cells }
    delete newCells[gameState.lastTurnMoves.second]

    const optimisticState: GameState = {
      ...gameState,
      cells: newCells,
      firstMoveKey: gameState.lastTurnMoves.first,
      movesThisTurn: 1,
      lastTurnMoves: null,
      currentPlayer: gameState.currentPlayer === 'x' ? 'o' : 'x',
      updatedAt: Date.now(),
    }

    setGameState(optimisticState)
    lastUpdatedRef.current = optimisticState.updatedAt

    try {
      const res = await fetch(`/api/games/${gameId}/undo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerToken }),
      })
      if (!res.ok) {
        const data = await res.json()
        lastUpdatedRef.current = 0
        await fetchGameState()
        setError(data.error || 'Failed to undo')
      }
    } catch {
      lastUpdatedRef.current = 0
      await fetchGameState()
      setError('Failed to connect to server')
    } finally {
      pendingMoveRef.current = false
    }
  }, [gameId, playerToken, gameState, fetchGameState])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.key === 'Backspace' && gameState && !gameState.winner) {
        e.preventDefault()
        const isMyTurn = gameState.currentPlayer === myPlayer
        const canUndoFirst = isMyTurn && gameState.movesThisTurn === 1 && !!gameState.firstMoveKey
        const canUndoSecond = !isMyTurn && gameState.movesThisTurn === 0 && !!gameState.lastTurnMoves

        if (canUndoFirst) {
          await handleUndoFirst()
        } else if (canUndoSecond) {
          await handleUndo()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [gameState, myPlayer, handleUndoFirst, handleUndo])

  const handleReset = useCallback(async () => {
    try {
      const res = await fetch(`/api/games/${gameId}/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerToken }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to reset')
        return
      }
      const data = await res.json()
      if (data.player) {
        onPlayerChange(data.player)
      }
      lastUpdatedRef.current = 0  // Force refresh
      await fetchGameState()
    } catch {
      setError('Failed to connect to server')
    }
  }, [gameId, playerToken, fetchGameState, onPlayerChange])

  const handleLeave = useCallback(async () => {
    try {
      await fetch(`/api/games/${gameId}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerToken }),
      })
    } catch {
      // Ignore errors when leaving
    }
    onLeave()
  }, [gameId, playerToken, onLeave])

  if (error) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        color: 'white',
        fontFamily: 'sans-serif',
      }}>
        <h2 style={{ color: '#ff6b6b' }}>Error</h2>
        <p>{error}</p>
        <button
          onClick={onLeave}
          style={{
            marginTop: 20,
            padding: '10px 20px',
            background: '#4a4a6e',
            border: 'none',
            borderRadius: 4,
            color: 'white',
            cursor: 'pointer',
            fontSize: 16,
          }}
        >
          Back to Lobby
        </button>
      </div>
    )
  }

  if (!gameState) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        color: 'white',
        fontFamily: 'sans-serif',
      }}>
        Loading...
      </div>
    )
  }

  const isMyTurn = gameState.currentPlayer === myPlayer
  const opponentPlayer = myPlayer === 'x' ? 'o' : 'x'
  const opponentPresent = !!gameState.players[opponentPlayer]

  // Check if opponent was ever in the game (board has more than just the initial move)
  const gameHasStarted = Object.keys(gameState.cells).length > 1
  const waitingForOpponent = !opponentPresent && !gameHasStarted
  const opponentLeft = !opponentPresent && gameHasStarted

  // Can undo first move if it's my turn and I've made one move
  const canUndoFirst = isMyTurn && gameState.movesThisTurn === 1 && !!gameState.firstMoveKey

  // Can undo second move if it's not my turn (I just finished) and opponent hasn't moved yet
  const canUndoSecond = !isMyTurn && gameState.movesThisTurn === 0 && !!gameState.lastTurnMoves

  return (
    <HexGrid
      gameId={gameId}
      cells={gameState.cells}
      movesThisTurn={gameState.movesThisTurn}
      firstMoveKey={gameState.firstMoveKey}
      lastTurnMoves={gameState.lastTurnMoves}
      winner={gameState.winner}
      winningCells={gameState.winningCells}
      myPlayer={myPlayer}
      isMyTurn={isMyTurn}
      canUndoFirst={canUndoFirst}
      canUndoSecond={canUndoSecond}
      onMove={handleMove}
      onUndoFirst={handleUndoFirst}
      onUndoSecond={handleUndo}
      onReset={handleReset}
      onLeave={handleLeave}
      waitingForOpponent={waitingForOpponent}
      opponentLeft={opponentLeft}
    />
  )
}
