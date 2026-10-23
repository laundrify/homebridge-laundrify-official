// End-to-end test: the built plugin (dist/) runs in a real Homebridge child process against the mock backend,
// and every assertion is made on what a HomeKit controller sees through the bridge's HAP server
// (`-I` allows reading it over plain HTTP without pairing).
// The tests build on each other and run in order. Since the pollInterval can't go below 10s, a run takes about 1.5 minutes.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChildProcess, spawn } from 'child_process'
import { once } from 'events'
import fs from 'fs'
import net from 'net'
import os from 'os'
import path from 'path'
import { Characteristic, HAPStatus, Service, uuid } from '@homebridge/hap-nodejs'

import { LAUNDRIFY_CONFIG_FILE, PLATFORM_NAME } from '../../src/settings'
import { readJson } from '../helpers'
import { createMockBackend, MockBackend, MockMachine } from '../mock-backend/server'

const ROOT = path.join(__dirname, '../..')
const HOMEBRIDGE = path.join(ROOT, 'node_modules/homebridge/bin/homebridge.js')
const POLL_INTERVAL = 10000
const { CONTACT_DETECTED, CONTACT_NOT_DETECTED } = Characteristic.ContactSensorState

interface HapCharacteristic {
	iid: number
	type: string
	value?: unknown
}

interface HapAccessory {
	aid: number
	services: { type: string, characteristics: HapCharacteristic[] }[]
}

const freePort = () => new Promise<number>((resolve) => {
	const server = net.createServer().listen(0, () => {
		const { port } = server.address() as net.AddressInfo
		server.close(() => resolve(port))
	})
})

const find = (accessory: HapAccessory, service: { UUID: string }, characteristic: { UUID: string }) =>
	accessory.services.find(s => s.type === uuid.toShortForm(service.UUID))
		?.characteristics.find(c => c.type === uuid.toShortForm(characteristic.UUID))

