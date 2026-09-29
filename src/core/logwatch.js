/**
 * Beobachtet Warframes EE.log und meldet Relikt-Belohnungen.
 *
 * WAS IM LOG STEHT (nachgemessen an einer echten Riss-Mission):
 *   VoidProjections: OpenVoidProjectionRewardScreenRMI
 *   ProjectionRewardChoice.lua: Relic rewards initialized
 *   VoidProjections: <accountId> gets reward /Lotus/StoreItems/.../PrimeBowGrip
 *   VoidProjections: Client got reward info from <accountId>      (x4)
 *   ProjectionRewardChoice.lua: Got rewards
 *   ProjectionsCountdown.lua: Initialize timer nil  15
 *   ProjectionRewardChoice.lua: Relic reward screen shut down
 *
 * WAS NICHT DRINSTEHT:
 *   Die Belohnungen der drei Mitspieler. Deren Daten kommen ueber das Netz an
 *   ("Client got reward info from"), werden aber nie mit Item protokolliert.
 *   Wer alle vier Namen will, braucht Texterkennung auf dem Bildschirm oder
 *   Lesezugriff auf den Spielspeicher. Der eigene Fund dagegen steht exakt da -
 *   ohne Raten, ohne Bilderkennung, ohne den Spielprozess anzufassen.
 *
 * ZUGANGSDATEN:
 *   Die Zeile enthaelt AccountIds - die eigene und die der Mitspieler. Sie
 *   werden hier verworfen und nie weitergereicht; aus dem Log verlaesst nur
 *   der Item-Pfad dieses Modul - und beim Fluestern der Name des Absenders,
 *   den das Spiel ohnehin als Reitertitel anzeigt.
 *
 * LESEZUGRIFF:
 *   Nur lesend, nur ab dem zuletzt gelesenen Byte. Die Datei bleibt in der
 *   Hand des Spiels; sie wird weder gesperrt noch veraendert noch gedreht.
 */
