import { useState, useEffect } from 'react'
import { X, FolderOpen, FileAudio, FileImage, FileText, Loader2 } from 'lucide-react'

const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']
const audioExts = ['mp3', 'wav', 'flac', 'aac', 'ogg', 'wma', 'm4a']
const textExts = ['txt', 'md', 'json', 'xml', 'csv', 'log', 'yml', 'yaml', 'toml']

function getPreviewType(fileName: string): 'audio' | 'image' | 'text' | null {
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  if (imageExts.includes(ext)) return 'image'
  if (audioExts.includes(ext)) return 'audio'
  if (textExts.includes(ext)) return 'text'
  return null
}

interface FilePreviewProps {
  filePath: string
  fileName: string
  onDismiss?: () => void
}

export function FilePreview({ filePath, fileName, onDismiss }: FilePreviewProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [textContent, setTextContent] = useState<string | null>(null)
  const [textTotalSize, setTextTotalSize] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const previewType = getPreviewType(fileName)

  useEffect(() => {
    if (!previewType) {
      setLoading(false)
      return
    }

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        if (previewType === 'audio' || previewType === 'image') {
          const result = await (window.api as any).file.readAsDataUrl(filePath)
          if (result.success) {
            setDataUrl(result.dataUrl)
          } else {
            setError(result.error)
          }
        } else if (previewType === 'text') {
          const result = await (window.api as any).file.readTextPreview(filePath)
          if (result.success) {
            setTextContent(result.content)
            setTextTotalSize(result.totalSize)
          } else {
            setError(result.error)
          }
        }
      } catch (err) {
        setError('Failed to load preview')
      }
      setLoading(false)
    }
    load()
  }, [filePath, previewType])

  if (!previewType) return null

  const handleOpenInFolder = () => {
    ;(window.api as any).file.openInFolder(filePath)
  }

  const TypeIcon = previewType === 'audio' ? FileAudio : previewType === 'image' ? FileImage : FileText

  return (
    <div className="bg-warp-card rounded-xl border border-warp-border p-3 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <TypeIcon size={14} className="text-warp-accent shrink-0" />
          <span className="text-xs text-warp-text truncate">{fileName}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleOpenInFolder}
            className="no-drag p-1 text-warp-text-muted hover:text-warp-accent transition-colors"
            title="Open in folder"
          >
            <FolderOpen size={13} />
          </button>
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="no-drag p-1 text-warp-text-muted hover:text-warp-text transition-colors"
              title="Dismiss"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {loading && (
        <div className="flex items-center justify-center py-4">
          <Loader2 size={18} className="text-warp-accent animate-spin" />
        </div>
      )}

      {error && (
        <p className="text-xs text-warp-error py-2">{error}</p>
      )}

      {!loading && !error && previewType === 'image' && dataUrl && (
        <img
          src={dataUrl}
          alt={fileName}
          className="max-h-48 rounded-lg object-contain w-full"
        />
      )}

      {!loading && !error && previewType === 'audio' && dataUrl && (
        <audio controls className="w-full h-10" src={dataUrl}>
          Your browser does not support the audio element.
        </audio>
      )}

      {!loading && !error && previewType === 'text' && textContent !== null && (
        <div>
          <pre className="max-h-40 overflow-y-auto text-xs font-mono text-warp-text-secondary bg-warp-surface rounded-lg p-3 border border-warp-border/50 whitespace-pre-wrap break-words">
            {textContent}
          </pre>
          {textTotalSize > 10000 && (
            <p className="text-[10px] text-warp-text-muted mt-1">
              Showing first 10KB of {(textTotalSize / 1024).toFixed(1)}KB
            </p>
          )}
        </div>
      )}
    </div>
  )
}
