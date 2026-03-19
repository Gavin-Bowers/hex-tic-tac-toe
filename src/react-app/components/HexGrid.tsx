import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react'
import { Stage, Layer, Line, Image, Shape } from 'react-konva'
import { defineHex, Grid, rectangle, Hex } from 'honeycomb-grid'
import useImage from 'use-image'
import type Konva from 'konva'

import xSvgUrl from '../assets/x.svg'
import oSvgUrl from '../assets/o.svg'
import type { CellState, Player } from '../../shared/types'
import { GRID_SIZE } from '../../shared/gameLogic'
import './HexGrid.css'

const HEX_SIZE = 30
const CENTER = Math.floor(GRID_SIZE / 2)
const BUFFER = 600

const MyHex = defineHex({
  dimensions: HEX_SIZE,
  origin: 'topLeft',
})

function getHexCorners(hex: Hex): number[] {
  const corners = hex.corners
  return corners.flatMap(corner => [corner.x, corner.y])
}

interface HexData {
  col: number
  row: number
  corners: number[]
  centerX: number
  centerY: number
  width: number
  height: number
}

interface HexGridProps {
  gameId: string
  cells: Record<string, CellState>
  movesThisTurn: number
  firstMoveKey: string | null
  lastTurnMoves: { first: string; second: string } | null
  winner: Player | 'closed' | null
  winningCells: string[]
  myPlayer: Player | null
  isMyTurn: boolean
  canUndoFirst: boolean
  canUndoSecond: boolean
  onMove: (col: number, row: number) => void
  onUndoFirst: () => void
  onUndoSecond: () => void
  onReset: () => void
  onLeave: () => void
  waitingForOpponent: boolean
  opponentLeft: boolean
}