describe('Homebridge with the plugin', { timeout: 60000 }, () => {
	let mock: MockBackend
	let storagePath: string
	let bridgePort: number
	let homebridge: ChildProcess
	let output = ''		// stdout and stderr, printed when a test fails
	let stderr = ''		// Homebridge logs warnings and errors to stderr
	let failed = false

	const hap = async <T>(urlPath: string) => (await fetch(`http://127.0.0.1:${bridgePort}${urlPath}`)).json() as Promise<T>

	// the contact sensors as a HomeKit controller sees them, sorted by name
	const sensors = async () => {
		const { accessories } = await hap<{ accessories: HapAccessory[] }>('/accessories')

		return accessories
			.filter(a => find(a, Service.ContactSensor, Characteristic.ContactSensorState))
			.map((a) => {
				const info = (characteristic: { UUID: string }) => find(a, Service.AccessoryInformation, characteristic)?.value
				const state = find(a, Service.ContactSensor, Characteristic.ContactSensorState)!

				return {
					name: info(Characteristic.Name),
					manufacturer: info(Characteristic.Manufacturer),
					model: info(Characteristic.Model),
					serial: info(Characteristic.SerialNumber),
					firmware: info(Characteristic.FirmwareRevision),
					state: state.value,
					stateId: `${a.aid}.${state.iid}`,
				}
			})
			.sort((a, b) => String(a.name).localeCompare(String(b.name)))
	}

	const readState = async (stateId: string) =>
		(await hap<{ characteristics: { value?: unknown, status?: number }[] }>(`/characteristics?id=${stateId}`)).characteristics[0]

	const sensor = async (name: string) => (await sensors()).find(s => s.name === name)

	const setMachines = (machines: MockMachine[]) => mock.machines = machines

	const startHomebridge = async () => {
		homebridge = spawn(process.execPath, [HOMEBRIDGE, '-D', '-I', '-Q', '-U', storagePath, '-P', ROOT, '--strict-plugin-resolution'])
		homebridge.stdout!.on('data', chunk => output += chunk)
		homebridge.stderr!.on('data', (chunk) => {
			output += chunk
			stderr += chunk
		})

		await vi.waitFor(async () => expect(await sensors()).toHaveLength(mock.machines.length), { timeout: 20000, interval: 250 })
	}

	const stopHomebridge = async () => {
		if (homebridge.exitCode === null && homebridge.signalCode === null) {
			const exited = once(homebridge, 'exit')
			homebridge.kill()
			await exited
		}
	}

	const [washer, dryer] = createMockBackend().machines
	const ironer: MockMachine = { ...washer, _id: 'cccc0003', name: 'Mock Mangel', status: 'ON', chipID: 'MOCKCHIP03' }

	beforeAll(async () => {
		mock = await createMockBackend().listen()
		storagePath = fs.mkdtempSync(path.join(os.tmpdir(), 'laundrify-e2e-'))
		bridgePort = await freePort()

		fs.writeFileSync(path.join(storagePath, 'config.json'), JSON.stringify({
			bridge: { name: 'Homebridge E2E', username: '0E:E2:E0:00:00:01', port: bridgePort, pin: '031-45-154' },
			platforms: [{
				platform: PLATFORM_NAME, name: 'laundrify', authCode: mock.authCode, pollInterval: POLL_INTERVAL / 1000, baseUrl: mock.url,
			}],
		}))

		await startHomebridge()
	}, 30000)

	beforeEach(({ onTestFailed }) => onTestFailed(() => {
		failed = true
	}))

	afterAll(async () => {
		await stopHomebridge()
		await mock.close()
		fs.rmSync(storagePath, { recursive: true, force: true })

		if (failed) {
			process.stderr.write(`\n----- Homebridge output -----\n${output}\n-----------------------------\n`)
		}
	})

	it('registers with the AuthCode and exposes every machine as a contact sensor', async () => {
		expect(mock.requests.filter(r => r.url === '/auth/homebridge/token')).toHaveLength(1)
		expect(readJson(storagePath + LAUNDRIFY_CONFIG_FILE)).toMatchObject({ authCode: mock.authCode, accessToken: mock.token })

		expect(await sensors()).toEqual([
			{
				name: 'Mock Trockner', manufacturer: 'laundrify', model: 'WLAN-Adapter classic', serial: 'MOCKCHIP02', firmware: '1.4.2',
				state: CONTACT_DETECTED, stateId: expect.any(String),
			},
			{
				name: 'Mock Waschmaschine', manufacturer: 'laundrify', model: 'WLAN-Adapter mini', serial: 'MOCKCHIP01', firmware: '1.5.0',
				state: CONTACT_NOT_DETECTED, stateId: expect.any(String),
			},
		])
	})

	it('pushes a status change to HomeKit with the next poll', async () => {
		setMachines([{ ...washer, status: 'ON' }, { ...dryer, status: 'OFF' }])

		await vi.waitFor(async () => {
			expect((await sensor('Mock Waschmaschine'))?.state).toBe(CONTACT_DETECTED)
			expect((await sensor('Mock Trockner'))?.state).toBe(CONTACT_NOT_DETECTED)
		}, { timeout: POLL_INTERVAL + 5000, interval: 500 })
	})

	it('adds and removes accessories when machines appear or disappear', async () => {
		setMachines([{ ...washer, status: 'ON' }, ironer])

		await vi.waitFor(async () => {
			expect((await sensors()).map(s => s.name)).toEqual(['Mock Mangel', 'Mock Waschmaschine'])
		}, { timeout: POLL_INTERVAL + 5000, interval: 500 })

		expect((await sensor('Mock Mangel'))?.state).toBe(CONTACT_DETECTED)
	})

	it('reports "Not Responding" after three failed polls and recovers with the next successful one', async () => {
		const { stateId } = (await sensor('Mock Waschmaschine'))!

		mock.mode = 'fail'
		await vi.waitFor(async () => {
			expect(await readState(stateId)).toMatchObject({ status: HAPStatus.SERVICE_COMMUNICATION_FAILURE })
		}, { timeout: 3 * POLL_INTERVAL + 10000, interval: 500 })

		mock.mode = 'ok'
		await vi.waitFor(async () => {
			expect(await readState(stateId)).toMatchObject({ value: CONTACT_DETECTED })
		}, { timeout: POLL_INTERVAL + 5000, interval: 500 })
	})

	it('drops the persisted access token when the backend rejects it', async () => {
		mock.mode = 'unauth'

		await vi.waitFor(() => {
			expect(readJson(storagePath + LAUNDRIFY_CONFIG_FILE).accessToken).toBe('')
		}, { timeout: POLL_INTERVAL + 5000, interval: 500 })

		mock.mode = 'ok'
	})

	it('restores the cached accessories after a restart, keeping their HomeKit IDs, and registers again', async () => {
		const before = await sensors()

		await stopHomebridge()
		const restartedAt = output.length
		await startHomebridge()

		const log = () => output.slice(restartedAt)
		await vi.waitFor(() => expect(log()).toContain('Retrieved 2 Machines'), { timeout: POLL_INTERVAL + 5000, interval: 500 })

		expect(log()).toContain('Loading accessory from cache: Mock Waschmaschine')
		expect(log()).toContain('Loading accessory from cache: Mock Mangel')
		expect(log()).not.toContain('Adding new accessory')
		expect(mock.requests.filter(r => r.url === '/auth/homebridge/token')).toHaveLength(2)
		expect(await sensors()).toEqual(before)
	})

	it('logs no warnings or errors besides the ones provoked above', () => {
		const provoked = [
			/Removing Mock Trockner since its Machine hasn't been returned from backend/,
			/Error while loading Machines from backend/,
			/AccessToken seems to be invalid/,
		]

		expect(stderr.split('\n').filter(line => line.trim() && !provoked.some(re => re.test(line)))).toEqual([])
	})
})
