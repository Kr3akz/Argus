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
| **Strg+R** | Overlay ein-/ausblenden (global, auch im Spiel) |
| **Alt+Shift+E** | Mauszeiger ins Overlay holen, **Esc** bringt ihn zurück ins Spiel |
| **▣** in der Titelleiste | Overlay ein-/ausblenden |

Beide Kürzel sind im Tab **Einstellungen** frei belegbar.

> **Zu Strg+R:** Ein global registriertes Kürzel reicht Windows **nicht mehr ans Spiel
> weiter**. In Warframe liegt auf Strg das Ducken und auf R das Nachladen — wer im
> Gleiten nachlädt, blendet damit das Overlay ein, statt nachzuladen. Wenn dich das
> stört, stell es in den Einstellungen um, etwa auf Strg+Alt+R.

### Zwei Fenster

Das **Hauptfenster** ist die volle Oberfläche mit allen neun Bereichen — gedacht für
den zweiten Monitor. Es bleibt offen, wenn das Overlay erscheint: beides läuft
gleichzeitig, auf getrennten Bildschirmen.

Das **Overlay** ist ein eigenes Fenster mit eigener Oberfläche (`overlay.html`), keine
geschrumpfte Fassung des Dashboards. 380 px schmal, für den Bildschirm mit dem
laufenden Spiel, und es zeigt nur, was sich in den nächsten Minuten entscheidet:

- die drei Open-World-Zyklen mit sekundengenauem Countdown
- aktive Void-Risse — Treffer deiner Benachrichtigungs-Auswahl stehen oben und sind
  farbig hinterlegt, der Rest bleibt darunter sichtbar
- gemerkte Relikte aus dem Relikt-Planer — mit Erwartungswert, teuerster Belohnung und
  der Zahl der gerade offenen Risse ihrer Ära
- deine offenen Farm-Ziele

Restzeiten unter fünf Minuten färben sich golden.

Welche Relikte im Overlay stehen, entscheidet der **Stern** auf den Karten im
Relikt-Planer (Tab **Baro & Dukaten**). Die Auswahl wirkt sofort, auch bei offenem
Overlay, und übersteht einen Neustart — sie liegt in `data/goals.json`. Ist zu einem
gemerkten Relikt gerade ein Riss der passenden Ära offen, ist die Zeile farbig
hinterlegt: dann lohnt es sich jetzt, es mitzunehmen.

Das Overlay merkt sich seine Position und Größe getrennt vom Hauptfenster. Beim ersten
Mal geht es oben rechts auf dem **Hauptbildschirm** auf — dort läuft in aller Regel das
Spiel, während das Hauptfenster auf dem zweiten Monitor stehen bleibt. Einmal
woandershin gezogen, bleibt es dort, auch über einen Neustart hinweg.

Ausblenden schließt das Overlay nicht, es versteckt es nur — der nächste Tastendruck
ist deshalb sofort da. Erst wenn das Hauptfenster geschlossen wird, verschwindet auch
das Overlay und die App beendet sich.

In der Fußleiste stellst du die **Deckkraft** ein (35–100 %). Der Knopf mit dem
Fadenkreuz schaltet den **Klick-Durchlass**: Klicks gehen dann ans Spiel, statt im
Overlay zu landen. Die Kopfleiste bleibt dabei bedienbar — sonst käme man an den
Schalter nicht mehr heran, um ihn wieder auszuschalten.

### Zeiger ins Overlay holen

Solange Warframe im Vordergrund ist, hält es den Mauszeiger fest — das Overlay ist
dann zwar sichtbar, aber nicht bedienbar. **Alt+Shift+E** holt ihn: das Overlay nimmt
kurz den Eingabefokus, Windows gibt den Zeiger daraufhin von selbst frei. Das Spiel
läuft im Hintergrund weiter.

Zurück geht es mit **Esc** oder demselben Hotkey. Der Fokus wandert dabei gezielt an
das Fenster zurück, aus dem du gekommen bist, nicht irgendwohin — dafür merkt sich die
App vorher dessen Fensterkennung (siehe `src/core/foreground.js`). Klickst du
stattdessen selbst ins Spiel, endet der Modus ebenso.

