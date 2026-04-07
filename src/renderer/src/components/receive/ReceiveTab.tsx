import { useState, useEffect } from 'react'
import { Shield, Copy, Check, RefreshCw, MessageCircle, Trash2 } from 'lucide-react'
import { useAppStore } from '../../stores/app-store'
import { IncomingTransferCard } from '../shared/IncomingTransferCard'
import { ProgressBar } from '../shared/ProgressBar'
import { FilePreview } from '../shared/FilePreview'
import type { DeviceInfo } from '../../types'

interface ReceiveTabProps {
  deviceInfo: DeviceInfo
}

export function ReceiveTab({ deviceInfo }: ReceiveTabProps) {
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)
  const connectionString = useAppStore((s) => s.connectionString)
  const setConnectionString = useAppStore((s) => s.setConnectionString)
  const incomingRequests = useAppStore((s) => s.incomingRequests)
  const removeIncomingRequest = useAppStore((s) => s.removeIncomingRequest)
  const activeTransfers = useAppStore((s) => s.activeTransfers)
  const textMessages = useAppStore((s) => s.textMessages)
  const clearTextMessages = useAppStore((s) => s.clearTextMessages)
  const friends = useAppStore((s) => s.friends)
  const recentlyCompleted = useAppStore((s) => s.recentlyCompleted)
  const removeRecentlyCompleted = useAppStore((s) => s.removeRecentlyCompleted)

  const receivingTransfers = activeTransfers.filter((t) => t.direction === 'receiving')

  const fetchConnectionString = async () => {
    setLoading(true)
    try {
      const result = await window.api?.friends?.getConnectionString()
      if (result?.success) {
        setConnectionString(result.connectionString)
      }
    } catch {
      setConnectionString('WARP-...(unavailable)')
    }
    setLoading(false)
  }

  useEffect(() => {
    if (!connectionString) fetchConnectionString()
  }, [])

  const handleCopy = () => {
    navigator.clipboard.writeText(connectionString)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleAccept = async (transferId: string) => {
    try {
      await window.api?.transfers?.accept(transferId)
      removeIncomingRequest(transferId)
    } catch {}
  }

  const handleDecline = async (transferId: string) => {
    try {
      await window.api?.transfers?.decline(transferId)
      removeIncomingRequest(transferId)
    } catch {}
  }

  const handleSaveAs = async (transferId: string) => {
    try {
      await (window.api as any)?.transfers?.acceptWithPath(transferId)
      removeIncomingRequest(transferId)
    } catch {}
  }

  return (
    <div className="flex flex-col items-center justify-center h-full px-8">
      {/* Device icon */}
      <div className="relative mb-6">
        <div className="w-24 h-24 rounded-full bg-warp-accent/10 flex items-center justify-center shield-pulse">
          <div className="w-16 h-16 rounded-full bg-warp-accent/20 flex items-center justify-center">
            <Shield size={32} className="text-warp-accent icon-glow" />
          </div>
        </div>
        <div className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-warp-online border-2 border-warp-bg pulse-online" />
      </div>

      <h2 className="text-2xl font-semibold text-warp-text mb-1">
        {deviceInfo.name}
      </h2>
      <p className="text-sm text-warp-text-muted font-mono mb-8">
        {deviceInfo.id}
      </p>

      {/* Connection string card */}
      <div className="w-full max-w-md bg-warp-card rounded-xl border border-warp-border p-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-warp-text-secondary font-medium uppercase tracking-wider">
            Your Connection String
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchConnectionString}
              disabled={loading}
              className="no-drag text-warp-text-muted hover:text-warp-accent transition-colors"
              title="Regenerate"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={handleCopy}
              disabled={!connectionString}
              className="no-drag flex items-center gap-1.5 text-xs text-warp-accent hover:text-warp-accent/80 transition-colors"
            >
              {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
            </button>
          </div>
        </div>
        <p className="connection-string text-warp-text-secondary bg-warp-surface rounded-lg px-3 py-2.5 border border-warp-border/50">
          {connectionString || 'Generating...'}
        </p>
      </div>

      {/* Text messages — shown first for visibility */}
      {textMessages.length > 0 && (
        <div className="w-full max-w-md space-y-3 mb-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-medium text-warp-text-secondary uppercase tracking-wider">
              Messages
            </h3>
            <button
              onClick={clearTextMessages}
              className="no-drag flex items-center gap-1 text-[10px] text-warp-text-muted hover:text-warp-error transition-colors"
              title="Clear messages"
            >
              <Trash2 size={10} />
              Clear
            </button>
          </div>
          {textMessages.slice(-20).reverse().map((msg) => {
            const friend = friends.find((f) => f.id === msg.friendId)
            const senderName = friend?.nickname || friend?.displayName || 'Unknown'
            return (
              <div
                key={msg.messageId}
                className={`bg-warp-card rounded-xl border-l-4 p-3 ${
                  msg.direction === 'sent'
                    ? 'border-l-warp-accent ml-8'
                    : 'border-l-warp-online mr-8'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <MessageCircle size={12} className={msg.direction === 'sent' ? 'text-warp-accent' : 'text-warp-online'} />
                  <span className="text-xs text-warp-text-muted">
                    {msg.direction === 'sent' ? `To ${senderName}` : `From ${senderName}`}
                  </span>
                </div>
                <p className="text-sm text-warp-text whitespace-pre-wrap break-words">{msg.text}</p>
                <p className="text-xs text-warp-text-muted mt-1.5">
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </p>
              </div>
            )
          })}
        </div>
      )}

      {/* Incoming transfer requests */}
      {incomingRequests.length > 0 && (
        <div className="w-full max-w-md space-y-3 mb-6">
          <h3 className="text-xs font-medium text-warp-text-secondary uppercase tracking-wider">
            Incoming Requests
          </h3>
          {incomingRequests.map((req) => (
            <IncomingTransferCard
              key={req.transferId}
              request={req}
              onAccept={handleAccept}
              onDecline={handleDecline}
              onSaveAs={handleSaveAs}
            />
          ))}
        </div>
      )}

      {/* Active receiving transfers */}
      {receivingTransfers.length > 0 && (
        <div className="w-full max-w-md space-y-3 mb-6">
          <h3 className="text-xs font-medium text-warp-text-secondary uppercase tracking-wider">
            Receiving
          </h3>
          {receivingTransfers.map((t) => (
            <div key={t.transferId} className="bg-warp-card rounded-xl border border-warp-border p-3">
              <p className="text-sm text-warp-text mb-2 truncate">{t.fileName}</p>
              <ProgressBar
                percent={(t.completedChunks / t.totalChunks) * 100}
                speed={t.speed}
              />
            </div>
          ))}
        </div>
      )}

      {/* Recently received — file previews */}
      {recentlyCompleted.filter((t) => t.direction === 'receiving' && t.filePath).length > 0 && (
        <div className="w-full max-w-md space-y-3 mb-6">
          <h3 className="text-xs font-medium text-warp-text-secondary uppercase tracking-wider">
            Recently Received
          </h3>
          {recentlyCompleted
            .filter((t) => t.direction === 'receiving' && t.filePath)
            .map((t) => (
              <FilePreview
                key={t.transferId}
                filePath={t.filePath!}
                fileName={t.fileName}
                onDismiss={() => removeRecentlyCompleted(t.transferId)}
              />
            ))}
        </div>
      )}

      {/* Empty state */}
      {incomingRequests.length === 0 && receivingTransfers.length === 0 && textMessages.length === 0 && recentlyCompleted.length === 0 && (
        <p className="text-sm text-warp-text-muted mt-4">
          No incoming transfers
        </p>
      )}
    </div>
  )
}
