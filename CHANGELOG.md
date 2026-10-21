## 1.2.0

- New page: one network at a time with tabs Overview, Schedule, Shared settings and Ports – calmer than the card wall. / Neue Seite: ein Verbund auf einmal mit den Reitern Übersicht, Zeitplan, Gemeinsame Einstellungen und Ports – ruhiger als die Kartenwand.
- Start order chosen in the editor (up/down) – for clusters the main server first. / Startreihenfolge im Editor wählbar (hoch/runter) – bei Clustern der Hauptserver zuerst.
- Scheduled daily backup of every server and “Back up all”. / Geplante tägliche Sicherung aller Server und „Alle sichern“.
- Shared server password and player slots for every game server (Steam and LinuxGSM; Minecraft gets the slots). / Gemeinsames Server-Passwort und gemeinsame Spielerplätze für alle Spiele-Server (Steam und LinuxGSM; Minecraft bekommt die Plätze).
- Ports of the network with conflicts against every other server on this PC; router forwarding for the whole network in one go (owner game-network). / Ports des Verbunds mit Konflikten gegen alle anderen Server auf diesem PC; Router-Freigaben für den ganzen Verbund auf einmal (Besitzer game-network).
- Players per server through the server query and in total. / Spieler je Server über die Server-Abfrage und gesamt.
- Minecraft networks with a proxy, Bedrock and version bridges moved to the extension “Minecraft server network”; the Geyser hint is gone (Geyser belongs on the proxy – that extension does it right). / Minecraft-Netzwerke mit Proxy, Bedrock und Versions-Brücken sind in die Erweiterung „Minecraft-Servernetzwerk“ gezogen; der Geyser-Hinweis entfällt (Geyser gehört auf den Proxy – das macht die Erweiterung richtig).

## 1.1.0

- Start waits until each server is ready (Minecraft “Done”, game servers answer the query) instead of a fixed pause. / Starten wartet, bis jeder Server bereit ist (Minecraft „Done“, Spiele-Server antworten auf die Abfrage), statt einer festen Pause.
- If a backend fails, the proxy is not started – the page asks whether to start it anyway. / Fällt ein Server dahinter aus, startet der Proxy nicht – die Seite fragt, ob trotzdem.
- Scheduled daily restart with an announcement in the chat. / Geplanter täglicher Neustart mit Ansage im Chat.
- Geyser hint: once on the proxy instead of on every backend. / Geyser-Hinweis: einmal am Proxy statt auf jedem Server.
- Dashboard tile with all players; network info on each Minecraft server page (`mc.connect`). / Kachel mit allen Spielern; Verbund-Angabe auf jeder Minecraft-Serverseite (`mc.connect`).
- Error state with “Try again”, design scale instead of fixed pixels, sidebar next to Minecraft (`page.nav`), other extensions may add tabs. / Fehlerzustand mit „Erneut versuchen“, Design-Skala statt fester Pixel, Seitenleiste neben Minecraft (`page.nav`), andere Erweiterungen dürfen Reiter ergänzen.
- Release package contains everything except the repository tooling. / Release-Paket enthält alles außer dem Repo-Werkzeug.

## 1.0.0

- First release as its own extension (before: built into Hostwerk). Data stays where it was. / Erste Fassung als eigene Erweiterung (vorher fest in Hostwerk). Daten bleiben, wo sie waren.
