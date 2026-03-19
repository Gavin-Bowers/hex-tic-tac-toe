import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react'
import { Stage, Layer, Line, Image } from 'react-konva'
import { defineHex, Grid, rectangle, Hex } from 'honeycomb-grid'
import useImage from 'use-image'
import type Konva from 'konva'

import xSvgUrl from '../assets/x.svg'
import oSvgUrl from '../assets/o.svg'
import type { CellState, Player } from '../../shared/types'
import { GRID_SIZE } from '../../shared/gameLogic'

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
  currentPlayer: Player
  movesThisTurn: number
  firstMoveKey: string | null
  winner: Player | 'closed' | null
  winningCells: string[]
  myPlayer: Player | null
  isMyTurn: boolean
  onMove: (col: number, row: number) => void
  onUndoFirst: () => void
  onReset: () => void
  onLeave: () => void
  waitingForOpponent: boolean
}

function HexGrid({
  gameId,
  cells,
  currentPlayer,
  movesThisTurn,
  firstMoveKey,
  winner,
  winningCells,
  myPlayer,
  isMyTurn,
  onMove,
  onUndoFirst,
  onReset,
  onLeave,
  waitingForOpponent,
}: HexGridProps) {
  const [stagePos, setStagePos] = useState<{ x: number; y: number } | null>(null)
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight })
  const stageRef = useRef<Konva.Stage>(null)
  const mouseButtonRef = useRef<number>(0)
  const lastUpdateRef = useRef<number>(0)

  const winningCellsSet = useMemo(() => new Set(winningCells), [winningCells])

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
    if (!isMyTurn || winner || waitingForOpponent) return
    onMove(col, row)
  }, [isMyTurn, winner, waitingForOpponent, onMove])

  const handleRightClick = useCallback((col: number, row: number) => {
    if (!isMyTurn || winner) return
    if (movesThisTurn === 1 && firstMoveKey === `${col},${row}`) {
      onUndoFirst()
    }
  }, [isMyTurn, winner, movesThisTurn, firstMoveKey, onUndoFirst])

  if (stagePos === null) {
    return null
  }

  return (
    <>
      {/* Top left - game status */}
      <div style={{
        position: 'absolute',
        top: 20,
        left: 20,
        padding: '12px 20px',
        background: 'rgba(0, 0, 0, 0.7)',
        borderRadius: 8,
        color: 'white',
        fontFamily: 'sans-serif',
        fontSize: 18,
        zIndex: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 10
      }}>
        {waitingForOpponent ? (
          <span style={{ color: '#888' }}>Waiting for opponent...</span>
        ) : winner === 'closed' ? (
          <span style={{ color: '#888', fontSize: 20 }}>
            Opponent left the game
          </span>
        ) : winner ? (
          <span style={{
            color: winner === 'x' ? '#ff6b6b' : '#4ecdc4',
            fontWeight: 'bold',
            fontSize: 24
          }}>
            {winner.toUpperCase()} WINS!
            {winner === myPlayer && ' (You!)'}
          </span>
        ) : (
          <>
            <span>Turn:</span>
            <span style={{
              color: currentPlayer === 'x' ? '#ff6b6b' : '#4ecdc4',
              fontWeight: 'bold',
              fontSize: 24
            }}>
              {currentPlayer.toUpperCase()}
              {isMyTurn && ' (You)'}
            </span>
            <span style={{ color: '#888', fontSize: 14, marginLeft: 10 }}>
              ({movesThisTurn}/2 moves)
            </span>
          </>
        )}
        {myPlayer && (
          <span style={{
            marginLeft: 20,
            padding: '4px 8px',
            background: myPlayer === 'x' ? '#ff6b6b33' : '#4ecdc433',
            borderRadius: 4,
            color: myPlayer === 'x' ? '#ff6b6b' : '#4ecdc4',
            fontSize: 14,
          }}>
            You: {myPlayer.toUpperCase()}
          </span>
        )}
        <button
          onClick={onReset}
          title="Reset game"
          style={{
            marginLeft: 20,
            padding: '6px',
            background: '#4a4a6e',
            border: 'none',
            borderRadius: 4,
            color: 'white',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 24 }}>
            replay
          </span>
        </button>
      </div>

      {/* Top right - game ID and leave button */}
      <div style={{
        position: 'absolute',
        top: 20,
        right: 20,
        padding: '12px 20px',
        background: 'rgba(0, 0, 0, 0.7)',
        borderRadius: 8,
        color: 'white',
        fontFamily: 'sans-serif',
        fontSize: 14,
        zIndex: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 15
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <span style={{ color: '#888', fontSize: 12 }}>Game ID</span>
          <span style={{ fontFamily: 'monospace', fontSize: 18, letterSpacing: 1 }}>{gameId}</span>
        </div>
        <button
          onClick={onLeave}
          title="Leave game"
          style={{
            padding: '8px 16px',
            background: '#6b3a3a',
            border: 'none',
            borderRadius: 4,
            color: 'white',
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          Leave
        </button>
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
        {winner && (
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
      </Stage>
    </>
  )
}

interface HexCellProps {
  corners: number[]
  state: CellState
  isWinningCell: boolean
  col: number
  row: number
  onLeftClick: (col: number, row: number) => void
  onRightClick: (col: number, row: number) => void
}

const HexCell = memo(function HexCell({ corners, state, isWinningCell, col, row, onLeftClick, onRightClick }: HexCellProps) {
  const [hovered, setHovered] = useState(false)

  let fillColor = '#2a2a4e'

  if (isWinningCell) {
    fillColor = state === 'x' ? '#6b3a3a' : '#2a4a5a'
  } else if (hovered && state === 'empty') {
    fillColor = '#3a3a5e'
  }

  const handleMouseDown = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (e.evt.button === 0) {
      onLeftClick(col, row)
    } else if (e.evt.button === 2) {
      e.evt.preventDefault()
      onRightClick(col, row)
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

export default HexGrid
