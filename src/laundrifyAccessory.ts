import { Service, PlatformAccessory } from 'homebridge';

import { LaundrifyPlatform } from './laundrifyPlatform'
import { LAUNDRIFY_MODELS } from './settings'

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 *
 * HomeKit reads are answered by HAP-NodeJS from the last value pushed via `update()`,
 * so no GET handler is registered and the backend is never queried on a read.
 */
export class LaundrifyAccessory {
	private service: Service;

	private statusMap = {
		'ON': this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED,
		'OFF': this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED,
	}

	constructor(
		private readonly platform: LaundrifyPlatform,
		public readonly accessory: PlatformAccessory,
	) {
		this.accessory.getService(this.platform.Service.AccessoryInformation)!
			.setCharacteristic(this.platform.Characteristic.Manufacturer, 'laundrify')

		// get the ContactSensor service if it exists, otherwise create a new ContactSensor service
		// you can create multiple services for each accessory
		this.service = this.accessory.getService(this.platform.Service.ContactSensor) ||
			this.accessory.addService(this.platform.Service.ContactSensor)

		// set the service name, this is what is displayed as the default name on the Home app
		this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name)

		if (this.platform.config.invertStatus) {
			this.statusMap = {
				'ON': this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED,
				'OFF': this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED,
			}
		}

		this.update(accessory.context.device)
	}

	/**
	 * Apply the latest Machine data (as polled by the platform) and push it to HomeKit
	 */
	update(machine) {
		this.accessory.context.device = machine

		this.accessory.getService(this.platform.Service.AccessoryInformation)!
			.updateCharacteristic(this.platform.Characteristic.Model, LAUNDRIFY_MODELS[machine.model] || 'n/a')
			.updateCharacteristic(this.platform.Characteristic.SerialNumber, machine.chipID || 'n/a')
			.updateCharacteristic(this.platform.Characteristic.FirmwareRevision, machine.firmwareVersion || 'n/a')

		const state = this.statusMap[machine.status]

		if (state === undefined) {
			this.platform.log.warn(`Machine ${machine._id} reported an unknown status (${machine.status}), keeping the previous state`)
			return
		}

		this.service.updateCharacteristic(this.platform.Characteristic.ContactSensorState, state)
	}

	/**
	 * Show the accessory as "Not Responding" in the Home app until the next `update()`
	 */
	setUnreachable() {
		this.service.updateCharacteristic(
			this.platform.Characteristic.ContactSensorState,
			new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE),
		)
	}
}
