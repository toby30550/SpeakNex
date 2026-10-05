; ============================================================
; SN1-Server - SpeakNex Server Windows Installer
; Compiled with NSIS
; ============================================================

!include "MUI2.nsh"
!include "LogicLib.nsh"

Name "SN1-Server - SpeakNex Server"
OutFile "SN1-Server-Setup.exe"
InstallDir "$PROGRAMFILES64\SpeakNex\Server"
InstallDirRegKey HKLM "Software\SpeakNex\Server" "InstallDir"
RequestExecutionLevel admin

; Version info
VIProductVersion "26.0.0.0"
VIAddVersionKey /LANG=0 "ProductName" "SN1-Server - SpeakNex Server"
VIAddVersionKey /LANG=0 "FileDescription" "SpeakNex Voice Communication Server"
VIAddVersionKey /LANG=0 "CompanyName" "SpeakNex"
VIAddVersionKey /LANG=0 "FileVersion" "26.0.0"
VIAddVersionKey /LANG=0 "ProductVersion" "26.0"
VIAddVersionKey /LANG=0 "LegalCopyright" "Copyright (C) 2024 SpeakNex"

; Modern UI
!define MUI_ABORTWARNING
!define MUI_ICON "logo.ico"
!define MUI_UNICON "logo.ico"

; Pages
!insertmacro MUI_PAGE_LICENSE "license.txt"
!insertmacro MUI_PAGE_DIRECTORY

; Custom port + service page
Page custom PortPage PortPageLeave

!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH

!insertmacro MUI_LANGUAGE "French"
!insertmacro MUI_LANGUAGE "English"

Var PortVar
Var ServiceVar

; ============================================================
; Port configuration page
; ============================================================

Function PortPage
  nsDialogs::Create 1018
  Pop $0

  ${NSD_CreateLabel} 0 10u 100% 14u "Port du serveur SpeakNex (par defaut : 30000)"
  Pop $0

  ${NSD_CreateText} 0 30u 60u 15u "30000"
  Pop $PortVar

  ${NSD_CreateLabel} 0 55u 100% 24u "Si le port est deja utilise par un autre programme, le serveur ne pourra pas demarrer."
  Pop $0

  ${NSD_CreateLabel} 0 85u 100% 14u "Service Windows :"
  Pop $0

  ${NSD_CreateCheckBox} 0 105u 100% 14u "Installer SN1-Server comme service Windows (demarrage automatique)"
  Pop $ServiceVar
  ${NSD_Uncheck} $ServiceVar

  nsDialogs::Show
FunctionEnd

Function PortPageLeave
  ${NSD_GetText} $PortVar $0
  ${If} $0 == ""
    StrCpy $0 "30000"
  ${EndIf}
FunctionEnd

; ============================================================
; Sections
; ============================================================

Section "SN1-Server (requis)" SecServer
  SectionIn RO

  SetOutPath "$INSTDIR"

  ; Main files
  File "server.js"
  File "package.json"
  File "SN1-Server.bat"
  File "SN1-Server.js"
  File "service.js"
  File "logo.png"
  File "README.md"
  File /r "node_modules"

  ; Data directory
  CreateDirectory "$INSTDIR\data"

  ; Write configuration with chosen port
  Call WriteConfig

  ; Shortcuts
  CreateDirectory "$SMPROGRAMS\SpeakNex\Server"
  CreateShortcut "$SMPROGRAMS\SpeakNex\Server\SN1-Server.lnk" "$INSTDIR\SN1-Server.bat" "" "$INSTDIR\logo.png" 0
  CreateShortcut "$SMPROGRAMS\SpeakNex\Server\Documentation.lnk" "$INSTDIR\README.md"
  CreateShortcut "$SMPROGRAMS\SpeakNex\Server\Desinstaller.lnk" "$INSTDIR\uninst.exe"
  CreateShortcut "$DESKTOP\SN1-Server.lnk" "$INSTDIR\SN1-Server.bat" "" "$INSTDIR\logo.png" 0

  ; Uninstaller
  WriteUninstaller "$INSTDIR\uninst.exe"

  ; Registry
  WriteRegStr HKLM "Software\SpeakNex\Server" "InstallDir" "$INSTDIR"
  WriteRegStr HKLM "Software\SpeakNex\Server" "Version" "26.0"
  WriteRegStr HKLM "Software\SpeakNex\Server" "Port" $0

  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\SpeakNexServer" "DisplayName" "SN1-Server - SpeakNex Server"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\SpeakNexServer" "DisplayVersion" "26.0"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\SpeakNexServer" "Publisher" "SpeakNex"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\SpeakNexServer" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\SpeakNexServer" "DisplayIcon" "$INSTDIR\logo.png"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\SpeakNexServer" "UninstallString" "$INSTDIR\uninst.exe"
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\SpeakNexServer" "NoModify" 1
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\SpeakNexServer" "NoRepair" 1
SectionEnd

