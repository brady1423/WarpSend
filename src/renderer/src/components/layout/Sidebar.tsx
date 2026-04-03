import { Download, Send, Users, Settings } from 'lucide-react'
import clsx from 'clsx'

type Tab = 'receive' | 'send' | 'friends' | 'settings'

interface SidebarProps {
  activeTab: Tab
  onTabChange: (tab: Tab) => void
  incomingCount?: number
}

const tabs: { id: Tab; label: string; icon: typeof Download }[] = [
  { id: 'receive', label: 'Receive', icon: Download },
  { id: 'send', label: 'Send', icon: Send },
  { id: 'friends', label: 'Friends', icon: Users },
  { id: 'settings', label: 'Settings', icon: Settings }
]

export function Sidebar({ activeTab, onTabChange, incomingCount = 0 }: SidebarProps) {
  return (
    <aside className="w-[140px] bg-warp-sidebar flex flex-col border-r border-warp-border pt-9 shrink-0">
      <div className="px-4 py-5 no-drag">
        <h1 className="text-lg font-semibold text-warp-text tracking-tight">
          Warp<span className="text-warp-accent">Send</span>
        </h1>
      </div>

      <nav className="flex flex-col gap-0.5 px-2">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            className={clsx(
              'no-drag flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 relative',
              activeTab === id
                ? 'bg-warp-sidebar-active text-warp-accent'
                : 'text-warp-text-secondary hover:text-warp-text hover:bg-warp-card/50'
            )}
          >
            <Icon
              size={18}
              className={clsx(
                'transition-colors',
                activeTab === id ? 'text-warp-accent' : 'text-warp-text-muted'
              )}
            />
            {label}

            {/* Incoming transfers badge */}
            {id === 'receive' && incomingCount > 0 && (
              <span className="absolute top-1.5 right-2 min-w-[18px] h-[18px] flex items-center justify-center px-1 bg-warp-accent text-warp-bg text-[10px] font-bold rounded-full">
                {incomingCount}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="flex-1" />

      <div className="px-4 py-3 text-xs text-warp-text-muted">
        v0.1.0
      </div>
    </aside>
  )
}
