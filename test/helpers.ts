import { EventEmitter } from 'events'
import { vi } from 'vitest'
import * as hap from '@homebridge/hap-nodejs'
import type { API, Logger } from 'homebridge'
import type LaundrifyApi from '../src/helper/LaundrifyApi'

export const createLogger = () => ({
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
	debug: vi.fn(),
	log: vi.fn(),
	success: vi.fn(),
}) as unknown as Logger

/**
 * Stand-in for Homebridge's PlatformAccessory (which isn't exported at runtime):
 * a real HAP Accessory plus the `context` bag, so services and characteristics behave exactly like in Homebridge.
 */
export class FakePlatformAccessory extends hap.Accessory {
	public context: Record<string, any> = {}
}

/**
 * Minimal Homebridge API: the real HAP module (like Homebridge itself passes it), a real EventEmitter
 * for the lifecycle events, and spies for the accessory registry calls the plugin makes.
 */
export const createApi = (storagePath = '') => Object.assign(new EventEmitter(), {
	hap,
	platformAccessory: FakePlatformAccessory,
	user: { storagePath: () => storagePath },
	registerPlatformAccessories: vi.fn(),
	unregisterPlatformAccessories: vi.fn(),
}) as unknown as API & EventEmitter

/**
 * Stand-in for LaundrifyApi whose backend responses are controlled by the test
 */
export const createLaundrifyApi = (isInitialized = true) => ({
	isInitialized: Promise.resolve(isInitialized),
	loadMachines: vi.fn(),
}) as unknown as LaundrifyApi & { loadMachines: ReturnType<typeof vi.fn> }
