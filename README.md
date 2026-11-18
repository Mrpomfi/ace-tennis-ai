# ACE Tennis AI – Local Edition 1.0

## Datenschutz- und Funktionsprinzip
Diese Version hat keine Analyse-API, keine Cloud-Verbindung, keine Analytics und keinen externen Datenbankdienst. Spielerprofil, Matchjournal und Trainingshistorie werden mit IndexedDB lokal im Browser-Speicher abgelegt. Video-Dateien werden als Blob in IndexedDB gespeichert. Der Service Worker cached die App-Oberfläche für den Offline-Start nach dem ersten Laden.

## Installation auf dem iPhone 11 Pro
1. Die Dateien auf einen statischen HTTPS-Webhost legen. Für PWA-Installation und Service Worker ist HTTPS erforderlich. Das Hosting kann mit einem kostenlosen statischen Hosting-Tarif erfolgen; der Anbieter stellt dabei nur die App-Dateien bereit.
2. Die HTTPS-Adresse in Safari öffnen.
3. Teilen → „Zum Home-Bildschirm“ → Hinzufügen.
4. Die App einmal online starten, damit alle Dateien im Cache liegen.
5. Danach kann die Oberfläche offline starten. Bereits gespeicherte Videos und Einträge bleiben in IndexedDB verfügbar, solange iOS die Websitedaten nicht entfernt.

## Wichtig: lokale Speicherung auf iOS
Eine PWA ist keine native iOS-App. Browser-Speicher ist nicht so dauerhaft garantiert wie ein verwalteter nativer Dateispeicher; iOS kann Websitedaten unter bestimmten Umständen bei Speicherknappheit entfernen. Deshalb regelmäßig über Profil → „Alle Daten exportieren“ eine Sicherungsdatei erstellen und in „Dateien“ lokal ablegen. Diese Datei wird nicht automatisch in iCloud gespeichert, sofern der Nutzer keinen iCloud-Speicherort auswählt.

## Video-Backup
Der JSON-Export enthält die Videos als Base64 und kann bei vielen/großen Videos sehr groß werden. Für große Videoarchive empfiehlt sich, Videos zusätzlich einzeln über die Videoansicht zu exportieren. Import fügt Einträge hinzu und überschreibt keine vorhandenen Daten.

## Was diese Version kann
- Lokales Spielerprofil
- Videoarchiv mit Import/Aufnahme-Auswahl, Vorschau, Notizen und Löschen
- Matchjournal mit Ergebnis, Belag, Reflexion und mentaler Bewertung
- Trainingshistorie mit Schwerpunkt, Dauer und Notizen
- Lokale Datensicherung und Wiederherstellung
- Offline-App-Shell

## Noch nicht enthalten
Es gibt noch keine automatische KI-Schlaganalyse und keine automatische Bewertung. Das Dashboard zeigt deshalb bewusst keine erfundenen Technik-Scores. Eine echte Analyse komplett offline wäre ein separates Entwicklungsprojekt: Ein geeignetes On-Device-Modell müsste auf iOS laufen, und die Erkennung von Schläger und Ball ist deutlich anspruchsvoller als reine Körperpose-Erkennung. Es wird in dieser Version kein Video übertragen.
