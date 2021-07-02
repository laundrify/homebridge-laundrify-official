
<p align="center">

<img src="https://github.com/homebridge/branding/raw/master/logos/homebridge-wordmark-logo-vertical.png" width="150">

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
- Build and link the Plugin
  - using `npm run watch` for automatic builds
  - or `npm run build && npm link` for a manual build
- Publish Package using `npm publish` (don't forget to update the version number in `package[-lock].json`)
