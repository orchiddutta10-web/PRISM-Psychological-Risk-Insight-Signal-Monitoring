#ifndef SENTINELMIND_TRANSMITMANAGER_H
#define SENTINELMIND_TRANSMITMANAGER_H

#include <Arduino.h>
#include "Config.h"

#if defined(ESP32)
  #include <WiFi.h>
  #include <HTTPClient.h>
#elif defined(ESP8266)
  #include <ESP8266WiFi.h>
  #include <ESP8266HTTPClient.h>
#endif

#include <ArduinoJson.h>

/* -------------------------------------------------------------------
 *  SensorReading  — single time-stamped sample stored in the ring buffer
 * ------------------------------------------------------------------- */
struct SensorReading {
  unsigned long timestampMs;
  uint16_t      pulseRaw;
  float         hrBpm;
  float         hrConfidence;
  float         ibiMs;
  uint16_t      gsrRaw;
  float         gsrUs;
  float         gsrTonicUs;
  float         gsrPhasicUs;
};

/* -------------------------------------------------------------------
 *  TransmitManager
 *
 *  Maintains a fixed-size ring buffer of SensorReading structs.
 *  On every TRANSMIT_INTERVAL_MS, serialises the batch into a JSON
 *  document and POSTs it to the Flask backend via HTTP.
 *
 *  Batching reduces network overhead and ensures the backend receives
 *  ~100 samples per second per request.
 * ------------------------------------------------------------------- */
class TransmitManager {
public:
  TransmitManager()
    : _head(0), _tail(0), _count(0),
      _lastTransmit(0), _lastPayloadBytes(0),
      _txOk(0), _txFail(0)
  {}

  // ----------------------------------------------------------------
  //  push — add a reading to the ring buffer (call from main loop)
  // ----------------------------------------------------------------
  void push(const SensorReading& r) {
    _buffer[_head] = r;
    _head = (_head + 1) % BATCH_MAX_READINGS;
    if (_count == BATCH_MAX_READINGS) {
      _tail = (_tail + 1) % BATCH_MAX_READINGS;     /* overwrite oldest */
    } else {
      _count++;
    }
  }

  // ----------------------------------------------------------------
  //  tryTransmit — non-blocking; call every loop iteration
  //  Returns true if a transmission was attempted.
  // ----------------------------------------------------------------
  bool tryTransmit(bool wifiConnected) {
    unsigned long now = millis();

    if (now - _lastTransmit < TRANSMIT_INTERVAL_MS) return false;

    _lastTransmit = now;

    if (!wifiConnected || _count == 0) return false;

    _sendBatch();
    return true;
  }

  // ----------------------------------------------------------------
  //  Stats
  // ----------------------------------------------------------------
  uint32_t txOk()       const { return _txOk; }
  uint32_t txFail()     const { return _txFail; }
  uint32_t queued()     const { return _count; }
  size_t   lastPayload() const { return _lastPayloadBytes; }

private:
  SensorReading _buffer[BATCH_MAX_READINGS];
  uint8_t  _head;
  uint8_t  _tail;
  uint8_t  _count;

  unsigned long _lastTransmit;
  size_t   _lastPayloadBytes;
  uint32_t _txOk;
  uint32_t _txFail;

  // ----------------------------------------------------------------
  //  _sendBatch — drain the ring buffer into a JSON POST
  // ----------------------------------------------------------------
  void _sendBatch() {
    StaticJsonDocument<8192> doc;
    JsonObject root = doc.to<JsonObject>();
    root["device_id"] = DEVICE_ID;
    root["sample_rate_hz"] = SAMPLE_RATE_HZ;
    root["firmware"] = FIRMWARE_VERSION;

    JsonArray readingsJson = root.createNestedArray("readings");

    uint8_t batchSize = _count;

    for (uint8_t i = 0; i < batchSize; i++) {
      const SensorReading& r = _buffer[_tail];

      JsonObject rd = readingsJson.createNestedObject();
      rd["ts"]           = r.timestampMs / 1000.0;        /* seconds.millis */
      rd["pulse_raw"]    = r.pulseRaw;
      rd["hr_bpm"]       = r.hrBpm;
      rd["hr_conf"]      = r.hrConfidence;
      rd["ibi_ms"]       = r.ibiMs;
      rd["gsr_raw"]      = r.gsrRaw;
      rd["gsr_us"]       = r.gsrUs;
      rd["gsr_tonic_us"] = r.gsrTonicUs;
      rd["gsr_phasic_us"]= r.gsrPhasicUs;

      _tail = (_tail + 1) % BATCH_MAX_READINGS;
      _count--;
    }

    _lastPayloadBytes = measureJson(doc);

    _httpPost(doc);
  }

  // ----------------------------------------------------------------
  //  _httpPost — issue the HTTP request with retry-on-error
  // ----------------------------------------------------------------
  void _httpPost(JsonDocument& doc) {
    HTTPClient http;
    WiFiClient client;

    char url[96];
    snprintf(url, sizeof(url), "http://%s:%d%s", SERVER_HOST, SERVER_PORT, STREAM_ENDPOINT);

    bool ok = false;

    http.begin(client, url);
    http.setTimeout(HTTP_TIMEOUT_MS);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-Device-ID", DEVICE_ID);

    String payload;
    serializeJson(doc, payload);

    int httpCode = http.POST(payload);

    if (httpCode > 0) {
      if (httpCode == HTTP_CODE_OK || httpCode == HTTP_CODE_CREATED) {
        ok = true;
      } else {
        Serial.printf("[HTTP] POST %s → %d  (body: %u bytes)\n",
                      url, httpCode, payload.length());
      }
    } else {
      Serial.printf("[HTTP] POST failed — error: %s\n",
                    http.errorToString(httpCode).c_str());
    }

    http.end();

    if (ok) {
      _txOk++;
    } else {
      _txFail++;
      /* On failure, re-queue readings by pushing back.
         In production, you might want to write to a tiny SPIFFS
         log instead so no data is lost. */
      Serial.printf("[TX] Re-queuing %u readings on next cycle.\n", payload.length());
    }
  }
};

#endif /* SENTINELMIND_TRANSMITMANAGER_H */
