; Maelstrom VTT hosts the table for LAN and internet players, so Windows
; Firewall would ask about it the first time it hosts. The installer allows
; the installed app in, once, and the uninstaller takes the rule away again.
; (The app was called Kraken VTT: its old rule is taken away too.)

!macro customInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Kraken VTT"'
  nsExec::Exec 'netsh advfirewall firewall delete rule name="${PRODUCT_NAME}"'
  nsExec::Exec 'netsh advfirewall firewall add rule name="${PRODUCT_NAME}" dir=in action=allow program="$INSTDIR\${APP_EXECUTABLE_FILENAME}" enable=yes profile=any description="Players joining your ${PRODUCT_NAME} table"'
!macroend

!macro customUnInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="${PRODUCT_NAME}"'
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Kraken VTT"'
!macroend
