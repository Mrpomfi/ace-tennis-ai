# ACE Tennis AI – Local Edition 1.0

## Datenschutz- und Funktionsprinzip
Die App verwendet keinen Cloud-Speicher und keinen externen Datenbankdienst für persönliche Inhalte. Spielerprofil, Matchjournal, Trainingshistorie und Video-Dateien werden lokal in IndexedDB auf dem Gerät gespeichert. Die Vorhand-Pose-Erkennung läuft im Browser auf dem Gerät. MediaPipe kann laut Paket-Datenschutzhinweis Nutzungs-/Leistungsmetriken an Google übermitteln; Video- und Bildinhalte werden dabei nicht an Google gesendet. Die App-Oberfläche und Analyse-Dateien werden nach dem ersten Laden über den Service Worker lokal zwischengespeichert.

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

## Version 1.2 – lokal eingebundene Vorhandanalyse

- MediaPipe-JavaScript, WebAssembly-Dateien und das Pose-Modell liegen im Projekt unter `vendor/mediapipe/` und werden nicht mehr zur Laufzeit von einem externen CDN geladen.
- Die Dateien werden beim ersten Analyseversuch von derselben App-Adresse geladen und anschließend durch den Service Worker zwischengespeichert.
- Die gespeicherten Videos werden nicht hochgeladen; die Bildverarbeitung erfolgt lokal im Browser.
- Die App erkennt Körperpunkte und berechnet grobe Ellenbogen-/Kniewinkel. Sie erkennt noch nicht zuverlässig Schläger, Ball, Treffpunkt oder 3D-Rotation und vergibt deshalb keine Techniknote.

**Datenschutzhinweis:** Die MediaPipe-Paketinformation weist auf mögliche Nutzungs-/Leistungsmetriken hin. Die persönlichen Videos und daraus analysierten Bildinhalte werden laut MediaPipe lokal verarbeitet und nicht an Google übertragen. Eine vollständig netzwerkfreie Nutzung einschließlich aller Bibliotheksmetriken ist damit nicht zugesichert.

Für die beste Erkennung: ganzer Körper im Bild, gute Beleuchtung, Kamera stabil, seitliche und frontale Perspektive jeweils als separates Video aufnehmen.
