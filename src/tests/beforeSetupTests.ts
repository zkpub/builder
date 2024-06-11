// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import { TextEncoder, TextDecoder } from 'util'
import path from 'path'
import { config } from 'dotenv'
import flatten from 'flat'
import { mergeTranslations, setCurrentLocale } from 'decentraland-dapps/dist/modules/translation/utils'
import fetch, { Request, Response } from 'node-fetch'
import { en as dappsEn } from 'decentraland-dapps/dist/modules/translation/defaults'
import * as locales from '../modules/translation/languages'

jest.mock('decentraland-dapps/dist/modules/translation/utils', () => {
  const module = jest.requireActual('decentraland-dapps/dist/modules/translation/utils')
  return {
    ...module,
    T: ({ id, values }: (typeof module)['T']) => module.t(id, values) as unknown
  } as unknown
})

jest.mock('decentraland-dapps/dist/modules/translation/utils', () => {
  const module = jest.requireActual('decentraland-dapps/dist/modules/translation/utils')
  return {
    ...module,
    T: ({ id, values }: (typeof module)['T']) => module.t(id, values) as unknown
  } as unknown
})

config({ path: path.resolve(process.cwd(), '.env.example') })
global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder as any
if (!globalThis.fetch) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  globalThis.fetch = fetch as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  globalThis.Request = Request as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  globalThis.Response = Response as any
}

setCurrentLocale('en', mergeTranslations(flatten(dappsEn), flatten(locales.en)))

Object.defineProperty(window, 'location', {
  writable: true,
  value: {
    ...window.location,
    assign: jest.fn(),
    reload: jest.fn(),
    replace: jest.fn(),
    href: 'http://test.com/',
    pathname: '/',
    search: ''
  }
})
