![Spiele-Server-Verbund](banner.svg)

# Spiele-Server-Verbund

Spiele- und Minecraft-Server als Verbund: gemeinsam starten und stoppen – in der richtigen Reihenfolge – und auf einen Blick sehen, was läuft und wer spielt.

[English](README.md) · Offizielle [Hostwerk](https://github.com/Passimoritz/hostwerk-public)-Erweiterung (SDK 2.7, native Erweiterung)

![Bildschirmfoto](docs/screenshot.de.png)

## Was sie kann

- Gruppen aus Spiele-Servern und Minecraft-Servern
- Starten: erst alle Server, zuletzt der Proxy (Velocity) – Hostwerk wartet jeweils, bis ein Server **wirklich bereit** ist (Minecraft: „Done“, Spiele-Server: Antwort auf die Server-Abfrage), eine Pause kommt auf Wunsch obendrauf
- Fällt ein Server aus, bleibt der Proxy aus – mit Rückfrage „Trotzdem starten“
- **Geplanter Neustart** jeden Tag zu einer Uhrzeit, mit Ansage im Chat ein paar Minuten vorher
- **Geyser-Hinweis:** Läuft Geyser auf den Servern, aber nicht am Proxy, schlägt die Seite den Proxy vor
- **Kachel** mit allen Spielern in allen Verbünden für die Übersicht
- Auf der Seite jedes Minecraft-Servers (auch des Proxys) steht, zu welchem Verbund er gehört
- Stoppen: zuerst der Proxy, damit niemand auf einem Server landet, der gerade herunterfährt
- Velocity-Netzwerke aus Hostwerks Minecraft-Bereich werden erkannt und mit einem Klick übernommen
- Spieler und Zustand des ganzen Verbunds auf einer Karte, Rechtsklick-Menüs
- Andere Erweiterungen dürfen Reiter ergänzen (`allowExtensions`)

## Installieren

In Hostwerk unter **Erweiterungen → Entdecken** auf „Installieren“ klicken. Braucht `game-servers` – Hostwerk installiert das mit. Wer die Funktion schon in Hostwerk 2.8 benutzt hat, bekommt die Erweiterung beim Update automatisch – mit allen Daten.

Native Erweiterungen laufen als Teil von Hostwerk (eigener Server- und Oberflächen-Teil). Darum installiert Hostwerk sie nur aus dem offiziellen Katalog (mit Prüfsumme) oder im Entwickler-Modus.

## Daten

`settings.gameNetwork` – genau dort, wo Hostwerk sie schon immer abgelegt hat. Entfernen der Erweiterung löscht nichts.

## Entwickeln

```bash
node --test tests/*.test.js          # Tests
node build-native.js .               # Oberfläche bauen (sdk/build-native.js aus hostwerk-public)
node check.js . --strict             # Prüfung wie im Katalog (sdk/check.js)
```

Quelltext der Oberfläche in `ui/src`, Server-Teil in `server/`. Texte im Code sind Englisch, Deutsch steht in `locales/de.json`.

## Lizenz

MIT
