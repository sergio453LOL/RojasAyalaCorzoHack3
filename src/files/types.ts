export type BinCode = 'WO' | 'FC' | 'DR' | 'MA'
export const BINS: BinCode[] = ['WO', 'FC', 'DR', 'MA']

/** Carácter de `Tile.bins` → caja. */
export const BIN_BY_CHAR: Record<string, BinCode> = { W: 'WO', F: 'FC', D: 'DR', M: 'MA' }
export const CHAR_BY_BIN: Record<BinCode, string> = { WO: 'W', FC: 'F', DR: 'D', MA: 'M' }

export interface Progress {
  WO: number
  FC: number
  DR: number
  MA: number
  overall: number
}

export type FileStatus = 'ACTIVE' | 'COMPLETE'

export interface DataFile {
  id: number
  name: string
  rows: number
  cols: number
  tileSize: number
  status: FileStatus
  progress: Progress
  refinedGroups: number
  totalGroups: number
  mistakes: number
  updatedAt: string
}

export interface FilePage {
  content: DataFile[]
  totalElements: number
  totalPages: number
  page: number
  size: number
}

export interface Rules {
  tremorThreshold: number
  connectivity: 4 | 8
  minGroupSize: number
  maxGroupSize: number
  binning: { strategy: 'DIGIT_SUM_MOD' | 'MAX_DIGIT_MOD'; order: BinCode[] }
}

export interface TileDto {
  tileRow: number
  tileCol: number
  originRow: number
  originCol: number
  rows: number
  cols: number
  values: string
  tremor: string
  bins: string
  version: number
}

export interface RefineResult {
  refinementId: number
  bin: BinCode
  size: number
  file: {
    progress: Progress
    refinedGroups: number
    totalGroups: number
    mistakes: number
    status: FileStatus
  }
}

export interface Cell {
  r: number
  c: number
}
