import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge'

import { PLATFORM_NAME, PLUGIN_NAME } from './settings'
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

	// this is used to track restored cached accessories
	public readonly accessories: PlatformAccessory[] = []

	public laundrifyApi

	constructor(
		public readonly log: Logger,
		public readonly config: PlatformConfig,
		public readonly api: API,
	) {
		this.log.debug('Finished initializing platform:', this.config.name)

		// initUtils(this.log, this.api.user.storagePath())

		this.laundrifyApi = new LaundrifyApi(log, config, api)

		// When this event is fired it means Homebridge has restored all cached accessories from disk.
		// Dynamic Platform plugins should only register new accessories after this event was fired,
		// in order to ensure they weren't added to homebridge already. This event can also be used
		// to start discovery of new accessories.
		this.api.on('didFinishLaunching', () => {
			log.debug('Executed didFinishLaunching callback')
			// run the method to discover / register your devices as accessories
			this.discoverDevices()
		})
	}

	/**
	 * This function is invoked when homebridge restores cached accessories from disk at startup.
	 * It should be used to setup event handlers for characteristics and update respective values.
	 */
	configureAccessory(accessory: PlatformAccessory) {
		this.log.info('Loading accessory from cache:', accessory.displayName)

		// add the restored accessory to the accessories cache so we can track if it has already been registered
		this.accessories.push(accessory)
	}

	/**
	 * Accessories must only be registered once, previously created accessories
	 * must not be registered again to prevent "duplicate UUID" errors.
	 */
	discoverDevices() {
		this.laundrifyApi.loadMachines().then( machines => {
			this.log.info(`Retrieved ${machines.length} Machines (${machines.map(m => m._id).join(', ')}) from backend`)

			// loop over the discovered devices and register each one if it has not already been registered
			for (const machine of machines) {
				// generate a unique id for the accessory
				const uuid = this.api.hap.uuid.generate(machine._id)

				// see if an accessory with the same uuid has already been registered and restored from
				// the cached devices we stored in the `configureAccessory` method above
				const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid)

				if (existingAccessory) {
					// the accessory already exists
					this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName)

					// if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
					existingAccessory.context.device = machine
					this.api.updatePlatformAccessories([existingAccessory])

					// create the accessory handler for the restored accessory
					// this is imported from `platformAccessory.ts`
					new LaundrifyAccessory(this, existingAccessory)

					// it is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories`, eg.:
					// remove platform accessories when no longer present
					// this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory])
					// this.log.info('Removing existing accessory from cache:', existingAccessory.displayName)
				} else {
					// the accessory does not yet exist, so we need to create it
					this.log.info('Adding new accessory:', machine.name)

					// create a new accessory
					const accessory = new this.api.platformAccessory(machine.name, uuid)

					// store a copy of the device object in the `accessory.context`
					// the `context` property can be used to store any data about the accessory you may need
					accessory.context.device = machine

					// create the accessory handler for the newly create accessory
					// this is imported from `platformAccessory.ts`
					new LaundrifyAccessory(this, accessory)

					// link the accessory to your platform
					this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory])
				}
			}

			// delete accessories that have been removed from this account
			this.accessories.forEach( cachedAccessory => {
				const cachedMachine = cachedAccessory.context.device
				const isObsolete = machines.findIndex( m => cachedMachine._id === m._id ) === -1

				if (isObsolete) {
					this.log.warn(`Removing Machine ${cachedMachine._id} from cache since it hasn't been returned from backend`)
					this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [cachedAccessory])
				}

			})
		}).catch( (err: any) => {
			this.log.error(`Error while loading Machines from backend: `, err.message)
		})
	}
}