import { EventEmitter } from 'node:events';
import { open, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import * as dbwin from './dbwin.js';
import { RivenCycleWatch } from './riven-cycle.js';

/* ARGUS_EE_LOG zeigt auf eine andere Datei. Gedacht fuer zwei Faelle: eine
   Warframe-Installation mit abweichendem Datenpfad, und der Test der Kette
   ohne echte Riss-Mission - dann laeuft der Beobachter auf einer Kopie, statt
   in die Logdatei des laufenden Spiels zu schreiben. */
export const DEFAULT_LOG_PATH = () =>
  process.env.ARGUS_EE_LOG ||
  path.join(process.env.LOCALAPPDATA || '', 'Warframe', 'EE.log');

/* Schnelle Polling-Rate (150ms) fuer sofortige Reaktion bei Reliktauswahl. */
const POLL_MS = 150;

/* ---------- Zwei Quellen fuer dieselben Zeilen ----------
 *
 * Warframe gibt jede Logzeile GLEICHZEITIG ueber OutputDebugString aus und in
 * die Datei. Der Debugkanal liefert sofort, die Datei traege - nachgemessen
 * kamen "Got rewards" und "Relic reward screen shut down" 15 Sekunden
 * Spielzeit auseinander, aber 1 Millisekunde auseinander in der Datei.
 *
 * DER DATEIWEG BLEIBT TROTZDEM. Es kann systemweit nur EINEN Zuhoerer am
 * Debugkanal geben; laeuft dort schon ein anderes Werkzeug, kommt hier nichts
 * an - und zwar still. Der Poller ist die Rueckfallebene, die das auffaengt.
 *
 * WARUM NACH INHALT ENTPRELLT WIRD UND NICHT NACH ZEITSTEMPEL: Jede Zeile
 * traegt Warframes Laufzeituhr, und es waere verlockend, alles bis zum
 * hoechsten vom Debugkanal gesehenen Stand zu verwerfen. Das waere aber genau
 * dann falsch, wenn es darauf ankommt: hat der Kanal eine Zeile VERPASST -
 * weil ein anderer Zuhoerer sie abgefangen hat -, laege ihr Zeitstempel unter
 * dem Stand, und sie ginge endgueltig verloren. Der Inhaltsvergleich kann das
 * nicht: was der Kanal nie geliefert hat, steht auch nicht in der Menge.
 *
 * Jede Zeile wird genau einmal erwartet, also faellt sie beim Treffer wieder
 * heraus. Die Schranke ist nur die Notbremse fuer den Fall, dass die Datei
 * eine Zeile nie nachliefert. */
const GESEHEN_MAX = 5000;

/* Zwischen "gets reward" und "Got rewards" liegen Millisekunden. Ein aelterer
   Fund gehoert zu einer frueheren Mission und wird nicht mehr angezeigt. */
const REWARD_MAX_AGE_MS = 30000;

/* Notbremse fuer die Reliktauswahl: bleibt das Schlusssignal aus, schliesst
   sie die Uhr. Fuenf Minuten sind laenger, als irgendjemand vor der Auswahl
   steht, und kurz genug, dass eine haengende Anzeige nicht den Abend ueberlebt. */
const SELECT_MAX_MS = 5 * 60 * 1000;

/* Zwischen zwei Runden einer Endlosmission laeuft die Auswahl gegen eine Uhr
   des Spiels. Nachgemessen an vier Runden am 28.09.2026:

     886.640  ThemedProjectionManager.lua: PopulateInventoryGrid
     886.712  ProjectionsCountdown.lua: Initialize timer nil 20     +72 ms

   (die anderen drei: +65, +61, +63 ms). Waehlt man nichts, schliesst das
   Spiel den Bildschirm nach diesen 20 s von selbst - welche Zeile dann kommt,
   ist nicht gemessen, Kaan hat jedes Mal gewaehlt. Die Uhr des Spiels ist
   dafuer die bessere Notbremse als fuenf Minuten: eine Anzeige ueber einer
   laufenden Mission ist das Schlimmste, was diese Erkennung tun kann.

   Eine Sekunde Fenster, weil die Zeitangaben des Belohnungsbildschirms
   (5, 15) sonst hineinfallen koennten - die kommen, bevor die Auswahl
   aufgeht, nie danach. */
const SELECT_TIMER_WINDOW_S = 1;
const SELECT_TIMER_GRACE_MS = 2000;

/* Entprellung fuer game-activity: Zonenwechsel erzeugen oft mehrere Zeilen
   innerhalb weniger Millisekunden. Nur das erste Ereignis in diesem Fenster
   wird emittiert. */
const ACTIVITY_DEBOUNCE_MS = 5000;

/* ----- Spielereignisse, die auf ein veraendertes Inventar hindeuten ----- */
const RE_MISSION_END = /MatchingService::LeaveSquad/;
const RE_ORBITER     = /(?:TennoShipAvatar|TennoMotion).*Setting PM_|Created\s+\S*ThemedMainMenu\.swf/;
const RE_TRADE       = /TradeService::\w*(?:Accept|Confirm|Complete)/i;

const RE_OWN_REWARD = /VoidProjections:\s+[0-9a-f]{24}\s+gets reward\s+(\S+)/;
const RE_READY      = /ProjectionRewardChoice\.lua:\s*Got rewards/;

/**
 * Wie viele Karten auf dem Bildschirm stehen werden.
 *
 * Eine pro Mitspieler, und das Log zaehlt sie mit: fuer jeden trifft genau eine
 * Zeile "Client got reward info from <accountId>" ein, die eigene inbegriffen.
 *
 * WARUM DAS ZAEHLEN NOETIG IST:
 *   Die Erkennung hoerte auf, sobald VIER Namen dastanden. In einer vollen
 *   Gruppe stimmt das. Zu dritt kommt die Vier nie zustande - dann las sie
 *   stur weiter, bis die Zeit abgelaufen war, und zeigte die drei Karten erst
 *   nach sieben Sekunden statt nach einer halben. Von fuenfzehn Sekunden
 *   Bedenkzeit ist das fast die Haelfte, vertan mit Warten auf eine vierte
 *   Karte, die es nicht gibt.
 *
 * Die AccountIds werden nur gezaehlt, nicht behalten - siehe Kopfkommentar.
 */
const RE_REWARD_PEER = /VoidProjections:\s*Client got reward info from\s+([0-9a-f]{24})/;
const RE_REWARD_OPEN = /VoidProjections:\s*OpenVoidProjectionRewardScreenRMI/;
const RE_TIMER      = /ProjectionsCountdown\.lua:\s*Initialize timer\s+\S+\s+(\d+)/;
const RE_CLOSED     = /ProjectionRewardChoice\.lua:\s*Relic reward screen shut down/;

/**
 * Die Reliktauswahl geht auf.
 *
 * EIN Bildschirm, drei Wege dorthin - und alle drei melden dasselbe:
 *   - Veredelung im Schiff, ueber die Konsole im Relikt-Segment
 *   - Reliktwahl auf der Sternenkarte, bevor eine Rissmission startet
 *   - Reliktwahl zwischen den Runden in Endlos-Missionen
 * In allen dreien baut ThemedProjectionManager das Gitter der eigenen
 * Relikte auf. Etwas anderes darf hier nicht stehen.
 *
 * OHNE UIConsoleTrigger3: hier stand zusaetzlich die Orbiter-Konsole mit
 * genau diesem Index. Der Index ist aber nicht der des Relikt-Segments,
 * sondern eine LAUFENDE NUMMER INNERHALB EINER SZENENEBENE - im Mitschnitt
 * meldet sich das Relikt-Segment als /Layer255/Layer1/Layer31/UIConsoleTrigger3
 * und die Navigation als /Layer255/Layer1/Layer30/UIConsoleTrigger1. Welche
 * Konsole die Nummer 3 traegt, haengt an Ebene und Ausbau des Schiffs. Jede
 * andere Konsole mit derselben Nummer riss damit die Empfehlung auf, ohne
 * dass ein Relikt im Spiel war - das "geht ganz random auf".
 *
 * Gekostet hat der Ausbau nichts: im Mitschnitt folgt dem Konsolen-Ereignis
 * 29 ms spaeter PopulateInventoryGrid. Fuer 29 ms Vorsprung war das der
 * falsche Preis.
 *
 * OHNE DEN BACKGROUND-HERZSCHLAG: "Background.lua: Update the Profile
 * Variable" stand hier lange als Notnagel fuer Bildschirme, die sonst nichts
 * melden. Er ist keiner. Nachgemessen an einem Mitschnitt schlaegt er in
 * unregelmaessigen Abstaenden zu - mal Sekunden, mal Minuten - und traf damit
 * beides: einmal schloss er die Anzeige 4 s BEVOR der Spieler sein Relikt
 * waehlte, ein andermal erst 20 s NACHDEM er den Bildschirm verlassen hatte.
 * Was ihn ersetzt, steht weiter unten (RE_INIT_MAPPING).
 */
const RE_SELECT_OPEN   = /ThemedProjectionManager\.lua:\s*PopulateInventoryGrid|(?:Created|Subscribing for)\s+\S*ThemedProjectionManager\.swf/;

/* Der Gegenzug. UIConsoleTrigger steht jetzt OHNE Nummer hier: aufgehen laesst
   die Auswahl keine Konsole mehr, also heisst jede aufgehende Konsole, dass
   der Spieler woanders ist. */
const RE_SELECT_CLOSED = /Subscribing for \S*ChatRedux\.swf|UIConsoleTrigger::Open\(\)|(?:ThemedMainMenu|RadialSolarMap|PauseMenu|TopMenu)\.lua|(?:TennoShipAvatar|TennoMotion|MotionController|WallSlideController).*Setting PM_|Created\s+\S*(?:Transmission|Dialog|MapRedux|ThemedMainMenu|RadialSolarMap)\.swf|MatchingService::LeaveSquad|Set squad mission/;

/**
 * Der schnelle Schluss: der Eingabefilter wechselt weg vom Menue.
 *
 * Solange die Reliktauswahl offen ist, laeuft die Eingabe ueber einen
 * *MenuInputFilter - der Bildschirm meldet sich beim Aufgehen selbst so an.
 * JEDER Wechsel auf einen anderen Filter heisst deshalb: der Bildschirm ist
 * weg. Zurueck ins Schiff (TennoShipInputFilter), auf die Sternenkarte
 * (MapReduxInputFilter), in die Ausruestung (LoadoutReduxInputFilter) - eine
 * Regel statt einer Liste, die bei jedem neuen Bildschirm nachgezogen
 * werden muesste.
 *
 * Ueber der Sternenkarte fiel das bisher nicht auf: dort folgt auf die Wahl
 * sofort die Sicherheitsfrage ("Are you sure you want to equip ..."), und
 * deren Dialog.swf steht schon in RE_SELECT_CLOSED. Im Schiff gibt es keine
 * solche Frage - dort kam der Schluss erst mit dem Background-Herzschlag an,
 * irgendwann. Genau die Verzoegerung schliesst diese Zeile.
 *
 * SCHARF ERST NACH DER ANMELDUNG (RE_SELECT_ARMED): beim Aufgehen faellt der
 * Filter fuer einen Sekundenbruchteil auf den Schiffsfilter zurueck, BEVOR
 * sich der Bildschirm anmeldet. Wer schon vorher hinsieht, schliesst die
 * Anzeige 0.4 s nach dem Oeffnen wieder.
 */
const RE_INIT_MAPPING  = /InitMapping\b.*\bfilter\s+(\S+)/;
const RE_SELECT_ARMED  = /Subscribing for \S*ThemedProjectionManager\.swf/;

/**
 * Der Bildschirm ist fertig aufgebaut.
 *
 * Nachgemessen an 23 Auswahlen am 28./29.09.2026: 89 bis 367 ms nach
 * PopulateInventoryGrid - zwischen zwei Runden um 90 ms, von der Sternenkarte
 * und im Schiff um 300 ms. Wer vom Bildschirm etwas ABLESEN will, fragt ab
 * hier; vorher liest er ein halbes Raster.
 */
const RE_SELECT_READY  = /ThemedProjectionManager\.lua:\s*LoadingCompleteEnd/;

/**
 * Von wo die Auswahl aufgerufen wurde - drei Wege, drei Vorlaeufer im Log,
 * nachgemessen an allen 23 Auswahlen vom 28./29.09.2026 (sieben von der
 * Karte, vier zwischen Runden, zwoelf im Schiff; keine blieb ohne Zuordnung):
 *
 *   console  Die Relikt-Konsole im Schiff (Veredeln, kein Riss). Unmittelbar
 *            davor "UIConsoleTrigger::Open()" - 22 bis 41 ms.
 *            Dass die Nummer der Konsole nichts taugt (siehe RE_SELECT_OPEN),
 *            stoert hier nicht: gefragt ist nur, OB eben eine Konsole aufging.
 *   round    Zwischen zwei Runden einer Endlosmission. Unmittelbar davor
 *            "Relic reward screen shut down" - 60 bis 68 ms.
 *   map      Von der Sternenkarte. Zuletzt galt dort der Eingabefilter der
 *            Karte (MapReduxInputFilter).
 *
 * Nur die Sternenkarte verlangt nach einem Blick auf den Bildschirm: zwischen
 * den Runden nennt das Log die Aera schon, und im Schiff gibt es keinen Riss.
 */
const RE_CONSOLE_OPEN  = /UIConsoleTrigger::Open\(\)/;
const VIA_CONSOLE_S = 0.2;
const VIA_ROUND_S = 1;

/**
 * Welches Relikt fuer die Mission eingelegt wurde.
 *
 * Die Sicherheitsfrage nennt es beim Namen, mitsamt Politur:
 *   Dialog::CreateOkCancel(description=Are you sure you want to equip
 *   Meso F3 Relic [RADIANT] for this mission? It will be consumed if you
 *   seal the Void Fissure and extract., ...)
 *
 * Ohne Klammer ist es unpoliert. Das VERBRAUCHT wird es erst mit dem
 * Belohnungsbildschirm - deshalb wird hier nur gemerkt, nicht abgezogen
 * (siehe main.js). Im Mitschnitt wechseln sich beide sauber ab: einlegen,
 * Belohnung, einlegen, Belohnung - fuenf Paare hintereinander.
 */
const RE_EQUIP = /Dialog::CreateOkCancel\(description=.*?\bequip\s+(\S+)\s+(\S+)\s+Relic(?:\s+\[([A-Za-z]+)\])?\s+for this mission/;

/**
 * Auf welchen Knoten die Gruppe gerade zielt.
 *
 * Nachgemessen an EE.log:
 *   Net [Info]: Set squad mission: {"name":"SolNode854","difficulty":0}
 *   Script [Info]: ThemedSquadOverlay.lua: Cached mission name=Exterminate:
 *                  Techrot (Höllvania) (SolNode854)
 *
 * WANN DIE ZEILE KOMMT: hier stand "vor der Reliktauswahl - auf der
 * Sternenkarte waehlt man erst den Riss und dann das Relikt". Im Spiel stimmt
 * die Reihenfolge, im LOG nicht. Nachgemessen am 28.09.2026 an zwei Rissen
 * von der Sternenkarte: die Auswahl geht auf, das Relikt wird gewaehlt, und
 * erst 0,8 bis 0,9 s NACH der Sicherheitsfrage steht die Mission im Log. Fuer
 * die erste Auswahl einer Rissmission ist die Aera also nicht zu haben; fuer
 * jede weitere in derselben Mission schon (siehe RE_MISSION_LOADED).
 *
 * NUR DIE KENNUNG, NICHT DER NAME: die zweite Zeile traegt den Missionstitel in
 * der SPRACHE DES SPIELS ("Höllvania"). Ein Abgleich darueber haette bei jeder
 * anderen Spracheinstellung ins Leere gegriffen. SolNode854 ist ueberall
 * dasselbe.
 *
 * NICHT NUR "SolNode": nachgemessen an den 30 offenen Rissen vom 14.09.2026
 * tragen sie drei verschiedene Praefixe - SolNode75 (Cervantes), SettlementNode1
 * (Roche) und CrewBattleNode515 (Railjack, Luckless Expanse). Eine Regel auf
 * SolNode haette ein Drittel der Risse stumm uebergangen.
 *
 * WIE EIN RISS DASTEHT, nachgemessen am 28.09.2026:
 *   Set squad mission: {"difficulty":"","voidTier":"VoidT4","quest":"",
 *                       "name":"SolNode195_ActiveMission"}
 * Zweierlei daran ist wichtig:
 *   - Der Name traegt "_ActiveMission" hinten dran. Die Knotentabelle kennt
 *     nur "SolNode195" - mit dem Zusatz fand fissureForNode keinen Riss, und
 *     der Aera-Filter blieb bei Rissmissionen stumm. Knotenkennungen tragen
 *     nie einen Unterstrich (452 von 452 in sol-nodes.json), also ist alles
 *     ab dem ersten der Zusatz.
 *   - voidTier nennt die Aera selbst, ohne Umweg ueber die Rissliste des
 *     Weltzustands - und damit auch dann, wenn die gerade nicht erreichbar ist.
 *
 * Dieselbe Zeile steht auch in RE_SELECT_CLOSED - wer eine Mission setzt, ist
 * nicht mehr in der Reliktauswahl. Beides gilt, und beides wird gemeldet:
 * dieser Zweig steht vor der Auswertung der Auswahl und gibt die Zeile weiter.
 */
const RE_SQUAD_MISSION = /Set squad mission:\s*(\{[^}]*\})/;

/**
 * Die Mission, die gerade GELADEN wird - also die, in der man dann steht.
 *
 * Nachgemessen am 28.09.2026:
 *    671.339  Sys [Info]: Client loaded {"difficulty":"","voidTier":"VoidT6",
 *             "quest":"","name":"SolNode232_ActiveMission"} with MissionInfo:
 *   1802.003  Script [Info]: ThemedSquadOverlay.lua: Host loading
 *             {"difficulty":0.5,"name":"IceBladeHUB_HUB"} with MissionInfo:
 *
 * WARUM ES DIESE ZEILE BRAUCHT: "Set squad mission" haelt nicht durch. Beim
 * Start der Mission, 2,9 s danach, kommt MatchingService::LeaveSquad - und
 * das loescht den Riss (RE_LEFT_MISSION). Zwischen zwei Runden einer
 * Endlosmission, genau dort, wo die Reliktauswahl alle paar Minuten
 * wiederkommt, war die Aera damit nie bekannt. Diese Zeile kommt NACH dem
 * Verlassen der Gruppe (665.668 -> 671.339) und gilt, bis man wieder im
 * Schiff ist oder etwas anderes laedt.
 *
 * Ohne voidTier heisst sie deshalb auch etwas: kein Riss. Der alte wandert
 * dann nicht in den Hub oder die naechste gewoehnliche Mission mit.
 */
const RE_MISSION_LOADED = /(?:Client loaded|Host loading)\s+(\{[^}]*\})\s+with MissionInfo/;

