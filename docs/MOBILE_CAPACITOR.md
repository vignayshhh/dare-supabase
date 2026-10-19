# Mobile App with Capacitor

This project now includes Capacitor native shells for Android and iOS.

## How it is wired

The current Next app uses API routes and server-side code, so the native app loads the hosted Next deployment instead of trying to run Next inside the phone WebView.

Default mobile URL:

```text
https://dare-web-app.vercel.app
```

Override it before syncing if you need a different backend:

```powershell
$env:CAPACITOR_SERVER_URL = "https://your-production-domain.example"
npm run mobile:sync
```

For local device testing, run the Next dev server on your network and point Capacitor at it:

```powershell
npm run dev -- --hostname 0.0.0.0
$env:CAPACITOR_SERVER_URL = "http://YOUR_LAN_IP:3000"
npm run mobile:sync
npm run mobile:android
```

## Commands

```powershell
npm run mobile:sync
npm run mobile:android
npm run mobile:open:android
npm run mobile:ios
npm run mobile:open:ios
```

Android can be built from Windows with Android Studio installed.

iOS project files are generated, but building and submitting iOS still requires macOS with Xcode.

## Native project folders

```text
android/
ios/
capacitor.config.ts
mobile-www/
```

`mobile-www` is a small fallback page. The real app is loaded through the Capacitor `server.url` setting.
