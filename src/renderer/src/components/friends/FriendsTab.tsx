import { useState } from 'react'
import { UserPlus, Copy, Check, ArrowRight, X, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import { useAppStore } from '../../stores/app-store'

export function FriendsTab() {
  const [showAddModal, setShowAddModal] = useState(false)
  const [peerCode, setPeerCode] = useState('')
  const [copied, setCopied] = useState(false)
  const [pairStatus, setPairStatus] = useState<'idle' | 'pairing' | 'success' | 'error'>('idle')
  const [pairError, setPairError] = useState('')
  const friends = useAppStore((s) => s.friends)
  const setFriends = useAppStore((s) => s.setFriends)
  const connectionString = useAppStore((s) => s.connectionString)
  const setConnectionString = useAppStore((s) => s.setConnectionString)

  const loadFriends = async () => {
    try {
      const result = await window.api?.friends?.list()
      if (result?.success) setFriends(result.friends)
    } catch {}
  }

  const fetchConnectionString = async () => {
    try {
      const result = await window.api?.friends?.getConnectionString()
      if (result?.success) setConnectionString(result.connectionString)
    } catch {
      setConnectionString('WARP-...(unavailable)')
    }
  }

  const handleOpenModal = () => {
    setShowAddModal(true)
    setPairStatus('idle')
    setPairError('')
    setPeerCode('')
    fetchConnectionString()
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(connectionString)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handlePair = async () => {
    if (!peerCode.startsWith('WARP-')) return
    setPairStatus('pairing')
    try {
      const result = await window.api?.friends?.pair(peerCode)
      if (result?.success) {
        setPairStatus('success')
        setPeerCode('')
        loadFriends()
        setTimeout(() => setShowAddModal(false), 1000)
      } else {
        setPairStatus('error')
        setPairError(result?.error || 'Pairing failed')
      }
    } catch (err) {
      setPairStatus('error')
      setPairError((err as Error).message)
    }
  }

  const handleRemoveFriend = async (id: string) => {
    try {
      await window.api?.friends?.remove(id)
      loadFriends()
    } catch {
      // ignore
    }
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-warp-text">Friends</h2>
        <button
          onClick={handleOpenModal}
          className="no-drag flex items-center gap-2 px-4 py-2 bg-warp-accent text-warp-bg rounded-lg font-medium text-sm hover:bg-warp-accent/90 transition-colors"
        >
          <UserPlus size={16} />
          Add Friend
        </button>
      </div>

      {/* Friends list */}
      {friends.length > 0 ? (
        <div className="space-y-2">
          {friends.map((friend) => (
            <div
              key={friend.id}
              className="flex items-center gap-3 px-4 py-3 bg-warp-card rounded-xl border border-warp-border"
            >
              {/* Avatar */}
              <div className="relative">
                <div className="w-10 h-10 rounded-full bg-warp-accent/10 flex items-center justify-center">
                  <span className="text-sm font-semibold text-warp-accent">
                    {friend.displayName[0]}
                  </span>
                </div>
                <div
                  className={clsx(
                    'absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-warp-card',
                    friend.isOnline ? 'bg-warp-online pulse-online' : 'bg-warp-offline'
                  )}
                />
              </div>

              {/* Info */}
              <div className="flex-1">
                <p className="text-sm font-medium text-warp-text">{friend.displayName}</p>
                <p className="text-xs text-warp-text-muted">
                  {friend.isOnline
                    ? 'Online'
                    : friend.lastSeenAt
                      ? `Last seen ${new Date(friend.lastSeenAt).toLocaleDateString()}`
                      : 'Never connected'}
                </p>
              </div>

              {/* Stats */}
              <span className="text-xs text-warp-text-muted mr-2">
                {friend.transferCount} transfers
              </span>

              {/* Remove button */}
              <button
                onClick={() => handleRemoveFriend(friend.id)}
                className="no-drag p-1.5 text-warp-text-muted hover:text-warp-error rounded transition-colors"
                title="Remove friend"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-16 h-16 rounded-full bg-warp-card flex items-center justify-center mb-4">
            <UserPlus size={28} className="text-warp-text-muted" />
          </div>
          <p className="text-sm text-warp-text-secondary mb-1">No friends yet</p>
          <p className="text-xs text-warp-text-muted">
            Click "Add Friend" to pair with someone
          </p>
        </div>
      )}

      {/* Add Friend Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-warp-surface border border-warp-border rounded-2xl w-full max-w-md mx-4 overflow-hidden">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-warp-border">
              <h3 className="text-base font-semibold text-warp-text">Add Friend</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="no-drag text-warp-text-muted hover:text-warp-text transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Share your code */}
              <div>
                <label className="text-xs font-medium text-warp-text-secondary uppercase tracking-wider block mb-2">
                  Share Your Connection String
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 connection-string text-warp-text-secondary bg-warp-card rounded-lg px-3 py-2.5 border border-warp-border/50 overflow-hidden">
                    <span className="block truncate">{connectionString || 'Generating...'}</span>
                  </div>
                  <button
                    onClick={handleCopy}
                    disabled={!connectionString}
                    className={clsx(
                      'no-drag shrink-0 p-2.5 rounded-lg border transition-all',
                      copied
                        ? 'bg-warp-accent/10 border-warp-accent/30 text-warp-accent'
                        : 'bg-warp-card border-warp-border text-warp-text-muted hover:text-warp-accent'
                    )}
                  >
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                </div>
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-warp-border" />
                <span className="text-xs text-warp-text-muted">or</span>
                <div className="flex-1 h-px bg-warp-border" />
              </div>

              {/* Enter friend's code */}
              <div>
                <label className="text-xs font-medium text-warp-text-secondary uppercase tracking-wider block mb-2">
                  Enter Friend's Connection String
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={peerCode}
                    onChange={(e) => {
                      setPeerCode(e.target.value)
                      setPairStatus('idle')
                      setPairError('')
                    }}
                    placeholder="WARP-..."
                    className="no-drag flex-1 bg-warp-card border border-warp-border rounded-lg px-3 py-2.5 text-sm text-warp-text placeholder:text-warp-text-muted font-mono focus:outline-none focus:border-warp-accent/50 focus:ring-1 focus:ring-warp-accent/20 transition-all"
                  />
                  <button
                    onClick={handlePair}
                    disabled={!peerCode.startsWith('WARP-') || pairStatus === 'pairing'}
                    className="no-drag shrink-0 p-2.5 rounded-lg bg-warp-accent text-warp-bg hover:bg-warp-accent/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  >
                    {pairStatus === 'pairing' ? (
                      <div className="w-4 h-4 border-2 border-warp-bg border-t-transparent rounded-full animate-spin" />
                    ) : pairStatus === 'success' ? (
                      <Check size={16} />
                    ) : (
                      <ArrowRight size={16} />
                    )}
                  </button>
                </div>

                {/* Status messages */}
                {pairStatus === 'success' && (
                  <p className="text-xs text-warp-online mt-2">Friend added successfully!</p>
                )}
                {pairStatus === 'error' && (
                  <p className="text-xs text-warp-error mt-2">{pairError}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
