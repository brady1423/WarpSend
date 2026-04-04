import { useState } from 'react'
import { Sidebar } from './components/layout/Sidebar'
import { ReceiveTab } from './components/receive/ReceiveTab'
import { SendTab } from './components/send/SendTab'
import { FriendsTab } from './components/friends/FriendsTab'
import { SettingsTab } from './components/settings/SettingsTab'
import { useAppInit } from './hooks/useAppInit'
import { useAppStore } from './stores/app-store'
import { ToastContainer } from './components/shared/Toast'

type Tab = 'receive' | 'send' | 'friends' | 'settings'

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('receive')
  const deviceInfo = useAppStore((s) => s.deviceInfo)
  const incomingCount = useAppStore((s) => s.incomingRequests.length)

  useAppInit()

  return (
    <div className="flex h-screen bg-warp-bg">
      <div className="drag-region fixed top-0 left-0 right-0 h-9 z-50" />

      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        incomingCount={incomingCount}
      />

      <main className="flex-1 pt-9 overflow-hidden">
        <div className="h-full overflow-y-auto">
          {activeTab === 'receive' && <ReceiveTab deviceInfo={deviceInfo} />}
          {activeTab === 'send' && <SendTab />}
          {activeTab === 'friends' && <FriendsTab />}
          {activeTab === 'settings' && <SettingsTab />}
        </div>
      </main>
      <ToastContainer />
    </div>
  )
}
