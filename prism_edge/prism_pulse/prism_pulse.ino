/*
 * PRISM PULSE — ESP32 NodeMCU Firmware (Multi-Factor + Cloud Edition)
 * Sensors: Analog Pulse Sensor (GPIO34) | MPU6050 (I2C) | ISD1820 (GPIO4) | I2C LCD
 * 
 * Logic: Triggers ISD1820 only if High BPM + Low Movement is sustained for 15s.
 * Cloud:  Non-blocking WiFi HTTP POST to PRISM API every TX_INTERVAL ms.
 */

#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <WiFi.h>
#include <HTTPClient.h>

// WiFi & API credentials live in secrets.h (gitignored — never commit real values)
#include "secrets.h"

#ifndef WIFI_SSID
#error "secrets.h missing — copy secrets.example.h to secrets.h and fill in your values"
#endif

// ── Pin Definitions ───────────────────────────────────────────────
#define PULSE_PIN       34    // Analog Pulse Sensor (S) → GPIO34
#define ISD_PLAY_PIN    4     // ISD1820 P-E trigger → GPIO4

// ── Devices ───────────────────────────────────────────────────────
LiquidCrystal_I2C lcd(0x27, 16, 2);
Adafruit_MPU6050 mpu;

bool lcdFound = false;
bool mpuFound = false;

// ── Pulse Sensor Variables ────────────────────────────────────────
const int THRESHOLD = 2000;
int pulseValue = 0;
bool pulseDetected = false;

unsigned long lastBeatTime = 0;
int BPM = 0;
int IBI = 600;

// ── Multi-Factor Logic Variables ──────────────────────────────────
const int BPM_THRESHOLD = 110;
const float MOVEMENT_THRESHOLD = 1.2;
const unsigned long SUSTAINED_DURATION_MS = 15000;

unsigned long anomalyStartTime = 0;
bool anomalyActive = false;
unsigned long lastISDTrigger = 0;

float currentGForce = 1.0;

// ── Timing ────────────────────────────────────────────────────────
unsigned long lastSampleMs   = 0;
unsigned long lastDisplayMs  = 0;
unsigned long lastSerialMs   = 0;
unsigned long lastTxMs       = 0;

// ── Pi Status (LCD indicator from Raspberry Pi) ────────────────────
char piStatusChar = 'B';          // default: Booting
unsigned long lastPiStatusMs = 0;

const long SAMPLE_INTERVAL   = 20;     // 50 Hz sampling for pulse
const long DISPLAY_INTERVAL  = 1000;   // Update LCD every 1s
const long SERIAL_INTERVAL   = 1000;   // Serial log every 1s
const long TX_INTERVAL       = 5000;   // Cloud transmit every 5s

// ── WiFi State Machine ────────────────────────────────────────────
enum WifiState { WIFI_DISCONNECTED, WIFI_CONNECTING, WIFI_CONNECTED };
WifiState wifiState = WIFI_DISCONNECTED;
unsigned long lastWifiAttemptMs = 0;
const long WIFI_RETRY_INTERVAL = 30000; // Retry WiFi every 30s
int wifiConnectionAttempts = 0;

// ── HTTP TX State Machine ─────────────────────────────────────────
enum TxState { TX_IDLE, TX_BUSY };
TxState txState = TX_IDLE;

// ──────────────────────────────────────────────────────────────────
bool initLCD(uint8_t addr) {
  Wire.beginTransmission(addr);
  if (Wire.endTransmission() != 0) return false;
  lcd = LiquidCrystal_I2C(addr, 16, 2);
  lcd.init();
  lcd.backlight();
  lcd.clear();
  return true;
}

void triggerISD1820(const char* reason) {
  if (millis() - lastISDTrigger < 10000) return;
  
  Serial.print("[ISD1820] Trigger: "); Serial.println(reason);
  digitalWrite(ISD_PLAY_PIN, HIGH);
  delay(100);
  digitalWrite(ISD_PLAY_PIN, LOW);
  
  lastISDTrigger = millis();
}

