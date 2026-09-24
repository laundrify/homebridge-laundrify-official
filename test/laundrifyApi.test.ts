import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'

import LaundrifyApi from '../src/helper/LaundrifyApi'
import { LAUNDRIFY_CONFIG_FILE, PLATFORM_NAME } from '../src/settings'
import { createApi, createLogger } from './helpers'
import { createMockBackend, MockBackend } from './mock-backend/server'

const { version } = fs.readJsonSync(path.join(__dirname, '../package.json'))

describe('LaundrifyApi', () => {
	let mock: MockBackend
	let storagePath: string
	let log: ReturnType<typeof createLogger>

	const configFile = () => storagePath + LAUNDRIFY_CONFIG_FILE
	const writeConfig = (config) => fs.writeJsonSync(configFile(), { pluginVersion: version, ...config })
	const create = (config = {}) => new LaundrifyApi(log, { platform: PLATFORM_NAME, baseUrl: mock.url, ...config }, createApi(storagePath))
	const requests = (method: string, url: string) => mock.requests.filter(r => r.method === method && r.url === url)

	beforeEach(async () => {
		mock = await createMockBackend().listen()
		storagePath = fs.mkdtempSync(path.join(os.tmpdir(), 'laundrify-test-'))
		log = createLogger()
	})

	afterEach(async () => {
		vi.useRealTimers()
		await mock.close()
		fs.removeSync(storagePath)
	})

	it('registers with the AuthCode on the first start and persists the token', async () => {
		const api = create({ authCode: '123-456' })

		await expect(api.isInitialized).resolves.toBe(true)

		expect(requests('POST', '/auth/homebridge/token')).toHaveLength(1)
		expect(fs.readJsonSync(configFile())).toMatchObject({ pluginVersion: version, authCode: '123-456', accessToken: 'mock-token' })
	})

	it('sends the token with every request and returns the machines', async () => {
		const api = create({ authCode: '123-456' })

		await expect(api.loadMachines()).resolves.toEqual(mock.machines)
		expect(requests('GET', '/api/machines')[0].authorization).toBe('Bearer hb|mock-token')
	})

	it('reuses a persisted token instead of registering again', async () => {
		writeConfig({ authCode: '123-456', accessToken: 'mock-token' })
		const api = create({ authCode: '123-456' })

		await expect(api.loadMachines()).resolves.toEqual(mock.machines)
		expect(requests('POST', '/auth/homebridge/token')).toHaveLength(0)
	})

	it('registers again when the configured AuthCode changed', async () => {
		writeConfig({ authCode: '000-000', accessToken: 'stale-token' })
		const api = create({ authCode: '123-456' })

		await expect(api.isInitialized).resolves.toBe(true)

		expect(requests('POST', '/auth/homebridge/token')).toHaveLength(1)
		expect(fs.readJsonSync(configFile())).toMatchObject({ authCode: '123-456', accessToken: 'mock-token' })
	})

	it('rejects a malformed AuthCode without contacting the backend', async () => {
		const api = create({ authCode: 'abc' })

		await expect(api.isInitialized).resolves.toBe(false)
		expect(mock.requests).toHaveLength(0)
		expect(log.error).toHaveBeenCalledWith(expect.stringContaining("doesn't match the expected pattern"))
	})

	it('fails to initialize when the backend does not know the AuthCode', async () => {
		const api = create({ authCode: '999-999' })

		await expect(api.isInitialized).resolves.toBe(false)
		expect(log.error).toHaveBeenCalledWith(expect.stringContaining('AuthCode 999-999 not found'))
	})

	it('is not initialized without an AuthCode and refuses to send requests', async () => {
		const api = create()

		await expect(api.isInitialized).resolves.toBe(false)
		await expect(api.loadMachines()).rejects.toThrow('not initialized')
		expect(mock.requests).toHaveLength(0)
	})

	it('retries a failed request three times with backoff before giving up', async () => {
		const api = create({ authCode: '123-456' })
		await api.isInitialized
		mock.mode = 'fail'

		// skip the real backoff waits: each retry is announced right before its timer is scheduled
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
		const result = api.loadMachines()

		for (const wait of [200, 400, 800]) {
			await vi.waitFor(() => expect(log.debug).toHaveBeenCalledWith(expect.stringContaining(`retrying in ${wait}ms`)))
			await vi.advanceTimersByTimeAsync(wait)
		}

		await expect(result).rejects.toMatchObject({ status: 500 })
		expect(requests('GET', '/api/machines')).toHaveLength(4)
	})

	it('does not retry on 401 and clears the persisted token', async () => {
		const api = create({ authCode: '123-456' })
		await api.isInitialized
		mock.mode = 'unauth'

		await expect(api.loadMachines()).rejects.toMatchObject({ status: 401 })
		expect(requests('GET', '/api/machines')).toHaveLength(1)
		expect(fs.readJsonSync(configFile()).accessToken).toBe('')
		expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('AccessToken seems to be invalid'))
	})

	it('never writes the access token to the debug log', async () => {
		writeConfig({ authCode: '123-456', accessToken: 'mock-token' })
		const api = create({ authCode: '123-456' })

		await api.isInitialized

		const debugOutput = vi.mocked(log.debug).mock.calls.flat().join('\n')
		expect(debugOutput).toContain('Read config from disk')
		expect(debugOutput).not.toContain('mock-token')
	})
})
