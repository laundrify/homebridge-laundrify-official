import {
	API,
	Logger,
	PlatformConfig,
} from 'homebridge'

import fs from 'fs-extra'
import axios, { AxiosInstance } from 'axios'

import { LAUNDRIFY_CONFIG_FILE, LAUNDRIFY_BASEURL } from '../settings'

// eslint-disable-next-line @typescript-eslint/no-require-imports -- package.json lives outside rootDir, so it can't be imported
const {version: pluginVersion} = require('../../package.json')

const MAX_RETRIES = 3

interface LaundrifyConfig {
	pluginVersion: string
	updatedAt: string
	authCode: string
	accessToken: string
}

export default class LaundrifyApi {

	public readonly isInitialized: Promise<boolean>
	private http: AxiosInstance
	private pluginConfig: LaundrifyConfig = {
		pluginVersion: '',
		updatedAt: '',
		authCode: '',
		accessToken: '',
	}

	constructor(
		private readonly log: Logger,
		private readonly config: PlatformConfig,
		private readonly api: API,
	) {
		// dedicated instance, so baseURL and Authorization header don't leak into other plugins sharing this process
		this.http = axios.create({
			baseURL: this.config.baseUrl || LAUNDRIFY_BASEURL,
			timeout: 5000,
		})

		// handle 401 responses to reset the accessToken
		this.http.interceptors.response.use(
			(response) => response,
			async (error) => {
				// Any status codes that falls outside the range of 2xx cause this function to trigger
				if (error.response && error.response.status === 401 && this.pluginConfig.accessToken) {
					this.log.warn('AccessToken seems to be invalid, going to remove it.')

					this.pluginConfig.accessToken = ''
					await this.writePluginConfig()
				}

				if (typeof error.toJSON === 'function') {
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
				this.readPluginConfig().then( async () => {

					// check if the plugin has been updated
					if (this.pluginConfig.pluginVersion !== pluginVersion) {
						this.log.debug(`The configured pluginVersion (${this.pluginConfig.pluginVersion}) ` +
							`doesn't match the current version (${pluginVersion})`)

						if (this.pluginConfig.pluginVersion === '') {
							this.log.debug(`The configured pluginVersion is an empty string, it's most likely a new installation`)
						}

						this.pluginConfig.pluginVersion = pluginVersion
						await this.writePluginConfig()
					}

					if (this.pluginConfig.authCode !== this.config.authCode) {
						this.log.info('The configured AuthCode changed, going to update the plugin config..')

						this.pluginConfig.authCode = this.config.authCode
						this.pluginConfig.accessToken = ''

						await this.writePluginConfig()
					}

					if (!this.pluginConfig.accessToken) {
						this.log.info('Homebridge did not register itself at laundrify API yet. Going to register now..')

						const registrationSuccessful = await this.register()

						if ( !registrationSuccessful ) {
							return resolve(false)
						}
					}

					// set Authorization header to use the accessToken for all requests
					this.http.defaults.headers.common['Authorization'] = 'Bearer hb|' + this.pluginConfig.accessToken

					return resolve(true)
				})
			}
		})
	}

	getConfigFilePath() {
		return this.api.user.storagePath() + LAUNDRIFY_CONFIG_FILE
	}

	async sendRequest(method, url, retryCtr = 0) {
		if (!(await this.isInitialized)) {
			throw new Error('laundrify API is not initialized')
		}

		try {
			const res = await this.http.request({ method, url })

			if (retryCtr > 0) {
				this.log.debug(`${method.toUpperCase()} ${url} succeeded at retry #${retryCtr}`)
			}

			return res
		} catch(err: any) {
			if (retryCtr < MAX_RETRIES && err.status !== 401) {
				const waitTime = (2**retryCtr) * 200		// equals to 200, 400, 800ms

				this.log.debug(`${method.toUpperCase()} ${url} failed (${err.message}), retrying in ${waitTime}ms`)

				await new Promise( resolve => setTimeout(resolve, waitTime) )

				return this.sendRequest(method, url, ++retryCtr)
			} else {
				throw err
			}
		}
	}

	async readPluginConfig() {
		try {
			const laundrifyConfig = await fs.readJson( this.getConfigFilePath() )

			const maskedConfig = { ...laundrifyConfig, accessToken: laundrifyConfig.accessToken ? '***' : '' }
			this.log.debug('Read config from disk: ' + JSON.stringify(maskedConfig))

			this.pluginConfig = laundrifyConfig

			return true
		} catch(err: any) {
			if (err.code === 'ENOENT') {
				this.log.debug(`Config file (${this.getConfigFilePath()}) doesn't exist - will be created on plugin init.`)
				return false
			}
			this.log.error(`Error while reading ${this.getConfigFilePath()}: `, err)
			return false
		}
	}

	async writePluginConfig() {
		try {
			const laundrifyConfig = {
				updatedAt: (new Date()).toISOString(),
				pluginVersion: this.pluginConfig.pluginVersion,
				authCode: this.pluginConfig.authCode,
				accessToken: this.pluginConfig.accessToken,
			}

			await fs.writeJson(this.getConfigFilePath(), laundrifyConfig, { spaces: '\t' })
			this.log.debug(`Config has been written to ${this.getConfigFilePath()}`)
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
			const res = await this.http.post(`/auth/homebridge/token`, {authCode: this.config.authCode})

			if (res.data && res.data.token) {
				this.log.info('Registration successful.')

				this.pluginConfig.accessToken = res.data.token
				await this.writePluginConfig()

				return true
			} else {
				this.log.error(`Invalid registration response: couldn't find token property.`)
				this.log.debug( JSON.stringify(res.data) )
				return false
			}
		} catch(err: any) {
			if (err.status === 404) {
				this.log.error(`Registration failed: AuthCode ${this.config.authCode} not found. Please check your config.`)
			} else {
				this.log.error(`Registration failed: `, err)
			}
			return false
		}
	}

	async loadMachines() {
		const res = await this.sendRequest('GET', '/api/machines')

		return res.data
	}
}
