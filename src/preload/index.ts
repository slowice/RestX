import { contextBridge, ipcRenderer } from 'electron'
import type { RestXApi } from '../app-api'
import { createFeatureApiContributions } from '../platform/preload/feature-registry'
import { composeApiContributions, createPlatformApi } from '../platform/preload/expose-api'

const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> => ipcRenderer.invoke(channel, ...args) as Promise<T>
const api = composeApiContributions([createPlatformApi(invoke), ...createFeatureApiContributions(invoke)]) as RestXApi

contextBridge.exposeInMainWorld('restx', api)
