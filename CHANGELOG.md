# Changelog

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