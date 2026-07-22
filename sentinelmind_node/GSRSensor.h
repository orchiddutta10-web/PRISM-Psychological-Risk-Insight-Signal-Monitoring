#ifndef SENTINELMIND_GSRSENSOR_H
#define SENTINELMIND_GSRSENSOR_H

#include <Arduino.h>
#include "Config.h"

/* -------------------------------------------------------------------
 *  GSRSensor
 *
 *  Reads a GSR voltage-divider analog input and converts the ADC value
 *  to skin conductance in microSiemens (µS).
 *
 *  Pipeline:
 *    1. Moving-average filter (5-tap) for noise reduction
 *    2. ADC code → Vout → R_skin → Conductance [µS]
 *    3. Single-pole IIR low-pass (α = 0.001 ≈ 0.05 Hz) → Tonic SCL
 *    4. Phasic SCR = instantaneous - tonic (clamped ≥ 0)
 *
 *  Circuit assumed:
 *      VCC ──[GSR electrodes]──┬──[R_fixed]── GND
 *                               │
 *                              ADC pin
 *
 *      R_skin = R_fixed * (VCC / Vout - 1)
 *      G [µS] = 1e6 / R_skin
 * ------------------------------------------------------------------- */
class GSRSensor {
public:
  GSRSensor(uint8_t pin)
    : _pin(pin),
      _raw(0),
      _conductance(0.0f),
      _tonic(0.0f),
      _phasic(0.0f),
      _lastTonic(0.0f)
  {
    _maBuffer[0] = _maBuffer[1] = _maBuffer[2] = _maBuffer[3] = _maBuffer[4] = 0;
    _maIdx = 0;
  }

  // ----------------------------------------------------------------
  //  readAndProcess — called every SAMPLE_INTERVAL_MS
  // ----------------------------------------------------------------
  void readAndProcess() {
    _raw = analogRead(_pin);

    /* Moving-average filter */
    _maBuffer[_maIdx] = (float)_raw;
    _maIdx = (_maIdx + 1) % GSR_MA_WINDOW;
    float sum = 0;
    for (int i = 0; i < GSR_MA_WINDOW; i++) sum += _maBuffer[i];
    float filtered = sum / GSR_MA_WINDOW;

    /* ADC code → Vout [V] */
    float vout = (filtered / (float)ADC_RESOLUTION) * ADC_VREF;

    /* Guard against division-by-zero / short-circuit */
    if (vout < 0.001f) vout = 0.001f;
    if (vout >= ADC_VREF - 0.001f) vout = ADC_VREF - 0.001f;

    /* R_skin via voltage divider */
    float rSkin = GSR_FIXED_RESISTOR * (ADC_VREF / vout - 1.0f);
    if (rSkin < 100.0f)   rSkin = 100.0f;     /* clamp unrealistically low R */
    if (rSkin > 10.0e6f)  rSkin = 10.0e6f;    /* clamp open-circuit */

    /* Conductance in microSiemens */
    _conductance = 1.0e6f / rSkin;

    /* Tonic (SCL) — single-pole IIR low-pass */
    _tonic = _lastTonic + GSR_TONIC_ALPHA * (_conductance - _lastTonic);
    _lastTonic = _tonic;

    /* Phasic (SCR) — residual above tonic */
    _phasic = _conductance - _tonic;
    if (_phasic < 0.0f) _phasic = 0.0f;
  }

  // ----------------------------------------------------------------
  //  Accessors
  // ----------------------------------------------------------------
  uint16_t rawADC()           const { return _raw; }
  float    conductance()      const { return _conductance; }   /* µS */
  float    tonicSCL()         const { return _tonic; }         /* µS */
  float    phasicSCR()        const { return _phasic; }        /* µS */
  float    voltage()          const {
    return ((float)_raw / ADC_RESOLUTION) * ADC_VREF;
  }

  // ----------------------------------------------------------------
  //  report — formatted serial line for debug
  // ----------------------------------------------------------------
  void report() const {
    Serial.print("  GSR    raw=");
    Serial.print(_raw);
    Serial.print("  Vout=");
    Serial.print(voltage(), 3);
    Serial.print("V  G=");
    Serial.print(_conductance, 2);
    Serial.print(" µS  tonic=");
    Serial.print(_tonic, 2);
    Serial.print("  phasic=");
    Serial.print(_phasic, 2);
  }

private:
  uint8_t  _pin;
  uint16_t _raw;

  float    _maBuffer[GSR_MA_WINDOW];
  uint8_t  _maIdx;

  float    _conductance;
  float    _tonic;
  float    _phasic;
  float    _lastTonic;
};

#endif /* SENTINELMIND_GSRSENSOR_H */
