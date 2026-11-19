# ACE Tennis AI – unabhängiger Schläger-Modellvergleich

Dieser Versuchszweig ist bewusst von `main` getrennt. Er verändert weder die veröffentlichte App noch deren IndexedDB-Daten, Videos oder Analysen.

## Ziel

Gesucht wird ein Modell, das einen echten Tennisschläger in privaten Trainingsvideos zuverlässig erkennt – seitlich und frontal, auch bei Bewegungsunschärfe und teilweiser Verdeckung – und anschließend auf dem iPhone lokal ausführbar ist.

## Ausgangslage

- Bestehender App-Stand auf `main`: Version 2.9.28 (Stand des Branch-Abzweigs).
- Bisheriges Modell: CourtSide YOLOv11n, ONNX, Klasse `racket`.
- Die bisherigen Tests in den ACE-Aufnahmen zeigen trotz Detektions- und Hand-/Arm-Tracking weiterhin deutliche Fehlzuordnungen.
- Die vorhandene Detektionspipeline bleibt in diesem Versuchszweig unverändert; neue Modelle werden zunächst separat bewertet.

## Kandidaten und Verfügbarkeit

| Kandidat | Bekannte Fakten | Eignung für den nächsten Test |
|---|---|---|
| CourtSide YOLOv11n (Bestand) | 2,6 Mio. Parameter, 640×640; vom App-Projekt bereits eingebunden. Das veröffentlichte Modellprofil nennt ca. 44 % Recall auf einem kleinen Validierungssatz (66 Bilder). | Referenz/Baseline |
| YOLO-Net (Du et al., 2026) | Tennis-spezifisches Modell mit 2,58 Mio. Parametern; im Paper 84,5 % Precision, 73,0 % Recall und 78,2 % mAP@0.5 auf dem Autoren-Datensatz. Der öffentliche Kaggle-Eintrag enthält laut Paper Validierungsbilder und Annotationen. Ein direkt ladbarer Modell-Checkpoint bzw. offizieller Export wurde bislang nicht gefunden. | Höchste Priorität zur Beschaffung/Verifikation der Gewichte; Paper-Metriken sind nicht mit den ACE-Aufnahmen gleichzusetzen |
| YOLO-World v2 small | Open-Vocabulary-Modell; ONNX-Export ca. 48,8 MB/12,7 Mio. Parameter. Benötigt zusätzlich CLIP ViT-B/32 Text-Embeddings und NMS. Die gefundene ONNX-Variante ist AGPL-3.0 lizenziert. | Technischer Zweitkandidat, falls iPhone-Laufzeit und Lizenzbedingungen akzeptabel sind |
| OWLv2 base | Zero-shot-Detektor; veröffentlichte Modellablage ca. 1,24 GB. | Für die erste iPhone-Testsituation zu groß; vorerst nicht priorisieren |
| Grounding DINO | Open-set-Detektor mit Transformer-Backbone und separatem Text-Encoder. | Für lokale Echtzeit-/iPhone-Verarbeitung zunächst zu aufwendig; nicht erster Kandidat |

## Fairer Testablauf

1. Identische Testbilder und Videoframes für alle Modelle verwenden.
2. Mindestens folgende Fälle abdecken: Schlägerkopf klar sichtbar, Schläger seitlich/verkürzt, Schläger in Bewegung, Schläger vor dunkler/heller Kleidung, teilweise verdeckt, Schläger nicht vorhanden.
3. Pro Frame notieren: echter Schläger erkannt ja/nein, falscher Treffer ja/nein, Box überlappt den Schläger ausreichend, Konfidenz und Inferenzzeit.
4. Hauptkennzahlen: Recall (wie oft der echte Schläger gefunden wird), Precision (wie viele Treffer wirklich Schläger sind), Box-Qualität und Laufzeit auf dem iPhone.
5. Die Modellausgabe zunächst ohne Hand-/Arm-Heuristik vergleichen. Erst danach dieselbe Hand-/Arm-Zuordnung und denselben Tracker für die besten Modelle ergänzen.
6. Keine Videos oder Frames an externe Inferenzdienste senden. Gewichte dürfen von einem Modell-Host heruntergeladen werden; die Bildinferenz bleibt lokal auf dem Gerät.
7. Erst nach bestandenem Vergleich wird ein Kandidat in die reguläre App integriert.

## Vorläufige Entscheidung

YOLO-Net ist wegen des tennis-spezifischen Trainings und der kleinen Parameterzahl der interessanteste Kandidat. Die publizierten Kennzahlen sind jedoch keine Garantie für die Wohnzimmer-/Trainingsaufnahmen in ACE. Der nächste technische Schritt ist, einen offiziellen bzw. reproduzierbaren Checkpoint zu finden. Falls keiner verfügbar ist, wird YOLO-World small als nächster ausführbarer Kandidat geprüft – unter Beachtung der AGPL-Lizenz und der zusätzlichen CLIP-Komponente.

## Quellen

- Du et al. (2026), *YOLO-Net: A lightweight edge-enhanced detection model for small-object recognition in tennis match scenarios*, PLOS ONE: https://doi.org/10.1371/journal.pone.0335558
- Autoren-Datensatz (Validierungsbilder und Annotationen laut Paper): https://www.kaggle.com/datasets/taowang1123/yolo-net
- YOLO-World v2 ONNX-Modellkarte und Input-Schema: https://huggingface.co/Instemic/yolo-world-onnx
- OWLv2 Modellkarte: https://huggingface.co/google/owlv2-base-patch16
- Grounding DINO: https://github.com/IDEA-Research/GroundingDINO
