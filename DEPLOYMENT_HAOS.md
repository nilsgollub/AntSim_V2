# Deployment auf Home Assistant (HAOS) & Raspberry Pi Kiosk

> **WICHTIG: Neue Kiosk-Architektur (Entkoppelt von HA)**
> Der Raspberry-Pi-Kiosk (Formica-OS) ist mittlerweile **komplett von Home Assistant entkoppelt**. Ein Absturz oder Neustart von HA fuehrt nicht mehr dazu, dass der Kiosk-Bildschirm schwarz wird.
> 
> **Wie der Kiosk jetzt funktioniert:**
> 1. **Lokales Serving:** Auf dem Raspberry Pi ist das AntSim_V2 Repo unter /home/nilsgollub/AntSim_V2 geklont. Ein lokaler Nginx liefert den Ordner dist/ direkt aus. Home Assistant fungiert *nicht* mehr als Proxy.
> 2. **Auto-Pull (Kein Build auf Pi):** Das gebaute dist/ Verzeichnis ist ins Git-Repo eingecheckt. Beim Booten fuehrt ein Autostart-Skript (~/.config/autostart/formica-kiosk.desktop) automatisch einen git pull aus. Der Pi aktualisiert sich somit bei jedem Neustart selbst, ohne Node.js oder Build-Tools zu benoetigen.
> 3. **Neuer Deployment Workflow:** npm run build -> Committen (inkl. dist/) -> Pushen. Der Pi zieht das Update beim naechsten Neustart automatisch.

---

AntSim V2 ist eine reine Client-Side-Anwendung (Single Page Application). Das bedeutet, dass die gesamte Rechenlast (Simulation, Rendering) im Browser des Nutzers stattfindet. Der Server (dein Home Assistant) dient lediglich als Dateispeicher und muss keine Berechnungen durchführen. Die Ressourcenbelastung für deinen Home Assistant ist daher **minimal**.

## Voraussetzungen

*   Ein laufendes Home Assistant OS (HAOS) System.
*   Zugriff auf das Dateisystem von Home Assistant (z.B. über das "Samba Share" Add-on oder "File Editor").
*   Die fertig gebaute AntSim Anwendung (siehe Schritt 1).

## Schritt-für-Schritt Anleitung

### 1. Anwendung bauen (Build)

Führe auf deinem Entwicklungsrechner im Projektverzeichnis folgenden Befehl aus, um die optimierten Produktionsdateien zu erstellen:

```bash
npm run build
```

Dies erstellt einen Ordner namens `dist/` in deinem Projektverzeichnis. Dieser Ordner enthält alles, was du brauchst (HTML, JavaScript, CSS).

### 2. Dateien auf Home Assistant übertragen

Home Assistant besitzt einen speziellen Ordner für statische Webseiteninhalte, den `www`-Ordner.

1.  Verbinde dich mit deinem Home Assistant (z.B. über Samba).
2.  Navigiere in den Ordner `config`.
3.  Prüfe, ob dort ein Ordner namens `www` existiert. Falls nicht, erstelle ihn.
4.  Erstelle innerhalb von `www` einen neuen Ordner für die Simulation, z.B. `antsim`.
    *   Pfad: `config/www/antsim/`
5.  Kopiere den **gesamten Inhalt** deines lokalen `dist/`-Ordners in diesen neuen `antsim`-Ordner auf dem Home Assistant.

### 3. Zugriff testen

Nach dem Kopieren ist die Simulation sofort im Netzwerk verfügbar. Home Assistant stellt Inhalte aus dem `www`-Ordner unter dem Pfad `/local/` bereit.

Öffne deinen Browser und gib folgende URL ein:

```
http://192.168.1.155:8123/local/antsim/index.html
```

*(Ersetze `<DEINE-HA-IP>` mit der IP-Adresse deines Home Assistant, z.B. 192.168.178.50)*

### 4. (Optional) Einbindung in das Dashboard

Du kannst die Simulation auch direkt als Kachel in dein Lovelace-Dashboard einbinden:

1.  Gehe auf dein Dashboard -> "Dashboard bearbeiten".
2.  Klicke auf "Karte hinzufügen".
3.  Wähle die Karte **"Webseite" (Iframe)**.
4.  Gib bei URL den Pfad ein: `/local/antsim/index.html`
5.  Stelle das Seitenverhältnis passend ein (z.B. 100%).

## Hinweise zur Performance

*   **Server (HAOS):** Die Belastung ist vernachlässigbar. Es werden nur wenige Kilobyte an Daten übertragen.
*   **Client (Browser):** Die Simulation benötigt Rechenleistung. Auf älteren Tablets oder Handys kann es sinnvoll sein, die Qualitätseinstellung in der Simulation auf "Mittel" oder "Niedrig" zu stellen.
