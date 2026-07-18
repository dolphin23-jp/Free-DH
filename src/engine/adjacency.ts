export interface GridPosition {
  row: number
  column: number
}

export interface GridItemPlacement {
  position: GridPosition
  /** Item data stores size as [columns, rows]. */
  size: readonly [number, number]
  rotated?: boolean
}

const ORTHOGONAL_OFFSETS = [
  [-1, 0],
  [0, -1],
  [0, 1],
  [1, 0],
] as const

const RANGE_EIGHT_OFFSETS = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
] as const

function cellKey(cell: GridPosition): string {
  return `${cell.row}:${cell.column}`
}

function compareCells(left: GridPosition, right: GridPosition): number {
  return left.row - right.row || left.column - right.column
}

export function getPlacedSize(placement: GridItemPlacement): {
  columns: number
  rows: number
} {
  const [baseColumns, baseRows] = placement.size

  return placement.rotated
    ? { columns: baseRows, rows: baseColumns }
    : { columns: baseColumns, rows: baseRows }
}

export function getOccupiedCells(placement: GridItemPlacement): GridPosition[] {
  const { columns, rows } = getPlacedSize(placement)
  const cells: GridPosition[] = []

  for (let rowOffset = 0; rowOffset < rows; rowOffset += 1) {
    for (let columnOffset = 0; columnOffset < columns; columnOffset += 1) {
      cells.push({
        row: placement.position.row + rowOffset,
        column: placement.position.column + columnOffset,
      })
    }
  }

  return cells
}

export function getAdjacentCells(placement: GridItemPlacement, range8 = false): GridPosition[] {
  const occupied = getOccupiedCells(placement)
  const occupiedKeys = new Set(occupied.map(cellKey))
  const adjacent = new Map<string, GridPosition>()
  const offsets = range8 ? RANGE_EIGHT_OFFSETS : ORTHOGONAL_OFFSETS

  for (const cell of occupied) {
    for (const [rowOffset, columnOffset] of offsets) {
      const candidate = {
        row: cell.row + rowOffset,
        column: cell.column + columnOffset,
      }
      const key = cellKey(candidate)

      if (!occupiedKeys.has(key)) {
        adjacent.set(key, candidate)
      }
    }
  }

  return [...adjacent.values()].sort(compareCells)
}

export function areItemsAdjacent(
  source: GridItemPlacement,
  target: GridItemPlacement,
  range8 = false,
): boolean {
  const adjacentKeys = new Set(getAdjacentCells(source, range8).map(cellKey))
  return getOccupiedCells(target).some((cell) => adjacentKeys.has(cellKey(cell)))
}
