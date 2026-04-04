import { useState } from 'react'
import { X, Send } from 'lucide-react'

interface TextInputModalProps {
  initialText?: string
  onSend: (text: string) => void
  onClose: () => void
}

export function TextInputModal({ initialText = '', onSend, onClose }: TextInputModalProps) {
  const [text, setText] = useState(initialText)

  const handleSend = () => {
    if (text.trim()) {
      onSend(text)
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-warp-surface border border-warp-border rounded-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-warp-border">
          <h3 className="text-base font-semibold text-warp-text">Send Text</h3>
          <button
            onClick={onClose}
            className="no-drag text-warp-text-muted hover:text-warp-text transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type your message..."
            rows={6}
            autoFocus
            className="no-drag w-full bg-warp-card border border-warp-border rounded-lg px-3 py-2.5 text-sm text-warp-text placeholder:text-warp-text-muted focus:outline-none focus:border-warp-accent/50 focus:ring-1 focus:ring-warp-accent/20 transition-all resize-none"
          />

          <div className="flex items-center justify-between">
            <span className="text-xs text-warp-text-muted">
              {text.length} characters
            </span>
            <button
              onClick={handleSend}
              disabled={!text.trim()}
              className="no-drag flex items-center gap-2 px-4 py-2 bg-warp-accent text-warp-bg rounded-lg font-medium text-sm hover:bg-warp-accent/90 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <Send size={14} />
              Add to Selection
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