Im Zeigermodus ist der Klick-Durchlass ausgesetzt und das Overlay bekommt einen blauen
Rahmen. Die Einstellung selbst bleibt unangetastet: nach dem Zurückspringen gilt wieder,
was vorher galt.

**Mausrad oder Maustaste geht dafür nicht.** Electron kann systemweit nur Tasten
abfangen; für Mausereignisse bräuchte es einen globalen Maus-Hook. In Warframe wäre das
Rad ohnehin die falsche Wahl — dort wechselt es die Waffe. Wer den Griff zur Tastatur
sparen möchte, legt Alt+Shift+E in der Software seiner Maus auf eine Daumentaste.

Das Overlay setzt Warframe im **randlosen Fenstermodus** voraus. Echtes Vollbild lässt
kein fremdes Fenster darüber zu — das ist eine Windows-Eigenheit, keine Einschränkung
der App.

## Relikt-Belohnungen

Sobald der Auswahlbildschirm nach einer Riss-Mission aufgeht, blendet Argus **alle vier
zur Auswahl stehenden Teile** ein — jeweils mit Platinpreis und Dukatenwert, samt
Countdown der 15 Sekunden Bedenkzeit. Danach verschwindet die Anzeige von selbst.

```
RELIKT-BELOHNUNGEN                        9s
   BELOHNUNG                   PLATIN  DUK.
1  Pyrana Prime Barrel            4p     15   ← dein Relikt
2  Vadarya Prime Receiver         2p     45
3  Dual Zoren Prime Handle        2p     15
4  Perigale Prime Stock           1p     15
```

**Die Nummerierung ist der Kern:** sie entspricht der Reihenfolge auf dem Bildschirm,
von links nach rechts. Du liest die Zahl und klickst die Karte — kein Namensvergleich
unter Zeitdruck.

### Preisschilder direkt im Spiel

Noch schneller geht es ohne Liste: Argus setzt unter jede der vier Karten ein kleines
Schild mit Platinpreis und Dukatenwert. Das teuerste Teil bekommt einen grünen Rahmen,
dein eigenes die Beschriftung *deins*.

Möglich wird das, weil die Texterkennung nicht nur Namen liefert, sondern auch deren
**Bildschirmkoordinaten**. Jedes Schild sitzt mittig unter dem Namen, zu dem es gehört.

Technisch ist es **ein** durchsichtiges Fenster über dem ganzen Bildschirm, nicht vier
einzelne: vier Fenster wären vier Renderer für dieselbe Sache und vier Gelegenheiten,
dass eines hängen bleibt. Es ist **klickdurchlässig** und nicht fokussierbar — es kann
keinen Klick abfangen, der der Karte darunter gilt, und nimmt dem Spiel nie die
Eingabe.

Zwei Fallstricke stecken darin, beide gelöst:

- Bildschirmkoordinaten sind echte Pixel, Fensterkoordinaten sind geräteunabhängige
  Punkte. Bei 125 % Skalierung säßen die Schilder sonst ein Viertel zu weit rechts.
- `showInactive()` lässt ein Fenster mit `transparent: true` und `focusable: false`
  unter Windows unsichtbar — nachgemessen. Deshalb `show()`, was hier gefahrlos ist:
  ein nicht fokussierbares Fenster kann den Fokus nicht nehmen.

Sie verschwinden, sobald das Log den Auswahlbildschirm als geschlossen meldet — und
spätestens zwei Sekunden nach Ablauf des Countdowns, auch wenn diese Meldung ausbleibt.
Ein Schild, das über dem laufenden Spiel kleben bleibt, wäre die schlechteste denkbare
Eigenschaft; deshalb entscheidet die Uhr mit.

Der senkrechte Abstand unter dem Namen beträgt 8,3 % der Bildschirmhöhe — 120 px bei
1440p, rund drei Zentimeter auf 27 Zoll. Als Anteil der Höhe und nicht als feste
Pixelzahl, damit es auf 1080p an derselben Stelle des Bildes sitzt. Wer ihn anders
haben will, setzt in `data/config.json`:

```json
{ "relicTagOffset": 0.083 }
```

Abschaltbar in den **Einstellungen**. Ohne Schilder erscheint die Liste im Overlay.

### Woher die Daten kommen

