/*
 * PRISM PULSE — WiFi credentials (secret).
 *
 * Copy this file to secrets.h and fill in your real values.
 * secrets.h is gitignored and must NEVER be committed.
 */
#ifndef PRISM_SECRETS_H
#define PRISM_SECRETS_H

// ── WiFi & API Config ─────────────────────────────────────────────
#define WIFI_SSID       "YOUR_WIFI_SSID"
#define WIFI_PASSWORD   "YOUR_WIFI_PASSWORD"
#define API_BASE_URL    "http://192.168.1.100:8081"   // Pi Edge Bridge
// Set to the same value as PRISM_ESP32_BRIDGE_TOKEN on the Pi to
// authenticate against the bridge. Keep empty if the bridge has auth disabled.
#define DEVICE_JWT      ""

#endif // PRISM_SECRETS_H
