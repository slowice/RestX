import type { HomeLoginInput } from '../shared/contracts'

export type HomePostLoginCallback = (input: Readonly<HomeLoginInput>) => Promise<void>

export const homePostLoginCallback: HomePostLoginCallback = async () => undefined
