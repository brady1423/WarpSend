import clsx from 'clsx'

interface ProgressBarProps {
  percent: number
  speed?: number  // bytes per second
  className?: string
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec > 1024 * 1024) return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
  if (bytesPerSec > 1024) return `${(bytesPerSec / 1024).toFixed(0)} KB/s`
  return `${bytesPerSec.toFixed(0)} B/s`
}

function formatSize(bytes: number): string {
  if (bytes > 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  if (bytes > 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes > 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

export { formatSize }

export function ProgressBar({ percent, speed, className }: ProgressBarProps) {
  return (
    <div className={clsx('w-full', className)}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-warp-text-secondary">
          {Math.round(percent)}%
        </span>
        {speed !== undefined && speed > 0 && (
          <span className="text-xs text-warp-text-muted">
            {formatSpeed(speed)}
          </span>
        )}
      </div>
      <div className="w-full h-1.5 bg-warp-border rounded-full overflow-hidden">
        <div
          className="h-full bg-warp-accent rounded-full transition-all duration-300 ease-out"
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
    </div>
  )
}
