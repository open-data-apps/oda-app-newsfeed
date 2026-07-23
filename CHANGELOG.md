# Changelog

## 1.4.0 - 2026-07-23

- **ENH:** Datenabruf auf den Schalter `proxyAktiv` umgestellt; direkte Abrufe sind der Standard, der ODAS-Proxy wird nur noch bei `ja` verwendet
- **ENH:** Einfachen Standalone-Betrieb hinter Traefik mit derselben `odas-config/config.json` wie in der Entwicklung ergänzt
- **ENH:** Traefik-Anbindung auf das externe Netzwerk `proxynet`, den EntryPoint `websecure` und den Zertifikatsresolver `letsencrypt` festgelegt
- **FIX:** Proxy-Basispfad funktioniert jetzt auch bei URLs mit `index.html`; der Ziel-Pfad wird URL-kodiert
- **FIX:** Proxy-Basispfad brach bei URLs mit index.html; jetzt kanonische Ableitung
- **FIX:** Lokale `odas-config/config.json` auf `proxyAktiv: nein` gestellt; der frühere localhost-Sonderfall erzwang lokal ohnehin den Direktabruf, die Quelle ist CORS-freigegeben
- **DOC:** Start über `STANDALONE=true make up` dokumentiert

## 16.06.2026 (Version 1.3.0)

- ENH: Methodikbox (ausklappbar) mit Datenquelle-Hinweis und Datenstand ergaenzt (`datenquelleHinweis`, `datenStand`).
- ENH: KPI-Erklaerungstexte unter den Kennzahlen ergaenzt (`kpiKontext1`–`kpiKontext4`).

## 16.06.2026 (Version 1.2.0)

- ENH: Schale-4-Verstaendlichkeit ergaenzt – „Fuer wen ist diese App?"-Block in Beschreibung und README.
- ENH: Konfigurierbarer Abschnitt „Weitere Informationen" mit weiterfuehrenden Links (neues Feld `weiterfuehrendeLinks`, leer = ausgeblendet).
- ENH: Automatisches Datenfrische-Label, das Datum und Uhrzeit der neuesten Meldung anzeigt.

## 26.05.2026

- FEAT: Presse-Feed mit Lagebild, Filterleiste und chronologischem Nachrichtenstrom umgesetzt
- FEAT: Demo-Daten und Hilfslogik fuer normalisierte Feed-Quellen sowie CKAN-Datastore-Antworten ergänzt
- FEAT: App-Metadaten, README und Datenschema auf den News-Feed-Anwendungsfall umgestellt
- FEAT: CKAN-Beispieldatensatz als Default-apiurl und ODAS-Proxy-Schalter fuer CORS-kritische Quellen ergänzt

## ToDo

- Config über Nginx laden

## 21.02.2025

- ENH: app-package mit Multiline Strings
- ENH: Feldtypen von HTML auf Markdown umgestellt

## 17.02.2025

- FIX: Loadpage Funktion optimiert

## 12.2.2025 (Version 1.0.0)

- ENH: Anzeige config.json
- ENH: Config-File mit Multiline-String (als Array)
- FIX: Code-Teilung in app-base und app
- FIX: Docker korrigiert, läuft wieder
