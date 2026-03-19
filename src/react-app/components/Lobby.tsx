import { useState } from 'react'
import type { Player, CreateGameResponse, JoinGameResponse } from '../../shared/types'

interface LobbyProps {
  onJoinGame: (gameId: string, playerToken: string, player: Player) => void
}

export default function Lobby({ onJoinGame }: LobbyProps) {
  const [joinGameId, setJoinGameId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleCreateGame = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/games', { method: 'POST' })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to create game')
        return
      }
      const data: CreateGameResponse = await res.json()
      onJoinGame(data.gameId, data.playerToken, data.player)
    } catch {
      setError('Failed to connect to server')
    } finally {
      setLoading(false)
    }
  }

  const handleJoinGame = async () => {
    if (!joinGameId.trim()) {
      setError('Please enter a game ID')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/games/${joinGameId}/join`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to join game')
        return
      }
      const data: JoinGameResponse = await res.json()
      onJoinGame(joinGameId, data.playerToken, data.player)
    } catch {
      setError('Failed to connect to server')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      color: 'white',
      fontFamily: 'sans-serif',
      padding: 20,
    }}>
      <h1 style={{ fontSize: 48, marginBottom: 10 }}>Hex Tic-Tac-Toe</h1>
      <p style={{ color: '#888', marginBottom: 40, textAlign: 'center' }}>
        Get 6 in a row to win. Each player makes 2 moves per turn.
      </p>

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 30,
        width: '100%',
        maxWidth: 400,
      }}>
        <button
          onClick={handleCreateGame}
          disabled={loading}
          style={{
            padding: '15px 30px',
            fontSize: 20,
            background: '#4ecdc4',
            border: 'none',
            borderRadius: 8,
            color: 'white',
            cursor: loading ? 'wait' : 'pointer',
            fontWeight: 'bold',
          }}
        >
          Create New Game
        </button>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <div style={{ flex: 1, height: 1, background: '#4a4a6e' }} />
          <span style={{ color: '#888' }}>or</span>
          <div style={{ flex: 1, height: 1, background: '#4a4a6e' }} />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <input
            type="text"
            value={joinGameId}
            onChange={(e) => setJoinGameId(e.target.value)}
            placeholder="Enter game ID"
            disabled={loading}
            style={{
              flex: 1,
              padding: '15px',
              fontSize: 18,
              background: '#2a2a4e',
              border: '1px solid #4a4a6e',
              borderRadius: 8,
              color: 'white',
              outline: 'none',
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleJoinGame()
            }}
          />
          <button
            onClick={handleJoinGame}
            disabled={loading}
            style={{
              padding: '15px 25px',
              fontSize: 18,
              background: '#ff6b6b',
              border: 'none',
              borderRadius: 8,
              color: 'white',
              cursor: loading ? 'wait' : 'pointer',
              fontWeight: 'bold',
            }}
          >
            Join
          </button>
        </div>

        {error && (
          <p style={{ color: '#ff6b6b', textAlign: 'center', margin: 0 }}>
            {error}
          </p>
        )}
      </div>

      <div style={{
        position: 'absolute',
        bottom: 20,
        color: '#666',
        fontSize: 14,
      }}>
        Middle-click to pan | Right-click to undo first move | Backspace to undo second move
      </div>
    </div>
  )
}
