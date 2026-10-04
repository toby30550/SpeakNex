; SpeakNex Client Installer Script
; Custom NSIS installer for SN1 - SpeakNex Client 1

!macro customHeader
  !define MUI_ABORTWARNING
!macroend

!macro customInstall
  ; Installation complete
!macroend

!macro customUnInstall
  ; Ask if user wants to keep settings
  MessageBox MB_YESNO "Voulez-vous conserver vos paramètres SpeakNex ?" IDYES keepSettings IDNO removeSettings
  
  removeSettings:
    ; Remove settings folder
    RMDir /r "$APPDATA\SN1 - SpeakNex Client 1"
    Goto endUninstall
  
  keepSettings:
    Goto endUninstall
  
  endUninstall:
!macroend