// ── Non-blocking WiFi connection state machine ────────────────────
void handleWiFi() {
  unsigned long now = millis();

  switch (wifiState) {
    case WIFI_DISCONNECTED:
      if (now - lastWifiAttemptMs >= WIFI_RETRY_INTERVAL) {
        lastWifiAttemptMs = now;
        wifiConnectionAttempts++;
        Serial.print("[WiFi] Connecting to "); Serial.print(WIFI_SSID);
        Serial.print(" (attempt "); Serial.print(wifiConnectionAttempts); Serial.println(")");
        WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
        wifiState = WIFI_CONNECTING;
      }
      break;

    case WIFI_CONNECTING:
      if (WiFi.status() == WL_CONNECTED) {
        wifiState = WIFI_CONNECTED;
        wifiConnectionAttempts = 0;
        Serial.print("[WiFi] Connected! IP: ");
        Serial.println(WiFi.localIP());
      } else if (now - lastWifiAttemptMs > 15000) {
        // Timeout after 15s — go back to disconnected for retry
        Serial.println("[WiFi] Connection timeout, will retry...");
        WiFi.disconnect(true);
        wifiState = WIFI_DISCONNECTED;
        lastWifiAttemptMs = now; // Reset timer for next retry
      }
      break;

    case WIFI_CONNECTED:
      if (WiFi.status() != WL_CONNECTED) {
        Serial.println("[WiFi] Lost connection");
        wifiState = WIFI_DISCONNECTED;
        lastWifiAttemptMs = now;
      }
      break;
  }
}

// ── Non-blocking HTTP POST ────────────────────────────────────────
void transmitReading() {
  if (wifiState != WIFI_CONNECTED || txState != TX_IDLE) return;

  // Build JSON payload matching the API format
  String alertStatus;
  if (BPM == 0) {
    alertStatus = "OK";
  } else if (anomalyActive) {
    long remaining = (SUSTAINED_DURATION_MS - (millis() - anomalyStartTime)) / 1000;
    alertStatus = "WARNING-" + String(remaining) + "s";
  } else {
    alertStatus = "OK";
  }

  String jsonPayload = "{";
  jsonPayload += "\"ts_ms\":" + String(millis()) + ",";
  jsonPayload += "\"pulse_raw\":" + String(pulseValue) + ",";
  jsonPayload += "\"bpm\":" + String(BPM) + ",";
  jsonPayload += "\"g_force\":" + String(currentGForce, 3) + ",";
  jsonPayload += "\"alert_status\":\"" + alertStatus + "\"";
  jsonPayload += "}";

  txState = TX_BUSY;

  HTTPClient http;
  http.begin(API_BASE_URL + String("/api/v1/physio/pulse/ingest"));
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", "Bearer " + String(DEVICE_JWT));
  http.setTimeout(3000); // 3 second HTTP timeout

  int httpCode = http.POST(jsonPayload);
  
  if (httpCode > 0) {
    Serial.print("[HTTP] POST /pulse/ingest → "); Serial.print(httpCode);
    Serial.print(" — ");
    if (httpCode == 200 || httpCode == 201) {
      Serial.println("OK");
    } else {
      Serial.println("FAIL");
      String response = http.getString();
      if (response.length() > 0 && response.length() < 200) {
        Serial.print("       Response: "); Serial.println(response);
      }
    }
  } else {
    Serial.print("[HTTP] POST failed: "); Serial.println(http.errorToString(httpCode));
    // Connection error likely means WiFi dropped
    wifiState = WIFI_DISCONNECTED;
  }

  http.end();
  txState = TX_IDLE;
}

// ──────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println("=== PRISM PULSE v5.0 (Multi-Factor + Cloud) ===");
  
  // ISD1820
  pinMode(ISD_PLAY_PIN, OUTPUT);
  digitalWrite(ISD_PLAY_PIN, LOW);

  // I2C (For LCD and MPU6050)
  Wire.begin(21, 22);

  // LCD
  if (initLCD(0x27)) { lcdFound = true; Serial.println("[LCD] 0x27"); }
  else if (initLCD(0x3F)) { lcdFound = true; Serial.println("[LCD] 0x3F"); }

  if (lcdFound) {
    lcd.setCursor(0, 0); lcd.print("PRISM v5");
    lcd.setCursor(0, 1); lcd.print("Booting...");
  }

  // MPU6050
  if (!mpu.begin()) {
    Serial.println("[MPU6050] Not Found! Check I2C wiring.");
  } else {
    mpuFound = true;
    Serial.println("[MPU6050] Found!");
    mpu.setAccelerometerRange(MPU6050_RANGE_4_G);
  }

  // WiFi — set to station mode, trigger first connection attempt
  WiFi.mode(WIFI_STA);
  lastWifiAttemptMs = millis() - WIFI_RETRY_INTERVAL + 2000; // Start connecting after 2s

  triggerISD1820("startup");
  delay(1000);
  
  Serial.println("ts_ms,pulse_raw,bpm,g_force,alert_status");
}

