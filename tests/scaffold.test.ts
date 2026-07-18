import { describe, expect, it } from 'vitest'

import { appInfo } from '../src/appInfo'

describe('project scaffold', () => {
  it('exposes the expected application metadata', () => {
    expect(appInfo).toEqual({ name: 'Free-DH', version: '0.0.0' })
  })
})