Aus zwei Quellen, die nacheinander eintreffen:

**Der eigene Fund** steht sofort fest. Warframes Logdatei `EE.log` schreibt im Moment
des Auswahlbildschirms:

```
VoidProjections: <accountId> gets reward /Lotus/StoreItems/.../PyranaPrimeBarrel
ProjectionRewardChoice.lua: Got rewards
```

Die AccountIds aus diesen Zeilen werden verworfen und nie weitergereicht.

**Die anderen drei** stehen dort nicht — DE protokolliert nur den eigenen. Sie werden
per **Texterkennung** vom Bildschirm gelesen: ein Bildschirmfoto, die Windows-eigene
OCR (`Windows.Media.Ocr`, kein Zusatzpaket, läuft offline), danach wird das Bild
gelöscht. Es verlässt den Rechner nie.

Zuverlässig wird das durch den Abgleich: nicht der erkannte Text zählt, sondern der
Treffer in der Menge der **rund 600 möglichen Reliktbelohnungen** aus DEs Droptabellen.
Aus einem verlesenen „kris Prime Grip" wird so wieder *Paris Prime Grip*. Erkannt werden
muss nur genug, um im Kandidatenfeld eindeutig zu sein.

Nachgemessen bei 2560×1440 mit englischem Client und deutscher Windows-Erkennung: alle
vier Namen fehlerfrei, Aufnahme und Erkennung in 1,3 Sekunden — von 15 Sekunden
Bedenkzeit. Wer die **englische** Texterkennung nachinstalliert (Windows-Einstellungen →
Sprache → optionale Features), gibt der Erkennung zusätzlich das passende Sprachmodell;
Argus nimmt es automatisch, sobald es da ist.

Das Lesen vom Bildschirm lässt sich in den **Einstellungen** abschalten. Dann bleibt der
eigene Fund aus dem Log — ganz ohne Bildschirmfoto.

### Preise

Von **warframe.market**, über die v2-API — v1 ist abgeschaltet (`/v1/items` antwortet
404). Gezählt werden nur Angebote von Verkäufern, die **gerade im Spiel** sind: das
billigste Angebot von jemandem, der seit drei Tagen offline ist, ist kein Preis,
sondern eine Zahl.

Das automatische Einblenden lässt sich in den **Einstellungen** abschalten.

### Grenzen

- Erkannt wird, was auf dem **Hauptbildschirm** steht. Läuft Warframe auf einem anderen
  Monitor, findet die Erkennung nichts.
- Bricht die Erkennung ab, bleibt der eigene Fund stehen — die Anzeige fällt also nie
  ganz aus.
- Sehr kleine Auflösungen sind ungetestet; der Abgleich fängt einiges ab, aber unter
  1080p kann die Schrift zu klein werden.

## Mods, Arcanes und Relikte im Inventar

### Die Karten, wie sie im Spiel aussehen

Eine Mod hat im Spiel **zwei Zustände**: zugeklappt steht nur der Name da, beim
Darüberfahren klappt sie auf und zeigt Illustration, Wirkung und Kompatibilität. Genau
das macht das Inventar hier auch.

```
zugeklappt (184 × 90)             aufgeklappt (× 1.1)
┌──────────────────┐              ┌──────────────────┐
│ ╌╌╌╌╌╌╌╌╌  14 ⟋  │              │ ╌╌╌╌╌╌╌╌╌  14 ⟋  │
│                  │              │   [Illustration] │
│ Primed Continuity│   ──▶        │                  │
│                  │              │ Primed Continuity│
│ ★★★★★★★★★★       │              │ +55% Ability Dur.│
└──────────────────┘              │ ▓▓ WARFRAME ▓▓   │
                                  │ ★★★★★★★★★★       │
                                  └──────────────────┘
```

**Die Karte wird gezeichnet, nicht als Bild geladen.** Ein fertig gerendertes Kartenbild
kennt nur einen Zustand; den zugeklappten daraus zu schneiden geht nicht, weil er anders
aufgebaut ist und die Namenszeile je nach Länge des Wirkungstextes woanders sitzt. Hier
steht jedes Teil an seinem Platz, und der Wechsel ist eine Frage von Höhe und Deckkraft.

