import { Folder } from 'lucide-react'
import clsx from 'clsx'
import { useState, useEffect } from 'react'
import { useAppStore } from '../../stores/app-store'

interface ToggleProps {
  enabled: boolean
  onToggle: () => void
}

function Toggle({ enabled, onToggle }: ToggleProps) {
  return (
    <button
      onClick={onToggle}
      className={clsx(
        'no-drag relative w-10 h-5.5 rounded-full transition-colors duration-200',
        enabled ? 'bg-warp-accent' : 'bg-warp-border'
      )}
    >
      <span
        className={clsx(
          'absolute top-0.5 w-4.5 h-4.5 rounded-full bg-white shadow transition-transform duration-200',
          enabled ? 'translate-x-5' : 'translate-x-0.5'
        )}
      />
    </button>
  )
}

export function SettingsTab() {
  const deviceInfo = useAppStore((s) => s.deviceInfo)
  const setDeviceInfo = useAppStore((s) => s.setDeviceInfo)
  const [deviceName, setDeviceName] = useState(deviceInfo.name)
  const [downloadFolder, setDownloadFolder] = useState('~/Downloads')
  const [startOnBoot, setStartOnBoot] = useState(false)
  const [notifications, setNotifications] = useState(true)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setDeviceName(deviceInfo.name)
  }, [deviceInfo.name])

  const handleNameChange = async (name: string) => {
    setDeviceName(name)
  }

  const handleNameBlur = async () => {
    if (deviceName !== deviceInfo.name) {
      try {
        await window.api?.app?.setDeviceName?.(deviceName)
        setDeviceInfo({ ...deviceInfo, name: deviceName })
        setSaved(true)
        setTimeout(() => setSaved(false), 1500)
      } catch {}
    }
  }

  const handleChangeFolder = async () => {
    try {
      const folder = await window.api?.dialog?.openFolder()
      if (folder) setDownloadFolder(folder)
    } catch {}
  }

  const handleToggleBoot = async () => {
    const newVal = !startOnBoot
    setStartOnBoot(newVal)
    try {
      await (window.api as any)?.settings?.setStartOnBoot?.(newVal)
    } catch {}
  }

  return (
    <div className="p-6 max-w-xl">
      <div className="flex items-center gap-2 mb-6">
        <h2 className="text-lg font-semibold text-warp-text">Settings</h2>
        {saved && (
          <span className="text-xs text-warp-online animate-pulse">Saved</span>
        )}
      </div>

      <div className="space-y-5">
        {/* Device Name */}
        <div>
          <label className="text-xs font-medium text-warp-text-secondary uppercase tracking-wider block mb-2">
            Device Name
          </label>
          <input
            type="text"
            value={deviceName}
            onChange={(e) => handleNameChange(e.target.value)}
            onBlur={handleNameBlur}
            className="no-drag w-full bg-warp-card border border-warp-border rounded-lg px-3 py-2.5 text-sm text-warp-text focus:outline-none focus:border-warp-accent/50 focus:ring-1 focus:ring-warp-accent/20 transition-all"
          />
        </div>

        {/* Download Folder */}
        <div>
          <label className="text-xs font-medium text-warp-text-secondary uppercase tracking-wider block mb-2">
            Download Folder
          </label>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-warp-card border border-warp-border rounded-lg px-3 py-2.5 text-sm text-warp-text-secondary truncate font-mono">
              {downloadFolder}
            </div>
            <button
              onClick={handleChangeFolder}
              className="no-drag shrink-0 p-2.5 rounded-lg bg-warp-card border border-warp-border text-warp-text-muted hover:text-warp-accent hover:border-warp-accent/30 transition-all"
            >
              <Folder size={16} />
            </button>
          </div>
        </div>

        <div className="h-px bg-warp-border" />

        {/* Start on boot */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-warp-text">Start on boot</p>
            <p className="text-xs text-warp-text-muted mt-0.5">Launch WarpSend when your computer starts</p>
          </div>
          <Toggle enabled={startOnBoot} onToggle={handleToggleBoot} />
        </div>

        {/* Notifications */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-warp-text">Notifications</p>
            <p className="text-xs text-warp-text-muted mt-0.5">Show alerts for incoming transfers</p>
          </div>
          <Toggle enabled={notifications} onToggle={() => setNotifications(!notifications)} />
        </div>

        <div className="h-px bg-warp-border" />

        {/* About */}
        <div>
          <p className="text-sm font-medium text-warp-text mb-1">About</p>
          <p className="text-xs text-warp-text-muted">WarpSend v0.1.0 — Encrypted P2P file transfer</p>
          <p className="text-xs text-warp-text-muted mt-0.5">Built with WireGuard-grade encryption. No servers, no accounts.</p>
        </div>
      </div>
    </div>
  )
}
