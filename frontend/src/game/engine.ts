// Dot Link - Flow Free game engine helpers (pure functions).
// Grid is rows × cols (size × size). Cells store either:
//   - { type: 'empty' }
//   - { type: 'dot', color, endpoint: 'a' | 'b' }
//   - { type: 'path', color }
// Paths must connect a→b for every color via 4-connected moves, may not cross,
// and the entire grid must be filled.

import type { Dot, LevelData } from '@/src/api/client';

export type Cell =
  | { type: 'empty' }
  | { type: 'dot'; color: string; endpoint: 'a' | 'b' }
  | { type: 'path'; color: string };

export type Point = { r: number; c: number };

export type GameState = {
  size: number;
  dots: Dot[];
  grid: Cell[][];                       // dots are immovable, paths are mutable
  paths: Record<string, Point[]>;       // color -> sequence including endpoints
  drawing: { color: string; from: 'a' | 'b' } | null;
};

export function createState(level: LevelData): GameState {
  const grid: Cell[][] = Array.from({ length: level.size }, () =>
    Array.from({ length: level.size }, () => ({ type: 'empty' } as Cell)),
  );
  for (const d of level.dots) {
    const [ar, ac] = d.a;
    const [br, bc] = d.b;
    grid[ar][ac] = { type: 'dot', color: d.color, endpoint: 'a' };
    grid[br][bc] = { type: 'dot', color: d.color, endpoint: 'b' };
  }
  return {
    size: level.size,
    dots: level.dots,
    grid,
    paths: {},
    drawing: null,
  };
}

export function pointKey(p: Point): string {
  return `${p.r},${p.c}`;
}

function cloneState(s: GameState): GameState {
  return {
    size: s.size,
    dots: s.dots,
    grid: s.grid.map((row) => row.map((c) => ({ ...c }))),
    paths: Object.fromEntries(Object.entries(s.paths).map(([k, v]) => [k, v.map((p) => ({ ...p }))])),
    drawing: s.drawing ? { ...s.drawing } : null,
  };
}

export function equal(a: Point, b: Point) {
  return a.r === b.r && a.c === b.c;
}

export function adjacent(a: Point, b: Point) {
  const dr = Math.abs(a.r - b.r);
  const dc = Math.abs(a.c - b.c);
  return dr + dc === 1;
}

export function getDotAt(state: GameState, p: Point): Dot | null {
  for (const d of state.dots) {
    if ((d.a[0] === p.r && d.a[1] === p.c) || (d.b[0] === p.r && d.b[1] === p.c)) return d;
  }
  return null;
}

export function getEndpoint(dot: Dot, p: Point): 'a' | 'b' | null {
  if (dot.a[0] === p.r && dot.a[1] === p.c) return 'a';
  if (dot.b[0] === p.r && dot.b[1] === p.c) return 'b';
  return null;
}

function clearColor(state: GameState, color: string) {
  const existing = state.paths[color];
  if (!existing) return;
  for (const p of existing) {
    const cell = state.grid[p.r][p.c];
    if (cell.type === 'path' && cell.color === color) {
      state.grid[p.r][p.c] = { type: 'empty' };
    }
  }
  delete state.paths[color];
}

/**
 * Begin a draw stroke at a dot endpoint. Returns updated state and the
 * starting path (just the endpoint).
 */
export function beginAt(stateIn: GameState, p: Point): GameState {
  const state = cloneState(stateIn);
  const cell = state.grid[p.r][p.c];
  let dot: Dot | null = null;
  let endpoint: 'a' | 'b' | null = null;
  let pathStart: Point[] = [];

  if (cell.type === 'dot') {
    dot = getDotAt(state, p);
    if (!dot) return state;
    endpoint = getEndpoint(dot, p);
    if (endpoint === null) return state;
    // Clear any existing path for this color (we're restarting)
    clearColor(state, dot.color);
    pathStart = [p];
  } else if (cell.type === 'path') {
    // Tap on mid-path -> truncate to here and continue
    const color = cell.color;
    const existing = state.paths[color] || [];
    const idx = existing.findIndex((q) => equal(q, p));
    if (idx < 0) return state;
    // Erase everything after idx in the grid (but keep cells <= idx, including p)
    for (let i = idx + 1; i < existing.length; i++) {
      const q = existing[i];
      const qc = state.grid[q.r][q.c];
      if (qc.type === 'path' && qc.color === color) {
        state.grid[q.r][q.c] = { type: 'empty' };
      } else if (qc.type === 'dot' && qc.color === color) {
        // keep endpoint cell as dot
      }
    }
    const trimmed = existing.slice(0, idx + 1);
    state.paths[color] = trimmed;
    // figure out which endpoint we started from
    const startPoint = trimmed[0];
    const startDot = getDotAt(state, startPoint);
    endpoint = startDot ? getEndpoint(startDot, startPoint) : 'a';
    dot = startDot;
    return {
      ...state,
      drawing: dot ? { color: dot.color, from: endpoint || 'a' } : null,
    };
  } else {
    return state;
  }

  state.paths[dot.color] = pathStart;
  return { ...state, drawing: { color: dot.color, from: endpoint } };
}

