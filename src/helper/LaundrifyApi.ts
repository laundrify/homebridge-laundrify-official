import {
	API,
	Logger,
	PlatformConfig,
} from 'homebridge'

import fs from 'fs-extra'
import axios from 'axios'

import { LAUNDRIFY_CONFIG_FILE, LAUNDRIFY_BASEURL } from '../settings'

export default class LaundrifyApi {

	private isInitialized: Promise<boolean>
	private accessToken: string

	constructor(
		private readonly log: Logger,
		private readonly config: PlatformConfig,
		private readonly api: API,
	) {
		this.accessToken = ''

		axios.defaults.baseURL = this.config.baseUrl || LAUNDRIFY_BASEURL

		// handle 401 responses to reset the accessToken
		axios.interceptors.response.use(
			(response) => response,
			(error) => {
				// Any status codes that falls outside the range of 2xx cause this function to trigger
				if (error.response.status === 401) {
					this.log.warn('AccessToken seems to be invalid, going to remove it.')
					this.accessToken = ''
					this.persistToken()

					return Promise.reject('Invalid AccessToken!')
				}

				return Promise.reject(error)
			},
		)

		this.isInitialized = new Promise( (resolve) => {
			// check if an authCode has already been provided
			if (!this.config.authCode) {
				this.log.warn('AuthCode has not been configured yet. Please update your config.')
				return resolve(false)
			} else {
				// if authToken has been provided, load the accessToken from the internal config
				this.loadToken().then( async accessToken => {
					if (!accessToken) {
						this.log.info('Homebridge did not register itself at laundrify API yet. Going to register now..')

						const registrationSuccessful = await this.register()

						if ( !registrationSuccessful ) {
							return resolve(false)
						}

					} else {
						this.log.info('AccessToken has been loaded from disk: ' + accessToken)
						this.accessToken = accessToken
					}

					// set Authorization header to use the accessToken for all requests
					axios.defaults.headers.common['Authorization'] = 'Bearer hb|' + this.accessToken

					return resolve(true)
				})
			}
		})
	}

	getConfigFilePath() {
		return this.api.user.storagePath() + LAUNDRIFY_CONFIG_FILE
	}

	async loadToken() {
		try {
			const laundrifyConfig = await fs.readJson( this.getConfigFilePath() )

			this.log.debug('Read config from disk: ' + JSON.stringify(laundrifyConfig))

			if (laundrifyConfig.accessToken) {
				return laundrifyConfig.accessToken
			}
		} catch(err) {
			if (err.code === 'ENOENT') {
				// file not found
				return ''
			}
			this.log.error(`Error while reading ${this.getConfigFilePath()}: `, err)
		}
	}

	async persistToken() {
		try {
			const laundrifyConfig = {
				updatedAt: (new Date()).toISOString(),
				accessToken: this.accessToken,
			}

			fs.writeJson(this.getConfigFilePath(), laundrifyConfig, { spaces: '\t' })
			this.log.info(`Token has been written to ${this.getConfigFilePath()}`)
		} catch(err) {
			this.log.error(`Error while writing ${this.getConfigFilePath()}: `, err)
		}
	}

	async register() {
		try {
			const res = await axios.post(`/auth/homebridge/token`, {authCode: this.config.authCode})

			if (res.data && res.data.token) {
				this.log.info('Registration successful.')

				this.accessToken = res.data.token
				this.persistToken()

				return true
			} else {
				this.log.error(`Invalid registration response: couldn't find token property.`)
				this.log.debug( JSON.stringify(res.data) )
				return false
			}
		} catch(err) {
			if (err.response.status === 404) {
				this.log.error(`Registration failed: AuthCode ${this.config.authCode} not found. Please check your config.`)
			} else {
				this.log.error(`Registration failed: `, err)
			}
			return false
		}
	}

	async loadMachines() {
		const isInitialized = await this.isInitialized

		if (!isInitialized) {
			this.log.warn('Cannot load Machines since laundrify API is not initialized')
			return []
		}

		const res = await axios.get('/api/machines')

		return res.data
	}

	async loadMachine(_machine) {
		const res = await axios.get(`/api/machines/${_machine}`)

		return res.data
	}
}

// export const writeConfig = async (config) => {
// 	try {
// 		config.updatedAt = (new Date()).toISOString()
// 		fs.writeJson(getConfigFilePath(), config, { spaces: '\t' })
// 	} catch(err) {
// 		_log.error(`Error while writing ${getConfigFilePath()}: `, err)
// 	}
// }