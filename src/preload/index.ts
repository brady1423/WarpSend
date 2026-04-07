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
    remove: (id: string) => ipcRenderer.invoke('friends:remove', id),
    setNickname: (id: string, nickname: string) =>
      ipcRenderer.invoke('friends:set-nickname', id, nickname)
  },
  transfers: {
    send: (friendId: string, filePaths: string[]) =>
      ipcRenderer.invoke('transfer:send', friendId, filePaths),
    sendText: (friendId: string, text: string) =>
      ipcRenderer.invoke('transfer:send-text', friendId, text),
    accept: (transferId: string) => ipcRenderer.invoke('transfer:accept', transferId),
    acceptWithPath: (transferId: string) =>
      ipcRenderer.invoke('transfer:accept-with-path', transferId),
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
    },
    onFailed: (callback: (data: unknown) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data)
      ipcRenderer.on('transfer:failed', listener)
      return () => ipcRenderer.removeListener('transfer:failed', listener)
    },
    onCompleted: (callback: (data: unknown) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data)
      ipcRenderer.on('transfer:completed', listener)
      return () => ipcRenderer.removeListener('transfer:completed', listener)
    }
  },
  tunnel: {
    onFriendStatus: (callback: (data: unknown) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data)
      ipcRenderer.on('tunnel:friend-status', listener)
      return () => ipcRenderer.removeListener('tunnel:friend-status', listener)
    }
  },
  history: {
    list: (friendId?: string) => ipcRenderer.invoke('history:list', friendId),
    clear: (friendId?: string) => ipcRenderer.invoke('history:clear', friendId)
  },
  text: {
    onIncoming: (callback: (data: unknown) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data)
      ipcRenderer.on('text:incoming', listener)
      return () => ipcRenderer.removeListener('text:incoming', listener)
    }
  },
  file: {
    readTextPreview: (filePath: string) => ipcRenderer.invoke('file:read-text-preview', filePath),
    readAsDataUrl: (filePath: string) => ipcRenderer.invoke('file:read-as-data-url', filePath),
    openInFolder: (filePath: string) => ipcRenderer.invoke('file:open-in-folder', filePath)
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
