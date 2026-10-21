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
