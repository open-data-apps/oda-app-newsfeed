# Presse-Feed

Die App **Presse-Feed** visualisiert einen oeffentlichen Nachrichtenstrom fuer
Social Media, amtliche Veroeffentlichungen und klassische Presseverteiler in
einer gemeinsamen ODAS-App.

Die App ist fuer den Einsatz im
[Open Data App Store](https://open-data-app-store.de/) vorgesehen und orientiert
sich an der
[Open Data App Spezifikation](https://open-data-apps.github.io/open-data-app-docs/open-data-app-spezifikation/).

## Funktionen

Die App ist eine Single Page Application mit:

- Lagebild fuer aktuelle Meldungen
- Kennzahlen zu sichtbaren Meldungen und aktiven Stellen
- Chronologischem Feed mit Kartenansicht
- Filtern nach `Kanal`, `Tag`, `Amt/Stelle` und `Zeitraum`
- Hervorgehobenen amtlichen Veroeffentlichungen
- Detailansicht pro Meldung mit Volltext und optionaler Quelle

## Datenformat

Die App erwartet eine JSON-Datenquelle mit normalisierten Feldern fuer:

- `datum`
- `uhrzeit`
- `kanal`
- `tags` oder `schlagworte`
- `amt` oder `stelle`
- `kurztext`
- `text`
- `url`

Unterstuetzte Antwortformen:

- Direktes Array von Feed-Eintraegen
- Objekt mit `records`
- CKAN-Datastore-Antwort mit `result.records`
- Objekt mit `items`, `data`, `results`, `entries` oder `meldungen`

Standardmaessig ist die App bereits mit dem hochgeladenen CKAN-Beispieldatensatz vorbelegt:

- JSON-Download:
  `https://open-data-musterstadt.ckan.de/dataset/3ad34553-4b71-47c4-833c-5d75f2b2aced/resource/93a14563-e19c-4336-888b-8c788a977afe/download/beispiel-datensatz-presse-feed.json`
- Ressourcenseite:
  `https://open-data-musterstadt.ckan.de/dataset/3ad34553-4b71-47c4-833c-5d75f2b2aced/resource/93a14563-e19c-4336-888b-8c788a977afe`

Wenn die Quelle direkt im Browser nicht ladbar ist, kann sie ueber den ODAS-Proxy bezogen werden.

## Kompatible Kanaele

Die App erkennt aktuell besonders:

- `Amtliche Veroeffentlichungen`
- `Presseverteiler`
- `Social Media`

Andere Kanalbezeichnungen werden uebernommen und ebenfalls angezeigt.

## Konfiguration

Folgende Instanz-Parameter sind fuer die App relevant:

| Parameter | Beschreibung | Pflicht |
| --- | --- | --- |
| `titel` | Titel der App im Header | ja |
| `seitentitel` | Titel im Browser-Tab | ja |
| `icon` | Logo im Header | ja |
| `apiurl` | JSON-Endpunkt fuer die Feed-Daten | ja |
| `proxyAktiv` | `ja`/`nein` fuer ODAS-Proxy statt Direktabruf | ja |
| `urlDaten` | Optionaler Link zur Datensatzseite oder Quelle | nein |
| `kontakt` | Kontaktseite | ja |
| `beschreibung` | Beschreibungsseite | ja |
| `impressum` | Impressumsseite | ja |
| `datenschutz` | Datenschutzseite | ja |
| `fusszeile` | Text in der Fusszeile | ja |
| `brandingCSS` | Optionales Inline-Branding | nein |
| `brandingCSSFile` | Optionaler Pfad zu Branding-CSS | nein |

## Lokale Entwicklung

### Mit Docker

```bash
make build up
```

Danach ist die App unter `http://localhost:8089` erreichbar.

### Mit VS Code Live Server

Empfohlen fuer die schnelle Frontend-Iteration:

1. Live Server aus der Projektwurzel starten
2. `http://127.0.0.1:<port>/app/` oeffnen
3. Die lokale Konfiguration zeigt standardmaessig auf den CKAN-Beispieldatensatz
4. Wenn der direkte Browser-Abruf an CORS scheitert, `proxyAktiv` fuer den Testpfad aktiv lassen

Empfohlene Live-Server-Einstellungen:

```json
{
  "liveServer.settings.host": "127.0.0.1",
  "liveServer.settings.root": "/",
  "liveServer.settings.file": "app/index.html"
}
```

## Wichtige Dateien

| Datei | Beschreibung |
| --- | --- |
| `app/app.js` | Feed-Logik, Datenaufbereitung, Filterung und Rendering |
| `app/app.css` | App-spezifisches Layout und Feed-Styling |
| `app-package.json` | ODAS-Metadaten und Instanz-Konfiguration |
| `assets/schema.json` | Erwartetes Datenschema fuer Feed-Eintraege |
| `odas-config/config.json` | Lokale Vorschau-Konfiguration |
| `assets/odas-app-icon.svg` | App-Icon fuer die Auslieferung |

## Tests

Die Feed-Helfer werden ueber Node-Tests abgesichert:

```bash
node --test tests/app.test.js
```

## Autor

© 2026, Ondics GmbH
