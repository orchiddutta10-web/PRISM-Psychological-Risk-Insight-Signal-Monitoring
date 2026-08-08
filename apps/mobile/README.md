# PRISM Mobile App

This directory contains the cross-platform mobile application built using **React Native** and **Expo**. It serves two primary workflows:

1. **Teen App Workflow:**
   - Active disclosure screen displaying exactly what is being monitored.
   - On-device metadata aggregation pipeline (accelerometer, GPS, keystroke metrics, and app categories).
   - Local storage configuration (encrypted SQLite/SecureStore for cryptographic keys and queued payloads).
   
2. **Guardian Mobile View:**
   - Guardian login and onboarding.
   - Quick wellness baseline alerts and notification preferences.

## Tech Stack
- React Native (Expo SDK)
- Expo Sensor APIs (Accelerometer, Location metadata)
- Custom React Native Text Input wrapping for keystroke timing metrics
- SecureStore / Async Storage (Encrypted at rest)

## Connecting to the Backend (Physical Device / Emulator)

All API and WebSocket URLs come from one module: `src/config/network.ts`.
A single host value generates both `API_BASE_URL` and `WS_BASE_URL` — never
hardcode a URL anywhere else.

Host resolution priority:

1. `EXPO_PUBLIC_API_HOST` (from `.env`)
2. `FALLBACK_LAN_HOST` (constant in `src/config/network.ts`)
3. Emulator loopback (`10.0.2.2` on Android, `localhost` elsewhere)

### 1. Find your PC's LAN IP

- **Windows:** `ipconfig` → look for `IPv4 Address` under your Wi-Fi adapter
  (e.g. `192.168.1.100`)
- **macOS/Linux:** `ifconfig` → `inet` under `en0` / `wlan0`

### 2. Edit `.env`

Copy `.env.example` to `.env` if it doesn't exist, then set:

```
EXPO_PUBLIC_API_HOST=192.168.1.100
```

| Target | Value |
| --- | --- |
| Physical phone (Expo Go) | Your PC's LAN IP, e.g. `192.168.1.100` |
| Android emulator | `10.0.2.2` |
| iOS simulator / web | `localhost` |

### 3. Restart Expo (env vars are inlined at bundle time)

```
npm start
```

If the app still resolves the old host, clear the Metro cache:

```
npx expo start --clear
```

### 4. Connect with Expo Go

1. Install **Expo Go** on the phone (Play Store / App Store).
2. Make sure the phone and PC are on the **same Wi-Fi network**.
3. Scan the QR code from the Expo terminal (Android: Expo Go scanner;
   iOS: Camera app).

### 5. Windows Firewall

The backend listens on `0.0.0.0:8000`, but Windows may block inbound
connections from other devices. Allow it once:

```
netsh advfirewall firewall add rule name="PRISM API 8000" dir=in action=allow protocol=TCP localport=8000
```

(Or: Windows Security → Firewall → Allow an app → allow Python on Private networks.)

### Troubleshooting

- **Nothing loads on the phone** → wrong LAN IP, phone on a different
  network (guest Wi-Fi / mobile data), or the firewall rule is missing.
- **`localhost` works in the emulator but not on the phone** → expected:
  on a physical device `localhost` is the phone itself. Set
  `EXPO_PUBLIC_API_HOST` to the PC's LAN IP.
- **Verify the phone can reach the API** → open
  `http://<LAN-IP>:8000/docs` in the phone's browser; you should see the
  FastAPI docs page.
