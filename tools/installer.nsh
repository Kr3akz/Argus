; Eigene Schritte fuer den NSIS-Installer von electron-builder - eingebunden
; ueber nsis.include in electron-builder.yml. Nicht unter build/, wo
; electron-builder so eine Datei von selbst suchen wuerde: build/ ist
; gitignoriert und entsteht im Workflow erst (npm run icon).
;
; Die Makros und ${isUpdated} stammen aus den Vorlagen von electron-builder
; (node_modules/app-builder-lib/templates/nsis/uninstaller.nsh).

; "Start with Warframe" traegt Argus unter HKCU\...\Run ein (src/main/launch.js),
; Name des Eintrags ist die AppUserModelId - dieselbe Kennung wie appId.
; Wer Argus deinstalliert, soll keinen Eintrag zurueckbehalten, der bei jeder
; Anmeldung ins Leere zeigt. StartupApproved\Run haelt, ob er unter
; Task-Manager -> Autostart abgeschaltet war - der gehoert mit weg.
;
; NICHT bei einem Update: dann laeuft dieser Deinstaller still vor dem neuen
; Installer, und der Eintrag zeigt danach wieder auf dieselbe Argus.exe.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${APP_ID}"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "${APP_ID}"
  ${endIf}
!macroend