/**
 * Extend the current stroke to point p if it is adjacent to the path tail.
 * Crossing other colors clears them. Returns new state and a flag indicating completion.
 */
export function extendTo(
  stateIn: GameState,
  p: Point,
): { state: GameState; completed?: boolean } {
  if (!stateIn.drawing) return { state: stateIn };
  const state = cloneState(stateIn);
  const color = state.drawing!.color;
  const path = state.paths[color];
  if (!path || path.length === 0) return { state };
  const tail = path[path.length - 1];
  // Within bounds
  if (p.r < 0 || p.c < 0 || p.r >= state.size || p.c >= state.size) return { state };
  // If same as tail, nothing
  if (equal(p, tail)) return { state };

  // If user moves back along their own path, truncate
  const inPathIdx = path.findIndex((q) => equal(q, p));
  if (inPathIdx >= 0) {
    // Remove cells after inPathIdx
    for (let i = inPathIdx + 1; i < path.length; i++) {
      const q = path[i];
      const qc = state.grid[q.r][q.c];
      if (qc.type === 'path' && qc.color === color) {
        state.grid[q.r][q.c] = { type: 'empty' };
      }
    }
    state.paths[color] = path.slice(0, inPathIdx + 1);
    return { state: { ...state } };
  }

  if (!adjacent(p, tail)) return { state };

  // Inspect target cell
  const target = state.grid[p.r][p.c];
  if (target.type === 'dot') {
    if (target.color === color) {
      // Connecting to opposite endpoint completes this color
      const dotHere = getDotAt(state, p);
      const ep = dotHere ? getEndpoint(dotHere, p) : null;
      if (ep && ep !== state.drawing.from) {
        const newPath = [...path, p];
        state.paths[color] = newPath;
        const completed = checkComplete({ ...state });
        return { state: { ...state, drawing: null }, completed };
      } else {
        // Same endpoint we started - ignore
        return { state };
      }
    } else {
      // Different color's dot - cannot enter
      return { state };
    }
  } else if (target.type === 'path') {
    if (target.color === color) {
      // Shouldn't normally happen (handled above), ignore
      return { state };
    }
    // Other color's path - clear it (Flow Free behaviour)
    clearColor(state, target.color);
    // Now the cell is empty, fall through to place
    state.grid[p.r][p.c] = { type: 'path', color };
    state.paths[color] = [...path, p];
    return { state: { ...state } };
  } else {
    // empty
    state.grid[p.r][p.c] = { type: 'path', color };
    state.paths[color] = [...path, p];
    return { state: { ...state } };
  }
}

export function endStroke(state: GameState): GameState {
  return { ...state, drawing: null };
}

export function checkComplete(state: GameState): boolean {
  // 1) Every color must have a complete path connecting both endpoints
  for (const d of state.dots) {
    const p = state.paths[d.color];
    if (!p || p.length < 2) return false;
    const first = p[0];
    const last = p[p.length - 1];
    const hits = [
      first.r === d.a[0] && first.c === d.a[1],
      first.r === d.b[0] && first.c === d.b[1],
      last.r === d.a[0] && last.c === d.a[1],
      last.r === d.b[0] && last.c === d.b[1],
    ];
    const hitsAB = (hits[0] && hits[3]) || (hits[1] && hits[2]);
    if (!hitsAB) return false;
  }
  // 2) Every cell must be filled
  for (let r = 0; r < state.size; r++) {
    for (let c = 0; c < state.size; c++) {
      const cell = state.grid[r][c];
      if (cell.type === 'empty') return false;
    }
  }
  return true;
}

export function isColorConnected(state: GameState, color: string): boolean {
  const p = state.paths[color];
  if (!p || p.length < 2) return false;
  const dot = state.dots.find((d) => d.color === color);
  if (!dot) return false;
  const first = p[0];
  const last = p[p.length - 1];
  const ok =
    (first.r === dot.a[0] && first.c === dot.a[1] && last.r === dot.b[0] && last.c === dot.b[1]) ||
    (first.r === dot.b[0] && first.c === dot.b[1] && last.r === dot.a[0] && last.c === dot.a[1]);
  return ok;
}

export function filledRatio(state: GameState): number {
  let filled = 0;
  for (let r = 0; r < state.size; r++) {
    for (let c = 0; c < state.size; c++) {
      if (state.grid[r][c].type !== 'empty') filled++;
    }
  }
  return filled / (state.size * state.size);
}

export function computeStars(moves: number, optimalMoves: number, completed: boolean): number {
  if (!completed) return 0;
  if (moves <= optimalMoves) return 3;
  if (moves <= optimalMoves * 1.5) return 2;
  return 1;
}
