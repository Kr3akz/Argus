# Cephalon Argus

*Der hundertäugige Wächter der griechischen Mythologie — er schließt nie alle Augen zugleich.*

Mastery-Rank-Planer für Warframe. Zeigt, welche Items dir für MR fehlen, was sich am
schnellsten lohnt, und schlüsselt Farm-Ziele bis auf die Rohstoffe auf.

## Starten

```bash
npm start
```

Konsolen-Report ohne Oberfläche:

```bash
npm run report
```

## Bedienung

| | |
|---|---|
| **Alt+Shift+W** | Overlay ein-/ausblenden (global, auch im Spiel) |
| **▣** in der Titelleiste | Zwischen Fenster- und Overlay-Modus wechseln |

Das Overlay setzt Warframe im **randlosen Fenstermodus** voraus. Echtes Vollbild lässt
kein fremdes Fenster darüber zu — das ist eine Windows-Eigenheit, keine Einschränkung
der App.

## Ist das sicher?

Ja, und zwar aus einem strukturellen Grund: **Die App fasst das Spiel nicht an.**

- Kein Speicherzugriff, keine Injection, kein DLL-Hook
- Keine Netzwerk-Interception (von Warframes EULA ausdrücklich verboten)
- Keine Automatisierung, keine Eingabesimulation
- Keine Zugangsdaten — die App *kann* sich technisch nicht einloggen

Sie liest ausschließlich zwei öffentliche HTTP-Endpunkte, genau wie ein Browser:

| Endpunkt | Zweck |
|---|---|
| `api.warframe.com/cdn/getProfileViewingData.php` | dein öffentliches Profil |
| `cdn.jsdelivr.net/.../warframe-exports-data` | DEs Item-Katalog + Bilder |

### ⚠️ Wichtig: Nicht zu oft aktualisieren

