# homebridge-laundrify-official

Homebridge dynamic-platform plugin that exposes laundrify power plugs as HomeKit contact sensors.
TypeScript in `src/`, compiled to CommonJS in `dist/`. The platform polls `GET /api/machines` once per
interval and pushes state to HomeKit; reads never hit the backend.

## Commands

- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`: all four run in CI and in `prepublishOnly`.
- `npm run mock`: local stand-in for the laundrify API on port 4999 (`test/mock-backend/server.ts` documents its
  control endpoints for switching failure modes and machine lists at runtime).
- `npm run dev`: foreground Homebridge in debug mode with the plugin, using `test/hbConfig/` and the mock.
  `npm run watch` does the same and restarts on every source change. Neither needs admin rights or `npm link`.
- Testing against the real API means running the plugin inside a regular Homebridge installation with an
  AuthCode from the laundrify app. The platform accepts an undocumented `baseUrl` option for other backends.

## Conventions

- Tabs, single quotes, no semicolons, max line length 140 (`eslint.config.mjs`), `--max-warnings=0`.
- Commit prefixes: `feat:`, `fix:`, `refactor:`, `chore:`, `test:`, `ci:`.
- `CHANGELOG.md`: add lines under `## Unreleased`. The maintainer bumps the version and turns that section into
  the release entry as the very last step before `npm publish`. Pull requests must not bump the version.
- Only `dist/`, `config.schema.json` and `CHANGELOG.md` are published (`files` in `package.json`).
- Tests live in `test/`, run with vitest and are type-checked via `tsconfig.test.json`. `test/helpers.ts` holds the
  Homebridge fakes: Homebridge exports `PlatformAccessory` and `API` as types only, so the fake accessory is a real
  HAP `Accessory` plus a `context` bag, and the platform takes an injectable `LaundrifyApi` for the same reason.

## Gotchas

- `npm run dev` passes `-P ..` because the repo-local Homebridge only scans its own `node_modules` chain and
  `%APPDATA%\npm\node_modules`. Other global trees (nvm and the like) are never searched.
- The backend answers `GET /api/machines` with a superset of `GET /api/machines/:id`; the list is the only
  endpoint the plugin needs.
- Windows: `hb-service install` writes the NSSM `AppParameters` unquoted, so a Node path containing a space
  (nvm-windows 2.x installs under `Author Software`) makes the service crash-loop until the registry value is
  quoted by hand. Upstream: homebridge-config-ui-x issue 3036.