/* VoidT1 bis VoidT6 -> Aera. Dieselbe Zaehlung wie in den Reliktpfaden
   (T1VoidProjection... ist Lith, siehe inventory-items.js). Im Log
   nachgemessen: VoidT4 bei "Hydron (Sedna) - Axi Fissure", eingelegt wurde
   ein Axi-Relikt; VoidT6 bei "Tuvul Commons (Zariman) - Omnia Fissure". */
const TIER_BY_VOID = {
  VoidT1: 'Lith', VoidT2: 'Meso', VoidT3: 'Neo', VoidT4: 'Axi', VoidT5: 'Requiem', VoidT6: 'Omnia'
};

/**
 * Das Missions-JSON aus einer der beiden Zeilen -> { node, name, tier }.
 *
 * Mit zwei Suchen statt JSON.parse: die Reihenfolge der Felder ist nicht
 * dieselbe wie in der aelteren Messung oben, und ein Feld, das DE einmal
 * anders schreibt, soll nur dieses Feld kosten und nicht die ganze Zeile.
 *
 * `name` ist die Kennung, wie sie dasteht (mit Zusatz), `node` der Knoten
 * ohne ihn - oder null, wenn es kein Knoten ist (Hubs wie "IceBladeHUB_HUB").
 */
export function readMission(json) {
  const name = /"name"\s*:\s*"([^"]*)"/.exec(json)?.[1] || '';
  const id = name.split('_')[0];
  const tier = TIER_BY_VOID[/"voidTier"\s*:\s*"(\w+)"/.exec(json)?.[1]] || null;
  return { node: /^\w*Node\w+$/.test(id) ? id : null, name: name || null, tier };
}