Drei Kniffe tragen das:

- Die Karte trägt `transform: scale(1)`. Eine Transformation macht sie zum **Bezugsrahmen**
  für alles, was darin absolut sitzt — Rahmenteile, Kostenzahl, Kompatibilitätsbalken,
  Rangsterne. Deshalb wandern sie beim Aufklappen mit, statt am 90 px hohen Platz zu kleben.
- Der Innenteil schneidet ab. Zugeklappt ist die Karte 90 px hoch, der Wirkungstext liegt
  darunter und ist damit weg.
- Der Name sitzt mit `top: -60px` über der abgedunkelten Illustration und fährt beim
  Aufklappen auf `top: 0`, wodurch der Text darunter frei wird.

Der **Platz im Raster behält seine 90 px**, auch wenn die Karte darin auf 260 px wächst —
sonst bräche das Raster bei jedem Zeigerwechsel um. Die Karte selbst nimmt keine
Mausereignisse an, damit die aufgeklappte Fassung ihre Nachbarn nicht blockiert.

Die Rahmenteile sind die **echten Spiel-Texturen** (vier Familien nach Seltenheit, je fünf
Dateien) und liegen unter `src/renderer/assets/mod/`. Die Illustration kommt wie bisher
aus DEs Export. Damit funktioniert das Raster vollständig offline.

Die Polaritäts-Zeichen sind Vektoren aus dem Wiki, inline in `icons.js`. Sie färben sich
über `currentColor` mit und bleiben scharf, ob 11 oder 24 Pixel groß — vorher stand dort
ein Buchstabe als Notbehelf.

Arcanes sind keine Karten, sondern Gefäße: quer, ohne Rahmen und ohne Namen darin. Sie
bekommen ihr echtes Gefäßbild aus dem Wiki und den Namen darunter. Ein eigener
Bildspeicher wäre dafür überflüssig — das Wiki liefert
`cache-control: public, max-age=31536000, immutable`, Chromium legt jedes Bild also von
selbst dauerhaft ab.

### Datenblatt einer Mod oder eines Arcanes

Ein Klick auf eine Karte öffnet ihr Datenblatt.

```
Serration                             MOD · PRIMÄRWAFFEN-MOD · UNGEWÖHNLICH
Passt auf Gewehr · Polarität V Madurai

IM BESITZ   13 Exemplare              Rang 0 ×11 · Rang 6 · Rang 10

WIRKUNG     [0][1][2][3][4][5][6•][7][8][9][10•]
            +165% Damage
            Kostet 14 Kapazität · 6.138 Endo bis hierher

WOHER BEKOMMT MAN DAS?
  MISSION   Arval · Mars        Spy · Rotation C          8,6 %
  GEGNER    Ghoul Expired       Mod-Drop 20 % × Tab. 7,37 %  1,47 %
```

**Die Rangleiter ist der Kern.** Eine Karte auf Rang 3 wirkt anders als dieselbe auf
Rang 10, und genau das ist die Frage, die man sich vor dem Aufwerten stellt. Ein Punkt
unter der Ziffer markiert die Ränge, die im eigenen Bestand liegen; beim Öffnen steht
das Blatt auf dem höchsten davon.

Arcanes rechnen anders: sie kosten weder Kapazität noch Endo, sondern sich selbst.
Statt der Endo-Zeile steht dort, wie viele Exemplare der Rang schluckt — 21 für Rang 5.
Ein fertiges Rang-5-Arcane ist dabei **ein** Gegenstand, in dem 21 stecken; die Anzeige
rechnet das mit, statt neben einem Maximum noch „20 fehlen" zu behaupten.

### Woher die Fundorte kommen

Drei Stufen, in dieser Reihenfolge:

1. **DEs Droptabellen** (`drops.warframestat.us`) — dieselbe Quelle wie bei den
   Relikten. Sie liefern Planet, Knoten, Rotation, Gegner und Chance als eigene Felder,
   lassen sich also sauber beschriften. Bei Gegnern steht die **effektive** Chance da:
   erst muss der Gegner überhaupt eine Mod fallen lassen, dann muss es diese sein.
