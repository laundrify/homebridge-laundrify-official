import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge'

import { PLATFORM_NAME, PLUGIN_NAME, MAX_FAILED_POLLS } from './settings'
import { LaundrifyAccessory } from './laundrifyAccessory'

import LaundrifyApi from './helper/LaundrifyApi'

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class LaundrifyPlatform implements DynamicPlatformPlugin {
	public readonly Service: typeof Service = this.api.hap.Service
	public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic

	// accessory handlers (restored from cache or registered at runtime) by accessory UUID
	private readonly handlers = new Map<string, LaundrifyAccessory>()

	public readonly laundrifyApi: LaundrifyApi

	private readonly pollInterval: number
	private pollTimer?: NodeJS.Timeout
	private failedPolls = 0

	constructor(
		public readonly log: Logger,
		public readonly config: PlatformConfig,
		public readonly api: API,
	) {
		this.log.debug('Finished initializing platform:', this.config.name)

		this.laundrifyApi = new LaundrifyApi(log, config, api)

		this.pollInterval = this.config.pollInterval * 1000 || 60000

		if (this.pollInterval < 10000) {
			this.log.warn('The configured pollInterval is below the minimum of 10s!')
			this.log.warn('Using the default value of 60s instead.')
			this.pollInterval = 60000
		}

		// When this event is fired it means Homebridge has restored all cached accessories from disk.
		// Dynamic Platform plugins should only register new accessories after this event was fired,
		// in order to ensure they weren't added to homebridge already. This event can also be used
		// to start discovery of new accessories.
		this.api.on('didFinishLaunching', async () => {
			log.debug('Executed didFinishLaunching callback')

			if (!(await this.laundrifyApi.isInitialized)) {
				this.log.warn('laundrify API is not initialized, Machines will not be polled. Please check your config.')
				return
			}

			this.poll()
		})

		this.api.on('shutdown', () => clearTimeout(this.pollTimer))
	}

	/**
	 * This function is invoked when homebridge restores cached accessories from disk at startup.
	 * It should be used to setup event handlers for characteristics and update respective values.
	 */
	configureAccessory(accessory: PlatformAccessory) {
		this.log.info('Loading accessory from cache:', accessory.displayName)

		this.handlers.set(accessory.UUID, new LaundrifyAccessory(this, accessory))
	}

	/**
	 * Load all Machines from the backend (a single request) and reconcile the accessories with them.
	 * The next poll is scheduled once this one has finished, so polls never overlap.
	 */
	async poll() {
		try {
			const machines = await this.laundrifyApi.loadMachines()

			this.failedPolls = 0

			// the very first poll is the initial discovery, log it as info
			const logLevel = this.pollTimer ? 'debug' : 'info'
			const summary = machines.map(m => `${m._id}=${m.status}`).join(', ')
			this.log[logLevel](`Retrieved ${machines.length} Machines (${summary}) from backend`)

			this.reconcile(machines)
		} catch(err: any) {
			this.failedPolls++
			this.log.error(`Error while loading Machines from backend (${this.failedPolls} consecutive failures): `, err.message)

			if (this.failedPolls >= MAX_FAILED_POLLS) {
				this.handlers.forEach( handler => handler.setUnreachable() )
			}
		} finally {
			this.pollTimer = setTimeout( () => this.poll(), this.pollInterval )
		}
	}

	/**
	 * Push the polled Machine data to the known accessories, register accessories for new Machines
	 * and unregister accessories whose Machine is no longer returned from the backend.
	 * Accessories must only be registered once, so restored ones are looked up by their UUID.
	 */
	reconcile(machines) {
		const returnedUuids = new Set<string>()

		for (const machine of machines) {
			// generate a unique id for the accessory
			const uuid = this.api.hap.uuid.generate(machine._id)
			returnedUuids.add(uuid)

			const handler = this.handlers.get(uuid)

			if (handler) {
				handler.update(machine)
				continue
			}

			this.log.info('Adding new accessory:', machine.name)

			// store the Machine in the accessory `context`, which Homebridge persists to the accessory cache
			const accessory = new this.api.platformAccessory(machine.name, uuid)
			accessory.context.device = machine

			this.handlers.set(uuid, new LaundrifyAccessory(this, accessory))
			this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory])
		}

		// remove accessories whose Machine hasn't been returned from the backend (e.g. removed in the laundrify app)
		for (const [uuid, handler] of this.handlers) {
			if (returnedUuids.has(uuid)) {
				continue
			}

			this.log.warn(`Removing ${handler.accessory.displayName} since its Machine hasn't been returned from backend`)
			this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [handler.accessory])
			this.handlers.delete(uuid)
		}
	}
}