/** Zurueck im Schiff heisst: keine Mission mehr im Blick. */
const RE_LEFT_MISSION = /MatchingService::LeaveSquad|Created\s+\S*ThemedMainMenu\.swf/;

/**
 * Warframe meldet selbst, wenn es den Vordergrund verliert und zurueckbekommt:
 *
 *   19941.344  Sys [Info]: WM_ACTIVATEAPP 0
 *   19949.453  Sys [Info]: WM_ACTIVATEAPP 1
 *
 * Nachgemessen am 28.09.2026: 118 solche Zeilen in einer Sitzung, streng
 * abwechselnd, sieben davon bei offener Reliktauswahl - Kaan hatte die
 * Konsole im Schiff offen und war zwischendurch in einem anderen Fenster.
 * Genau dann stuende ein Feld ueber diesem anderen Fenster statt ueber dem
 * Spiel.
 */
const RE_ACTIVATE = /\bWM_ACTIVATEAPP ([01])\s*$/;

/**
 * Eine neue Fluesterunterhaltung.
 *
 * Nachgemessen am 26.09.2026 an einer echten Nachricht:
 *   ChatRedux.lua: ChatRedux::AddTab: Adding tab with channel name: FiFlynn to index 7
 * "F" + Absender. Die anderen Reiter tragen andere Praefixe (C Clan, A Allianz,
 * S Squad, H_ Region, Q/R/T Handel und Rekrutierung) - nur F ist Fluestern.
 *
 * NUR DIE ERSTE NACHRICHT: der Reiter geht einmal auf; weitere Nachrichten im
 * offenen Reiter schreibt das Log nicht mit. Den Text schreibt es gar nicht -
 * der kommt aus dem Speicher, siehe whispers.js.
 *
 * DAS PLATTFORM-SYMBOL: beim zweiten Test stand hinter dem Namen ein Zeichen
 * aus dem privaten Bereich (UTF-8 EE 80 80), direkt vor " to index":
 *   channel name: FTharun.tco<U+E000> to index 7
 * Bei iFlynn fehlte es. Das Muster nahm nur den Fall ohne Symbol - und die
 * Meldung blieb aus. Deshalb jetzt: alles bis zum Leerzeichen, und was nicht
 * ASCII ist, faellt aus dem Namen heraus.
 */