function HexGrid({
  gameId,
  cells,
  movesThisTurn,
  firstMoveKey,
  lastTurnMoves,
  winner,
  winningCells,
  myPlayer,
  isMyTurn,
  canUndoFirst,
  canUndoSecond,
  onMove,
  onUndoFirst,
  onUndoSecond,
  onReset,
  onLeave,
  waitingForOpponent,
  opponentLeft,
}: HexGridProps) {
  const [stagePos, setStagePos] = useState<{ x: number; y: number } | null>(null)
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight })
  const stageRef = useRef<Konva.Stage>(null)
  const mouseButtonRef = useRef<number>(0)
  const lastUpdateRef = useRef<number>(0)

  const winningCellsSet = useMemo(() => new Set(winningCells), [winningCells])
  const recentMovesSet = useMemo(() => {
    const set = new Set<string>()
    if (firstMoveKey) set.add(firstMoveKey)
    if (lastTurnMoves) {
      set.add(lastTurnMoves.first)
      set.add(lastTurnMoves.second)
    }
    return set
  }, [firstMoveKey, lastTurnMoves])

  const grid = useMemo(() => {
    return new Grid(MyHex, rectangle({ width: GRID_SIZE, height: GRID_SIZE }))
  }, [])

  const hexDataMap = useMemo(() => {
    const map = new Map<string, HexData>()
    for (const hex of grid) {
      const key = `${hex.col},${hex.row}`
      map.set(key, {
        col: hex.col,
        row: hex.row,
        corners: getHexCorners(hex),
        centerX: hex.x,
        centerY: hex.y,
        width: hex.width,
        height: hex.height
      })
    }
    return map
  }, [grid])

  const visibleHexes = useMemo(() => {
    if (stagePos === null) return []

    const minX = -stagePos.x - BUFFER
    const maxX = -stagePos.x + dimensions.width + BUFFER
    const minY = -stagePos.y - BUFFER
    const maxY = -stagePos.y + dimensions.height + BUFFER

    const firstHex = hexDataMap.get('0,0')
    if (!firstHex) return []

    const hexWidth = firstHex.width
    const hexHeight = firstHex.height
    const startX = firstHex.centerX
    const startY = firstHex.centerY
    const verticalSpacing = hexHeight * 0.75

    const minCol = Math.max(0, Math.floor((minX - startX) / hexWidth) - 1)
    const maxCol = Math.min(GRID_SIZE - 1, Math.ceil((maxX - startX) / hexWidth) + 1)
    const minRow = Math.max(0, Math.floor((minY - startY) / verticalSpacing) - 1)
    const maxRow = Math.min(GRID_SIZE - 1, Math.ceil((maxY - startY) / verticalSpacing) + 1)

    const result: HexData[] = []
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const hex = hexDataMap.get(`${col},${row}`)
        if (hex) {
          result.push(hex)
        }
      }
    }
    return result
  }, [hexDataMap, stagePos, dimensions])

  // Map of all occupied cells for efficient lookup
  const occupiedCells = useMemo(() => {
    const map = new Map<string, { centerX: number; centerY: number; state: 'x' | 'o' }>()
    for (const [key, state] of Object.entries(cells)) {
      if (state === 'x' || state === 'o') {
        const hexData = hexDataMap.get(key)
        if (hexData) {
          map.set(key, { centerX: hexData.centerX, centerY: hexData.centerY, state })
        }
      }
    }
    return map
  }, [cells, hexDataMap])

  // Calculate off-screen move indicators
  const offScreenIndicators = useMemo(() => {
    if (stagePos === null) return []

    const INDICATOR_SIZE = 16
    const PADDING = INDICATOR_SIZE / 2 + 2 // Keep indicator fully visible
    const indicators: { x: number; y: number; angle: number; state: 'x' | 'o' }[] = []

    for (const [, cell] of occupiedCells) {
      // Convert world position to screen position
      const screenX = cell.centerX + stagePos.x
      const screenY = cell.centerY + stagePos.y

      // Check if off screen (with buffer so partly visible cells don't show indicators)
      const EDGE_BUFFER = 40
      const isOffScreen = screenX < -EDGE_BUFFER || screenX > dimensions.width + EDGE_BUFFER ||
                          screenY < -EDGE_BUFFER || screenY > dimensions.height + EDGE_BUFFER

      if (isOffScreen) {
        // Clamp to screen edge with minimal padding
        const clampedX = Math.max(PADDING, Math.min(dimensions.width - PADDING, screenX))
        const clampedY = Math.max(PADDING, Math.min(dimensions.height - PADDING, screenY))

        // Calculate angle pointing towards the off-screen cell
        const angle = Math.atan2(screenY - clampedY, screenX - clampedX) * (180 / Math.PI)

        indicators.push({
          x: clampedX,
          y: clampedY,
          angle,
          state: cell.state
        })
      }
    }

    return indicators
  }, [occupiedCells, stagePos, dimensions])

  useEffect(() => {
    const handleResize = () => {
      setDimensions({ width: window.innerWidth, height: window.innerHeight })
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (stagePos !== null) return

    const centerHex = grid.getHex({ col: CENTER, row: CENTER })
    if (centerHex) {
      const hexCenter = {
        x: centerHex.x + HEX_SIZE,
        y: centerHex.y + HEX_SIZE * Math.sqrt(3) / 2
      }
      setStagePos({
        x: dimensions.width / 2 - hexCenter.x,
        y: dimensions.height / 2 - hexCenter.y
      })
    }
  }, [grid, dimensions, stagePos])

  const handleDragMove = useCallback(() => {
    const now = performance.now()
    if (now - lastUpdateRef.current < 50) return

    lastUpdateRef.current = now
    const stage = stageRef.current
    if (stage) {
      setStagePos({
        x: stage.x(),
        y: stage.y()
      })
    }
  }, [])

  const handleDragEnd = useCallback(() => {
    const stage = stageRef.current
    if (stage) {
      setStagePos({
        x: stage.x(),
        y: stage.y()
      })
    }
  }, [])

  const handleStageMouseDown = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    mouseButtonRef.current = e.evt.button
  }, [])

  const dragBoundFunc = useCallback((pos: { x: number; y: number }) => {
    if (mouseButtonRef.current !== 1) {
      return { x: stagePos?.x ?? 0, y: stagePos?.y ?? 0 }
    }
    return pos
  }, [stagePos])

  const handleLeftClick = useCallback((col: number, row: number) => {
    if (!isMyTurn || winner || waitingForOpponent || opponentLeft) return
    onMove(col, row)
  }, [isMyTurn, winner, waitingForOpponent, opponentLeft, onMove])

  const handleRightClick = useCallback(() => {
    if (winner) return
    if (canUndoFirst) {
      onUndoFirst()
    } else if (canUndoSecond) {
      onUndoSecond()
    }
  }, [winner, canUndoFirst, canUndoSecond, onUndoFirst, onUndoSecond])

  if (stagePos === null) {
    return null
  }

  return (
    <>
      {/* Top left - turn status and player indicator */}
      <div className="hex-ui left-panel">
        {/* Turn status - always shown */}
        <div className="hex-ui-box turn-status">
          <span className="status-text">
            {isMyTurn ? "It's your turn" : "It's your opponent's turn"}
          </span>
          <span className="moves-count">
            ({movesThisTurn}/2 moves)
          </span>
        </div>

        {/* Player indicator - always shown */}
        {myPlayer && (
          <div className="hex-ui-box player-indicator">
            <span className="status-text">
              You're playing as
              <img
                src={myPlayer === 'x' ? xSvgUrl : oSvgUrl}
                alt={myPlayer}
                className={`player-icon ${myPlayer}`}
              />
            </span>
          </div>
        )}
      </div>

      {/* Top center - waiting status or win/lose */}
      {(waitingForOpponent || opponentLeft || (winner && winner !== 'closed')) && (
        <div className="hex-ui hex-ui-box center-status">
          {winner && winner !== 'closed' ? (
            <span className="status-text result">
              {winner === myPlayer ? 'You Win!' : 'You Lose'}
            </span>
          ) : (
            <span className="status-text waiting">
              {waitingForOpponent ? 'Waiting for a player to join' : 'Your opponent left'}
            </span>
          )}
        </div>
      )}

      {/* Top right - game ID, new game, and leave button */}
      <div className="hex-ui game-controls">
        {/* Game ID row */}
        <div className="hex-ui-box control-row">
          <span className="game-id">{gameId}</span>
          <button
            onClick={() => navigator.clipboard.writeText(gameId)}
            title="Copy game ID"
            className={`icon-btn ${waitingForOpponent ? 'highlight' : ''}`}
          >
            <span className="material-symbols-outlined">content_copy</span>
          </button>
        </div>

        {/* New Game row */}
        <div className="hex-ui-box control-row">
          <span className="control-label large">New Game</span>
          <button
            onClick={onReset}
            title="New Game"
            className={`icon-btn ${winner && winner !== 'closed' ? 'highlight' : ''}`}
          >
            <span className="material-symbols-outlined">restart_alt</span>
          </button>
        </div>

        {/* Exit Lobby row */}
        <div className="hex-ui-box control-row">
          <span className="control-label large">Exit Lobby</span>
          <button
            onClick={onLeave}
            title="Exit Lobby"
            className="icon-btn danger"
          >
            <span className="material-symbols-outlined">exit_to_app</span>
          </button>
        </div>
      </div>
      <Stage
        ref={stageRef}
        width={dimensions.width}
        height={dimensions.height}
        x={stagePos.x}
        y={stagePos.y}
        draggable
        dragBoundFunc={dragBoundFunc}
        onMouseDown={handleStageMouseDown}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onContextMenu={(e) => e.evt.preventDefault()}
      >
        <Layer>
          {visibleHexes.map(({ col, row, corners }) => {
            const key = `${col},${row}`
            const state = cells[key] || 'empty'

            return (
              <HexCell
                key={key}
                corners={corners}
                state={state}
                isWinningCell={winningCellsSet.has(key)}
                isRecentMove={recentMovesSet.has(key)}
                col={col}
                row={row}
                onLeftClick={handleLeftClick}
                onRightClick={handleRightClick}
              />
            )
          })}
        </Layer>
        <Layer>
          {visibleHexes.map(({ col, row, centerX, centerY, width, height }) => {
            const key = `${col},${row}`
            const state = cells[key]
            if (!state || state === 'empty') return null

            const isFirstMove = key === firstMoveKey

            return (
              <CellIcon
                key={`icon-${key}`}
                state={state}
                centerX={centerX}
                centerY={centerY}
                width={width}
                height={height}
                isFirstMove={isFirstMove}
              />
            )
          })}
        </Layer>
        {winner && winner !== 'closed' && (
          <Layer>
            {visibleHexes
              .filter(({ col, row }) => winningCellsSet.has(`${col},${row}`))
              .map(({ col, row, corners }) => {
                const key = `${col},${row}`
                const state = cells[key]
                return (
                  <Line
                    key={`win-border-${key}`}
                    points={corners}
                    closed
                    stroke={state === 'x' ? '#ff6b6b' : '#4eadcc'}
                    strokeWidth={2}
                    listening={false}
                  />
                )
              })}
          </Layer>
        )}
        {/* Off-screen indicators layer - fixed to screen space */}
        <Layer x={-stagePos.x} y={-stagePos.y} listening={false}>
          {offScreenIndicators.map((indicator, i) => (
            <OffScreenIndicator
              key={`indicator-${i}`}
              x={indicator.x}
              y={indicator.y}
              angle={indicator.angle}
              color={indicator.state === 'x' ? '#ff6b6b' : '#4ecdc4'}
            />
          ))}
        </Layer>
      </Stage>
    </>
  )
}

