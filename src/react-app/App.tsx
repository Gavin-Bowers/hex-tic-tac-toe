import { useState, useEffect } from 'react'
import Lobby from './components/Lobby'
import Game from './components/Game'
import type { Player } from '../shared/types'
import './App.css'

interface GameSession {
  gameId: string
  playerToken: string
  player: Player
}

function App() {
  const [session, setSession] = useState<GameSession | null>(() => {
    // Restore session from URL hash if present
    const hash = window.location.hash.slice(1)
    if (hash) {
      const stored = sessionStorage.getItem(`game:${hash}`)
      if (stored) {
        try {
          const data = JSON.parse(stored)
          return { gameId: hash, ...data }
        } catch {
          // Invalid stored data
        }
      }
    }
    return null
  })

  const handleJoinGame = (gameId: string, playerToken: string, player: Player) => {
    const newSession = { gameId, playerToken, player }
    setSession(newSession)
    // Store in sessionStorage and update URL
    sessionStorage.setItem(`game:${gameId}`, JSON.stringify({ playerToken, player }))
    window.location.hash = gameId
  }

  const handleLeaveGame = () => {
    if (session) {
      sessionStorage.removeItem(`game:${session.gameId}`)
    }
    setSession(null)
    window.location.hash = ''
  }

  // Handle browser back/forward
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1)
      if (!hash) {
        setSession(null)
        return
      }
      const stored = sessionStorage.getItem(`game:${hash}`)
      if (stored) {
        try {
          const data = JSON.parse(stored)
          setSession({ gameId: hash, ...data })
        } catch {
          setSession(null)
        }
      }
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  if (session) {
    return (
      <Game
        gameId={session.gameId}
        playerToken={session.playerToken}
        myPlayer={session.player}
        onLeave={handleLeaveGame}
      />
    )
  }

  return <Lobby onJoinGame={handleJoinGame} />
}

export default App
