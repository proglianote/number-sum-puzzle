/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RefreshCw, Trophy, CheckCircle2, Heart, MousePointer2, Eraser, AlertCircle } from 'lucide-react';

// --- Constants ---
const GRID_SIZE = 5;
const INITIAL_LIVES = 2;
const COLORS = {
  initial: '#DED0C1', // Light Greige
  selected: '#A8998A', // Dark Greige
  locked: '#8E8071',   // Accent
  background: '#F5F5F4', // Light Grey-Beige
  text: '#4A4A4A',
  success: '#6B8E6B',
  error: '#E57373', // Soft Red for hearts and errors
  white: '#FFFFFF',
};

// --- Types ---
type CellStatus = 'none' | 'selected' | 'erased';

interface Cell {
  id: number;
  row: number;
  col: number;
  value: number;
  status: CellStatus;
  isCorrect: boolean;
}

export default function App() {
  const [cells, setCells] = useState<Cell[]>([]);
  const [rowTargets, setRowTargets] = useState<number[]>([]);
  const [colTargets, setColTargets] = useState<number[]>([]);
  const [isWon, setIsWon] = useState<boolean>(false);
  const [isGameOver, setIsGameOver] = useState<boolean>(false);
  const [isGameStarted, setIsGameStarted] = useState<boolean>(false);
  const [lives, setLives] = useState<number>(INITIAL_LIVES);
  const [mode, setMode] = useState<'select' | 'erase'>('select');
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [hasStarted, setHasStarted] = useState<boolean>(false);
  const [isAdPlaying, setIsAdPlaying] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [adTimeLeft, setAdTimeLeft] = useState<number>(30);
  const [canRevive, setCanRevive] = useState<boolean>(true);
  const lastTapTime = React.useRef<number>(0);
  const adTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const [solveCount, setSolveCount] = useState<number>(0);
  const [errorFlash, setErrorFlash] = useState<number | null>(null);

  // --- Persistence ---
  useEffect(() => {
    const saved = localStorage.getItem('numberSum_solveCount');
    if (saved) {
      setSolveCount(parseInt(saved, 10));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('numberSum_solveCount', solveCount.toString());
  }, [solveCount]);

  // --- Ad Placeholder ---
  const showAdPlaceholder = () => {
    console.log('Ad will be shown here');
  };

  // --- Game Logic ---
  const generateLevel = useCallback(() => {
    // 1. Generate random numbers 1-9 for a 4x4 grid
    const newCells: Cell[] = [];
    const solutionMask = Array.from({ length: GRID_SIZE * GRID_SIZE }, () => false);
    
    // Ensure every row has at least one correct cell
    for (let r = 0; r < GRID_SIZE; r++) {
      const randomCol = Math.floor(Math.random() * GRID_SIZE);
      solutionMask[r * GRID_SIZE + randomCol] = true;
    }

    // Ensure every column has at least one correct cell
    for (let c = 0; c < GRID_SIZE; c++) {
      // Check if this column already has a correct cell
      let hasCorrect = false;
      for (let r = 0; r < GRID_SIZE; r++) {
        if (solutionMask[r * GRID_SIZE + c]) {
          hasCorrect = true;
          break;
        }
      }
      if (!hasCorrect) {
        const randomRow = Math.floor(Math.random() * GRID_SIZE);
        solutionMask[randomRow * GRID_SIZE + c] = true;
      }
    }

    // Add some extra random correct cells for variety
    for (let i = 0; i < solutionMask.length; i++) {
      if (!solutionMask[i] && Math.random() > 0.6) {
        solutionMask[i] = true;
      }
    }

    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const id = r * GRID_SIZE + c;
        newCells.push({
          id,
          row: r,
          col: c,
          value: Math.floor(Math.random() * 9) + 1,
          status: 'none',
          isCorrect: solutionMask[id],
        });
      }
    }

    // 2. Calculate row and column targets based on the solution
    // and ensure they are at least 5
    let rTargets = new Array(GRID_SIZE).fill(0);
    let cTargets = new Array(GRID_SIZE).fill(0);

    const calculateTargets = (cellsList: Cell[]) => {
      const rows = new Array(GRID_SIZE).fill(0);
      const cols = new Array(GRID_SIZE).fill(0);
      cellsList.forEach(cell => {
        if (cell.isCorrect) {
          rows[cell.row] += cell.value;
          cols[cell.col] += cell.value;
        }
      });
      return { rows, cols };
    };

    let targets = calculateTargets(newCells);
    
    // Safety loop to ensure targets >= 5
    let attempts = 0;
    while ((targets.rows.some(v => v < 5) || targets.cols.some(v => v < 5)) && attempts < 20) {
      attempts++;
      for (let r = 0; r < GRID_SIZE; r++) {
        if (targets.rows[r] < 5) {
          const col = Math.floor(Math.random() * GRID_SIZE);
          newCells[r * GRID_SIZE + col].isCorrect = true;
          // Increase value if needed to reach 5 faster
          if (newCells[r * GRID_SIZE + col].value < 3) newCells[r * GRID_SIZE + col].value += 3;
        }
      }
      for (let c = 0; c < GRID_SIZE; c++) {
        if (targets.cols[c] < 5) {
          const row = Math.floor(Math.random() * GRID_SIZE);
          newCells[row * GRID_SIZE + c].isCorrect = true;
          if (newCells[row * GRID_SIZE + c].value < 3) newCells[row * GRID_SIZE + c].value += 3;
        }
      }
      targets = calculateTargets(newCells);
    }

    setCells(newCells);
    setRowTargets(targets.rows);
    setColTargets(targets.cols);
    setIsWon(false);
    setIsGameOver(false);
    setHasStarted(false);
    setCanRevive(true);
    setIsAdPlaying(false);
    setLives(INITIAL_LIVES);
    setMode('select');
    setIsChecking(false);
    lastTapTime.current = 0;
  }, []);

  // Initialize game
  useEffect(() => {
    generateLevel();
  }, [generateLevel]);

  // Calculate current sums
  const currentRowSums = useMemo(() => {
    const sums = new Array(GRID_SIZE).fill(0);
    cells.forEach(cell => {
      if (cell.status === 'selected') sums[cell.row] += cell.value;
    });
    return sums;
  }, [cells]);

  const currentColSums = useMemo(() => {
    const sums = new Array(GRID_SIZE).fill(0);
    cells.forEach(cell => {
      if (cell.status === 'selected') sums[cell.col] += cell.value;
    });
    return sums;
  }, [cells]);

  // Check win condition
  useEffect(() => {
    if (cells.length === 0 || isWon || isGameOver) return;

    const allRowsMatch = currentRowSums.every((sum, i) => sum === rowTargets[i]);
    const allColsMatch = currentColSums.every((sum, i) => sum === colTargets[i]);

    if (allRowsMatch && allColsMatch) {
      setIsWon(true);
      const newSolveCount = solveCount + 1;
      setSolveCount(newSolveCount);
      
      if (newSolveCount % 3 === 0) {
        showAdPlaceholder();
      }
    }
  }, [currentRowSums, currentColSums, rowTargets, colTargets, isWon, isGameOver, solveCount, cells.length]);

  // --- Ad & Revive Logic ---
  const handleRequestAd = () => {
    if (!canRevive) return;
    setIsAdPlaying(true);
    setIsPaused(true);
    setAdTimeLeft(30);
  };

  const giveReward = useCallback(() => {
    setLives(1);
    setIsGameOver(false);
    setIsAdPlaying(false);
    setIsPaused(false);
    setCanRevive(false);
    if (adTimerRef.current) clearInterval(adTimerRef.current);
  }, []);

  const closeAdWithoutReward = () => {
    setIsAdPlaying(false);
    setIsPaused(false);
    if (adTimerRef.current) clearInterval(adTimerRef.current);
  };

  useEffect(() => {
    if (isAdPlaying && adTimeLeft > 0) {
      adTimerRef.current = setInterval(() => {
        setAdTimeLeft(prev => {
          if (prev <= 1) {
            giveReward();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (adTimerRef.current) clearInterval(adTimerRef.current);
    };
  }, [isAdPlaying, adTimeLeft, giveReward]);

  // Handle cell click
  const handleCellClick = (id: number) => {
    // 1. Logical Processing Guard (Instant response, but prevent concurrent state updates)
    if (isWon || isGameOver || isChecking || isAdPlaying || isPaused) return;
    
    setIsChecking(true);

    // Find the target cell in current state
    const cell = cells.find(c => c.id === id);
    if (!cell) {
      setIsChecking(false);
      return;
    }

    // Check if the row or column is already solved (using current sums)
    const isRowAlreadySolved = currentRowSums[cell.row] === rowTargets[cell.row];
    const isColAlreadySolved = currentColSums[cell.col] === colTargets[cell.col];
    
    // If already solved OR correctly selected, ignore click
    if (isRowAlreadySolved || isColAlreadySolved || (cell.isCorrect && cell.status === 'selected')) {
      setIsChecking(false);
      return;
    }

    let nextStatus: CellStatus = cell.status;
    let isMistake = false;

    // Determine next status based on mode and correctness
    if (mode === 'select') {
      if (cell.status === 'selected') {
        nextStatus = 'none';
      } else if (cell.status === 'none') {
        if (cell.isCorrect) {
          nextStatus = 'selected';
        } else {
          isMistake = true;
          nextStatus = 'none'; // Keep as 'none' on mistake
        }
      }
    } else { // mode === 'erase'
      if (cell.status === 'erased') {
        nextStatus = 'none';
      } else if (cell.status === 'none') {
        if (!cell.isCorrect) {
          nextStatus = 'erased';
        } else {
          isMistake = true;
          nextStatus = 'none'; // Keep as 'none' on mistake
        }
      }
    }

    // 3. Handle Life Reduction
    if (isMistake) {
      setLives(current => {
        const next = current - 1;
        if (next <= 0) {
          setIsGameOver(true);
          return 0;
        }
        return next;
      });
      setErrorFlash(id);
      setTimeout(() => setErrorFlash(null), 400);
    }

    // 4. Update Grid State
    setCells(prev => prev.map(c => c.id === id ? { ...c, status: nextStatus } : c));
    setHasStarted(true);

    // 5. Release Lock immediately for fluid gameplay
    setIsChecking(false);
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#F5F5F4] overflow-hidden font-sans">
      <div 
        className="relative aspect-[9/16] h-full max-h-[100dvh] max-w-full flex flex-col items-center p-0"
        style={{ color: COLORS.text }}
      >
        <AnimatePresence mode="wait">
          {!isGameStarted ? (
            <motion.div
              key="start-screen"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex-1 flex flex-col items-center justify-center w-full text-center p-4"
            >
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2, type: 'spring' }}
                className="mb-48"
              >
                <h1 className="text-5xl font-black tracking-tighter mb-2 text-gray-900">Number Sum</h1>
                <p className="text-sm font-bold text-stone-500 uppercase tracking-[0.2em]">Level {solveCount + 1}</p>
              </motion.div>

              <button
                onClick={() => setIsGameStarted(true)}
                className="group relative px-14 py-4 bg-[#F5F5F4] text-stone-600 border border-stone-200 rounded-2xl font-bold text-lg shadow-sm hover:shadow-md hover:bg-white transition-all active:scale-95 overflow-hidden"
              >
                <span className="relative z-10">START GAME</span>
                <motion.div 
                  className="absolute inset-0 bg-black/5"
                  initial={{ x: '-100%' }}
                  whileHover={{ x: '100%' }}
                  transition={{ duration: 0.5 }}
                />
              </button>

              <div className="mt-auto pt-8">
                <a 
                  href="#" 
                  className="text-xs text-black opacity-40 hover:opacity-100 transition-opacity uppercase tracking-widest"
                  onClick={(e) => e.preventDefault()}
                >
                  Privacy Policy
                </a>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="game-screen"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="w-full flex flex-col items-center h-full p-0"
            >
              {/* Header & Lives */}
              <div className="w-full flex justify-between items-center px-4 pt-4 mb-2">
                <motion.div 
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                >
                  <h1 className="text-2xl font-bold tracking-tight">Number Sum</h1>
                  <p className="text-[10px] opacity-50 uppercase tracking-[0.2em]">Puzzle Game</p>
                </motion.div>

                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex gap-1"
                >
                  {Array.from({ length: INITIAL_LIVES }).map((_, i) => (
                    <motion.div
                      key={i}
                      animate={{ 
                        scale: i < lives ? 1 : 0.8,
                        opacity: i < lives ? 1 : 0.1,
                      }}
                      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    >
                      <Heart 
                        fill={i < lives ? COLORS.error : 'transparent'} 
                        color={COLORS.error} 
                        size={24} 
                      />
                    </motion.div>
                  ))}
                </motion.div>
              </div>

              {/* Mode Switcher */}
              <div className="flex bg-white/50 p-1 rounded-2xl mb-2 shadow-inner border border-black/5">
                <button
                  onClick={() => setMode('select')}
                  className={`flex items-center gap-2 px-4 py-1.5 rounded-xl transition-all duration-300 ${
                    mode === 'select' ? 'bg-white shadow-md text-black' : 'opacity-40 hover:opacity-60'
                  }`}
                >
                  <MousePointer2 size={16} />
                  <span className="text-xs font-semibold">Select</span>
                </button>
                <button
                  onClick={() => setMode('erase')}
                  className={`flex items-center gap-2 px-4 py-1.5 rounded-xl transition-all duration-300 ${
                    mode === 'erase' ? 'bg-white shadow-md text-black' : 'opacity-40 hover:opacity-60'
                  }`}
                >
                  <Eraser size={16} />
                  <span className="text-xs font-semibold">Erase</span>
                </button>
              </div>

              {/* Game Board Container */}
              <div className="relative p-2 bg-white/30 rounded-3xl shadow-xl backdrop-blur-sm border border-white/20 w-full max-w-[100vw]">
                <div className="grid grid-cols-6 gap-1 sm:gap-2">
                  {/* Row 0: Corner + Column Targets */}
                  <div className="w-full aspect-square flex items-center justify-center">
                    {isWon && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="text-emerald-600"
                      >
                        <CheckCircle2 size={24} />
                      </motion.div>
                    )}
                  </div>
                  {Array.from({ length: GRID_SIZE }).map((_, c) => (
                    <div 
                      key={`col-target-${c}`}
                      className={`flex items-center justify-center w-full aspect-square rounded-xl text-lg font-bold transition-all duration-300 ${
                        hasStarted && currentColSums[c] === colTargets[c] ? 'opacity-0 pointer-events-none' : 'bg-black/5 text-black/20 opacity-100'
                      }`}
                    >
                      {colTargets[c]}
                    </div>
                  ))}

                  {/* Rows 1-5: Row Target + 5 Cells */}
                  {Array.from({ length: GRID_SIZE }).map((_, r) => (
                    <React.Fragment key={`row-${r}`}>
                      {/* Row Target (Left) */}
                      <div 
                        className={`flex items-center justify-center w-full aspect-square rounded-xl text-lg font-bold transition-all duration-300 ${
                          hasStarted && currentRowSums[r] === rowTargets[r] ? 'opacity-0 pointer-events-none' : 'bg-black/5 text-black/20 opacity-100'
                        }`}
                      >
                        {rowTargets[r]}
                      </div>

                      {/* Numbers in the row */}
                      {cells.filter(c => c.row === r).map(cell => {
                        const isRowSolved = currentRowSums[cell.row] === rowTargets[cell.row];
                        const isColSolved = currentColSums[cell.col] === colTargets[cell.col];
                        const isSolved = hasStarted && (isRowSolved || isColSolved);
                        
                        // Auto-cleaning: Hide if manually erased OR if row/col is solved and cell is not selected
                        const isHidden = cell.status === 'erased' || (isSolved && cell.status !== 'selected');
                        const isLocked = isSolved || (cell.isCorrect && cell.status === 'selected');

                        return (
                          <motion.button
                            key={cell.id}
                            animate={{ 
                              scale: errorFlash === cell.id ? [1, 1.1, 1] : 1,
                              backgroundColor: errorFlash === cell.id ? COLORS.error : 
                                              isLocked ? COLORS.locked :
                                              cell.status === 'selected' ? COLORS.selected : 
                                              COLORS.initial,
                              opacity: isHidden ? 0 : 1,
                            }}
                            onClick={() => handleCellClick(cell.id)}
                            disabled={isWon || isGameOver || isLocked || isHidden}
                            className={`
                              w-full aspect-square flex items-center justify-center text-xl sm:text-2xl font-bold
                              rounded-xl transition-all duration-200 shadow-sm relative overflow-hidden
                              ${cell.status === 'selected' && !isHidden && !isLocked ? 'ring-2 sm:ring-4 ring-white shadow-md' : ''}
                              ${isHidden ? 'pointer-events-none' : 'cursor-pointer'}
                            `}
                            style={{ 
                              color: (cell.status === 'selected' || isLocked) ? COLORS.white : COLORS.text,
                            }}
                          >
                            {cell.value}
                          </motion.button>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </div>

                {/* Compact Dialog Overlay (Clear or Game Over) */}
                <AnimatePresence>
                  {(isWon || isGameOver) && !isAdPlaying && (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 z-40 flex items-center justify-center p-4 bg-black/20 backdrop-blur-[2px] rounded-3xl"
                    >
                      <motion.div 
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-[240px] border border-black/5 flex flex-col items-center text-center gap-4"
                      >
                        {isWon ? (
                          <>
                            <div className="bg-emerald-50 p-3 rounded-full text-emerald-500">
                              <Trophy size={32} />
                            </div>
                            <div>
                              <h3 className="text-lg font-bold text-gray-900">Clear!</h3>
                              <p className="text-xs text-gray-500 mt-1">Great job! Ready for more?</p>
                            </div>
                            <button
                              onClick={generateLevel}
                              className="w-full py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-semibold hover:bg-emerald-600 transition-colors flex items-center justify-center gap-2"
                            >
                              <RefreshCw size={14} />
                              Next Level
                            </button>
                          </>
                        ) : (
                          <>
                            <div className="bg-red-50 p-3 rounded-full text-red-500">
                              <AlertCircle size={32} />
                            </div>
                            <div>
                              <h3 className="text-lg font-bold text-gray-900">Game Over</h3>
                              <p className="text-xs text-gray-500 mt-1">Try again or revive!</p>
                            </div>
                            <div className="flex flex-col gap-2 w-full">
                              <button
                                onClick={generateLevel}
                                className="w-full py-2.5 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
                              >
                                <RefreshCw size={14} />
                                Retry
                              </button>
                              {canRevive && (
                                <button
                                  onClick={handleRequestAd}
                                  className="w-full py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-semibold hover:bg-emerald-600 transition-colors flex items-center justify-center gap-2"
                                >
                                  <Heart size={14} fill="white" />
                                  Watch Ad to Revive
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Feedback & Controls */}
              <div className="h-16 mt-2 flex flex-col items-center justify-center gap-2">
                <AnimatePresence mode="wait">
                  {isWon || isGameOver ? null : (
                    <motion.p 
                      key="hint"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-[10px] sm:text-xs opacity-40 text-center max-w-xs"
                    >
                      Select numbers to match row and column targets.
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>

              {/* Footer Info */}
              <div className="mt-auto px-4 pb-4 pt-2 text-[10px] uppercase tracking-widest opacity-30 flex gap-8">
                <span>Level {solveCount + 1}</span>
                <span>Greige Edition</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Ad Overlay */}
      <AnimatePresence>
        {isAdPlaying && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center text-white p-6"
          >
            <div className="absolute top-6 right-6 flex flex-col items-end gap-2">
              <span className="text-sm font-mono opacity-80">Ad: {adTimeLeft}s remaining</span>
              <button 
                onClick={closeAdWithoutReward}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
              >
                <RefreshCw className="rotate-45" size={24} /> {/* Placeholder for X icon */}
              </button>
            </div>
            
            <div className="flex flex-col items-center gap-6 text-center">
              <div className="w-20 h-20 border-4 border-white/20 border-t-white rounded-full animate-spin" />
              <div>
                <h2 className="text-2xl font-bold mb-2">Watching Sponsored Video</h2>
                <p className="opacity-60 text-sm max-w-xs">
                  Your game will resume automatically once the video finishes.
                </p>
              </div>
            </div>

            <div className="mt-12 w-full max-w-xs bg-white/10 h-1 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{ duration: 30, ease: "linear" }}
                className="h-full bg-white"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