interface HexCellProps {
  corners: number[]
  state: CellState
  isWinningCell: boolean
  isRecentMove: boolean
  col: number
  row: number
  onLeftClick: (col: number, row: number) => void
  onRightClick: () => void
}

const HexCell = memo(function HexCell({ corners, state, isWinningCell, isRecentMove, col, row, onLeftClick, onRightClick }: HexCellProps) {
  const [hovered, setHovered] = useState(false)

  let fillColor = '#2a2a4e'

  if (isWinningCell) {
    fillColor = state === 'x' ? '#6b3a3a' : '#2a4a5a'
  } else if (isRecentMove) {
    fillColor = '#3a3a5e'
  } else if (hovered && state === 'empty') {
    fillColor = '#3a3a5e'
  }

  const handleMouseDown = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (e.evt.button === 0) {
      onLeftClick(col, row)
    } else if (e.evt.button === 2) {
      e.evt.preventDefault()
      onRightClick()
    }
  }, [col, row, onLeftClick, onRightClick])

  const handleTouchStart = useCallback(() => {
    onLeftClick(col, row)
  }, [col, row, onLeftClick])

  return (
    <Line
      points={corners}
      closed
      fill={fillColor}
      stroke="#4a4a6e"
      strokeWidth={1}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    />
  )
})

