import { FileDown, Check, X } from 'lucide-react'
import { formatSize } from './ProgressBar'
import type { TransferRequest } from '../../types'

interface IncomingTransferCardProps {
  request: TransferRequest
  onAccept: (transferId: string) => void
  onDecline: (transferId: string) => void
}

export function IncomingTransferCard({ request, onAccept, onDecline }: IncomingTransferCardProps) {
  return (
    <div className="w-full max-w-md bg-warp-card rounded-xl border border-warp-accent/30 p-4 animate-in">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-warp-accent/10 flex items-center justify-center shrink-0">
          <FileDown size={20} className="text-warp-accent" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-warp-text truncate">
            {request.fileName}
          </p>
          <p className="text-xs text-warp-text-muted mt-0.5">
            {formatSize(request.fileSize)} from {request.friendName || 'a friend'}
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => onAccept(request.transferId)}
            className="no-drag p-2 rounded-lg bg-warp-accent/10 text-warp-accent hover:bg-warp-accent/20 transition-colors"
            title="Accept"
          >
            <Check size={16} />
          </button>
          <button
            onClick={() => onDecline(request.transferId)}
            className="no-drag p-2 rounded-lg bg-warp-error/10 text-warp-error hover:bg-warp-error/20 transition-colors"
            title="Decline"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
