import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';

import { LaundrifyPlatform } from './laundrifyPlatform'

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class LaundrifyAccessory {
	private service: Service;

	private statusMap = {
		'ON': this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED,
		'OFF': this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED,
	}

	constructor(
		private readonly platform: LaundrifyPlatform,
		private readonly accessory: PlatformAccessory,
	) {

		// set accessory information
		this.accessory.getService(this.platform.Service.AccessoryInformation)!
			.setCharacteristic(this.platform.Characteristic.Manufacturer, 'laundrify')
			.setCharacteristic(this.platform.Characteristic.Model, 'WLAN-Adapter')
			.setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.device.mac || 'n/a')
			.setCharacteristic(this.platform.Characteristic.FirmwareRevision, accessory.context.device.firmwareVersion || 'n/a')

		// get the ContactSensor service if it exists, otherwise create a new ContactSensor service
		// you can create multiple services for each accessory
		this.service = this.accessory.getService(this.platform.Service.ContactSensor) ||
			this.accessory.addService(this.platform.Service.ContactSensor)

		// set the service name, this is what is displayed as the default name on the Home app
		this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name)

		// register handlers for the ContactSensorState characteristic
		this.service.getCharacteristic(this.platform.Characteristic.ContactSensorState)
			.onGet( () => this.handleGetValue() )

		if (this.platform.config.invertStatus) {
			this.statusMap = {
				'ON': this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED,
				'OFF': this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED,
			}
		}

		// Frequently poll the current status of the Machine
		let pollInterval = this.platform.config.pollInterval * 1000 || 60000

		if (pollInterval < 10000) {
			this.platform.log.warn('The configured pollInterval is below the minimum of 10s!')
			this.platform.log.warn('Using the default value of 60s instead.')
			pollInterval = 60000
		}

		setInterval( async () => {
			try {
				const machine = await this.platform.laundrifyApi.loadMachine( this.accessory.context.device._id )

				this.service.updateCharacteristic(this.platform.Characteristic.ContactSensorState, this.statusMap[machine.status])
			} catch(err) {
				this.platform.log.error('Error while polling Machine status: ', err)
			}
		}, pollInterval)
	}

	/**
	 * Handle the "GET" requests from HomeKit
	 * These are sent when HomeKit wants to know the current state of the accessory, for example, checking if a Light bulb is on.
	 *
	 * GET requests should return as fast as possbile. A long delay here will result in
	 * HomeKit being unresponsive and a bad user experience in general.
	 *
	 * If your device takes time to respond you should update the status of your device
	 * asynchronously instead using the `updateCharacteristic` method instead.

	 * @example
	 * this.service.updateCharacteristic(this.platform.Characteristic.On, true)
	 */
	async handleGetValue(): Promise<CharacteristicValue> {
		try {
			const machine = await this.platform.laundrifyApi.loadMachine( this.accessory.context.device._id )

			this.platform.log.debug(`Machine ${machine._id} is currently ${machine.status}`)

			return this.statusMap[machine.status]
		} catch(err) {
			this.platform.log.error('Error while loading Machine: ', err)

			// return an error to show the device as "Not Responding" in the Home app:
			throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
		}
	}
}