Section "Service Windows (demarrage automatique)" SecService
  DetailPrint "Installation du service SpeakNexServer..."
  ; service.js utilise node-windows pour creer un vrai service Windows
  nsExec::ExecToLog 'cmd /c cd /d "$INSTDIR" && node service.js install'
  Pop $0
  ${If} $0 == 0
    DetailPrint "Service installe avec succes."
    nsExec::ExecToLog 'cmd /c cd /d "$INSTDIR" && node service.js start'
    Pop $0
    ${If} $0 == 0
      DetailPrint "Service demarre."
    ${Else}
      DetailPrint "Service cree mais non demarre (code $0)."
    ${EndIf}
  ${Else}
    DetailPrint "Impossible d'installer le service (code $0)."
    DetailPrint "Vous pouvez toujours lancer le serveur avec SN1-Server.bat"
  ${EndIf}
SectionEnd

Section "Demarrer le serveur maintenant" SecRunNow
  DetailPrint "Demarrage du serveur..."
  Exec 'cmd /c start "" "$INSTDIR\SN1-Server.bat"'
SectionEnd

; ============================================================
; Write configuration
; ============================================================

Function WriteConfig
  FileOpen $1 "$INSTDIR\data\config.json" w
  FileWrite $1 "{$\r$\n"
  FileWrite $1 '  "port": '
  FileWrite $1 $0
  FileWrite $1 ",$\r$\n"
  FileWrite $1 '  "serverName": "SpeakNex Server",$\r$\n'
  FileWrite $1 '  "maxClients": 50$\r$\n'
  FileWrite $1 "}$\r$\n"
  FileClose $1
FunctionEnd

; ============================================================
; Desinstallation
; ============================================================

Section "Uninstall"
  ; Stop and remove service
  DetailPrint "Arret du service..."
  nsExec::ExecToLog 'cmd /c cd /d "$INSTDIR" && node service.js uninstall'
  Pop $0
  nsExec::ExecToLog 'sc.exe stop SpeakNexServer'
  Pop $0

  ; Shortcuts
  Delete "$DESKTOP\SN1-Server.lnk"
  Delete "$SMPROGRAMS\SpeakNex\Server\SN1-Server.lnk"
  Delete "$SMPROGRAMS\SpeakNex\Server\Documentation.lnk"
  Delete "$SMPROGRAMS\SpeakNex\Server\Desinstaller.lnk"
  RMDir "$SMPROGRAMS\SpeakNex\Server"
  RMDir "$SMPROGRAMS\SpeakNex"

  ; Keep data ?
  MessageBox MB_YESNO "Voulez-vous conserver les donnees du serveur (configuration, cles de privileges) ?" IDYES keepdata

  RMDir /r "$INSTDIR"
  Goto regclean

keepdata:
  CreateDirectory "$DESKTOP\SpeakNex-Server-Data"
  CopyFiles "$INSTDIR\data\*.*" "$DESKTOP\SpeakNex-Server-Data\"
  RMDir /r "$INSTDIR"

regclean:
  DeleteRegKey HKLM "Software\SpeakNex\Server"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\SpeakNexServer"
SectionEnd
