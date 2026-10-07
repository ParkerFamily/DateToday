#!/bin/bash
# Fix profile using Firebase REST API

USER_ID="HvojrnHYUsZsQk3VmXF35lwsbkq2"
LEGAL_NAME="OG BOBBY JOHNSON"
DISPLAY_NAME="Bobby"
PROJECT_ID="datetoday-e1331"

echo "🔧 Fixing profile for: $USER_ID"
echo "Legal Name: $LEGAL_NAME"
echo "Display Name: $DISPLAY_NAME"
echo ""

# Note: This requires Firebase Auth token
# Get it from: firebase login:ci or from logged-in browser

echo "This script needs Firebase authentication."
echo "Please use Firebase Console instead:"
echo ""
echo "1. Go to: https://console.firebase.google.com/project/$PROJECT_ID/firestore/data"
echo "2. Update users/$USER_ID:"
echo "   - legalName = \"$LEGAL_NAME\""
echo "   - displayName = \"$DISPLAY_NAME\""
echo "3. Update profiles/$USER_ID:"
echo "   - displayName = \"$DISPLAY_NAME\""
echo ""
echo "Or run from your local machine where you're logged into Firebase CLI"
