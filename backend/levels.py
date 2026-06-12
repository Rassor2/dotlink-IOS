"""
Dot Link - Level Generator
Flow Free-style levels: pre-compute Hamiltonian paths via guaranteed
patterns (snake, column-snake, spiral) then randomly split into N colored
segments. Apply random rotation/reflection per level for visual variety.
Solvability is guaranteed because the base path itself is a valid solution.
"""
import random
from typing import List, Tuple, Dict, Optional

# 5 palette colors (no blue/purple per design constraints)
PALETTE = [
    "#32A852",  # Emerald
    "#FF7F50",  # Coral
    "#FFC107",  # Amber
    "#E91E63",  # Rose
    "#98FF98",  # Mint
]

DIFFICULTY_CONFIG: Dict[str, Dict] = {
    "lumina":   {"label": "Débutant",   "size": 4, "colors": (2, 3), "count": 60, "order": 1},
    "aurora":   {"label": "Facile",     "size": 5, "colors": (3, 4), "count": 70, "order": 2},
    "zenith":   {"label": "Moyen",      "size": 6, "colors": (3, 4), "count": 80, "order": 3},
    "eclipse":  {"label": "Difficile",  "size": 7, "colors": (4, 5), "count": 90, "order": 4},
    "void":     {"label": "Impossible", "size": 8, "colors": (4, 5), "count": 100, "order": 5},
}


# ---------------- Hamiltonian path patterns ----------------

def _snake_path(size: int) -> List[Tuple[int, int]]:
    """Row-by-row boustrophedon path."""
    path = []
    for r in range(size):
        cols = range(size) if r % 2 == 0 else range(size - 1, -1, -1)
        for c in cols:
            path.append((r, c))
    return path


def _col_snake_path(size: int) -> List[Tuple[int, int]]:
    """Column-by-column boustrophedon path."""
    path = []
    for c in range(size):
        rows = range(size) if c % 2 == 0 else range(size - 1, -1, -1)
        for r in rows:
            path.append((r, c))
    return path


def _spiral_path(size: int) -> List[Tuple[int, int]]:
    """Inward spiral path starting from (0,0)."""
    path = []
    visited = [[False] * size for _ in range(size)]
    # right, down, left, up
    dirs = [(0, 1), (1, 0), (0, -1), (-1, 0)]
    r, c, di = 0, 0, 0
    for _ in range(size * size):
        path.append((r, c))
        visited[r][c] = True
        dr, dc = dirs[di]
        nr, nc = r + dr, c + dc
        if not (0 <= nr < size and 0 <= nc < size and not visited[nr][nc]):
            di = (di + 1) % 4
            dr, dc = dirs[di]
            nr, nc = r + dr, c + dc
        r, c = nr, nc
    return path


def _zigzag_blocks(size: int) -> List[Tuple[int, int]]:
    """Snake but in 2-row blocks - creates a different feel."""
    if size < 4:
        return _snake_path(size)
    path = []
    r = 0
    while r < size:
        if r % 4 == 0:
            # Two rows down-right then continue
            for c in range(size):
                path.append((r, c))
            if r + 1 < size:
                for c in range(size - 1, -1, -1):
                    path.append((r + 1, c))
        else:
            for c in range(size):
                path.append((r, c))
            if r + 1 < size:
                for c in range(size - 1, -1, -1):
                    path.append((r + 1, c))
        r += 2
    # Dedup just in case
    seen = set()
    cleaned = []
    for p in path:
        if p in seen:
            continue
        seen.add(p)
        cleaned.append(p)
    return cleaned if len(cleaned) == size * size else _snake_path(size)


PATTERNS = [_snake_path, _col_snake_path, _spiral_path, _zigzag_blocks]