const RE_WHISPER_TAB = /ChatRedux::AddTab: Adding tab with channel name: F(\S+) to index/;

/* Beim Einloggen baut der Chat seine Reiter neu auf. Ob dabei offene
   Fluesterreiter wiederkommen, ist nicht gemessen - kaemen sie, waeren es
   lauter alte Unterhaltungen, gemeldet als neue. Die Reiter folgen dem
   Verbindungsaufbau gemessen nach 0,7 s; zehn Sekunden sind reichlich. */
const RE_CHAT_CONNECTED = /IRC connected/;
const WHISPER_LOGIN_QUIET_SEC = 10;

const STATE_BY_TAG = {
  RADIANT: 'Radiant', FLAWLESS: 'Flawless', EXCEPTIONAL: 'Exceptional', INTACT: 'Intact'
};

/** Warframes Laufzeituhr vorn in der Zeile, in Sekunden. */
function logSeconds(line) {
  const m = /^(\d+\.\d+)/.exec(line);
  return m ? parseFloat(m[1]) : Date.now() / 1000;
}

export class LogWatcher extends EventEmitter {
  constructor(file = DEFAULT_LOG_PATH()) {
    super();
    this.file = file;
    this.offset = 0;
    this.rest = '';
    this.timer = null;
    this.pendingReward = null;   // { uniqueName, at }
    this.relicSelectActive = false;
    this.relicSelectOpenedAt = 0;
    this.relicSelectArmedAt = 0;
    this.relicSelectReady = false;
    /* Die Vorlaeufer, an denen sich ablesen laesst, woher eine Auswahl kam -
       siehe RE_CONSOLE_OPEN. Laufzeituhr des Spiels, in Sekunden. */
    this.lastConsoleAt = null;
    this.lastRewardClosedAt = null;
    this.lastInputFilter = null;
    this.selectGuard = null;      // Notbremse, siehe armSelectGuard()
    this.busy = false;
    this.lastActivity = 0;          // Zeitstempel des letzten game-activity
    this.chatConnectedAt = null;    // Laufzeituhr beim Chat-Login, siehe RE_CHAT_CONNECTED
    /* Zeilen, die ueber den Debugkanal kamen und deren Echo in der Datei noch
       aussteht. Siehe GESEHEN_MAX. */
    this.gesehen = new Set();
    this.echos = 0;                 // nur fuer die Bilanz beim Beenden
    this.ueberDbwin = 0;
    /* Zeilen, die nur ueber die Datei kamen, OBWOHL der Debugkanal lief. Jede
       einzelne davon hat der Kanal verpasst - siehe handleLine. */
    this.verpasst = 0;
    /* Der Umwandeln-Bildschirm fuer Rivens - eigener Zustand in eigenem
       Modul, siehe riven-cycle.js. Hier kommt nur jede Zeile einmal an. */
    this.rivenCycle = new RivenCycleWatch((type, data) =>
      this.emit('riven-cycle', { type, ...data, at: Date.now() }));
  }

