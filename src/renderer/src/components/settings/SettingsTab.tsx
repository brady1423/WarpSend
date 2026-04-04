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
        'no-drag relative rounded-full transition-colors duration-200',
        enabled ? 'bg-warp-accent' : 'bg-warp-border'
      )}
      style={{ width: 40, height: 22, flexShrink: 0 }}
    >
      <span
        className="absolute rounded-full bg-white shadow"
        style={{
          width: 18,
          height: 18,
          top: 2,
          left: enabled ? 20 : 2,
          transition: 'left 0.2s ease'
        }}
      />
    </button>
  )
}

export function SettingsTab() {
  const deviceInfo = useAppStore((s) => s.deviceInfo)
  const setDeviceInfo = useAppStore((s) => s.setDeviceInfo)
  const [deviceName, setDeviceName] = useState(deviceInfo.name)
  const [downloadFolder, setDownloadFolder] = useState('~/Downloads/WarpSend')
  const [activeTheme, setActiveTheme] = useState('midnight-teal')
  const [startOnBoot, setStartOnBoot] = useState(false)
  const [notifications, setNotifications] = useState(true)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setDeviceName(deviceInfo.name)
  }, [deviceInfo.name])

  useEffect(() => {
    window.api?.settings?.get('theme').then((result: any) => {
      if (result?.success && result.value) {
        setActiveTheme(result.value)
      }
    }).catch(() => {})
  }, [])

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

  const handleThemeChange = async (theme: string) => {
    setActiveTheme(theme)
    document.documentElement.setAttribute('data-theme', theme === 'midnight-teal' ? '' : theme)
    try {
      await window.api?.settings?.set('theme', theme)
    } catch {}
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

        {/* Themes */}
        <div>
          <label className="text-xs font-medium text-warp-text-secondary uppercase tracking-wider block mb-3">
            Theme
          </label>
          <div className="flex gap-3">
            {/* Midnight Teal */}
            <button
              onClick={() => handleThemeChange('midnight-teal')}
              className={`no-drag flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${
                activeTheme === 'midnight-teal'
                  ? 'border-warp-accent bg-warp-accent/5'
                  : 'border-warp-border hover:border-warp-accent/30'
              }`}
            >
              <div className="flex gap-1">
                <div className="w-4 h-4 rounded-full bg-[#0f1019] border border-warp-border" />
                <div className="w-4 h-4 rounded-full bg-[#1e2030] border border-warp-border" />
                <div className="w-4 h-4 rounded-full bg-[#2dd4bf]" />
              </div>
              <span className="text-xs text-warp-text-secondary">Midnight Teal</span>
              {activeTheme === 'midnight-teal' && (
                <span className="text-[10px] text-warp-accent font-medium">Active</span>
              )}
            </button>

            {/* Onyx Black */}
            <button
              onClick={() => handleThemeChange('onyx-black')}
              className={`no-drag flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${
                activeTheme === 'onyx-black'
                  ? 'border-warp-accent bg-warp-accent/5'
                  : 'border-warp-border hover:border-warp-accent/30'
              }`}
            >
              <div className="flex gap-1">
                <div className="w-4 h-4 rounded-full bg-[#000000] border border-warp-border" />
                <div className="w-4 h-4 rounded-full bg-[#111111] border border-warp-border" />
                <div className="w-4 h-4 rounded-full bg-[#2dd4bf]" />
              </div>
              <span className="text-xs text-warp-text-secondary">Onyx Black</span>
              {activeTheme === 'onyx-black' && (
                <span className="text-[10px] text-warp-accent font-medium">Active</span>
              )}
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
