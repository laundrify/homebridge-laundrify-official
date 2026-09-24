/* eslint-disable no-console */
import { createMockBackend } from './server'

// `npm run mock`: the port matches the baseUrl in test/hbConfig/config.json
createMockBackend({ port: 4999, log: (line) => console.log(new Date().toISOString().slice(11, 19), line) })
	.listen()
	.then((mock) => console.log(`mock laundrify backend listening on ${mock.url} (authCode ${mock.authCode})`))
