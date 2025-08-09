import { useEffect, useMemo, useRef, useState } from 'react'
import { Chess, Move } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import './App.css'

import { StockfishEngine } from './engine/stockfish'

type Color = 'white' | 'black'

function App() {
  const [gameFen, setGameFen] = useState<string>(new Chess().fen())
  const [playerColor] = useState<Color>('white')
  const [status, setStatus] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const [history, setHistory] = useState<Move[]>([])
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null)
  const [legalTargets, setLegalTargets] = useState<Set<string>>(new Set())
  const chessRef = useRef(new Chess())
  const engine = useMemo(() => new StockfishEngine(), [])


  useEffect(() => {
    engine.initialize().then(() => engine.setSkillLevel(20)).catch(() => {})
    return () => {}
  }, [engine])

  const makeAIMove = async () => {
    setIsThinking(true)
    const fen = chessRef.current.fen()
    try {
      const { move } = await engine.getBestMove(fen, { movetimeMs: 500 })
      const from = move.slice(0, 2)
      const to = move.slice(2, 4)
      const promo = move[4]
      const res = chessRef.current.move({ from, to, promotion: (promo as any) ?? 'q' })
      if (!res) return
      setGameFen(chessRef.current.fen())
      setHistory(chessRef.current.history({ verbose: true }))
      updateStatus()
      setSelectedSquare(null)
      setLegalTargets(new Set())
    } finally {
      setIsThinking(false)
    }
  }

  const onSquareClick = ({ square }: { square: string }) => {
    const game = chessRef.current
    const turn = game.turn() === 'w' ? 'white' : 'black'
    const blocked = turn !== playerColor || isThinking
    if (blocked) {
      setSelectedSquare(null)
      setLegalTargets(new Set())
      return
    }

    if (selectedSquare == null) {
      const piece = game.get(square as any)
      if (!piece) return
      const pieceColor = piece.color === 'w' ? 'white' : 'black'
      if (pieceColor !== playerColor) return
      setSelectedSquare(square)
      const legal = game.moves({ square: square as any, verbose: true }) as Move[]
      setLegalTargets(new Set(legal.map((m) => m.to)))
      return
    }

    if (square === selectedSquare) {
      setSelectedSquare(null)
      setLegalTargets(new Set())
      return
    }

    const isLegal = legalTargets.has(square)
    if (!isLegal) {
      const piece = game.get(square as any)
      const pieceColor = piece ? (piece.color === 'w' ? 'white' : 'black') : null
      if (piece && pieceColor === playerColor) {
        setSelectedSquare(square)
        const legal = game.moves({ square: square as any, verbose: true }) as Move[]
        setLegalTargets(new Set(legal.map((m) => m.to)))
      }
      return
    }

    const isPromotion =
      game.get(selectedSquare as any)?.type === 'p' &&
      ((playerColor === 'white' && square[1] === '8') || (playerColor === 'black' && square[1] === '1'))
    let promotion: 'q' | 'r' | 'b' | 'n' | undefined
    if (isPromotion) {
      promotion = (prompt('Promote to (q, r, b, n)?', 'q') as any) ?? 'q'
      if (!['q', 'r', 'b', 'n'].includes(promotion as string)) promotion = 'q'
    }

    const move = game.move({ from: selectedSquare, to: square, promotion: promotion ?? 'q' })
    if (!move) return
    setGameFen(game.fen())
    setHistory(game.history({ verbose: true }))
    updateStatus()
    setSelectedSquare(null)
    setLegalTargets(new Set())

    if (!game.isGameOver()) {
      void makeAIMove()
    }
  }

  const onPieceDrop = ({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }) => {
    if (!targetSquare) return false
    const game = chessRef.current
    const turn = game.turn() === 'w' ? 'white' : 'black'
    if (turn !== playerColor || isThinking) return false

    const isPromotion =
      game.get(sourceSquare as any)?.type === 'p' &&
      ((playerColor === 'white' && targetSquare[1] === '8') || (playerColor === 'black' && targetSquare[1] === '1'))
    let promotion: 'q' | 'r' | 'b' | 'n' | undefined
    if (isPromotion) {
      promotion = (prompt('Promote to (q, r, b, n)?', 'q') as any) ?? 'q'
      if (!['q', 'r', 'b', 'n'].includes(promotion as string)) promotion = 'q'
    }

    const move = game.move({ from: sourceSquare, to: targetSquare, promotion: promotion ?? 'q' })
    if (!move) return false
    setGameFen(game.fen())
    setHistory(game.history({ verbose: true }))
    updateStatus()
    setSelectedSquare(null)
    setLegalTargets(new Set())

    if (!game.isGameOver()) {
      setTimeout(() => void makeAIMove(), 0)
    }
    return true
  }



  useEffect(() => {
    const turn = chessRef.current.turn() === 'w' ? 'white' : 'black'
    if (turn !== playerColor && !chessRef.current.isGameOver()) {
      void makeAIMove()
    }
  }, [playerColor])

  const updateStatus = () => {
    const game = chessRef.current
    let s = ''
    if (game.isGameOver()) {
      if (game.isCheckmate()) s = 'Checkmate'
      else if (game.isStalemate()) s = 'Stalemate'
      else if (game.isInsufficientMaterial()) s = 'Draw: Insufficient material'
      else if (game.isThreefoldRepetition()) s = 'Draw: Threefold repetition'
      else if (game.isDraw()) s = 'Draw'
    } else {
      s = `${game.turn() === 'w' ? 'White' : 'Black'} to move${game.inCheck() ? ' — Check!' : ''}`
    }
    setStatus(s)
  }

  useEffect(() => {
    updateStatus()
  }, [])



  const buildSquareStyles = (): Record<string, React.CSSProperties> => {
    const styles: Record<string, React.CSSProperties> = {}

    const last = history[history.length - 1] as (Move & { from?: string; to?: string }) | undefined
    if (last && (last as any).from && (last as any).to) {
      const from = (last as any).from as string
      const to = (last as any).to as string
      styles[from] = {
        ...(styles[from] || {}),
        boxShadow: 'inset 0 0 0 1000px rgba(255, 235, 59, 0.15)'
      }
      styles[to] = {
        ...(styles[to] || {}),
        boxShadow: 'inset 0 0 0 1000px rgba(255, 235, 59, 0.15)'
      }
    }

    if (selectedSquare) {
      styles[selectedSquare] = {
        ...(styles[selectedSquare] || {}),
        boxShadow: `${styles[selectedSquare]?.boxShadow ?? ''}, inset 0 0 0 3px #42a5f5`
      }
      legalTargets.forEach((sq) => {
        styles[sq] = {
          ...(styles[sq] || {}),
          backgroundImage: 'radial-gradient(circle, rgba(0,200,83,0.9) 0 10px, rgba(0,200,83,0.0) 11px)'
        }
      })
    }

    const game = chessRef.current
    if (!game.isGameOver() && game.inCheck()) {
      const kingSquare = findKingSquare(game, game.turn())
      if (kingSquare) {
        styles[kingSquare] = {
          ...(styles[kingSquare] || {}),
          animation: 'checkPulse 1200ms ease-in-out infinite'
        }
      }
    }

    return styles
  }

  function findKingSquare(game: Chess, turn: 'w' | 'b') {
    const board = game.board() as ReturnType<Chess['board']>
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c]
        if (piece && piece.type === 'k' && piece.color === turn) {
          const files = ['a','b','c','d','e','f','g','h']
          const rank = 8 - r
          return `${files[c]}${rank}`
        }
      }
    }
    return null
  }

  return (
    <div className="app">


      <div className="boardCard">
        <div className="boardWrap">
          <Chessboard
            options={{
              position: gameFen,
              boardOrientation: playerColor,
              onSquareClick,
              onPieceDrop,
              allowDragging: true,
              dragActivationDistance: 4,
              chessboardRows: 8,
              chessboardColumns: 8,
              squareStyles: buildSquareStyles(),
              darkSquareStyle: { background: '#2e3c4e' },
              lightSquareStyle: { background: '#cbd5e1' },
              boardStyle: {
                borderRadius: '8px',
                gap: 0,
                rowGap: 0,
                columnGap: 0,
                lineHeight: 0,
                overflow: 'hidden',
                border: '2px solid rgba(255,255,255,0.1)',
                boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.3)'
              },
              showNotation: true,
            }}
          />
        </div>
        <div className="status">
          {status}
          {status.includes('Checkmate') && (
            <span style={{ color: '#d32f2f', marginLeft: 8 }}>— Checkmate</span>
          )}
          {!status.includes('Checkmate') && status.includes('Check') && (
            <span style={{ color: '#f57c00', marginLeft: 8 }}>— Your king is in check</span>
          )}
        </div>
      </div>



      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Moves</h3>
        <ol className="moves">
          {(() => {
            const pairs: { w?: Move; b?: Move }[] = []
            history.forEach((m, idx) => {
              const pIdx = Math.floor(idx / 2)
              if (!pairs[pIdx]) pairs[pIdx] = {}
              if (idx % 2 === 0) pairs[pIdx].w = m
              else pairs[pIdx].b = m
            })
            return pairs.map((p, i) => (
              <li key={i}>
                <span style={{ marginRight: 8 }}>{p.w?.san ?? ''}</span>
                <span>{p.b?.san ?? ''}</span>
              </li>
            ))
          })()}
        </ol>
      </div>
    </div>
  )
}

export default App