  /**
   * Beginnt am ENDE der Datei, nicht am Anfang: beim Start soll nicht die
   * letzte Belohnung von vorgestern als frischer Fund erscheinen.
   */
  async start() {
    if (this.timer) return;
    try {
      const st = await stat(this.file);
      this.offset = st.size;
    } catch {
      this.offset = 0;   // Datei kommt vielleicht noch, wenn das Spiel startet
    }
    this.timer = setInterval(() => this.tick(), POLL_MS);

    /* Der Debugkanal obendrauf. Er liefert erst, wenn setGamePids() gesagt
       hat, welche Prozesse Warframe sind - vorher geht dort gar nichts hinaus,
       denn der Kanal ist systemweit und traegt auch die Ausgabe fremder
       Programme. */
    dbwin.start(zeilen => {
      for (const zeile of zeilen) {
        this.ueberDbwin++;
        if (this.gesehen.size >= GESEHEN_MAX) {
          /* Aelteste zuerst: Set behaelt die Einfuegereihenfolge. */
          this.gesehen.delete(this.gesehen.values().next().value);
        }
        this.gesehen.add(zeile);
        this.handleLine(zeile, 'dbwin');
      }
    });

    this.emit('started', { file: this.file });
  }

  /**
   * Welche Prozesse als Warframe gelten.
   *
   * Muss aufgerufen werden, sonst bleibt der Debugkanal stumm - das ist
   * Absicht und keine Anlaufhuerde: er traegt die Debugausgabe JEDES Programms
   * auf diesem Rechner, und was nicht vom Spiel kommt, soll gar nicht erst zu
   * Text werden.
   */
  setGamePids(pids) {
    dbwin.setPids(pids);
  }

  /** Laeuft der Debugkanal, und hoert noch jemand anders mit? */
  dbwinStatus() {
    return { aktiv: dbwin.isActive(), fremderZuhoerer: dbwin.otherListener() };
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    clearTimeout(this.selectGuard);
    this.selectGuard = null;
    /* Nicht abgewartet: stop() wird beim Herunterfahren aufgerufen und ist
       synchron. Der Arbeiter haengt an einem Abbruchfeld im gemeinsamen
       Speicher und geht von selbst, spaetestens nach einem Warteruf. */
    dbwin.stop().catch(() => {});
  }

  async tick() {
    /* Ein langsamer Lesevorgang darf sich nicht mit dem naechsten ueberlappen. */
    if (this.busy) return;
    this.busy = true;
    try {
      await this.readNew();
    } catch {
      /* Datei gerade nicht lesbar (Spielstart, Drehung) - der naechste
         Durchlauf versucht es erneut. */
    } finally {
      this.busy = false;
    }
  }

  async readNew() {
    if (!existsSync(this.file)) { this.offset = 0; return; }

    const st = await stat(this.file);
    /* Kleiner als zuletzt: das Spiel wurde neu gestartet und hat die Datei neu
       angelegt. Ohne diesen Zweig laeuft der Zeiger ins Leere. */
    if (st.size < this.offset) { this.offset = 0; this.rest = ''; }
    if (st.size === this.offset) return;

    const length = st.size - this.offset;
    const fh = await open(this.file, 'r');
    try {
      const buf = Buffer.alloc(length);
      await fh.read(buf, 0, length, this.offset);
      this.offset = st.size;

      /* Der letzte Abschnitt kann mitten in einer Zeile enden - Rest
         aufheben, sonst zerfaellt eine Meldung in zwei unbrauchbare Haelften. */
      const text = this.rest + buf.toString('utf8');
      const lines = text.split(/\r?\n/);
      this.rest = lines.pop() ?? '';

      for (const line of lines) {
        /* Schon ueber den Debugkanal gekommen? Dann ist das hier das Echo.
           Der Eintrag faellt dabei heraus - jede Zeile wird genau einmal
           nachgeliefert, und was bleibt, waere nur noch Ballast. */
        if (this.gesehen.delete(line)) { this.echos++; continue; }
        this.handleLine(line, 'datei');
      }
    } finally {
      await fh.close();
    }
  }

