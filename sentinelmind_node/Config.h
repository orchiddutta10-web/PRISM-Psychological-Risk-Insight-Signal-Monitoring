#ifndef SENTINELMIND_CONFIG_H
#define SENTINELMIND_CONFIG_H

#include <Arduino.h>

/* ===================================================================
 *  Hardware Pin Mapping
 *  ESP32:  use GPIO34-39 (ADC1 — read-only, no pull-ups needed)
 *  ESP8266: A0 only — requires external MUX or separate ADC for multi-
 *           channel; documented here for reference.
 * =================================================================== */
#if defined(ESP32)
  #define PIN_PULSE_SENSOR      34
  #define PIN_GSR_SENSOR        35
  #define PIN_LED_BUILTIN        2
  #define ADC_RESOLUTION         4095
  #define ADC_VREF               3.30f
  #ifndef IRAM_ATTR
    #define IRAM_ATTR
  #endif
#elif defined(ESP8266)
  #define PIN_PULSE_SENSOR     A0
  #define PIN_GSR_SENSOR       A0
  #define PIN_LED_BUILTIN      LED_BUILTIN
  #define ADC_RESOLUTION         1023
  #define ADC_VREF               3.30f
  #ifndef IRAM_ATTR
    #define IRAM_ATTR ICACHE_RAM_ATTR
  #endif
#endif

/* ===================================================================
 *  Sampling & Timer
 * =================================================================== */
#define SAMPLE_INTERVAL_MS      10        /* 100 Hz hardware-timer rate */
#define SAMPLE_RATE_HZ         100.0f

/* ===================================================================
 *  Pulse Sensor (BPM) Parameters
 * =================================================================== */
#define PULSE_MA_WINDOW           5       /* moving-average filter taps */
#define PULSE_THRESHOLD_RATIO   0.60f     /* adaptive threshold = min + ratio*(max-min) */
#define PULSE_REFRACTORY_MS    250        /* minimum ms between beats (~240 BPM ceiling) */
#define PULSE_MIN_BPM           30        /* reject intervals > 2000 ms */
#define PULSE_MAX_BPM          220        /* reject intervals < ~273 ms */
#define PULSE_SIGNAL_BIAS     512.0f      /* expected resting midpoint for default ADC */

/* ===================================================================
 *  GSR Sensor Parameters
 * =================================================================== */
#define GSR_FIXED_RESISTOR   10000.0f     /* 10 kΩ voltage-divider resistor */
#define GSR_MA_WINDOW             5
#define GSR_TONIC_LP_CUTOFF    0.05f      /* 0.05 Hz — skin conductance level */
#define GSR_TONIC_ALPHA         0.001f     /* single-pole IIR coefficient at 100 Hz */

/* ===================================================================
 *  Batch / Transmit
 * =================================================================== */
#define TRANSMIT_INTERVAL_MS   1000        /* send batch every 1 second */
#define BATCH_MAX_READINGS     100         /* ring-buffer capacity */

/* ===================================================================
 *  Wi-Fi
 * =================================================================== */
#define WIFI_SSID               "YOUR_SSID"
#define WIFI_PASS               "YOUR_PASSWORD"
#define WIFI_RETRY_MS           500        /* delay between reconnect attempts */
#define WIFI_MAX_RETRIES        40         /* ~20 s before giving up each cycle */

/* ===================================================================
 *  Flask Backend
 * =================================================================== */
#define SERVER_HOST             "192.168.1.100"   /* IP of the machine running app.py */
#define SERVER_PORT             5000
#define STREAM_ENDPOINT         "/api/v1/hardware/stream"
#define HTTP_TIMEOUT_MS         3000

/* ===================================================================
 *  Device Identity
 * =================================================================== */
#define DEVICE_ID               "sm-node-001"
#define FIRMWARE_VERSION        "1.0.0"

/* ===================================================================
 *  Serial Debug
 * =================================================================== */
#define SERIAL_BAUD            115200
#define DEBUG_PRINT_INTERVAL_MS 2500       /* print detailed stats every N ms */

#endif /* SENTINELMIND_CONFIG_H */