// ──────────────────────────────────────────────────────────────────
void loop() {
  unsigned long now = millis();

  // ── Read Pi Status Byte from UART ────────────────────────────────
  if (Serial.available() > 0) {
    char c = Serial.read();
    // Valid Pi status characters: O, X, S, E, B
    if (c == 'O' || c == 'X' || c == 'S' || c == 'E' || c == 'B') {
      piStatusChar = c;
      lastPiStatusMs = now;
    }
  }

  // ── Handle WiFi state machine (non-blocking) ────────────────────
  if (now - lastSampleMs >= SAMPLE_INTERVAL || 
      wifiState == WIFI_CONNECTING || 
      (now - lastTxMs >= TX_INTERVAL)) {
    handleWiFi();
  }

  // ── 1. Acquire Pulse Sensor (50 Hz) ─────────────────────────────
  if (now - lastSampleMs >= SAMPLE_INTERVAL) {
    lastSampleMs = now;
    pulseValue = analogRead(PULSE_PIN);

    // Peak detection
    if (pulseValue > THRESHOLD && !pulseDetected) {
      pulseDetected = true;
      IBI = now - lastBeatTime;
      lastBeatTime = now;
      if (IBI > 300 && IBI < 2000) { BPM = 60000 / IBI; }
    } 
    if (pulseValue < THRESHOLD && pulseDetected) {
      pulseDetected = false;
    }

    // ── 2. Acquire Kinesthetic Data (MPU6050) ─────────────────────
    if (mpuFound) {
      sensors_event_t a, g, temp;
      mpu.getEvent(&a, &g, &temp);
      currentGForce = sqrt(a.acceleration.x * a.acceleration.x + 
                           a.acceleration.y * a.acceleration.y + 
                           a.acceleration.z * a.acceleration.z) / 9.81;
    } else {
      currentGForce = 1.0;
    }

    // ── 3. Multi-Factor Decision Logic ─────────────────────────────
    bool isHighBPM = (BPM >= BPM_THRESHOLD);
    bool isInactive = (currentGForce <= MOVEMENT_THRESHOLD);

    if (isHighBPM && isInactive) {
      if (!anomalyActive) {
        anomalyStartTime = now;
        anomalyActive = true;
      } else {
        if (now - anomalyStartTime >= SUSTAINED_DURATION_MS) {
          triggerISD1820("Sustained High BPM + Inactivity");
          anomalyActive = false;
          anomalyStartTime = now + 10000;
        }
      }
    } else {
      anomalyActive = false;
    }

    // ── Serial Logging ────────────────────────────────────────────
    if (now - lastSerialMs >= SERIAL_INTERVAL) {
      lastSerialMs = now;
      Serial.print(now); Serial.print(",");
      Serial.print(pulseValue); Serial.print(",");
      Serial.print(BPM); Serial.print(",");
      Serial.print(currentGForce); Serial.print(",");
      
      if (anomalyActive) {
        long remaining = (SUSTAINED_DURATION_MS - (now - anomalyStartTime)) / 1000;
        Serial.print("WARNING-"); Serial.print(remaining); Serial.println("s");
      } else {
        Serial.println("OK");
      }
    }

    // ── Cloud Transmission (every TX_INTERVAL) ────────────────────
    if (now - lastTxMs >= TX_INTERVAL) {
      lastTxMs = now;
      transmitReading();
    }

    // ── LCD Update ────────────────────────────────────────────────
    if (lcdFound && (now - lastDisplayMs >= DISPLAY_INTERVAL)) {
      lastDisplayMs = now;
      
      lcd.setCursor(0, 0);
      lcd.print("BPM:"); lcd.print(BPM); lcd.print(" G:"); lcd.print(currentGForce, 1);
      
      // Pi status character on LCD row 0 (replaces WiFi indicator)
      // If no Pi status received for 10s, show '?'
      lcd.setCursor(13, 0);
      if (now - lastPiStatusMs < 10000) {
        lcd.print(piStatusChar);
      } else {
        lcd.print("?");
      }
      lcd.print("  ");

      lcd.setCursor(0, 1);
      if (pulseValue == 0) {
        lcd.print("Place Finger... ");
      } else if (anomalyActive) {
        long remaining = (SUSTAINED_DURATION_MS - (now - anomalyStartTime)) / 1000;
        lcd.print("ALERT IN: "); lcd.print(remaining); lcd.print("s  ");
      } else {
        lcd.print("Status: Normal  ");
      }
    }
  }
}
