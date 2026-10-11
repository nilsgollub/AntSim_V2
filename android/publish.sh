#!/usr/bin/env bash
# Baut die Android-App auf dem Steuer-Container und legt sie ins F-Droid-Repo des Homelabs
# (http://apps.srv.local/fdroid/repo, Skript im Homeserver-Repo). Updates kommen dann über F-Droid.
# Die Versionsnummer ist die Anzahl der Commits, deshalb vor dem Veröffentlichen committen.
# Aufruf: android/publish.sh
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -n "$(git status --porcelain --untracked-files=no -- . ':!dist' ':!graphify-out')" ]; then
  echo "Erst committen: die Versionsnummer ist die Anzahl der Commits." >&2
  exit 1
fi
export ANDROID_HOME=/opt/android-sdk
npm run build
npx cap sync android
cd android
[ -f local.properties ] || echo "sdk.dir=$ANDROID_HOME" > local.properties
./gradlew --no-daemon -q assembleRelease
/root/repos/Homeserver/scripts/fdroid-publish.sh app/build/outputs/apk/release/app-release.apk
