"""
ESP32 PRISM PULSE firmware — WiFi-enabled version
==================================================

Flashing instructions:
  1. Install Arduino IDE + ESP32 board support
  2. Install libraries: WiFi, WiFiClient, ArduinoJson
  3. Set board: ESP32 Dev Module
  4. Set port: COM7
  5. Upload this sketch
  6. ESP32 will connect to PRISM-NODE WiFi and stream BPM data to the Pi

Pin mapping:
  - Pulse sensor (analog) → GPIO 34 (ADC)
  - MPU6050 (I2C) → SDA=21, SCL=22
  - LCD I2C → SDA=21, SCL=22 (shared bus)

This firmware sends CSV telemetry over both serial (USB) and WiFi (HTTP POST).
"""

# The code below is Arduino-compatible C++. It lives in a .py file for
# organization within the PRISM repo. Copy to Arduino IDE to flash.

FIRMWARE_CPP = """
// ============================================================
// PRISM PULSE v4.0 — WiFi-Enabled Firmware for ESP32
// ============================================================
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// ---- WiFi Config ----
const char* WIFI_SSID = "PRISM-Node";
const char* WIFI_PASS = "PrismEdge2024";

// ---- Edge Bridge Config ----
const char* BRIDGE_HOST = "192.168.4.1";  // Pi's hotspot IP
const int   BRIDGE_PORT = 8500;
const char* BRIDGE_PATH = "/api/v1/telemetry/ingest";

// ---- Sensor Pins ----
const int PULSE_PIN = 34;  // Analog pulse sensor
const int LED_PIN   = 2;   // Onboard LED

// ---- Timing ----
unsigned long lastWiFiAttempt = 0;
unsigned long lastSend = 0;
const unsigned long WIFI_RETRY_MS = 10000;
const unsigned long SEND_INTERVAL_MS = 1000;

// ---- Sensor Data ----
int bpm = 0;
float g_force = 1.0;
String alert_status = "OK";
unsigned long ts_ms = 0;

// ---- WiFi State ----
bool wifiConnected = false;

// ============================================================
// Setup
// ============================================================
void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("=== PRISM PULSE v4.0 (WiFi) ===");
  Serial.println("[LCD] 0x27");
  Serial.println("[MPU6050] Initializing...");
  Serial.println("ts_ms,pulse_raw,bpm,g_force,alert_status");
  
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  
  // Connect WiFi
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("[WiFi] Connecting to " + String(WIFI_SSID));
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    wifiConnected = true;
    Serial.println();
    Serial.print("[WiFi] Connected! IP: ");
    Serial.println(WiFi.localIP());
    digitalWrite(LED_PIN, HIGH);
  } else {
    Serial.println();
    Serial.println("[WiFi] Could not connect. Running in serial-only mode.");
  }
}

// ============================================================
// Loop
// ============================================================
void loop() {
  ts_ms = millis();
  
  // ---- Read Pulse Sensor ----
  int pulseRaw = analogRead(PULSE_PIN);
  
  // Simple BPM estimation from pulse sensor
  static int lastPulse = 0;
  static unsigned long lastBeatTime = 0;
  static int beatCount = 0;
  static unsigned long beatWindow = 0;
  
  int threshold = 2000;  // Adjust based on your sensor
  
  if (pulseRaw > threshold && lastPulse <= threshold) {
    unsigned long now = millis();
    if (now - lastBeatTime > 300) {  // Debounce
      unsigned long interval = now - lastBeatTime;
      lastBeatTime = now;
      
      if (interval > 200 && interval < 2000) {
        beatCount++;
        beatWindow += interval;
        bpm = 60000 / (beatWindow / beatCount);
        
        if (beatCount > 10) {
          beatCount = 0;
          beatWindow = 0;
        }
      }
    }
  }
  lastPulse = pulseRaw;
  
  // Reset BPM if no beats for 3 seconds
  if (millis() - lastBeatTime > 3000) {
    bpm = 0;
    beatCount = 0;
    beatWindow = 0;
  }
  
  // ---- Read G-Force (simulated or from MPU6050) ----
  g_force = 1.0;  // Placeholder — real MPU would read via I2C
  
  // ---- Determine alert ----
  if (bpm > 120) {
    alert_status = "WARN";
  } else if (bpm > 90) {
    alert_status = "ELEVATED";
  } else {
    alert_status = "OK";
  }
  
  // ---- Serial Output ----
  Serial.printf("%lu,%d,%d,%.2f,%s\\n", ts_ms, pulseRaw, bpm, g_force, alert_status.c_str());
  
  // ---- WiFi HTTP POST ----
  if (wifiConnected && millis() - lastSend > SEND_INTERVAL_MS) {
    lastSend = millis();
    sendToBridge(pulseRaw, bpm, g_force, alert_status);
  }
  
  // ---- WiFi Reconnect ----
  if (!wifiConnected && millis() - lastWiFiAttempt > WIFI_RETRY_MS) {
    lastWiFiAttempt = millis();
    WiFi.begin(WIFI_SSID, WIFI_PASS);
    int retry = 0;
    while (WiFi.status() != WL_CONNECTED && retry < 10) {
      delay(300);
      retry++;
    }
    wifiConnected = (WiFi.status() == WL_CONNECTED);
    if (wifiConnected) {
      digitalWrite(LED_PIN, HIGH);
      Serial.print("[WiFi] Reconnected! IP: ");
      Serial.println(WiFi.localIP());
    }
  }
  
  delay(100);  // ~10 Hz sampling rate
}

// ============================================================
// Send to Bridge
// ============================================================
void sendToBridge(int pulseRaw, int bpm, float gForce, String status) {
  if (WiFi.status() != WL_CONNECTED) return;
  
  HTTPClient http;
  String url = "http://" + String(BRIDGE_HOST) + ":" + String(BRIDGE_PORT) + BRIDGE_PATH;
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  
  StaticJsonDocument<256> doc;
  doc["device_id"] = "prism-node-001";
  doc["signal_type"] = "physiological";
  
  JsonObject metadata = doc.createNestedObject("metadata");
  metadata["bpm"] = bpm;
  metadata["g_force"] = gForce;
  metadata["alert_status"] = status;
  metadata["pulse_raw"] = pulseRaw;
  metadata["source"] = "prism-pulse-v4-esp32";
  
  String body;
  serializeJson(doc, body);
  
  int httpCode = http.POST(body);
  
  if (httpCode > 0) {
    // Success — optionally blink LED
  } else {
    Serial.print("[WiFi] POST failed: ");
    Serial.println(http.errorToString(httpCode).c_str());
  }
  
  http.end();
}
"""

if __name__ == "__main__":
    print("PRISM PULSE WiFi Firmware")
    print("=" * 50)
    print()
    print("This file contains the ESP32 Arduino firmware (C++).")
    print("To flash:")
    print("  1. Open Arduino IDE")
    print("  2. Copy the FIRMWARE_CPP content below this message")
    print("  3. Select board: ESP32 Dev Module")
    print("  4. Select port: COM7")
    print("  5. Upload")
    print()
    print(FIRMWARE_CPP)
