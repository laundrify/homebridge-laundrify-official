import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Characteristic, HAPStatus, Service, uuid } from '@homebridge/hap-nodejs'

import { LaundrifyPlatform } from '../src/laundrifyPlatform'
import { PLATFORM_NAME } from '../src/settings'
import { createApi, createLaundrifyApi, createLogger, FakePlatformAccessory } from './helpers'

const { CONTACT_DETECTED, CONTACT_NOT_DETECTED } = Characteristic.ContactSensorState

const machine = (overrides = {}) => ({
	_id: 'aaaa0001', name: 'Waschmaschine', status: 'OFF', model: 'M01', chipID: 'CHIP01', firmwareVersion: '1.5.0', ...overrides,
})

const contactState = (accessory: FakePlatformAccessory) =>
	accessory.getService(Service.ContactSensor)!.getCharacteristic(Characteristic.ContactSensorState)

describe('LaundrifyPlatform', () => {
	let api: ReturnType<typeof createApi>
	let laundrifyApi: ReturnType<typeof createLaundrifyApi>
	let log: ReturnType<typeof createLogger>

	const start = (config = {}) => {
		const platform = new LaundrifyPlatform(log, { platform: PLATFORM_NAME, pollInterval: 10, ...config }, api, laundrifyApi)
		api.emit('didFinishLaunching')
		return platform
	}

	// the poll loop is async; a setImmediate (not faked) lets every pending microtask settle before asserting
	const flush = () => new Promise(resolve => setImmediate(resolve))
	const polled = async (times: number) => {
		await flush()
		expect(laundrifyApi.loadMachines).toHaveBeenCalledTimes(times)
	}

	const registeredAccessory = (call = 0) =>
		vi.mocked(api.registerPlatformAccessories).mock.calls[call][2][0] as unknown as FakePlatformAccessory

	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
		api = createApi()
		laundrifyApi = createLaundrifyApi()
		log = createLogger()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it('registers one accessory per machine and maps the status to the contact sensor state', async () => {
		laundrifyApi.loadMachines.mockResolvedValue([
			machine({ status: 'ON' }),
			machine({ _id: 'bbbb0002', name: 'Trockner', status: 'OFF', model: 'SU02' }),
		])

		start()
		await polled(1)

		expect(api.registerPlatformAccessories).toHaveBeenCalledTimes(2)

		const washer = registeredAccessory(0)
		expect(washer.displayName).toBe('Waschmaschine')
		expect(contactState(washer).value).toBe(CONTACT_DETECTED)

		const info = washer.getService(Service.AccessoryInformation)!
		expect(info.getCharacteristic(Characteristic.Model).value).toBe('WLAN-Adapter mini')
		expect(info.getCharacteristic(Characteristic.SerialNumber).value).toBe('CHIP01')
		expect(info.getCharacteristic(Characteristic.FirmwareRevision).value).toBe('1.5.0')

		expect(contactState(registeredAccessory(1)).value).toBe(CONTACT_NOT_DETECTED)
	})

	it('inverts the mapping when invertStatus is set', async () => {
		laundrifyApi.loadMachines.mockResolvedValue([machine({ status: 'ON' })])

		start({ invertStatus: true })
		await polled(1)

		expect(contactState(registeredAccessory()).value).toBe(CONTACT_NOT_DETECTED)
	})

	it('updates a cached accessory instead of registering it again', async () => {
		const cached = new FakePlatformAccessory('Waschmaschine', uuid.generate('aaaa0001'))
		cached.context.device = machine({ status: 'OFF' })
		laundrifyApi.loadMachines.mockResolvedValue([machine({ status: 'ON' })])

		const platform = start()
		platform.configureAccessory(cached as any)
		expect(contactState(cached).value).toBe(CONTACT_NOT_DETECTED)

		await polled(1)

		expect(api.registerPlatformAccessories).not.toHaveBeenCalled()
		expect(contactState(cached).value).toBe(CONTACT_DETECTED)
	})

	it('registers machines that appear and unregisters machines that disappear between polls', async () => {
		const washer = machine()
		const dryer = machine({ _id: 'bbbb0002', name: 'Trockner' })
		laundrifyApi.loadMachines.mockResolvedValueOnce([washer]).mockResolvedValueOnce([washer, dryer]).mockResolvedValue([dryer])

		start()
		await polled(1)
		expect(api.registerPlatformAccessories).toHaveBeenCalledTimes(1)

		await vi.advanceTimersByTimeAsync(10000)
		await polled(2)
		expect(api.registerPlatformAccessories).toHaveBeenCalledTimes(2)
		expect(registeredAccessory(1).displayName).toBe('Trockner')

		await vi.advanceTimersByTimeAsync(10000)
		await polled(3)
		expect(api.unregisterPlatformAccessories).toHaveBeenCalledTimes(1)
		expect(vi.mocked(api.unregisterPlatformAccessories).mock.calls[0][2][0].displayName).toBe('Waschmaschine')

		await vi.advanceTimersByTimeAsync(10000)
		await polled(4)
		expect(api.unregisterPlatformAccessories).toHaveBeenCalledTimes(1)
	})

	it('keeps the previous state and warns when a machine reports an unknown status', async () => {
		laundrifyApi.loadMachines.mockResolvedValueOnce([machine({ status: 'ON' })]).mockResolvedValue([machine({ status: 'WHATEVER' })])

		start()
		await polled(1)
		await vi.advanceTimersByTimeAsync(10000)
		await polled(2)

		expect(contactState(registeredAccessory()).value).toBe(CONTACT_DETECTED)
		expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('unknown status (WHATEVER)'))
	})

	it('reports "Not Responding" after three failed polls and recovers with the next successful one', async () => {
		laundrifyApi.loadMachines.mockResolvedValueOnce([machine({ status: 'ON' })])
			.mockRejectedValueOnce(new Error('boom'))
			.mockRejectedValueOnce(new Error('boom'))
			.mockRejectedValueOnce(new Error('boom'))
			.mockResolvedValue([machine({ status: 'OFF' })])

		start()
		await polled(1)
		const state = contactState(registeredAccessory())

		await vi.advanceTimersByTimeAsync(20000)
		await polled(3)
		await expect(state.handleGetRequest()).resolves.toBe(CONTACT_DETECTED)

		await vi.advanceTimersByTimeAsync(10000)
		await polled(4)
		await expect(state.handleGetRequest()).rejects.toBe(HAPStatus.SERVICE_COMMUNICATION_FAILURE)
		expect(log.error).toHaveBeenCalledWith(expect.stringContaining('3 consecutive failures'), 'boom')

		await vi.advanceTimersByTimeAsync(10000)
		await polled(5)
		await expect(state.handleGetRequest()).resolves.toBe(CONTACT_NOT_DETECTED)
	})

	it('schedules the next poll after the previous one finished and stops on shutdown', async () => {
		laundrifyApi.loadMachines.mockResolvedValue([])

		start()
		await polled(1)

		await vi.advanceTimersByTimeAsync(9999)
		expect(laundrifyApi.loadMachines).toHaveBeenCalledTimes(1)

		await vi.advanceTimersByTimeAsync(1)
		await polled(2)

		api.emit('shutdown')
		await vi.advanceTimersByTimeAsync(60000)
		expect(laundrifyApi.loadMachines).toHaveBeenCalledTimes(2)
	})

	it('does not poll when the laundrify API could not be initialized', async () => {
		laundrifyApi = createLaundrifyApi(false)

		start()
		await flush()
		expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('not initialized'))

		await vi.advanceTimersByTimeAsync(60000)
		expect(laundrifyApi.loadMachines).not.toHaveBeenCalled()
	})

	it('falls back to 60s when the configured pollInterval is below the minimum', async () => {
		laundrifyApi.loadMachines.mockResolvedValue([])

		start({ pollInterval: 5 })
		await polled(1)
		expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('below the minimum'))

		await vi.advanceTimersByTimeAsync(59999)
		expect(laundrifyApi.loadMachines).toHaveBeenCalledTimes(1)

		await vi.advanceTimersByTimeAsync(1)
		await polled(2)
	})
})
