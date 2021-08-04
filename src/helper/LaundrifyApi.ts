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
				if (error.response && error.response.status === 401) {
					this.log.warn('AccessToken seems to be invalid, going to remove it.')
					this.accessToken = ''
					this.persistToken()

					return Promise.reject('Invalid AccessToken!')
				} else if (typeof error.toJSON === 'function') {
					return Promise.reject(error.toJSON())
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
						this.log.info('AccessToken has been loaded from disk')
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

	async sendRequest(method, url, options = {}, maxRetry = 3, retryCtr = 0) {
		try {
			const res = await axios.request({
				method,
				url,
				...options,
			})

			return res
		} catch(err) {
			if (retryCtr < maxRetry) {
				const waitTime = (2**retryCtr) * 200		// equals to 200, 400, 800ms

				await new Promise( resolve => setTimeout(resolve, waitTime) )

				return this.sendRequest(method, url, options, maxRetry, ++retryCtr)
			} else {
				throw err
			}
		}
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
		const authCode = this.config.authCode

		if ( /\d{3}-\d{3}/.test(authCode) === false ) {
			this.log.error(`The configured authCode ${authCode} doesn't match the expected pattern! (xxx-xxx)`)
			return false
		}

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
		const res = await this.sendRequest('GET', `/api/machines/${_machine}`, {
			timeout: 5000,
		})

		return res.data
	}
}
