# Changelog

## v1.5.0 (2026-09-24)

 - chore: drop Node 18 and 20 (both EOL), add Node 22, 24 and 26 to supported engines
 - chore: bump homebridge devDependency to v2.4.0 for Homebridge v2 type-checking
 - chore: update engines.homebridge to `^1.6.0 || ^2.0.0` (drop `-beta.0`)
 - chore: bump axios to ^1.18.1 to resolve npm audit vulnerabilities (SSRF, DoS, prototype pollution)
 - chore: bump eslint to ^9.39.0 and @typescript-eslint packages to ^8.62.1
 - chore: update tsconfig target to ES2022, add skipLibCheck and useDefineForClassFields
 - thanks to @konradlang for the groundwork in #7

## v1.3.0 (2022-01-13)

 - fix: reauthenticate if AuthCode is changed
 - feat: persist last pluginVersion to the internal config to detect updates
 - fix: use chip ID as serial number
 - chore: update dependencies

## v1.2.0 (2021-08-04)

 - feat: resend request if it failed (max 3 times with exponential backoff)

## v1.1.1 (2021-07-02)

 - fix: add timeout of 2.5s when polling and log error as JSON
 - fix: use `.on('get', fn)` if `.onGet()` is not available (to support Homebridge v1.2.5)

## v1.1.0 (2021-06-23)

 - feat: add configuration to invert status mapping (#1)
 - chore: remove accessToken from log message

## v1.0.0 (2021-06-18)

Initial release