def _rotate_reflect(path: List[Tuple[int, int]], size: int, rng: random.Random) -> List[Tuple[int, int]]:
    """Apply a random rotation/reflection to the path for variety."""
    rot = rng.randint(0, 3)
    flip = rng.choice([False, True])
    new_path = []
    for (r, c) in path:
        rr, cc = r, c
        for _ in range(rot):
            rr, cc = cc, size - 1 - rr
        if flip:
            cc = size - 1 - cc
        new_path.append((rr, cc))
    return new_path


def _split_into_segments(path: List[Tuple[int, int]], num_segments: int, rng: random.Random) -> List[List[Tuple[int, int]]]:
    n = len(path)
    if num_segments <= 1:
        return [path]
    min_len = 2
    # Need num_segments-1 split positions in [min_len, n-min_len]
    # such that consecutive splits are at least min_len apart
    max_attempts = 30
    for _ in range(max_attempts):
        candidates = list(range(min_len, n - min_len + 1))
        rng.shuffle(candidates)
        chosen = []
        for cand in candidates:
            if all(abs(cand - p) >= min_len for p in chosen):
                chosen.append(cand)
            if len(chosen) == num_segments - 1:
                break
        if len(chosen) == num_segments - 1:
            chosen.sort()
            segments = []
            prev = 0
            for pos in chosen:
                segments.append(path[prev:pos])
                prev = pos
            segments.append(path[prev:])
            return segments
    # Fallback: even split
    chunk = n // num_segments
    segments = []
    for i in range(num_segments):
        start = i * chunk
        end = (i + 1) * chunk if i < num_segments - 1 else n
        segments.append(path[start:end])
    return segments


def _generate_level(size: int, num_colors: int, rng: random.Random, idx: int) -> dict:
    """Always succeeds since we use guaranteed patterns."""
    pattern = PATTERNS[idx % len(PATTERNS)]
    base = pattern(size)
    path = _rotate_reflect(base, size, rng)
    # Optionally reverse
    if rng.random() < 0.5:
        path = list(reversed(path))
    num_colors = min(num_colors, len(PALETTE))
    segments = _split_into_segments(path, num_colors, rng)
    # Shuffle which color goes to which segment
    colors = PALETTE[:num_colors]
    rng.shuffle(colors)
    dots = []
    solution = []
    for color, seg in zip(colors, segments):
        if len(seg) < 2:
            continue
        (r1, c1) = seg[0]
        (r2, c2) = seg[-1]
        dots.append({"color": color, "a": [r1, c1], "b": [r2, c2]})
        solution.append({"color": color, "path": [[r, c] for (r, c) in seg]})
    return {"size": size, "dots": dots, "solution": solution}


def generate_pack(difficulty: str, seed: int = 1337) -> List[dict]:
    cfg = DIFFICULTY_CONFIG[difficulty]
    size = cfg["size"]
    cmin, cmax = cfg["colors"]
    count = cfg["count"]
    rng = random.Random(seed + cfg["order"] * 10007)
    levels = []
    seen_sigs = set()
    attempts = 0
    while len(levels) < count and attempts < count * 6:
        attempts += 1
        n_colors = rng.randint(cmin, cmax)
        lvl = _generate_level(size, n_colors, rng, attempts)
        sig = tuple(sorted((d["color"], tuple(d["a"]), tuple(d["b"])) for d in lvl["dots"]))
        if sig in seen_sigs:
            continue
        seen_sigs.add(sig)
        levels.append(lvl)
    # Stable IDs
    for i, lvl in enumerate(levels, start=1):
        lvl["id"] = f"{difficulty}-{i}"
        lvl["index"] = i
    return levels


_CACHE: Dict[str, List[dict]] = {}


def get_levels(difficulty: str) -> List[dict]:
    if difficulty not in _CACHE:
        _CACHE[difficulty] = generate_pack(difficulty)
    return _CACHE[difficulty]


def get_level(difficulty: str, index: int) -> Optional[dict]:
    levels = get_levels(difficulty)
    if 1 <= index <= len(levels):
        return dict(levels[index - 1])
    return None
