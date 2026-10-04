; ============================================================
; SpeakNex Server Installer for Windows
; NSIS Installer Script
; ============================================================

!include "MUI2.nsh"
!include "LogicLib.nsh"

; General
Name "SN1-Server - SpeakNex Server"
OutFile "SN1-Server-Setup.exe"
Caption "Installation de SpeakNex Server"
VIProductVersion "26.0.0.0"
VIAddVersionKey "ProductName" "SN1-Server - SpeakNex Server"
VIAddVersionKey "FileDescription" "SpeakNex Voice Communication Server"
VIAddVersionKey "CompanyName" "SpeakNex"
VIAddVersionKey "LegalCopyright" "Copyright © 2024 SpeakNex"

; Install directory
InstallDir "$PROGRAMFILES64\SpeakNex\Server"
InstallDirRegKey HKLM "Software\SpeakNex\Server" "InstallDir"

; Request administrator privileges
RequestExecutionLevel admin

; Modern UI
!define MUI_ABORTWARNING
!define MUI_ICON "..\logo.png"
!define MUI_UNICON "..\logo.png"
!define MUI_HEADER_ICON "..\logo.png"

; Pages
!insertmacro MUI_PAGE_LICENSE "..\LICENSE"
!insertmacro MUI_PAGE_DIRECTORY

; Port configuration page
!define MUI_PAGE_CUSTOMFUNCTION_PRE portPagePre
!insertmacro MUI_PAGE_CUSTOM

; Components page
!insertmacro MUI_PAGE_COMPONENTS

!insertmacro MUI_PAGE_INSTFILES

; Finish page
!define MUI_FINISHPAGE_RUN "$INSTDIR\SN1-Server.bat"
!define MUI_FINISHPAGE_RUN_TEXT "Démarrer SpeakNex Server"
!insertmacro MUI_PAGE_FINISH

; Uninstall pages
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

; Languages
!insertmacro MUI_LANGUAGE "French"
!insertmacro MUI_LANGUAGE "English"

; Variables
Var Port
Var CreateDesktopShortcut
Var StartWithWindows

; ============================================================
; Port Configuration Page
; ============================================================

!define PORT_PAGE_TEXT "Configuration du serveur"

Function portPagePre
  ; Default port
  StrCpy $Port "30000"
FunctionEnd

Page custom showPortPage leavePortPage

Function showPortPage
  nsDialogs::Create 1018
  Pop $0
  
  ${NSD_CreateLabel} 0 10u 100% 15u "Port du serveur SpeakNex"
  Pop $0
  
  ${NSD_CreateText} 0 30u 100% 15u $Port
  Pop $0
  ${NSD_OnChange} $0 updatePort
  
  ${NSD_CreateLabel} 0 55u 100% 15u "Port par défaut: 30000 (laissez vide pour utiliser le port par défaut)"
  Pop $0
  
  ${NSD_CreateCheckbox} 0 80u 100% 15u "Créer un raccourci sur le bureau"
  Pop $CreateDesktopShortcut
  ${NSD_Check} $CreateDesktopShortcut
  
  ${NSD_CreateCheckbox} 0 100u 100% 15u "Démarrer le serveur avec Windows"
  Pop $StartWithWindows
  ${NSD_Uncheck} $StartWithWindows
  
  nsDialogs::Show
FunctionEnd

Function leavePortPage
  ${NSD_GetText} $0 $Port
FunctionEnd

Function updatePort
  ${NSD_GetText} $0 $Port
FunctionEnd

; ============================================================
; Sections
; ============================================================

!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
  !insertmacro MUI_DESCRIPTION_TEXT ${SecMain} "SpeakNex Server - Le serveur de communication vocale"
  !insertmacro MUI_DESCRIPTION_TEXT ${SecDocumentation} "Documentation et fichiers de configuration"
!insertmacro MUI_FUNCTION_DESCRIPTION_END

