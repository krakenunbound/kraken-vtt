; Kraken VTT hosts the table for LAN and internet players, so Windows Firewall
; would ask about it the first time it hosts. The installer allows the
; installed app in, once, and the uninstaller takes the rule away again.

!macro customInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Kraken VTT"'
  nsExec::Exec 'netsh advfirewall firewall add rule name="Kraken VTT" dir=in action=allow program="$INSTDIR\Kraken VTT.exe" enable=yes profile=any description="Players joining your Kraken VTT table"'
!macroend

!macro customUnInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Kraken VTT"'
!macroend
