#!/bin/bash
# Cross-platform notification script for Auto Pipeline
# Usage: notify.sh "title" "message" [success|error]

TITLE="${1:-Auto Pipeline}"
MESSAGE="${2:-Pipeline complete}"
STATUS="${3:-success}"

# The title/message come from the task string. Escape them for each host
# language they are interpolated into; never pass raw user text to osascript
# or PowerShell.
esc_applescript() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }
esc_xml()         { printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' -e "s/\"/\&quot;/g" -e "s/'/''/g"; }

# Determine notification style based on status
if [ "$STATUS" = "error" ]; then
    SOUND="Basso"
    URGENCY="critical"
else
    SOUND="Glass"
    URGENCY="normal"
fi

# Detect platform and send notification
case "$(uname -s)" in
    Darwin)
        # macOS
        AS_TITLE=$(esc_applescript "$TITLE")
        AS_MESSAGE=$(esc_applescript "$MESSAGE")
        osascript -e "display notification \"$AS_MESSAGE\" with title \"$AS_TITLE\" sound name \"$SOUND\"" 2>/dev/null
        ;;
    Linux)
        # Linux with notify-send (arguments are passed, not interpolated)
        if command -v notify-send &> /dev/null; then
            notify-send -u "$URGENCY" -- "$TITLE" "$MESSAGE"
        fi
        ;;
    MINGW*|MSYS*|CYGWIN*)
        # Windows (Git Bash, MSYS, Cygwin).
        # Use the OS's soft notification chime from the user's sound scheme —
        # NOT [console]::beep(), which is a harsh raw square-wave tone through the
        # system speaker. Asterisk = the gentle "info" chime; Exclamation = a
        # slightly more noticeable (but still soft) warning chime for errors.
        # The Start-Sleep lets the async .Play() finish before PowerShell exits.
        if [ "$STATUS" = "error" ]; then
            SOUND_EVENT="Exclamation"
        else
            SOUND_EVENT="Asterisk"
        fi
        powershell -c "[System.Media.SystemSounds]::${SOUND_EVENT}.Play(); Start-Sleep -Milliseconds 500" 2>/dev/null
        # Windows toast notification (visual). Marked <audio silent> so it does not
        # stack a second sound on top of the gentle chime above. The XML lives in a
        # single-quoted PowerShell string, so ' is doubled and XML specials escaped.
        # (Requires Windows PowerShell 5.1 for the WinRT types; pwsh 7 no-ops.)
        XML_TITLE=$(esc_xml "$TITLE")
        XML_MESSAGE=$(esc_xml "$MESSAGE")
        powershell -c "
            [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
            [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
            \$template = '<toast><visual><binding template=\"ToastText02\"><text id=\"1\">$XML_TITLE</text><text id=\"2\">$XML_MESSAGE</text></binding></visual><audio silent=\"true\"/></toast>'
            \$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
            \$xml.LoadXml(\$template)
            \$toast = [Windows.UI.Notifications.ToastNotification]::new(\$xml)
            [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('AutoPipeline').Show(\$toast)
        " 2>/dev/null
        # Handled Windows here; skip the terminal-bell fallback below (it can
        # retrigger the harsh default system beep).
        exit 0
        ;;
esac

# Fallback: terminal bell (macOS/Linux only — Windows exits above before here).
printf '\a'
