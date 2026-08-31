/**
 * Sichere Bruecke zwischen Renderer und Main-Prozess.
 *
 * Der Renderer bekommt bewusst KEINEN Node-Zugriff (contextIsolation an,
 * nodeIntegration aus). Nur die hier aufgefuehrten Funktionen sind erreichbar.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  /* Ersteinrichtung.
     Die Account-ID geht hier nur HINEIN. setupState() meldet lediglich, ob
     eine eingerichtet ist, und die letzten vier Zeichen zum Wiedererkennen -
     nie den vollen Wert. Das haelt die Zusage aus main.js ein, dass die
     Kennung den Hauptprozess nicht verlaesst, und kostet nur, dass man sie
     beim Aendern neu eintippt. */
  getSetupState:   ()          => ipcRenderer.invoke('setup:state'),
  detectSetup:     ()          => ipcRenderer.invoke('setup:detect'),
  saveSetup:       (data)      => ipcRenderer.invoke('setup:save', data),
  setInventoryScan:(on)        => ipcRenderer.invoke('setup:setScan', on),
  setAutoSync:     (on)        => ipcRenderer.invoke('setup:setAutoSync', on),
  openExternal:    (url)       => ipcRenderer.invoke('shell:open', url),
  getDashboard:    ()          => ipcRenderer.invoke('dashboard:get'),
  refreshProfile:  ()          => ipcRenderer.invoke('profile:refresh'),
  resolveGoal:     (u)         => ipcRenderer.invoke('goal:resolve', u),
  addGoal:         (u, n)      => ipcRenderer.invoke('goal:add', u, n),
  removeGoal:      (u)         => ipcRenderer.invoke('goal:remove', u),
  toggleGoal:      (u)         => ipcRenderer.invoke('goal:toggle', u),
  setNote:         (u, t)      => ipcRenderer.invoke('note:set', u, t),
  setGeneralNotes: (t)         => ipcRenderer.invoke('note:general', t),
  searchItems:     (q)         => ipcRenderer.invoke('items:search', q),
  getItemDetails:  (u)         => ipcRenderer.invoke('item:details', u),
  getWorldState:   (force)     => ipcRenderer.invoke('worldstate:get', force),
  /* Wochenrotation - stammt aus demselben Abruf wie der Weltzustand,
     siehe core/weekly.js. */
  getWeekly:       (force)     => ipcRenderer.invoke('weekly:get', force),
  setWeeklyDone:   (key, resetAt, done) => ipcRenderer.invoke('weekly:setDone', key, resetAt, done),
  getFarmingGuide: (q)         => ipcRenderer.invoke('farming:get', q),
  getMiningGuide:  (q)         => ipcRenderer.invoke('mining:get', q),
  getDucatsData:   ()          => ipcRenderer.invoke('ducats:get'),
  fetchDucatPrices:(slugs)     => ipcRenderer.invoke('ducats:fetchPrices', slugs),
  /* Baros Angebot gegen das eigene Inventar. Steht im Dukaten-Tab, weil es
     dieselbe Waehrung ausgibt, die dort eingenommen wird. */
  getBaroOffer:    ()          => ipcRenderer.invoke('baro:get'),
  /* Inventar: get liest nur die lokale Datei, refresh geht als einziger Weg
     ins Netz. Zugangsdaten bleiben im Hauptprozess - hier kommt nie ein
     accountId oder nonce an. */
  getInventory:    ()          => ipcRenderer.invoke('inventory:get'),
  getFoundry:      ()          => ipcRenderer.invoke('foundry:get'),
  /* Die Bauketten haengen am Katalog, nicht am Inventar - deshalb ein
     eigener Kanal: sie stehen auch, bevor je etwas abgerufen wurde. */
  getCraftChains:  ()          => ipcRenderer.invoke('foundry:chains'),
  refreshInventory:()          => ipcRenderer.invoke('inventory:refresh'),
  /* Auto-Sync: der Hauptprozess meldet, wenn im Hintergrund frische Daten
     eingetroffen sind (updated) oder ein Abruf am Rate-Limit gescheitert
     ist und nur ein Hinweis bleibt (stale). */
  onInventoryUpdated:(cb)      => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('inventory:updated', handler);
    return () => ipcRenderer.removeListener('inventory:updated', handler);
  },
  onInventoryStale:(cb)        => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('inventory:stale', handler);
    return () => ipcRenderer.removeListener('inventory:stale', handler);
  },
  /* Datenblatt einer Mod oder eines Arcanes. Der Inventar-Eintrag wandert
     mit, damit der Hauptprozess die Inventardatei nicht je Klick neu liest. */
  getUpgradeDetails:(u, owned) => ipcRenderer.invoke('upgrade:details', u, owned),
  getRelicDetails: (u)         => ipcRenderer.invoke('relic:details', u),
  relicsForItem:   (name)      => ipcRenderer.invoke('relics:forItem', name),
  getChecklist:    (cat)       => ipcRenderer.invoke('checklist:get', cat),
  getBuilds:       ()          => ipcRenderer.invoke('builds:get'),
  importBuild:     (url)       => ipcRenderer.invoke('builds:import', url),
  removeBuild:     (id)        => ipcRenderer.invoke('builds:remove', id),
  createBuild:     (item, name)=> ipcRenderer.invoke('builds:create', item, name),
  setBuildSlot:    (id, i, s)  => ipcRenderer.invoke('builds:setSlot', id, i, s),
  setBuildArcane:  (id, i, s)  => ipcRenderer.invoke('builds:setArcane', id, i, s),
  setBuildMeta:    (id, patch) => ipcRenderer.invoke('builds:setMeta', id, patch),
  searchMods:      (q, item)   => ipcRenderer.invoke('mods:search', q, item),
  searchArcanes:   (q, item)   => ipcRenderer.invoke('arcanes:search', q, item),
  itemsForBuild:   (q, cat)    => ipcRenderer.invoke('items:forBuild', q, cat),
  buildCategories: ()          => ipcRenderer.invoke('items:buildCategories'),
  getPolarities:   ()          => ipcRenderer.invoke('mods:polarities'),
  setModOwned:     (u, owned)  => ipcRenderer.invoke('mods:setOwned', u, owned),
  setManyModsOwned:(list, own) => ipcRenderer.invoke('mods:setManyOwned', list, own),
  getNotifications:()          => ipcRenderer.invoke('notifications:get'),
  saveNotifications:(patch)    => ipcRenderer.invoke('notifications:save', patch),
  testNotification:()          => ipcRenderer.invoke('notifications:test'),
  onNotificationEvent:(cb)     => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('notification:event', handler);
    return () => ipcRenderer.removeListener('notification:event', handler);
  },
  onNavigateTab:   (cb)        => {
    const handler = (_e, tab, subpane) => cb(tab, subpane);
    ipcRenderer.on('navigate:tab', handler);
    return () => ipcRenderer.removeListener('navigate:tab', handler);
  },
  /* Overlay: toggleOverlay und overlayState liefern denselben Zustand
     ({ overlay, clickThrough, opacity }), damit die Oberflaeche nach jedem
     Wechsel nur eine Quelle auszuwerten hat. */
  toggleOverlay:   ()          => ipcRenderer.invoke('window:overlay'),
  overlayState:    ()          => ipcRenderer.invoke('window:overlayState'),
  setClickThrough: (on)        => ipcRenderer.invoke('window:clickThrough', on),
  setOverlayHover: (over)      => ipcRenderer.invoke('window:hover', over),
  setInteract:     (on)        => ipcRenderer.invoke('window:interact', on),
  setOverlayOpacity:(value)    => ipcRenderer.invoke('window:opacity', value),
  onOverlayChanged:(cb)        => {
    const handler = (_e, st) => cb(st);
    ipcRenderer.on('overlay:changed', handler);
    return () => ipcRenderer.removeListener('overlay:changed', handler);
  },
  overlayHotkey:   ()          => ipcRenderer.invoke('window:hotkey'),
  /* Einstellungs-Tab: Tastenkuerzel lesen und aendern. setHotkeys meldet
     zurueck, welche Kombination das System nicht hergegeben hat. */
  getSettings:     ()          => ipcRenderer.invoke('settings:get'),
  setHotkeys:      (patch)     => ipcRenderer.invoke('settings:hotkeys', patch),
  setOverlayEnabled:(on)       => ipcRenderer.invoke('settings:overlayEnabled', on),
  setRelicAutoShow:(on)        => ipcRenderer.invoke('settings:relicAutoShow', on),
  setRelicScan:    (on)        => ipcRenderer.invoke('settings:relicScan', on),
  setRelicTags:    (on)        => ipcRenderer.invoke('settings:relicTags', on),
  /* Preisschilder im Spiel - nur das Schilder-Fenster hoert darauf. */
  onTags:          (cb)        => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('tags:show', handler);
    return () => ipcRenderer.removeListener('tags:show', handler);
  },
  onTagsHide:      (cb)        => {
    const handler = () => cb();
    ipcRenderer.on('tags:hide', handler);
    return () => ipcRenderer.removeListener('tags:hide', handler);
  },
  /* Relikt-Belohnungen aus EE.log. Nur der Item-Pfad kommt hier an -
     AccountIds bleiben in logwatch.js und werden dort verworfen. */
  getCurrentRelic: ()          => ipcRenderer.invoke('relic:current'),
  onRelicReward:   (cb)        => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('relic:reward', handler);
    return () => ipcRenderer.removeListener('relic:reward', handler);
  },
  onRelicTimer:    (cb)        => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('relic:timer', handler);
    return () => ipcRenderer.removeListener('relic:timer', handler);
  },
  onRelicClosed:   (cb)        => {
    const handler = () => cb();
    ipcRenderer.on('relic:closed', handler);
    return () => ipcRenderer.removeListener('relic:closed', handler);
  },
  /* Relikt-Auswahl & Empfehlungen */
  getRecommendedRelics:()      => ipcRenderer.invoke('relics:recommended'),
  getVoidTraces:   ()          => ipcRenderer.invoke('inventory:traces'),
  onRelicSelectOpen:(cb)       => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('relic:select-open', handler);
    return () => ipcRenderer.removeListener('relic:select-open', handler);
  },
  onRelicSelectClosed:(cb)     => {
    const handler = () => cb();
    ipcRenderer.on('relic:select-closed', handler);
    return () => ipcRenderer.removeListener('relic:select-closed', handler);
  },
  /* Der Bestand hat sich geaendert, ohne dass jemand danach gefragt hat -
     zum Beispiel, weil gerade ein Relikt geoeffnet wurde. Traegt dieselbe
     Ladung wie getRecommendedRelics(). */
  onRelicsChanged: (cb)        => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('relics:changed', handler);
    return () => ipcRenderer.removeListener('relics:changed', handler);
  },
  /* Merkliste des Relikt-Planers. Sie steht in derselben Datei wie Ziele
     und Notizen - hier laufen nur Kennungen hin und ausgerechnete Zeilen
     zurueck. Die Aenderung meldet der Hauptprozess an BEIDE Fenster, damit
     Planer und Overlay nach einem Klick gleich stehen. */
  getTrackedRelics:()          => ipcRenderer.invoke('relics:tracked'),
  toggleTrackedRelic:(entry)   => ipcRenderer.invoke('relics:toggleTracked', entry),
  clearTrackedRelics:()        => ipcRenderer.invoke('relics:clearTracked'),
  onTrackedRelicsChanged:(cb)  => {
    const handler = (_e, list) => cb(list);
    ipcRenderer.on('relics:tracked-changed', handler);
    return () => ipcRenderer.removeListener('relics:tracked-changed', handler);
  },
  /* Handel auf warframe.market.
     Das Passwort geht NUR durch tradeSignIn und nur in diese eine Richtung.
     Es kommt nie zurueck: tradeAuthState meldet Anzeigename und Plattform,
     niemals Token oder Zugangsdaten. Dieselbe Zusage wie bei der AccountId
     weiter oben. */
  tradeAuthState:  ()          => ipcRenderer.invoke('trade:authState'),
  tradeVerify:     ()          => ipcRenderer.invoke('trade:verify'),
  tradeSignIn:     (mail, pw)  => ipcRenderer.invoke('trade:signIn', mail, pw),
  tradeSignOut:    ()          => ipcRenderer.invoke('trade:signOut'),
  tradeDiagnose:   ()          => ipcRenderer.invoke('trade:diagnose'),
  /* Anwesenheit: "ingame" setzen, solange Warframe laeuft. Auch hier geht
     nur der Zustand nach draussen ('off' | 'connecting' | 'ingame' |
     'error'), nie das Token, mit dem die Verbindung angemeldet wird. */
  tradeAutoStatus:    ()       => ipcRenderer.invoke('trade:autoStatus'),
  tradeSetAutoStatus: (on)     => ipcRenderer.invoke('trade:setAutoStatus', on),
  onTradePresence: (cb)        => {
    const handler = (_e, st) => cb(st);
    ipcRenderer.on('trade:presence', handler);
    return () => ipcRenderer.removeListener('trade:presence', handler);
  },
  /* Orders: eigene Verkaufs- und Kaufauftraege */
  tradeOrders:     ()          => ipcRenderer.invoke('trade:orders'),
  tradeCreateOrder:(data)      => ipcRenderer.invoke('trade:createOrder', data),
  tradeUpdateOrder:(id, patch, opts) => ipcRenderer.invoke('trade:updateOrder', id, patch, opts),
  tradeDeleteOrder:(id)        => ipcRenderer.invoke('trade:deleteOrder', id),
  tradeMarkSold:   (id, info)  => ipcRenderer.invoke('trade:markSold', id, info),
  tradeOffers:     (slug, o)   => ipcRenderer.invoke('trade:offers', slug, o),
  /* Nur schreiben, nie lesen. Argus hat keinen Grund zu wissen, was jemand
     sonst in seiner Zwischenablage hat. */
  copyText:        (text)      => ipcRenderer.invoke('clip:write', text),
  tradeSearchItems:(q)         => ipcRenderer.invoke('trade:searchItems', q),
  tradeItemBySlug: (slug)      => ipcRenderer.invoke('trade:itemBySlug', slug),
  /* Contracts: Riven-, Lich- und Sister-Auktionen */
  tradeContracts:  (slug)      => ipcRenderer.invoke('trade:contracts', slug),
  tradeContractRef:()          => ipcRenderer.invoke('trade:contractReference'),
  tradeContractOffers:(o)      => ipcRenderer.invoke('trade:contractOffers', o),
  tradeCreateContract:(d)      => ipcRenderer.invoke('trade:createContract', d),
  tradeUpdateContract:(id, p)  => ipcRenderer.invoke('trade:updateContract', id, p),
  tradeCloseContract:(id, i)   => ipcRenderer.invoke('trade:closeContract', id, i),
  tradeDeleteContract:(id)     => ipcRenderer.invoke('trade:deleteContract', id),
  /* Handelsbuch - rein lokal, verlaesst den Rechner nicht */
  tradeTransactions:(o)        => ipcRenderer.invoke('trade:transactions', o),
  tradeAddTransaction:(e)      => ipcRenderer.invoke('trade:addTransaction', e),
  tradeUpdateTransaction:(i,p) => ipcRenderer.invoke('trade:updateTransaction', i, p),
  tradeRemoveTransaction:(id)  => ipcRenderer.invoke('trade:removeTransaction', id),
  tradeStatsByItem:(o)         => ipcRenderer.invoke('trade:transactionsByItem', o),
  /* Updates.
     downloadUpdate und installUpdate nehmen bewusst KEINE Adresse und keinen
     Pfad entgegen. Welche Datei geladen und welche ausgefuehrt wird, weiss
     nur der Hauptprozess aus seiner letzten Abfrage - von hier aus laesst
     sich also nichts anderes herunterladen oder starten. */
  getAppInfo:      ()          => ipcRenderer.invoke('app:info'),
  getUpdateState:  ()          => ipcRenderer.invoke('update:state'),
  checkForUpdates: ()          => ipcRenderer.invoke('update:check'),
  downloadUpdate:  ()          => ipcRenderer.invoke('update:download'),
  installUpdate:   ()          => ipcRenderer.invoke('update:install'),
  setUpdateCheck:  (on)        => ipcRenderer.invoke('update:setAuto', on),
  onUpdateChanged: (cb)        => {
    const handler = (_e, st) => cb(st);
    ipcRenderer.on('update:changed', handler);
    return () => ipcRenderer.removeListener('update:changed', handler);
  },
  minimize:        ()          => ipcRenderer.invoke('window:minimize'),
  close:           ()          => ipcRenderer.invoke('window:close')
});

