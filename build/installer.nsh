!include "MUI2.nsh"

; ============================================================================
; INSTALLER LOGIC
; ============================================================================

; Run at the very beginning of installation
!macro customInit
    ; No prompts here. Clean install.
!macroend

; ============================================================================
; UNINSTALLER LOGIC
; ============================================================================

; Run when the uninstaller initializes
!macro customUnInit
    ; Determine the user's home directory for the profile check
    ExpandEnvStrings $0 "%USERPROFILE%"
    
    ; Ask the user if they want to delete their media library AND app data
    ; MB_YESNO: Show Yes/No buttons
    ; MB_ICONQUESTION: Show a question mark icon
    ; MB_DEFBUTTON2: "No" is the default focused button (Safety)
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 \
    "Do you want to delete your entire ViveStream Media Library and Database?$\n$\nLocations:$\n - $0\ViveStream (Media)$\n - $APPDATA\ViveStream (Database)$\n$\nWARNING: This action cannot be undone." \
    IDYES delete_media IDNO keep_media

    delete_media:
        ; Delete the media folder in User Home
        RMDir /r "$0\ViveStream"
        
        ; Delete the AppData folder (Database and Settings)
        ; Check both common naming conventions just in case
        RMDir /r "$APPDATA\ViveStream"
        RMDir /r "$APPDATA\com.vivestream.app" 
        Goto done

    keep_media:
        ; Do nothing, just uninstall the executable files (handled by standard uninstaller)
        Goto done

    done:
!macroend