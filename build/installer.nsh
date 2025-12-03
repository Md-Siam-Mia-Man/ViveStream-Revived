!macro customUnInstall
  ; 1. Check if running in silent mode (Updates run silently)
  IfSilent skip_delete_confirmation

  ; 2. Not silent: This is a manual uninstall. Ask the user.
  ; /SD IDNO means: "If for some reason this runs silently, answer NO automatically"
  MessageBox MB_YESNO|MB_ICONQUESTION "Do you want to delete your ViveStream media library and database?$\n$\nThis includes all downloaded videos, playlists, and settings.$\nAction cannot be undone." /SD IDNO IDYES delete_data IDNO skip_delete_confirmation

delete_data:
  ; Delete Database & Settings
  RMDir /r "$APPDATA\ViveStream"
  
  ; Delete Media Files
  RMDir /r "$PROFILE\ViveStream"

skip_delete_confirmation:
!macroend