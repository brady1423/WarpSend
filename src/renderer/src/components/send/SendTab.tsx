import { useState, useEffect } from 'react'
import { File, Folder, Type, Clipboard, Upload, X as XIcon } from 'lucide-react'
import clsx from 'clsx'
import { useAppStore } from '../../stores/app-store'
import { ProgressBar, formatSize } from '../shared/ProgressBar'
import { TextInputModal } from '../shared/TextInputModal'
import type { Friend } from '../../types'

const selectionButtons = [
  { id: 'file', label: 'File', icon: File },
  { id: 'folder', label: 'Folder', icon: Folder },
  { id: 'text', label: 'Text', icon: Type },
  { id: 'paste', label: 'Paste', icon: Clipboard }
] as const

export function SendTab() {
  const friends = useAppStore((s) => s.friends)
  const setFriends = useAppStore((s) => s.setFriends)
  const activeTransfers = useAppStore((s) => s.activeTransfers)
  const queueCounts = useAppStore((s) => s.queueCounts)
  const [selectedFiles, setSelectedFiles] = useState<string[]>([])
  const [sending, setSending] = useState<string | null>(null) // friendId being sent to
  const [showTextModal, setShowTextModal] = useState(false)
  const [textModalInitial, setTextModalInitial] = useState('')
  const [pendingText, setPendingText] = useState<string | null>(null)

  useEffect(() => {
    loadFriends()
  }, [])

  const loadFriends = async () => {
    try {
      const result = await window.api?.friends?.list()
      if (result?.success) setFriends(result.friends)
    } catch {}
  }

  const handleSelectFile = async () => {
    try {
      const files = await window.api?.dialog?.openFile()
      if (files?.length) setSelectedFiles((prev) => [...prev, ...files])
    } catch {}
  }

  const handleSelectFolder = async () => {
    try {
      const folder = await window.api?.dialog?.openFolder()
      if (folder) setSelectedFiles((prev) => [...prev, folder])
    } catch {}
  }

  const handleSelectionClick = async (id: string) => {
    if (id === 'file') handleSelectFile()
    else if (id === 'folder') handleSelectFolder()
    else if (id === 'text') {
      setTextModalInitial('')
      setShowTextModal(true)
    } else if (id === 'paste') {
      try {
        const clipText = await navigator.clipboard.readText()
        if (clipText) {
          setTextModalInitial(clipText)
          setShowTextModal(true)
        }
      } catch {}
    }
  }

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSendToFriend = async (friend: Friend) => {
    if (selectedFiles.length === 0 && !pendingText) return
    if (!friend.isOnline) return
    setSending(friend.id)
    try {
      if (selectedFiles.length > 0) {
        await window.api?.transfers?.send(friend.id, selectedFiles)
      }
      if (pendingText) {
        await (window.api as any)?.transfers?.sendText(friend.id, pendingText)
      }
      setSelectedFiles([])
      setPendingText(null)
    } catch {}
    setSending(null)
  }

  const sendingTransfers = activeTransfers.filter((t) => t.direction === 'sending')

  return (
    <div className="p-6">
      {/* Selection */}
      <h3 className="text-sm font-medium text-warp-text-secondary uppercase tracking-wider mb-3">
        Selection
      </h3>
      <div className="flex gap-3 mb-4">
        {selectionButtons.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => handleSelectionClick(id)}
            className="no-drag flex flex-col items-center justify-center w-20 h-20 bg-warp-card hover:bg-warp-card-hover border border-warp-border rounded-xl transition-all duration-150 group"
          >
            <Icon size={22} className="text-warp-text-muted group-hover:text-warp-accent transition-colors mb-1.5" />
            <span className="text-xs text-warp-text-secondary group-hover:text-warp-text transition-colors">{label}</span>
          </button>
        ))}
      </div>

      {/* Selected files */}
      {(selectedFiles.length > 0 || pendingText) && (
        <div className="flex flex-wrap gap-2 mb-6">
          {selectedFiles.map((file, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-warp-accent/10 text-warp-accent text-xs rounded-lg border border-warp-accent/20"
            >
              {file.split(/[/\\]/).pop()}
              <button onClick={() => removeFile(i)} className="no-drag text-warp-accent/60 hover:text-warp-accent">
                <XIcon size={12} />
              </button>
            </span>
          ))}
          {pendingText && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-warp-accent/10 text-warp-accent text-xs rounded-lg border border-warp-accent/20">
              Text message ({pendingText.length} chars)
              <button onClick={() => setPendingText(null)} className="no-drag text-warp-accent/60 hover:text-warp-accent">
                <XIcon size={12} />
              </button>
            </span>
          )}
          <span className="text-xs text-warp-text-muted self-center ml-1">
            {selectedFiles.length + (pendingText ? 1 : 0)} item{selectedFiles.length + (pendingText ? 1 : 0) !== 1 ? 's' : ''} selected
          </span>
        </div>
      )}

      {/* Active sending transfers */}
      {sendingTransfers.length > 0 && (
        <div className="mb-6 space-y-2">
          <h3 className="text-sm font-medium text-warp-text-secondary uppercase tracking-wider mb-2">
            Sending
          </h3>
          {sendingTransfers.map((t) => (
            <div key={t.transferId} className="bg-warp-card rounded-xl border border-warp-accent/20 p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-warp-text truncate flex-1">{t.fileName}</p>
                <span className="text-xs text-warp-text-muted ml-2">{formatSize(t.fileSize)}</span>
              </div>
              <ProgressBar percent={(t.completedChunks / t.totalChunks) * 100} speed={t.speed} />
            </div>
          ))}
        </div>
      )}

      {/* Friends */}
      <div className="flex items-center gap-3 mb-3">
        <h3 className="text-sm font-medium text-warp-text-secondary uppercase tracking-wider">Friends</h3>
        <span className="text-xs text-warp-accent">
          {friends.filter((f) => f.isOnline).length} online
        </span>
      </div>

      <div className="space-y-2">
        {friends.map((friend) => {
          const queued = queueCounts[friend.id] ?? 0
          return (
            <button
              key={friend.id}
              onClick={() => handleSendToFriend(friend)}
              disabled={!friend.isOnline || (selectedFiles.length === 0 && !pendingText)}
              className={clsx(
                'no-drag w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-150',
                friend.isOnline && (selectedFiles.length > 0 || !!pendingText)
                  ? 'bg-warp-card hover:bg-warp-card-hover border-warp-border cursor-pointer'
                  : friend.isOnline
                    ? 'bg-warp-card border-warp-border'
                    : 'bg-warp-surface border-warp-border/50 opacity-60'
              )}
            >
              <div className="relative">
                <div className="w-10 h-10 rounded-full bg-warp-accent/10 flex items-center justify-center">
                  <span className="text-sm font-semibold text-warp-accent">{(friend.nickname || friend.displayName)[0]}</span>
                </div>
                <div
                  className={clsx(
                    'absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-warp-card',
                    friend.isOnline ? 'bg-warp-online pulse-online' : 'bg-warp-offline'
                  )}
                />
              </div>

              <div className="flex-1 text-left">
                <p className="text-sm font-medium text-warp-text">{friend.nickname || friend.displayName}</p>
                <p className="text-xs text-warp-text-muted">
                  {friend.isOnline ? 'Online' : friend.lastSeenAt ? `Last seen ${new Date(friend.lastSeenAt).toLocaleDateString()}` : 'Never connected'}
                </p>
              </div>

              {queued > 0 && (
                <span className="px-2 py-0.5 bg-warp-warning/10 text-warp-warning text-xs rounded-full border border-warp-warning/20">
                  Queued ({queued})
                </span>
              )}

              {friend.isOnline && (selectedFiles.length > 0 || !!pendingText) && sending !== friend.id && (
                <Upload size={16} className="text-warp-accent" />
              )}

              {sending === friend.id && (
                <div className="w-4 h-4 border-2 border-warp-accent border-t-transparent rounded-full animate-spin" />
              )}

              {!friend.isOnline && selectedFiles.length === 0 && !pendingText && (
                <span className="text-xs text-warp-text-muted">{friend.transferCount} transfers</span>
              )}
            </button>
          )
        })}

        {friends.length === 0 && (
          <div className="text-center py-12">
            <p className="text-sm text-warp-text-muted">No friends yet. Go to the Friends tab to add someone.</p>
          </div>
        )}
      </div>

      {showTextModal && (
        <TextInputModal
          initialText={textModalInitial}
          onSend={setPendingText}
          onClose={() => setShowTextModal(false)}
        />
      )}
    </div>
  )
}
