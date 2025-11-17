!macro customInit
  # Custom initialization code goes here
!macroend

!macro customInstall
  # Add an option to run on startup to the installer
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${PRODUCT_NAME}" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}'
!macroend

!macro customUninstall
  # Clean up the startup registry key
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${PRODUCT_NAME}"

  # Prompt the user to optionally delete their data
  MessageBox MB_YESNO|MB_ICONQUESTION "Do you want to remove all user data, including your media library and settings?$\n$\nThis cannot be undone." IDYES deleteUserData

  goto skipDelete

deleteUserData:
  # Delete application data (database, settings)
  RMDir /r "$APPDATA\${PRODUCT_NAME}"
  # Delete user's media library
  RMDir /r "$PROFILE\${PRODUCT_NAME}"

skipDelete:
  # Additional cleanup can go here
!macroend