Section "SN1-Server (requis)" SecMain
  SectionIn RO
  
  SetOutPath "$INSTDIR"
  
  ; Copy main files
  File "server.js"
  File "package.json"
  File "SN1-Server.bat"
  File "SN1-Server.js"
  File "logo.png"
  
  ; Copy node_modules
  SetOutPath "$INSTDIR\node_modules"
  File /r "node_modules\*"
  
  ; Create data directory
  CreateDirectory "$INSTDIR\data"
  
  ; Create configuration file
  SetOutPath "$INSTDIR\data"
  FileOpen $0 "$INSTDIR\data\config.json" w
  FileWrite $0 "{\n"
  FileWrite $0 "  \"port\": ${Port},\n"
  FileWrite $0 "  \"serverName\": \"SpeakNex Server\",\n"
  FileWrite $0 "  \"maxClients\": 50\n"
  FileWrite $0 "}\n"
  FileClose $0
  
  ; Create desktop shortcut
  ${If} $CreateDesktopShortcut == ${BST_CHECKED}
    CreateShortcut "$DESKTOP\SN1-Server.lnk" "$INSTDIR\SN1-Server.bat"
  ${EndIf}
  
  ; Create start menu shortcuts
  CreateDirectory "$SMPROGRAMS\SpeakNex\Server"
  CreateShortcut "$SMPROGRAMS\SpeakNex\Server\SN1-Server.lnk" "$INSTDIR\SN1-Server.bat"
  CreateShortcut "$SMPROGRAMS\SpeakNex\Server\Documentation.lnk" "$INSTDIR\README.md"
  CreateShortcut "$SMPROGRAMS\SpeakNex\Server\Désinstaller SpeakNex Server.lnk" "$INSTDIR\uninst.exe"
  
  ; Start with Windows
  ${If} $StartWithWindows == ${BST_CHECKED}
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "SpeakNexServer" "$INSTDIR\SN1-Server.bat"
  ${EndIf}
  
  ; Uninstaller
  WriteUninstaller "$INSTDIR\uninst.exe"
  
  ; Registry
  WriteRegStr HKLM "Software\SpeakNex\Server" "InstallDir" "$INSTDIR"
  WriteRegStr HKLM "Software\SpeakNex\Server" "Version" "26.0"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\SpeakNexServer" "DisplayName" "SN1-Server - SpeakNex Server"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\SpeakNexServer" "DisplayVersion" "26.0"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\SpeakNexServer" "Publisher" "SpeakNex"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\SpeakNexServer" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\SpeakNexServer" "UninstallString" "$INSTDIR\uninst.exe"
SectionEnd

Section "Documentation" SecDocumentation
  SetOutPath "$INSTDIR"
  File "README.md"
SectionEnd

; ============================================================
; Uninstall
; ============================================================

Section "Uninstall"
  ; Stop server if running
  nsExec::Exec "taskkill /F /IM node.exe"
  
  ; Remove Start with Windows
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "SpeakNexServer"
  
  ; Remove shortcuts
  Delete "$DESKTOP\SN1-Server.lnk"
  Delete "$SMPROGRAMS\SpeakNex\Server\SN1-Server.lnk"
  Delete "$SMPROGRAMS\SpeakNex\Server\Documentation.lnk"
  Delete "$SMPROGRAMS\SpeakNex\Server\Désinstaller SpeakNex Server.lnk"
  RMDir "$SMPROGRAMS\SpeakNex\Server"
  RMDir "$SMPROGRAMS\SpeakNex"
  
  ; Ask about keeping data
  MessageBox MB_YESNO "Voulez-vous conserver les données du serveur (configuration, clés de privilèges) ?" IDYES keepData
  
  ; Remove everything
  RMDir /r "$INSTDIR"
  Goto done
  
  keepData:
  ; Move data folder to desktop
  IfFileExists "$INSTDIR\data\*.*" 0 done
  CreateDirectory "$DESKTOP\SpeakNex-Server-Data"
  CopyFiles "$INSTDIR\data\*.*" "$DESKTOP\SpeakNex-Server-Data\"
  RMDir /r "$INSTDIR"
  
  done:
  ; Remove registry
  DeleteRegKey HKLM "Software\SpeakNex\Server"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\SpeakNexServer"
SectionEnd