2. **Die Item-API von warframestat.us** — nur, wenn Stufe 1 nichts hergibt. Sie kennt,
   was DE gar nicht als „Drop" veröffentlicht, allen voran die **Syndikats-Augmente**:
   *Despoil* gibt es bei Red Veil und der Perrin Sequence, in DEs Tabellen kommt der
   Name nirgends vor.
3. **Eine Regeltabelle** für Karten, die man schlicht nicht erfarmt — Baro-Ware,
   Arbitrations-Ehrenmarken, die Lua-Prüfungsräume, Precepts, die mit dem Begleiter
   kommen. Sie rät nicht, sondern liest den Pfad, in den DE die Karte einsortiert hat.

Gemessen an einem Konto mit 639 Mods und 90 Arcanes: 631 aus Stufe 1, 23 aus Stufe 2,
57 aus Stufe 3 — **9 Karten ohne Fundort**, gut ein Prozent. Das sind Nightwave-Reste
und Auslaufmodelle; dort steht der Hinweis, dass es sie im Handel weiterhin gibt, samt
Link ins Wiki.

Alles darüber — Wirkung je Rang, Kapazität, Polarität, Seltenheit, Set-Zugehörigkeit —
stammt aus DEs eigenem Export, also aus derselben Datei, aus der das Spiel die Karte
zeichnet.

### Datenblatt eines Relikts

Relikte lassen sich ebenso anklicken. Dort steht, was drin ist:

```
Axi A22                                    RELIKT · AXI · 4 im Bestand

POLITUR-STUFE   [Intakt 4] Außergewöhnlich 0  Makellos 0  Strahlend 0

BELOHNUNGEN
  Afentis Prime Blueprint      Selten          2,00 %    18p    100 Duk.
  Dual Zoren Prime Handle      Ungewöhnlich   25,33 %     2p     15 Duk.
  …

WAS EIN ÖFFNEN IM SCHNITT BRINGT     Platin 2,7   ·   Dukaten 18
```

**Die vier Politur-Stufen zeigen dieselben sechs Belohnungen** — nur die Chancen
verschieben sich: intakt steht die seltene bei 2 %, strahlend bei 10 %. Deshalb rechnet
das Datenblatt alle vier durch, statt eine auszuwählen; die Frage vor dem Polieren ist ja
gerade, ob es sich lohnt.

Der Erwartungswert ist **Chance × Wert**, nicht der Mittelwert der sechs Belohnungen —
bei Chancen zwischen 2 % und 25 % wäre ein Mittelwert eine andere Zahl als die, nach der
man entscheidet. Fehlt für einen Teil der Chance ein Platinpreis, sagt das Blatt es
dazu: der Platinwert ist dann eine Untergrenze, keine Schätzung.

Ein Relikt aus dem Tresor führt DE nicht mehr auf. Statt einer leeren Tabelle steht dann
da, dass es vaulted ist — mitsamt dem, was das praktisch heißt.

## Einstellungen

Im Tab **Einstellungen** stehen die Dinge, die immer gelten:

- **Tastenkürzel.** Auf die Schaltfläche klicken, Kombination drücken, fertig. Mindestens
  Strg, Alt oder Shift muss dabei sein — eine Taste allein würde Argus systemweit
  abfangen, auch im Chat. Ist die Kombination schon von einem anderen Programm belegt
  (Discord, GeForce Experience, ein weiteres Overlay), sagt die App das und behält das
  bisherige Kürzel.
- **Benachrichtigungen an/aus**, Ton und Windows-Desktop-Toast.

**Welche** Risse gemeldet werden — Stufen, Missionstypen, Steel Path, Railjack — bleibt
im **Live-Tracker** unter *Void-Risse → Benachrichtigungen*. Diese Auswahl gehört zu der
Liste, die sie filtert: dort zeigt die Vorschau direkt, wie viele Risse gerade passen.

## Ist das sicher?

**Am Spiel verändert die App nichts.** Was sie tut, vollständig:

- **Keine Injection, kein DLL-Hook, kein Schreibzugriff** auf den Spielprozess
- **Keine Netzwerk-Interception** — von Warframes EULA ausdrücklich verboten
- **Keine Automatisierung, keine Eingabesimulation**
- **Lesender Speicherzugriff** auf den Spielprozess, ausschließlich für den
  Inventar-Abruf und nur auf Knopfdruck: `gamecreds.js` sucht die temporären
  API-Zugangsdaten der laufenden Sitzung im Heap. Nur lesen, nichts schreiben.
