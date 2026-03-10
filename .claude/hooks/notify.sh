#!/bin/bash
# Cross-platform notification script for Auto Pipeline
# Usage: notify.sh "title" "message" [success|error]

TITLE="${1:-Auto Pipeline}"
MESSAGE="${2:-Pipeline complete}"
STATUS="${3:-success}"

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
        osascript -e "display notification \"$MESSAGE\" with title \"$TITLE\" sound name \"$SOUND\"" 2>/dev/null
        ;;
    Linux)
        # Linux with notify-send
        if command -v notify-send &> /dev/null; then
            notify-send -u "$URGENCY" "$TITLE" "$MESSAGE"
        fi
        ;;
    MINGW*|MSYS*|CYGWIN*)
        # Windows (Git Bash, MSYS, Cygwin)
        if [ "$STATUS" = "error" ]; then
            powershell -c "[console]::beep(300,500); [console]::beep(200,500)" 2>/dev/null
        else
            powershell -c "[console]::beep(800,200); [console]::beep(1000,200)" 2>/dev/null
        fi
        # Also try Windows toast notification
        powershell -c "
            [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
            [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
            \$template = '<toast><visual><binding template=\"ToastText02\"><text id=\"1\">$TITLE</text><text id=\"2\">$MESSAGE</text></binding></visual></toast>'
            \$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
            \$xml.LoadXml(\$template)
            \$toast = [Windows.UI.Notifications.ToastNotification]::new(\$xml)
            [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('AutoPipeline').Show(\$toast)
        " 2>/dev/null
        ;;
esac

# Fallback: terminal bell (works everywhere)
printf '\a'