  /**
   * Eine Logzeile auswerten.
   *
   * `quelle` ist 'dbwin' oder 'datei' und aendert am Auswerten nichts - eine
   * Zeile ist eine Zeile. Sie steht hier, weil sie fuer die Fehlersuche der
   * entscheidende Unterschied ist: kommt eine Meldung ueber die Datei, obwohl
   * der Debugkanal laeuft, hat er sie verpasst, und dann hoert wahrscheinlich
   * ein anderes Programm mit.
   */
  handleLine(line, quelle = 'datei') {
    if (quelle === 'datei' && dbwin.isActive()) this.verpasst++;

    /* Vor allen Abzweigungen unten: die meisten kehren nach ihrem Treffer
       zurueck, und eine Dialogzeile, die dort haengen bliebe, fehlte hier. */
    this.rivenCycle.handleLine(line);

    if (RE_CHAT_CONNECTED.test(line)) {
      this.chatConnectedAt = logSeconds(line);
      return;
    }

    const activate = RE_ACTIVATE.exec(line);
    if (activate) {
      this.emit('game-focus', { active: activate[1] === '1', at: Date.now() });
      return;
    }

    const whisper = RE_WHISPER_TAB.exec(line);
    if (whisper) {
      const sec = logSeconds(line);
      const afterLogin = this.chatConnectedAt != null && sec >= this.chatConnectedAt &&
        sec - this.chatConnectedAt < WHISPER_LOGIN_QUIET_SEC;
      const from = whisper[1].replace(/[^\x21-\x7E]/g, '');
      if (!afterLogin && from) this.emit('whisper', { from, at: Date.now() });
      return;
    }

    const equip = RE_EQUIP.exec(line);
    if (equip) {
      this.emit('relic-equipped', {
        tier: equip[1],
        name: equip[2],
        state: STATE_BY_TAG[(equip[3] || '').toUpperCase()] || 'Intact',
        at: Date.now()
      });
      return;
    }

    /* Ein neuer Belohnungsbildschirm - die Zaehlung beginnt von vorn.
     *
     * UND ER WIRD GEMELDET. Diese Zeile stand hier immer, wurde aber nur zum
     * Zuruecksetzen des Zaehlers benutzt und dann verworfen - dabei ist sie
     * das FRUEHESTE, was das Log ueber den Belohnungsbildschirm zu sagen hat.
     *
     * Nachgemessen an EE.log:
     *   15977.878  OpenVoidProjectionRewardScreenRMI   <- diese Zeile
     *   15978.043  Client got reward info from ...     +165 ms
     *   15978.572  ... gets reward ...                 +694 ms
     *   15978.636  Got rewards                         +758 ms  <- bisheriger Ausloeser
     *
     * Volle 758 Millisekunden lag also fest, dass der Bildschirm aufgeht,
     * bevor irgendetwas passierte. Zum LESEN taugt der Zeitpunkt nicht - die
     * Karten sind dann noch nicht gezeichnet, "Missing icon data!" kommt erst
     * spaeter. Zum ANZEIGEN taugt er sehr wohl: das Dock kann schon dastehen,
     * wenn die Namen eintreffen, statt erst danach aufzugehen.
     */
    if (RE_REWARD_OPEN.test(line)) {
      this.rewardPeers = new Set();
      this.emit('relic-screen-open', { at: Date.now() });
      return;
    }

    const peer = RE_REWARD_PEER.exec(line);
    if (peer) {
      /* Nur die Anzahl zaehlt. Die Kennung dient hier als Unterscheidung
         zwischen zwei Mitspielern und verlaesst dieses Modul nicht. */
      if (!this.rewardPeers) this.rewardPeers = new Set();
      this.rewardPeers.add(peer[1]);
      return;
    }

    const reward = RE_OWN_REWARD.exec(line);
    if (reward) {
      this.pendingReward = { uniqueName: reward[1], at: Date.now() };
      return;
    }

    if (RE_READY.test(line)) {
      const fresh = this.pendingReward &&
        Date.now() - this.pendingReward.at < REWARD_MAX_AGE_MS;

      this.emit('relic-reward', {
        /* Ohne eigenen Fund trotzdem melden: der Bildschirm ist offen, und
           der Countdown allein ist schon etwas wert. */
        uniqueName: fresh ? this.pendingReward.uniqueName : null,
        /* Wie viele Karten zu erwarten sind. 0 heisst "unbekannt" - dann
           soll die Gegenseite ihre eigene Annahme behalten, nicht eine Null
           als Zielmarke nehmen. */
        players: this.rewardPeers ? this.rewardPeers.size : 0,
        seconds: 15,
        at: Date.now()
      });
      this.pendingReward = null;
      this.rewardPeers = null;
      return;
    }

    const timer = RE_TIMER.exec(line);
    if (timer) {
      const seconds = Number(timer[1]);
      /* "Initialize timer nil 0" kommt beim Schliessen - keine neue Laufzeit. */
      if (seconds > 0) this.emit('relic-timer', { seconds });
      /* Dieselbe Zeile ist auch die Uhr der Reliktauswahl zwischen zwei
         Runden - siehe SELECT_TIMER_WINDOW_S. */
      if (seconds > 0 && this.relicSelectActive) this.noteSelectCountdown(seconds, logSeconds(line));
      return;
    }

    if (RE_CLOSED.test(line)) {
      this.lastRewardClosedAt = logSeconds(line);
      this.emit('relic-closed', {});
      return;
    }

    /* Der Knoten, auf den die Gruppe zielt. VOR der Auswertung der
       Reliktauswahl, weil dieselbe Zeile auch deren Schlusssignal ist - sie
       wird hier nur mitgelesen und nicht verbraucht.

       `loaded` unterscheidet die beiden Quellen: das Ziel der Gruppe darf
       ohne voidTier weiter ueber die Rissliste nachgeschlagen werden (so war
       es immer), eine GELADENE Mission ohne voidTier ist dagegen sicher
       keine Rissmission - siehe RE_MISSION_LOADED. */
    const squad = RE_SQUAD_MISSION.exec(line);
    const loaded = squad ? null : RE_MISSION_LOADED.exec(line);
    if (squad) {
      const m = readMission(squad[1]);
      if (m.node || m.tier) this.emit('squad-mission', { ...m, loaded: false, at: Date.now() });
    } else if (loaded) {
      this.emit('squad-mission', { ...readMission(loaded[1]), loaded: true, at: Date.now() });
    } else if (RE_LEFT_MISSION.test(line)) {
      this.emit('squad-mission', { node: null, name: null, tier: null, at: Date.now() });
    }

    const logSec = logSeconds(line);

    if (!this.relicSelectActive && RE_SELECT_OPEN.test(line)) {
      this.relicSelectActive = true;
      this.relicSelectOpenedAt = logSec;
      this.relicSelectReady = false;
      /* Faengt der Mitschnitt erst bei der Anmeldezeile an - etwa weil die App
         mitten in der Reliktauswahl gestartet wurde -, ist der Bildschirm mit
         genau dieser Zeile schon scharf. Sonst wartet der Schluss auf eine
         Anmeldung, die nicht mehr kommt. */
      this.relicSelectArmedAt = RE_SELECT_ARMED.test(line) ? logSec : 0;
      this.armSelectGuard();
      this.emit('relic-select-open', { at: Date.now(), via: this.selectVia(logSec) });
      return;
    }

    /* Die Vorlaeufer mitschreiben, die sagen, woher die NAECHSTE Auswahl
       kommt. Hinter der Pruefung oben: die Zeilen gehoeren immer zu dem, was
       davor geschah. */
    if (RE_CONSOLE_OPEN.test(line)) this.lastConsoleAt = logSec;
    const filter = RE_INIT_MAPPING.exec(line);
    if (filter && !this.relicSelectActive) this.lastInputFilter = filter[1];

    /* ----- Spielaktivitaet: Missionsende, Orbiter, Handel --------------- */
    const trigger =
      RE_MISSION_END.test(line) ? 'mission_end' :
      RE_ORBITER.test(line)     ? 'orbiter'     :
      RE_TRADE.test(line)       ? 'trade'       : null;

    if (trigger) {
      const now = Date.now();
      if (now - this.lastActivity >= ACTIVITY_DEBOUNCE_MS) {
        this.lastActivity = now;
        this.emit('game-activity', { trigger, at: now });
      }
    }

    if (!this.relicSelectActive) return;

    if (RE_SELECT_ARMED.test(line)) { this.relicSelectArmedAt = logSec; return; }

    if (RE_SELECT_READY.test(line)) {
      /* Zwischen zwei Runden kommt der Aufbau doppelt - gemeldet wird er einmal. */
      if (!this.relicSelectReady) {
        this.relicSelectReady = true;
        this.emit('relic-select-ready', { at: Date.now(), after: Math.round((logSec - this.relicSelectOpenedAt) * 1000) });
      }
      return;
    }

    /* Die 0.15 s halten die Zeilen ab, die zum Aufgehen selbst gehoeren -
       der Bildschirm meldet beim Oeffnen seinen eigenen Eingabefilter an. */
    if (logSec - this.relicSelectOpenedAt <= 0.15 && logSec >= this.relicSelectOpenedAt) return;

    const mapping = this.relicSelectArmedAt && logSec > this.relicSelectArmedAt
      ? RE_INIT_MAPPING.exec(line)
      : null;
    const leftMenu = mapping && !/MenuInputFilter$/.test(mapping[1]);

    if (leftMenu || RE_SELECT_CLOSED.test(line)) this.closeSelect();
  }

