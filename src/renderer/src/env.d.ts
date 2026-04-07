/// <reference types="vite/client" />

declare module '*.css' {}

declare module '../../preload/index' {
  const api: typeof import('../../preload/index')
  export = api
}
