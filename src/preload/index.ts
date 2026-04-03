import { contextBridge, ipcRenderer } from 'electron'

const api = {
  app: {
    getDeviceInfo: () => ipcRenderer.invoke('app:get-device-info'),
    setDeviceName: (name: string) => ipcRenderer.invoke('app:set-device-name', name)
  },
  friends: {
    list: () => ipcRenderer.invoke('friends:list'),
    getConnectionString: () => ipcRenderer.invoke('friends:get-connection-string'),
    pair: (connectionString: string) => ipcRenderer.invoke('friends:pair', connectionString),
    remove: (id: string) => ipcRenderer.invoke('friends:remove', id)
  },
  transfers: {
    send: (friendId: string, filePaths: string[]) =>
      ipcRenderer.invoke('transfer:send', friendId, filePaths),
    accept: (transferId: string) => ipcRenderer.invoke('transfer:accept', transferId),
    decline: (transferId: string) => ipcRenderer.invoke('transfer:decline', transferId),
    cancel: (transferId: string) => ipcRenderer.invoke('transfer:cancel', transferId),
    onProgress: (callback: (data: unknown) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data)
      ipcRenderer.on('transfer:progress', listener)
      return () => ipcRenderer.removeListener('transfer:progress', listener)
    },
    onIncoming: (callback: (data: unknown) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data)
      ipcRenderer.on('transfer:incoming', listener)
      return () => ipcRenderer.removeListener('transfer:incoming', listener)
    }
  },
  tunnel: {
    onFriendStatus: (callback: (data: unknown) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data)
      ipcRenderer.on('tunnel:friend-status', listener)
      return () => ipcRenderer.removeListener('tunnel:friend-status', listener)
    }
  },
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value),
    getStartOnBoot: () => ipcRenderer.invoke('settings:get-start-on-boot'),
    setStartOnBoot: (enabled: boolean) => ipcRenderer.invoke('settings:set-start-on-boot', enabled)
  },
  dialog: {
    openFile: () => ipcRenderer.invoke('dialog:open-file'),
    openFolder: () => ipcRenderer.invoke('dialog:open-folder')
  }
}

export type WarpSendAPI = typeof api

contextBridge.exposeInMainWorld('api', api)