- **Lesender Zugriff auf `EE.log`**, Warframes eigene Logdatei, für die
  Relikt-Belohnungen. Ab dem zuletzt gelesenen Byte, ohne die Datei zu sperren.
- **Bildschirmfoto** während des Belohnungsbildschirms, um die vier Teile per
  Texterkennung zu lesen. Es wird sofort nach dem Auswerten gelöscht, verlässt den
  Rechner nicht und lässt sich in den Einstellungen ganz abschalten.
- **Fokuswechsel** über `SetForegroundWindow` für den Zeigermodus — eine
  Fensteroperation, kein Zugriff auf das Spiel.

Abgerufen werden diese Endpunkte:

| Endpunkt | Zweck |
|---|---|
| `api.warframe.com/cdn/getProfileViewingData.php` | dein öffentliches Profil |
| `api.warframe.com/api/inventory.php` | dein Inventar (nur auf Knopfdruck) |
| `cdn.jsdelivr.net/.../warframe-exports-data` | DEs Item-Katalog + Bilder |
| `api.warframestat.us` | Weltzustand, Zyklen, Risse, Fundorte von Syndikats-Augmenten |
| `drops.warframestat.us` | DEs Droptabellen für Relikte, Mods und Arcanes |
| `api.warframe.market/v2` | Platinpreise und Dukatenwerte |
| `wiki.warframe.com` | Arcane-Bilder, Mod-Rahmen, Polaritaets-Zeichen |
| `overframe.gg` | Build-Import, nur auf Knopfdruck |

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
  foreground.js   gibt den Eingabefokus ans Spiel zurück
  logwatch.js     liest Warframes EE.log mit (Relikt-Belohnungen)
  rewardscan.js   erkennt die vier Belohnungen auf dem Bildschirm
  relics.js       Relikt-Belohnungstabellen aus DEs Droptabellen
  droptables.js   Fundorte fuer Mods und Arcanes ("wo bekomme ich das?")
  cards.js        Arcane-Gefaessbilder aus dem Warframe-Wiki
  upgrade-details.js  Datenblatt einer Mod/eines Arcanes, Werte je Rang
  market.js       Preise und Dukatenwerte von warframe.market
src/main/     Electron-Hauptprozess (Hauptfenster + Overlay-Fenster)
src/renderer/ Oberfläche
  index.html    Hauptfenster
  overlay.html  Overlay-Fenster, eigene schlanke Oberfläche
  style.css     beide Fenster
  assets/mod/   Rahmen-Texturen der Mod-Karten (Spiel-Assets)
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

Prüft die gesamte Datenkette ohne Electron. Dazu:

```bash
npm run relic-test "Meso H1"
```

Belohnungen eines Relikts mit Platinpreis und Dukaten, plus eine Probe über die
Reliktpfade im eigenen Inventar.

```bash
node src/cli/log-test.js
```

Spielt die vorhandene `EE.log` ab und zeigt, was Argus daraus erkannt hätte. Mit
`--live` wartet der Test auf die nächste Riss-Mission.

Zwei Umgebungsvariablen für Tests ohne laufendes Spiel:

| Variable | Wirkung |
|---|---|
| `ARGUS_EE_LOG` | andere Logdatei — auch für Installationen mit abweichendem Datenpfad |
| `ARGUS_SCAN_IMAGE` | wertet ein gespeichertes Bild aus, statt den Bildschirm aufzunehmen |
| `ARGUS_DEVTOOLS` | öffnet die Entwicklerwerkzeuge von Overlay und Preisschildern |

Der Hauptprozess protokolliert jede Relikt-Belohnung knapp mit:

```
[Relikt] Fund aus Log: Pyrana Prime Barrel | Erkennung: an | Schilder: an
[Relikt] Erkennung: 4 Treffer
[Relikt] Schilder gezeigt: 4 | sichtbar: true
```

Damit ist bei einem Fehlschlag unterscheidbar, ob das Log nichts hergab, die Erkennung
nichts fand oder die Anzeige klemmt.
