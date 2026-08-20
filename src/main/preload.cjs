/**
 * Sichere Bruecke zwischen Renderer und Main-Prozess.
 *
 * Der Renderer bekommt bewusst KEINEN Node-Zugriff (contextIsolation an,
 * nodeIntegration aus). Nur die hier aufgefuehrten Funktionen sind erreichbar.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
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
  getFarmingGuide: (q)         => ipcRenderer.invoke('farming:get', q),
  getDucatsData:   ()          => ipcRenderer.invoke('ducats:get'),
  /* Inventar: get liest nur die lokale Datei, refresh geht als einziger Weg
     ins Netz. Zugangsdaten bleiben im Hauptprozess - hier kommt nie ein
     accountId oder nonce an. */
  getInventory:    ()          => ipcRenderer.invoke('inventory:get'),
  refreshInventory:()          => ipcRenderer.invoke('inventory:refresh'),
  getChecklist:    (cat)       => ipcRenderer.invoke('checklist:get', cat),
  getBuilds:       ()          => ipcRenderer.invoke('builds:get'),
  importBuild:     (url)       => ipcRenderer.invoke('builds:import', url),
  removeBuild:     (id)        => ipcRenderer.invoke('builds:remove', id),
  createBuild:     (item, name)=> ipcRenderer.invoke('builds:create', item, name),
  setBuildSlot:    (id, i, s)  => ipcRenderer.invoke('builds:setSlot', id, i, s),
  setBuildMeta:    (id, patch) => ipcRenderer.invoke('builds:setMeta', id, patch),
  searchMods:      (q, item)   => ipcRenderer.invoke('mods:search', q, item),
  itemsForBuild:   (q)         => ipcRenderer.invoke('items:forBuild', q),
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
  toggleOverlay:   ()          => ipcRenderer.invoke('window:overlay'),
  overlayHotkey:   ()          => ipcRenderer.invoke('window:hotkey'),
  minimize:        ()          => ipcRenderer.invoke('window:minimize'),
  close:           ()          => ipcRenderer.invoke('window:close')
});

