/* ===================================================================
 *  SentinelMind Node — ESP32 / ESP8266 Hardware Sensor Firmware
 *
 *  Reads Analog Pulse Sensor (HR) and GSR Sensor at 100 Hz via
 *  hardware Ticker, processes BPM + conductance in real-time, batches
 *  readings, and POSTs structured JSON to the Flask backend every
 *  1000 ms.
 *
 *  Pinout (ESP32)
 *    Pulse Sensor   → GPIO34 (ADC1_CH6)
 *    GSR Sensor     → GPIO35 (ADC1_CH7)
 *    Built-in LED   → GPIO2
 *
 *  Dependencies (install via Library Manager)
 *    - ArduinoJson  by Benoit Blanchon  v6+
 *    - Ticker        (built-in for ESP32/ESP8266)
 *
 *  Author:  SentinelMind Firmware Team
 *  Version: 1.0.0
 * =================================================================== */

#include "Config.h"
#include "WiFiManager.h"
#include "PulseSensor.h"
#include "GSRSensor.h"
#include "TransmitManager.h"

/* ===================================================================
 *  Global Instances
 * =================================================================== */
WiFiManager      wifiMgr;
PulseSensor      pulseSensor(PIN_PULSE_SENSOR);
GSRSensor        gsrSensor(PIN_GSR_SENSOR);
TransmitManager  txMgr;

/* ===================================================================
 *  Ticker — hardware timer driven sampling flag
 *
 *  The ISR is kept as lean as possible: just sets a volatile flag.
 *  All ADC reads, filtering, and feature extraction happen in the
 *  main loop so they never block the timer.
 * =================================================================== */
#include <Ticker.h>
Ticker           sampleTicker;
volatile bool    samplingFlag     = false;
volatile uint32_t tickCount       = 0;

void IRAM_ATTR onSampleTick() {
  samplingFlag = true;
  tickCount++;
}

/* ===================================================================
 *  Debug counters
 * =================================================================== */
static unsigned long lastDebugPrint  = 0;
static uint32_t      loopCount       = 0;

/* ===================================================================
 *  setup
 * =================================================================== */
void setup() {
  Serial.begin(SERIAL_BAUD);
  delay(200);
  Serial.println();
  Serial.println(F("=============================================="));
  Serial.println(F("  SentinelMind Node v" FIRMWARE_VERSION));
  Serial.println(F("  Firmware for ESP32/ESP8266 Biosensor Node"));
  Serial.println(F("=============================================="));

  /* LED */
  pinMode(PIN_LED_BUILTIN, OUTPUT);
  digitalWrite(PIN_LED_BUILTIN, HIGH);

  /* ADC configuration */
  #if defined(ESP32)
    analogReadResolution(12);                      /* 0-4095 */
    analogSetAttenuation(ADC_11db);                /* 0 - 3.3V range */
    Serial.println(F("[ADC] 12-bit, 0-3.3V range, attenuation 11dB"));
  #elif defined(ESP8266)
    Serial.println(F("[ADC] 10-bit (ESP8266), 0-3.3V range"));
  #endif

  /* Wi-Fi */
  wifiMgr.begin(WIFI_SSID, WIFI_PASS);

  /* Hardware timer: 100 Hz sampling */
  sampleTicker.attach_ms(SAMPLE_INTERVAL_MS, onSampleTick);
  Serial.print(F("[Timer] Sampling at "));
  Serial.print(SAMPLE_RATE_HZ, 0);
  Serial.println(F(" Hz (10 ms interval)"));

  Serial.println(F("=============================================="));
  Serial.println(F("       RAW ADC    |  PULSE              |  GSR"));
  Serial.println(F("  #   pulse  gsr  |  flt   BPM  conf    |  µS    tonic  phasic"));
  Serial.println(F("------+-----+-----+---------------------+--------------------"));
}

/* ===================================================================
 *  loop
 * =================================================================== */