  /** Woher die Auswahl kam, die in `sec` aufging - siehe RE_CONSOLE_OPEN. */
  selectVia(sec) {
    const seit = t => (t != null && sec >= t ? sec - t : Infinity);
    if (seit(this.lastConsoleAt) <= VIA_CONSOLE_S) return 'console';
    if (seit(this.lastRewardClosedAt) <= VIA_ROUND_S) return 'round';
    if (/MapReduxInputFilter$/.test(this.lastInputFilter || '')) return 'map';
    return null;
  }

  closeSelect() {
    if (!this.relicSelectActive) return;
    this.relicSelectActive = false;
    clearTimeout(this.selectGuard);
    this.selectGuard = null;
    this.emit('relic-select-closed', { at: Date.now() });
  }

  /**
   * Notbremse gegen eine Anzeige, die stehen bleibt.
   *
   * Der Schluss haengt an einer Logzeile. Bleibt die aus - das Spiel stuerzt
   * ab, DE benennt eine Zeile um, das Log wird gedreht -, klebt die Empfehlung
   * ueber dem Bild und niemand wird sie los ausser ueber die Tastenkombination.
   * Ueber einem laufenden Spiel ist das die schlechteste aller Eigenschaften,
   * deshalb entscheidet ab jetzt die Uhr mit.
   *
   * Grosszuegig bemessen: vor einer Rissmission steht man auch mal zwei
   * Minuten vor seinen Relikten und rechnet.
   */
  armSelectGuard() {
    clearTimeout(this.selectGuard);
    this.selectGuard = setTimeout(() => this.closeSelect(), SELECT_MAX_MS);
    this.selectGuard.unref?.();
  }

  /**
   * Die Auswahl hat eine Uhr genannt - dann gilt die statt der fuenf Minuten.
   *
   * Nur eine Zeitangabe, die unmittelbar nach dem Aufgehen kommt, gehoert zur
   * Auswahl (siehe SELECT_TIMER_WINDOW_S). Ob sie das tut, entscheidet die
   * Spielzeit der beiden Zeilen, nicht ihre Ankunft: kommen sie in einem
   * Schwung aus der gepufferten Datei, sagt die Ankunft darueber nichts.
   */
  noteSelectCountdown(seconds, sec) {
    const since = sec - this.relicSelectOpenedAt;
    if (!(since >= 0 && since <= SELECT_TIMER_WINDOW_S)) return;
    clearTimeout(this.selectGuard);
    this.selectGuard = setTimeout(() => this.closeSelect(), seconds * 1000 + SELECT_TIMER_GRACE_MS);
    this.selectGuard.unref?.();
  }
}
