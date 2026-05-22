# Expo Trolling Logbook Clone

Expo/TypeScript wrapper around an exact cloned copy of the existing Flask/plain-JS trolling logbook UI. The original app in the parent folder is not overwritten.

The cloned web app lives in `public/logbook/` and keeps the same HTML, CSS, selectors, dialogs, stats, patterns, map/gallery views, photo queue, and trolling workflow. `App.tsx` is the Expo-compatible TypeScript host:

- On web, it renders the cloned app in an iframe.
- On iOS/Android, it renders the cloned app in `react-native-webview` from the Expo dev server.
- The cloned copy can still fall back to browser `localStorage`.
- The cloned copy can call the Flask API by using the same endpoint shape as the original app.

## Run

```powershell
cd "C:\Users\cache\Fishing  logbook app\expo-logbook"
npm install
npm start
```

For the web target:

```powershell
npm run web -- --port 8082
```

## Flask API Setup

Run the Flask app from the parent project:

```powershell
cd "C:\Users\cache\Fishing  logbook app"
python server.py
```

By default, when the cloned app is hosted by Expo on a non-8080 port, it tries `http://127.0.0.1:8080` for the Flask API and falls back to `localStorage` if Flask is unavailable.

To point at another Flask host, add an `apiBase` query parameter:

```text
http://127.0.0.1:8082/?apiBase=http://192.168.1.25:8080
```

The cloned app stores that API base in local storage for later loads.