void loop() {
  loopCount++;

  /* ---- 1. Maintain Wi-Fi link (non-blocking) ---- */
  wifiMgr.maintain();

  /* ---- 2. Timer-driven sampling ---- */
  if (samplingFlag) {
    samplingFlag = false;

    /* Read both sensors */
    pulseSensor.readAndProcess();
    gsrSensor.readAndProcess();
  }

  /* ---- 3. Buffer reading into transmit queue ---- */
  SensorReading reading;
  reading.timestampMs    = millis();
  reading.pulseRaw       = pulseSensor.raw();
  reading.hrBpm          = pulseSensor.bpm();
  reading.hrConfidence   = pulseSensor.confidence();
  reading.ibiMs          = pulseSensor.ibiMs();
  reading.gsrRaw         = gsrSensor.rawADC();
  reading.gsrUs          = gsrSensor.conductance();
  reading.gsrTonicUs     = gsrSensor.tonicSCL();
  reading.gsrPhasicUs    = gsrSensor.phasicSCR();
  txMgr.push(reading);

  /* ---- 4. Transmit batch (every TRANSMIT_INTERVAL_MS) ---- */
  txMgr.tryTransmit(wifiMgr.isConnected());

  /* ---- 5. Serial debug output ---- */
  if (millis() - lastDebugPrint >= DEBUG_PRINT_INTERVAL_MS) {
    lastDebugPrint = millis();
    _printDebugLine();
  }
}

/* ===================================================================
 *  _printDebugLine — formatted tabular serial output
 * =================================================================== */
static void _printDebugLine() {
  unsigned long now = millis();
  unsigned long uptimeSec = now / 1000;
  unsigned long h = uptimeSec / 3600;
  unsigned long m = (uptimeSec % 3600) / 60;
  unsigned long s = uptimeSec % 60;

  /* Column header (repeated every 20 lines for readability) */
  static uint8_t lineCount = 0;
  if (++lineCount >= 20) {
    lineCount = 0;
    Serial.println(F("------+-----+-----+---------------------+--------------------"));
    Serial.println(F("  #   pulse  gsr  |  flt   BPM  conf    |  µS    tonic  phasic"));
    Serial.println(F("------+-----+-----+---------------------+--------------------"));
  }

  char buf[128];

  snprintf(buf, sizeof(buf),
           "%4u | %4u | %4u | %4.0f %5.1f %3.0f%%  | %5.2f %6.2f %6.2f",
           tickCount % 9999,
           pulseSensor.raw(),
           gsrSensor.rawADC(),
           pulseSensor.filtered(),
           pulseSensor.bpm(),
           pulseSensor.confidence() * 100.0f,
           gsrSensor.conductance(),
           gsrSensor.tonicSCL(),
           gsrSensor.phasicSCR()
  );
  Serial.println(buf);

  /* ---- 5b. Extended status block ---- */
  Serial.print(F("  [WiFi] "));
  Serial.print(wifiMgr.isConnected() ? F("CONNECTED") : F("DISCONNECTED"));
  if (wifiMgr.isConnected()) {
    Serial.print(F("  IP="));
    Serial.print(wifiMgr.localIP());
    Serial.print(F("  RSSI="));
    Serial.print(wifiMgr.rssi());
    Serial.print(F(" dBm"));
  }
  Serial.println();

  Serial.print(F("  [TX]   OK="));
  Serial.print(txMgr.txOk());
  Serial.print(F("  FAIL="));
  Serial.print(txMgr.txFail());
  Serial.print(F("  queued="));
  Serial.print(txMgr.queued());
  Serial.print(F("  last_payload="));
  Serial.print(txMgr.lastPayload());
  Serial.print(F(" bytes"));
  Serial.println();

  /* ---- Raw waveform dump (compact) ---- */
  Serial.print(F("  [RAW]  "));
  for (int i = 0; i < 40; i++) {
    int barLen = map(pulseSensor.raw(), 0, ADC_RESOLUTION, 0, 40);
    Serial.print(i < barLen ? '#' : ' ');
  }
  Serial.print(F("  ADCp="));
  Serial.print(pulseSensor.raw());

  Serial.print(F("  |  "));

  for (int i = 0; i < 40; i++) {
    int barLen2 = map(gsrSensor.rawADC(), 0, ADC_RESOLUTION, 0, 40);
    Serial.print(i < barLen2 ? '#' : ' ');
  }
  Serial.print(F("  ADCs="));
  Serial.print(gsrSensor.rawADC());
  Serial.println();
}