DE drosselt **pro IP-Adresse**, nicht pro Endpunkt. Zu viele Abrufe führen dazu, dass
du dich **nicht mehr in Warframe einloggen** kannst („too many logins") — eine
IP-Sperre von bis zu 24 Stunden. Kein Account-Bann, aber lästig.

Deshalb ist eingebaut:

- Profil wird **nur auf Knopfdruck** abgerufen, nie automatisch
- Mindestens **6 Stunden** zwischen zwei Abrufen
- Nach einer Drosselung **24 Stunden Pause**, ohne Wiederholungsversuch

Mastery ändert sich ohnehin langsam — einmal pro Spielsession genügt völlig.

## Account-ID einrichten

Vorlage kopieren und die ID eintragen:

```bash
cp data/config.example.json data/config.json
```

`data/config.json`:

```json
{ "accountId": "…24 Hex-Zeichen…", "platform": "pc" }
```

Die Datei ist per `.gitignore` ausgeschlossen — wie der gesamte `data/`-Ordner, in dem
auch Profil- und Inventardaten deines Kontos liegen.

Die ID findest du so: auf warframe.com einloggen, dann
`https://www.warframe.com/api/user-data` aufrufen → Feld `user_id`.

Plattformen: `pc`, `psn`, `xbox`, `switch`, `mobile`.

Seit Update 38.0.8 funktioniert der Abruf **nur noch über die Account-ID**, nicht mehr
über den Spielernamen. Tools, die noch nach dem Namen fragen, sind veraltet.

## Aufbau

```
src/core/     Logik, komplett unabhängig von der Oberfläche
  mastery.js      MR-Formeln (gegen ein echtes Profil verifiziert)
  catalog.js      DEs PublicExport laden + cachen
  profile.js      Profilabruf mit Drosselungsschutz
  classify.js     DEs Kategorien bereinigen
  acquisition.js  Beschaffungswege + realistischer Aufwand
  analyze.js      Soll-Ist-Abgleich + Empfehlungen
  recipes.js      rekursive Materialauflösung
  ratelimit.js    schützt vor dem Login-Lockout
  store.js        Ziele und Notizen
src/main/     Electron-Hauptprozess
src/renderer/ Oberfläche
data/         lokaler Cache, Konfiguration, deine Ziele
```

`src/core/` kennt weder Electron noch DOM — die Logik ist damit auch ohne die
Oberfläche nutzbar (siehe `src/cli/`).

## Builds und Mods

Im Tab **Builds** fügst du einen Overframe-Link ein (`overframe.gg/build/86364/…` oder
nur die ID). Das Tool übernimmt Mods, Ränge, Polaritäten, Kapazität und Forma-Bedarf
und rechnet zusammen, was du insgesamt brauchst: Forma, Aura-/Umbra-Forma,
Orokin-Reaktoren und -Katalysatoren, Endo.

Klick auf einen Mod-Slot (oder eine Zeile unter *Fehlende Mods*) markiert ihn als
vorhanden. Erfasst wird nur, was in deinen Builds vorkommt — nicht alle 1.280 Mods.

### Eigene Builds

**Eigener Build** → Item wählen → die 10 Slots per Klick füllen (8 normale, ein
Aura-/Stance- und ein Exilus-Platz). Im Slot-Editor suchst du den Mod, stellst den Rang
per Regler ein und wählst die Polarität. Der Kapazitätsverbrauch wird live vorgerechnet:

- **Passende Polarität** halbiert die Kosten (aufgerundet)
- **Falsche Polarität** verteuert um 25 %
- **Aura-Mods geben Kapazität**, statt sie zu kosten — bei passender Polarität doppelt

Gegenprobe: Steel Charge auf Rang 5 mit Madurai ergibt **+18** — exakt der Wert, den
Overframe für denselben Mod meldet.

Bei importierten Builds öffnet der Klick auf einen Slot keinen Editor, sondern schaltet
den Mod-Besitz um — die Bestückung stammt ja von Overframe.

### Wie der Import funktioniert

`overframe.gg/api/v1/builds/<id>/` ist **nicht dokumentiert** und liefert nur interne
Mod-IDs; ein öffentliches Mapping auf Namen gibt es nicht (`/api/v1/mods/` → 404). Die
Namen entstehen erst beim Rendern. Deshalb lädt Electron die Seite **einmal unsichtbar**,
liest die Mod-Namen aus und speichert das Mapping in `data/overframe-mods.json`.
Bekannte IDs brauchen danach keinen Seitenaufruf mehr.

Als Absicherung dient der `drain`-Wert: Er steht sowohl in der API als auch auf der
Seite. Stimmen weniger als 80 % überein, bricht der Import ab, statt falsche Mods zu
speichern. Ändert Overframe seine Seitenstruktur, fällt nur der Import aus — alles
andere im Tool läuft weiter.

## Bekannte Grenzen

- **MR-Anzeige kann um 1 danebenliegen.** Die MR-XP pro Sternenkarten-Node ist nicht
  öffentlich dokumentiert; gerechnet wird mit 100. Die Item-Listen und die
  MR-Gewinne pro Item sind davon **nicht** betroffen — die stammen direkt aus deinen
  Profildaten.
- **Vaulted-Primes** werden noch als holbar geführt.
- Zaw-/Kitgun-/Amp-Teile sind grob klassifiziert.
- **Mod-Besitz lässt sich nicht automatisch erkennen.** Das öffentliche Profil enthält
  keinerlei Mod-Daten — wer das anbietet, liest den Spielspeicher oder loggt sich mit
  deinen Zugangsdaten ein. Deshalb hakst du Mods selbst ab.
- **Arcanes** stehen nicht im Mod-Katalog (sie liegen in `ExportRelicArcane`) und
  bleiben beim Import als „nicht zugeordnet" stehen.
- **Endo ohne Overframe-Quelle ist geschätzt.** Die eigene Formel (Verdopplung je Rang)
  liegt etwa Faktor 2 unter Overframes Wert, weil dort vermutlich die Duplikat-Mods
  mitgerechnet werden. Bei importierten Builds wird der exakte Wert der Quelle benutzt.

## Tests

```bash
node src/cli/dashboard-test.js
```

Prüft die gesamte Datenkette ohne Electron.