interface CellIconProps {
  state: 'x' | 'o'
  centerX: number
  centerY: number
  width: number
  height: number
  isFirstMove: boolean
}

const CellIcon = memo(function CellIcon({ state, centerX, centerY, width, height, isFirstMove }: CellIconProps) {
  const [xImage] = useImage(xSvgUrl)
  const [oImage] = useImage(oSvgUrl)

  const image = state === 'x' ? xImage : oImage
  const baseSize = Math.min(width, height)
  const iconSize = state === 'x' ? baseSize : baseSize * 0.85

  if (!image) return null

  return (
    <Image
      image={image}
      x={centerX - iconSize / 2}
      y={centerY - iconSize / 2}
      width={iconSize}
      height={iconSize}
      opacity={isFirstMove ? 0.5 : 1}
      listening={false}
    />
  )
})

interface OffScreenIndicatorProps {
  x: number
  y: number
  angle: number
  color: string
}

const OffScreenIndicator = memo(function OffScreenIndicator({ x, y, angle, color }: OffScreenIndicatorProps) {
  const size = 16

  return (
    <Shape
      x={x}
      y={y}
      rotation={angle + 90}
      sceneFunc={(context, shape) => {
        const h = size
        const w = size * 0.8

        context.beginPath()
        context.moveTo(0, -h / 2)
        context.lineTo(w / 2, h / 2)
        context.lineTo(-w / 2, h / 2)
        context.closePath()

        context.fillStrokeShape(shape)
      }}
      fill={color}
      opacity={0.8}
      listening={false}
    />
  )
})

export default HexGrid
