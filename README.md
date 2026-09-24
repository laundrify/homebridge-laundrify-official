
<p align="center">

<img src="https://raw.githubusercontent.com/homebridge/branding/6ef3a1685e79f79a2ecdcc83824e53775ec0475d/logos/homebridge-wordmark-logo-horizontal.png" height="150">

</p>


# homebridge-laundrify-official

This plugin exposes your [laundrify](https://laundrify.de) Power Plugs to Apple HomeKit using [Homebridge](https://homebridge.io).

## Getting Started

To get started you need to 

  1) Install the Plugin
  2) Obtain an AuthCode in the laundrify-App
  3) Configure the Plugin

### 1) Installation

The Plugin can either be installed using the Homebridge UI or via CLI.

> ⚠️ Please make sure you are using the correct Plugin (`laundrify-official`) since there is another one ([homebridge-laundrify](https://github.com/ttimpe/homebridge-laundrify) authored by @ttimpe).

#### Homebridge UI

Open Homebridge UI, navigate to the `Plugins` page and search for `laundrify-official`. Click on `Install`

#### CLI

```sh
sudo npm i -g homebridge-laundrify-official
```

### 2) Obtain AuthCode

Open the laundrify App and activate the Homebridge integration. Take note of the AuthCode that will be shown after the activation.

### 3) Configure the Plugin

Add (or extend) the `platforms` property in your Homebridge configuration as shown below:

```json
{
  "bridge": {...},
  "platforms": [
    {...}, 
    {
      "platform": "laundrify",
      "authCode": "xxx-xxx",
      "invertStatus": false,
    }
  ]
}
```

Replace `xxx-xxx` with the Auth Code that has been obtained in the previous step.

By default the ContactSensor states are mapped to the laundrify states as follows:
  - `OPEN => Off`
  - `CLOSED => On`

Since HomeKit will hide closed ContactSensors from the overview, you can invert the status mapping by setting `invertStatus` to `true`. 

Don't forget to restart Homebridge after saving the configuration.

## Plugin Development

- Install dependencies using `npm i`
- Run the checks: `npm run lint`, `npm run typecheck`, `npm test` and `npm run build`
- Develop against the local mock backend:
  - `npm run mock` starts a stand-in for the laundrify API on port 4999 (see `test/mock-backend/server.ts` for its control endpoints)
  - `npm run dev` starts a Homebridge instance in debug mode with the plugin and the config in `test/hbConfig/`
  - `npm run watch` does the same and restarts on every source change
- To test against the real laundrify API, link the plugin into a regular Homebridge installation (`npm run build && npm link`) and configure an AuthCode from the laundrify App
- Publish using `npm publish` (bump the version number in `package[-lock].json` and turn the `Unreleased` section of the changelog into the release entry first)
