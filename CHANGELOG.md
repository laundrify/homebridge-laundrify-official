# Changelog

## v1.5.0 (2026-02-27)

 - chore: add Node 22 to supported engines
 - chore: upgrade homebridge devDependency to v2.0.0-beta.75 (Node 22 compatible)
 - chore: upgrade eslint to v9.39.3 and @typescript-eslint packages to v8.56.1
 - chore: update tsconfig target to ES2022, add skipLibCheck and useDefineForClassFields
 - fix: resolve npm audit vulnerabilities (10 vulnerabilities across axios, form-data, minimatch and others)

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