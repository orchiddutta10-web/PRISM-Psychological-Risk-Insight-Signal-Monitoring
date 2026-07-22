#ifndef SENTINELMIND_PULSESENSOR_H
#define SENTINELMIND_PULSESENSOR_H

#include <Arduino.h>
#include "Config.h"

/* -------------------------------------------------------------------
 *  PulseSensor
 *
 *  Real-time heart-rate (BPM) detection from an analog Pulse Sensor
 *  Amplified module using an adaptive-threshold state machine.
 *
 *  Pipeline:
 *    1. Moving-average filter (5-tap) to reject 50/60 Hz ripple
 *    2. Track running min/max with slow decay
 *    3. Threshold = min + ratio * (max - min)
 *    4. Rising-edge crossing → beat detected → measure IBI
 *    5. Reject intervals outside [PULSE_MIN_BPM .. PULSE_MAX_BPM]
 *    6. Report BPM = 60000 / IBI
 * ------------------------------------------------------------------- */
class PulseSensor {
public:
  PulseSensor(uint8_t pin)
    : _pin(pin),
      _raw(0), _filtered(0),
      _signalMin(1024), _signalMax(0),
      _lastBeatTime(0),
      _lastBPM(0.0f),
      _bpm(0.0f),
      _confidence(0.0f),
      _beatCount(0),
      _inRefractory(false)
  {
    _maBuffer[0] = _maBuffer[1] = _maBuffer[2] = _maBuffer[3] = _maBuffer[4] = 0;
    _maIdx = 0;
  }

  // ----------------------------------------------------------------
  //  readAndProcess — called every SAMPLE_INTERVAL_MS from the main loop
  //  Performs one ADC read + filter + beat-detection step.
  // ----------------------------------------------------------------
  void readAndProcess() {
    _raw = analogRead(_pin);

    /* Moving-average filter */
    _maBuffer[_maIdx] = (float)_raw;
    _maIdx = (_maIdx + 1) % PULSE_MA_WINDOW;

    float sum = 0;
    for (int i = 0; i < PULSE_MA_WINDOW; i++) sum += _maBuffer[i];
    _filtered = sum / PULSE_MA_WINDOW;

    /* Update running min/max (asymmetric tracker with slow decay) */
    if (_filtered > _signalMax) {
      _signalMax = _filtered;
    } else {
      _signalMax -= (_signalMax - _filtered) * 0.005f;   /* slow decay */
    }

    if (_filtered < _signalMin) {
      _signalMin = _filtered;
    } else {
      _signalMin += (_filtered - _signalMin) * 0.005f;
    }

    /* Enforce min dynamic range to avoid noise-floor triggering */
    float range = _signalMax - _signalMin;
    if (range < 15.0f) {
      _inRefractory = false;     /* signal too flat — no beat possible */
      return;
    }

    float threshold = _signalMin + PULSE_THRESHOLD_RATIO * range;

    /* Refractory check */
    unsigned long now = millis();
    if (_inRefractory && (now - _lastBeatTime) >= PULSE_REFRACTORY_MS) {
      _inRefractory = false;
    }

    /* Beat detection: rising-edge crossing of threshold */
    if (!_inRefractory && _prevFiltered <= threshold && _filtered > threshold) {
      unsigned long ibi = now - _lastBeatTime;

      if (ibi >= (60000UL / PULSE_MAX_BPM) && ibi <= (60000UL / PULSE_MIN_BPM)) {
        _lastBPM = 60000.0f / (float)ibi;
        _bpm = _bpm * 0.6f + _lastBPM * 0.4f;                /* IIR smooth */
        _confidence = _constrainConfidence(range);
        _beatCount++;
      }

      _lastBeatTime = now;
      _inRefractory = true;
    }

    _prevFiltered = _filtered;
  }

  // ----------------------------------------------------------------
  //  Accessors
  // ----------------------------------------------------------------
  uint16_t raw()         const { return _raw; }
  float    filtered()    const { return _filtered; }
  float    bpm()         const { return _bpm; }
  float    confidence()  const { return _confidence; }
  float    signalMin()   const { return _signalMin; }
  float    signalMax()   const { return _signalMax; }
  uint32_t beatCount()   const { return _beatCount; }

  float    ibiMs()       const {
    return _bpm > 0.0f ? 60000.0f / _bpm : 0.0f;
  }

  // ----------------------------------------------------------------
  //  report — formatted serial line for debug
  // ----------------------------------------------------------------
  void report() const {
    Serial.print("  PULSE  raw=");
    Serial.print(_raw);
    Serial.print("  flt=");
    Serial.print(_filtered, 1);
    Serial.print("  [");
    Serial.print(_signalMin, 0);
    Serial.print("..");
    Serial.print(_signalMax, 0);
    Serial.print("]  BPM=");
    Serial.print(_bpm, 1);
    Serial.print("  (conf=");
    Serial.print(_confidence * 100.0f, 0);
    Serial.print("%)  beats=");
    Serial.print(_beatCount);
  }

  void reset() {
    _bpm = 0.0f;
    _lastBPM = 0.0f;
    _confidence = 0.0f;
    _beatCount = 0;
    _lastBeatTime = 0;
    _inRefractory = false;
  }

private:
  uint8_t  _pin;
  uint16_t _raw;
  float    _filtered;
  float    _prevFiltered;

  float    _maBuffer[PULSE_MA_WINDOW];
  uint8_t  _maIdx;

  float    _signalMin;
  float    _signalMax;

  unsigned long _lastBeatTime;
  float    _lastBPM;
  float    _bpm;
  float    _confidence;
  uint32_t _beatCount;
  bool     _inRefractory;

  float _constrainConfidence(float range) const {
    /* Heuristic confidence based on signal quality */
    if (range > 200.0f) return 0.95f;
    if (range > 100.0f) return 0.85f;
    if (range >  50.0f) return 0.70f;
    if (range >  30.0f) return 0.55f;
    return 0.30f;
  }
};

#endif /* SENTINELMIND_PULSESENSOR_H */
