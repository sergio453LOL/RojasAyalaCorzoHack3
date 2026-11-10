import { BINS, type BinCode, type Progress } from './types'

const BIN_STYLE: Record<BinCode, string> = {
  WO: 'border-sky-400',
  FC: 'border-emerald-400',
  DR: 'border-amber-400',
  MA: 'border-rose-400',
}

interface Props {
  progress: Progress
  canDrop: boolean
  suggested: BinCode | null
  hover: BinCode | null
  busy: boolean
  onDrop: (bin: BinCode) => void
}

export function BinsPanel({ progress, canDrop, suggested, hover, busy, onDrop }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Cajas">
      {BINS.map((bin, i) => {
        const value = progress[bin]
        return (
          <button
            key={bin}
            type="button"
            data-bin={bin}
            disabled={!canDrop || busy}
            onClick={() => onDrop(bin)}
            aria-keyshortcuts={String(i + 1)}
            aria-label={`Llevar el grupo a ${bin} (tecla ${i + 1}). Progreso ${Math.round(value * 100)} %`}
            className={`flex flex-col gap-2 rounded border-2 bg-slate-900 p-3 text-left transition-colors disabled:cursor-not-allowed ${
              BIN_STYLE[bin]
            } ${hover === bin ? 'bg-slate-700' : ''} ${suggested === bin && canDrop ? 'ring-2 ring-white' : ''}`}
          >
            <span className="flex items-baseline justify-between">
              <span className="text-lg font-semibold">{bin}</span>
              <span className="text-xs text-slate-300">tecla {i + 1}</span>
            </span>
            <progress max={1} value={value} className="w-full" aria-hidden="true" />
            <span className="text-sm text-slate-200">{Math.round(value * 100)} %</span>
          </button>
        )
      })}
    </div>
  )
}
