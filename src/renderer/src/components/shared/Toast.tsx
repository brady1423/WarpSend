import { useState, useEffect, useCallback } from 'react'
import { X, AlertTriangle, CheckCircle } from 'lucide-react'

export interface ToastMessage {
  id: string
  text: string
  type: 'error' | 'success'
}

let addToastFn: ((text: string, type: 'error' | 'success') => void) | null = null

export function showToast(text: string, type: 'error' | 'success' = 'error') {
  addToastFn?.(text, type)
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const addToast = useCallback((text: string, type: 'error' | 'success') => {
    const id = Date.now().toString()
    setToasts((prev) => [...prev, { id, text, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 4000)
  }, [])

  useEffect(() => {
    addToastFn = addToast
    return () => { addToastFn = null }
  }, [addToast])

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-center gap-2 px-4 py-3 rounded-xl border shadow-lg backdrop-blur-sm max-w-sm animate-slide-up ${
            toast.type === 'error'
              ? 'bg-warp-error/10 border-warp-error/30 text-warp-error'
              : 'bg-warp-online/10 border-warp-online/30 text-warp-online'
          }`}
        >
          {toast.type === 'error' ? <AlertTriangle size={16} /> : <CheckCircle size={16} />}
          <span className="text-sm flex-1">{toast.text}</span>
          <button
            onClick={() => removeToast(toast.id)}
            className="no-drag text-warp-text-muted hover:text-warp-text transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
