![Game server network](banner.svg)

# Game server network

Game and Minecraft servers as one network: start and stop them together – in the right order – and see at a glance what runs and who plays.

[Deutsch](README.de.md) · An official [Hostwerk](https://github.com/Passimoritz/hostwerk-public) extension (SDK 2.7, native extension)

![Screenshot](docs/screenshot.png)

## What it does

- Groups of game servers and Minecraft servers
- Start: every backend first, the proxy (Velocity) last, with a pause in between
- Stop: the proxy first, so nobody lands on a server that is going down
- Velocity networks from Hostwerk’s Minecraft area are found and taken over with one click
- Players and state of the whole network on one card, right-click menus

## Install

In Hostwerk: **Extensions → Discover** and click “Install”. Needs `game-servers` – Hostwerk installs it too. If you already used this feature in Hostwerk 2.8, the update installs the extension by itself – with all your data.

Native extensions run as part of Hostwerk (own server and interface part). That is why Hostwerk only installs them from the official catalogue (with checksum) or in developer mode.

## Data

`settings.gameNetwork` – exactly where Hostwerk always kept it. Removing the extension deletes nothing.

## Develop

```bash
node --test tests/*.test.js          # tests
node build-native.js .               # build the interface (sdk/build-native.js from hostwerk-public)
node check.js . --strict             # same check as the catalogue (sdk/check.js)
```

Interface source in `ui/src`, server part in `server/`. Texts in the code are English, German is in `locales/de.json`.

## License

MIT
