import { useState, useEffect, useCallback, useRef } from 'react'
import HexGrid from './HexGrid'
import type { Player, CellState } from '../../shared/types'

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
}

export default function Game({ gameId, playerToken, myPlayer, onLeave }: GameProps) {
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const lastUpdatedRef = useRef<number>(0)

  const fetchGameState = useCallback(async () => {
    try {
      const res = await fetch(`/api/games/${gameId}`)
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to fetch game')
        return
      }
      const data: GameState = await res.json()

      // Only update if the game state has changed
      if (data.updatedAt > lastUpdatedRef.current) {
        lastUpdatedRef.current = data.updatedAt
        setGameState(data)
      }
    } catch {
      setError('Failed to connect to server')
    }
  }, [gameId])

  // Initial fetch
  useEffect(() => {
    fetchGameState()
  }, [fetchGameState])

  // Poll for updates
  useEffect(() => {
    const interval = setInterval(fetchGameState, 1000)
    return () => clearInterval(interval)
  }, [fetchGameState])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.key === 'Backspace' && gameState) {
        e.preventDefault()
        // Only undo if it's not our turn (we just finished our turn)
        const previousPlayer = gameState.currentPlayer === 'x' ? 'o' : 'x'
        if (previousPlayer === myPlayer && gameState.movesThisTurn === 0 && gameState.lastTurnMoves) {
          await handleUndo()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [gameState, myPlayer])

  const handleMove = useCallback(async (col: number, row: number) => {
    try {
      const res = await fetch(`/api/games/${gameId}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ col, row, playerToken }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to make move')
        return
      }
      // Immediately fetch updated state
      await fetchGameState()
    } catch {
      setError('Failed to connect to server')
    }
  }, [gameId, playerToken, fetchGameState])

  const handleUndoFirst = useCallback(async () => {
    try {
      const res = await fetch(`/api/games/${gameId}/undo-first`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerToken }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to undo')
        return
      }
      await fetchGameState()
    } catch {
      setError('Failed to connect to server')
    }
  }, [gameId, playerToken, fetchGameState])

  const handleUndo = useCallback(async () => {
    try {
      const res = await fetch(`/api/games/${gameId}/undo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerToken }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to undo')
        return
      }
      await fetchGameState()
    } catch {
      setError('Failed to connect to server')
    }
  }, [gameId, playerToken, fetchGameState])

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
      lastUpdatedRef.current = 0  // Force refresh
      await fetchGameState()
    } catch {
      setError('Failed to connect to server')
    }
  }, [gameId, playerToken, fetchGameState])

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
  const waitingForOpponent = !gameState.players.o

  return (
    <HexGrid
      gameId={gameId}
      cells={gameState.cells}
      currentPlayer={gameState.currentPlayer}
      movesThisTurn={gameState.movesThisTurn}
      firstMoveKey={gameState.firstMoveKey}
      winner={gameState.winner}
      winningCells={gameState.winningCells}
      myPlayer={myPlayer}
      isMyTurn={isMyTurn}
      onMove={handleMove}
      onUndoFirst={handleUndoFirst}
      onReset={handleReset}
      onLeave={handleLeave}
      waitingForOpponent={waitingForOpponent}
    />
  )
}
