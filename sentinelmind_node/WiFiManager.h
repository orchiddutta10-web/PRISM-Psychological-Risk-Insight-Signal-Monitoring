#ifndef SENTINELMIND_WIFIMANAGER_H
#define SENTINELMIND_WIFIMANAGER_H

#include <Arduino.h>
#include "Config.h"

#if defined(ESP32)
  #include <WiFi.h>
#elif defined(ESP8266)
  #include <ESP8266WiFi.h>
#endif

/* -------------------------------------------------------------------
 *  WiFiManager
 *  Handles connection, station-keep, and automatic reconnection with
 *  exponential back-off.  Reports status via a shared enum so the main
 *  loop can take action (e.g. skip HTTP until link is restored).
 * ------------------------------------------------------------------- */
enum WiFiState : uint8_t {
  WIFI_IDLE,
  WIFI_CONNECTING,
  WIFI_CONNECTED,
  WIFI_DISCONNECTED,
  WIFI_RECONNECTING,
  WIFI_FAILED
};

class WiFiManager {
public:
  WiFiManager()
    : _state(WIFI_IDLE),
      _lastStateChange(0),
      _retryCount(0),
      _lastRecoveryPrint(0),
      _firstConnectDone(false)
  {}

  // ----------------------------------------------------------------
  //  begin — blocking first connection (called once in setup)
  // ----------------------------------------------------------------
  void begin(const char* ssid, const char* pass) {
    _ssid = ssid;
    _pass = pass;

    Serial.print("[WiFi] Connecting to ");
    Serial.print(ssid);
    Serial.print(" ...");

    _state = WIFI_CONNECTING;
    _setLedPattern(LED_PATTERN_FAST);

    WiFi.mode(WIFI_STA);
    WiFi.begin(ssid, pass);

    unsigned long start = millis();
    while (WiFi.status() != WL_CONNECTED) {
      delay(WIFI_RETRY_MS);
      Serial.print('.');
      if (millis() - start > WIFI_RETRY_MS * WIFI_MAX_RETRIES) {
        Serial.println("\n[WiFi] FAILED — check credentials / network.");
        _state = WIFI_FAILED;
        _firstConnectDone = true;
        return;
      }
    }

    Serial.println();
    _onConnected();
    _firstConnectDone = true;
  }

  // ----------------------------------------------------------------
  //  maintain — call every loop iteration (~1 ms)
  //  Non-blocking reconnection when link drops.
  // ----------------------------------------------------------------
  void maintain() {
    if (!_firstConnectDone) return;

    wl_status_t status = WiFi.status();

    switch (status) {
      case WL_CONNECTED:
        if (_state != WIFI_CONNECTED) {
          _onConnected();
        }
        _retryCount = 0;
        _setLedPattern(LED_PATTERN_SOLID);
        break;

      case WL_DISCONNECTED:
      case WL_CONNECTION_LOST:
        if (_state == WIFI_CONNECTED || _state == WIFI_IDLE) {
          Serial.println("\n[WiFi] Link lost — reconnecting...");
          _state = WIFI_RECONNECTING;
          _retryCount = 0;
        }
        _reconnect();
        break;

      case WL_NO_SSID_AVAIL:
      case WL_CONNECT_FAILED:
        if (_state == WIFI_CONNECTED || _state == WIFI_IDLE) {
          Serial.println("\n[WiFi] Connection failed — retrying...");
          _state = WIFI_RECONNECTING;
        }
        _reconnect();
        break;

      default:
        break;
    }
  }

  WiFiState state() const           { return _state; }
  bool      isConnected() const     { return _state == WIFI_CONNECTED; }
  IPAddress localIP() const         { return WiFi.localIP(); }
  int8_t    rssi() const            { return WiFi.RSSI(); }

private:
  const char*  _ssid;
  const char*  _pass;
  WiFiState    _state;
  unsigned long _lastStateChange;
  uint8_t      _retryCount;
  unsigned long _lastRecoveryPrint;
  bool         _firstConnectDone;

  // ----------------------------------------------------------------
  // LED patterns (built-in LED visual feedback)
  // ----------------------------------------------------------------
  enum LedPattern : uint8_t {
    LED_PATTERN_SOLID,
    LED_PATTERN_FAST,
    LED_PATTERN_SLOW,
    LED_PATTERN_OFF
  };

  void _setLedPattern(LedPattern p) {
    static bool ledState = false;
    static unsigned long lastToggle = 0;
    unsigned long now = millis();
    unsigned long period;

    switch (p) {
      case LED_PATTERN_SOLID: digitalWrite(PIN_LED_BUILTIN, LOW);  return;
      case LED_PATTERN_FAST:  period = 80;                          break;
      case LED_PATTERN_SLOW:  period = 400;                         break;
      case LED_PATTERN_OFF:
      default:                digitalWrite(PIN_LED_BUILTIN, HIGH); return;
    }
    if (now - lastToggle >= period) {
      ledState = !ledState;
      digitalWrite(PIN_LED_BUILTIN, ledState ? LOW : HIGH);
      lastToggle = now;
    }
  }

  void _onConnected() {
    _state = WIFI_CONNECTED;
    Serial.print("[WiFi] Connected — IP: ");
    Serial.print(WiFi.localIP());
    Serial.print("  RSSI: ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");
  }

  void _reconnect() {
    if (millis() - _lastStateChange < WIFI_RETRY_MS) return;
    _lastStateChange = millis();
    _retryCount++;

    if ((_retryCount % 10) == 0) {
      Serial.printf("[WiFi] Reconnect attempt %u ...\n", _retryCount);
    }

    WiFi.disconnect(false);
    WiFi.begin(_ssid, _pass);
  }
};

#endif /* SENTINELMIND_WIFIMANAGER_H */
