// Minimal stand-in for the laundrify backend, reduced to what the plugin uses.
// Used in-process by the test suite and as a CLI by `npm run mock` / `npm run dev` (see cli.ts).
//
// Endpoints (same contract as api.laundrify.de):
//   POST /auth/homebridge/token   { authCode } -> { token }, 404 for unknown codes
//   GET  /api/machines            requires "Authorization: Bearer hb|<token>", 401 otherwise
// Control endpoints (to change the behaviour while `npm run dev` is running):
//   POST /_mock/mode/<ok|fail|timeout|unauth>
//   PUT  /_mock/machines          JSON array replacing the machine list
import http from 'http'
import { AddressInfo } from 'net'

export type MockMode = 'ok' | 'fail' | 'timeout' | 'unauth'

export interface MockMachine {
	_id: string
	name: string
	status: string
	model: string
	chipID: string
	firmwareVersion: string
	isOnline: boolean
	totalEnergy: number
}

export interface MockRequest {
	method?: string
	url?: string
	authorization?: string
}

export interface MockBackend {
	url: string
	authCode: string
	token: string
	mode: MockMode			// ok | fail (HTTP 500) | timeout (never answers) | unauth (HTTP 401)
	machines: MockMachine[]
	requests: MockRequest[]	// every request received
	listen(): Promise<MockBackend>
	close(): Promise<void>
}

interface MockOptions {
	port?: number			// 0 (default) lets the OS pick a free port, so test files can run in parallel
	log?: (line: string) => void
}

export function createMockBackend({ port = 0, log = () => {} }: MockOptions = {}): MockBackend {
	const mock: MockBackend = {
		url: '',
		authCode: '123-456',
		token: 'mock-token',
		mode: 'ok',
		machines: [
			{
				_id: 'aaaa0001', name: 'Mock Waschmaschine', status: 'OFF', model: 'M01',
				chipID: 'MOCKCHIP01', firmwareVersion: '1.5.0', isOnline: true, totalEnergy: 1234.5,
			},
			{
				_id: 'bbbb0002', name: 'Mock Trockner', status: 'ON', model: 'SU02',
				chipID: 'MOCKCHIP02', firmwareVersion: '1.4.2', isOnline: true, totalEnergy: 42,
			},
		],
		requests: [],
		listen: () => new Promise((resolve, reject) => {
			server.once('error', reject)
			server.listen(port, () => {
				mock.url = `http://localhost:${(server.address() as AddressInfo).port}`
				resolve(mock)
			})
		}),
		close: () => new Promise((resolve) => {
			server.closeAllConnections()
			server.close(() => resolve())
		}),
	}

	const end = (res: http.ServerResponse, status: number) => {
		res.writeHead(status)
		res.end()
	}

	const json = (res: http.ServerResponse, data: unknown) => {
		res.writeHead(200, { 'Content-Type': 'application/json' })
		res.end(JSON.stringify(data))
	}

	const server = http.createServer((req, res) => {
		let body = ''
		req.on('data', (chunk) => body += chunk)
		req.on('end', () => {
			mock.requests.push({ method: req.method, url: req.url, authorization: req.headers.authorization })
			log(`${req.method} ${req.url} (mode=${mock.mode})`)

			if (req.method === 'POST' && req.url?.startsWith('/_mock/mode/')) {
				mock.mode = req.url.split('/').pop() as MockMode
				return end(res, 200)
			}

			if (req.method === 'PUT' && req.url === '/_mock/machines') {
				mock.machines = JSON.parse(body)
				return end(res, 200)
			}

			if (req.method === 'POST' && req.url === '/auth/homebridge/token') {
				const { authCode } = JSON.parse(body || '{}')
				return authCode === mock.authCode ? json(res, { token: mock.token }) : end(res, 404)
			}

			if (req.method === 'GET' && req.url === '/api/machines') {
				if (mock.mode === 'timeout') {
					return
				}
				if (mock.mode === 'fail') {
					return end(res, 500)
				}
				if (mock.mode === 'unauth' || req.headers.authorization !== `Bearer hb|${mock.token}`) {
					return end(res, 401)
				}
				return json(res, mock.machines)
			}

			end(res, 404)
		})
	})

	return mock
}
