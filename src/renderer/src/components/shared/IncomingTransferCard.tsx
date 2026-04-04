import { Check, X, FolderDown, FileText, FileImage, FileVideo, FileAudio, FileArchive, File } from 'lucide-react'
import { formatSize } from './ProgressBar'

interface IncomingTransferCardProps {
  request: {
    transferId: string
    friendId: string
    friendName: string
    fileName: string
    fileSize: number
    fileType: string
  }
  onAccept: (transferId: string) => void
  onDecline: (transferId: string) => void
  onSaveAs?: (transferId: string) => void
}

function getFileIcon(fileName: string) {
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico']
  const videoExts = ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm']
  const audioExts = ['mp3', 'wav', 'flac', 'aac', 'ogg', 'wma', 'm4a']
  const archiveExts = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz']
  const textExts = ['txt', 'md', 'json', 'xml', 'csv', 'log', 'yml', 'yaml', 'toml']

  if (imageExts.includes(ext)) return FileImage
  if (videoExts.includes(ext)) return FileVideo
  if (audioExts.includes(ext)) return FileAudio
  if (archiveExts.includes(ext)) return FileArchive
  if (textExts.includes(ext)) return FileText
  return File
}

function getFileCategory(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico']
  const videoExts = ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm']
  const audioExts = ['mp3', 'wav', 'flac', 'aac', 'ogg', 'wma', 'm4a']
  const archiveExts = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz']
  const textExts = ['txt', 'md', 'json', 'xml', 'csv', 'log']

  if (imageExts.includes(ext)) return 'Image'
  if (videoExts.includes(ext)) return 'Video'
  if (audioExts.includes(ext)) return 'Audio'
  if (archiveExts.includes(ext)) return 'Archive'
  if (textExts.includes(ext)) return 'Text'
  return ext.toUpperCase() || 'File'
}

export function IncomingTransferCard({ request, onAccept, onDecline, onSaveAs }: IncomingTransferCardProps) {
  const FileIcon = getFileIcon(request.fileName)
  const category = getFileCategory(request.fileName)

  return (
    <div className="bg-warp-card rounded-xl border border-warp-accent/30 p-4 space-y-3">
      {/* File preview header */}
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-lg bg-warp-accent/10 flex items-center justify-center shrink-0">
          <FileIcon size={24} className="text-warp-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-warp-text truncate" title={request.fileName}>
            {request.fileName}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-warp-text-muted">{formatSize(request.fileSize)}</span>
            <span className="text-xs text-warp-text-muted">·</span>
            <span className="text-xs text-warp-text-muted">{category}</span>
          </div>
          {request.friendName && (
            <p className="text-xs text-warp-text-secondary mt-1">
              From: <span className="text-warp-accent">{request.friendName}</span>
            </p>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onAccept(request.transferId)}
          className="no-drag flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-warp-accent text-warp-bg rounded-lg text-xs font-medium hover:bg-warp-accent/90 transition-colors"
        >
          <Check size={14} />
          Accept
        </button>
        {onSaveAs && (
          <button
            onClick={() => onSaveAs(request.transferId)}
            className="no-drag flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-warp-card border border-warp-accent/30 text-warp-accent rounded-lg text-xs font-medium hover:bg-warp-accent/10 transition-colors"
          >
            <FolderDown size={14} />
            Save As
          </button>
        )}
        <button
          onClick={() => onDecline(request.transferId)}
          className="no-drag px-3 py-2 bg-warp-card border border-warp-border text-warp-text-muted rounded-lg text-xs font-medium hover:bg-warp-error/10 hover:text-warp-error hover:border-warp-error/30 transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
