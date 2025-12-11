!macro customUnInstall
  ; Ask the user if they want to delete their data
  MessageBox MB_YESNO|MB_ICONQUESTION "Do you want to delete your personal media library and database?$\n$\nThis includes:$\n- The 'ViveStream' folder in your user directory (Videos, Covers, Subtitles)$\n- Your database, settings, and watch history" /SD IDNO IDNO skip_delete

  ; If YES, delete the files
  
  ; 1. Delete the Media Folder (C:\Users\Name\ViveStream)
  ; $PROFILE maps to the user's home directory
  RMDir /r "$PROFILE\ViveStream"

  ; 2. Delete the AppData (Database & Settings)
  ; ${PRODUCT_FILENAME} usually maps to the productName in package.json safe name
  ; but to be safe we target the specific AppData folder name used by Electron
  RMDir /r "$APPDATA\ViveStream Revived"

  skip_delete:
!macroend