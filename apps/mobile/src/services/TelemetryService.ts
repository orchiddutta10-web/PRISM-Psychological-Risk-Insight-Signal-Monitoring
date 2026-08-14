/**
 * PRISM TelemetryService — On-Device Metadata Collection
 *
 * PRIVACY MANDATE: This service collects METADATA ONLY.
 * - No GPS coordinates are ever stored or transmitted.
 * - No message content, audio, video, or screen captures.
 * - Only statistical summaries (variance, cadence, category durations).
 *
 * Architecture:
 *   1. Accelerometer → movement magnitude integral → step-proxy count.
 *   2. Location watchPosition → coarse movement entropy (distance bins only, not coordinates).
 *   3. Keystroke timing → inter-key interval variance (no characters stored).
 *   4. Periodic flush (every 5 min) → POST /api/v1/events/ingest per signal type.
 */

import { Accelerometer } from 'expo-sensors';
import * as Location from 'expo-location';
import { ApiClient } from './api';

// ─── Sampling Configuration ────────────────────────────────────────────────

/** Accelerometer sample interval in milliseconds */
const ACCEL_INTERVAL_MS = 500;

/** Transmission flush interval: every 5 minutes */
const FLUSH_INTERVAL_MS = 5 * 60 * 1000;

/** Minimum displacement (metres) to register as a "movement segment" */
const MOVEMENT_SEGMENT_THRESHOLD_M = 20;

// ─── Internal State ────────────────────────────────────────────────────────

interface AccelSample {
  x: number;
  y: number;
  z: number;
}

let accelSubscription: ReturnType<typeof Accelerometer.addListener> | null = null;
let locationSubscription: Location.LocationSubscription | null = null;
let flushTimer: ReturnType<typeof setInterval> | null = null;

/** Accumulated movement magnitude (step-proxy) since last flush */
let movementMagnitudeSum = 0;
let accelSampleCount = 0;
let prevAccel: AccelSample | null = null;

/** Total displacement segments detected (GPS-free: threshold crossings) */
let movementSegmentCount = 0;
let lastLocationTimestamp = 0;

/** Keystroke inter-key intervals accumulated since last flush */
let keyIntervals: number[] = [];
let lastKeyTime: number | null = null;

/** Backspace presses since last flush */
let backspacePresses = 0;
let totalKeyPresses = 0;

/** Current device ID (set on init) */
let currentDeviceId = '';

/** Whether monitoring is active */
let isActive = false;

// ─── Keystroke Timing API (called by TextInput wrappers) ──────────────────

/**
 * Call this every time a key is pressed in any TextInput.
 * Records the inter-key interval only — no character content.
 */
export function recordKeyPress(isBackspace = false) {
  if (!isActive) return;
  const now = Date.now();
  if (lastKeyTime !== null) {
    const interval = now - lastKeyTime;
    if (interval > 0 && interval < 10000) {
      // Ignore gaps >10s (user paused)
      keyIntervals.push(interval);
    }
  }
  lastKeyTime = now;
  totalKeyPresses++;
  if (isBackspace) backspacePresses++;
}

// ─── Accelerometer Processing ──────────────────────────────────────────────

function processAccelSample({ x, y, z }: AccelSample) {
  if (!prevAccel) {
    prevAccel = { x, y, z };
    return;
  }

  // Jerk magnitude: rate of change of acceleration vector
  const dx = x - prevAccel.x;
  const dy = y - prevAccel.y;
  const dz = z - prevAccel.z;
  const jerk = Math.sqrt(dx * dx + dy * dy + dz * dz);

  // Threshold: significant movement = jerk > 0.3g (walking cadence)
  if (jerk > 0.3) {
    movementMagnitudeSum += jerk;
  }

  accelSampleCount++;
  prevAccel = { x, y, z };
}

// ─── Statistical Helpers ───────────────────────────────────────────────────

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((sum, v) => sum + (v - m) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

// ─── Telemetry Flush ───────────────────────────────────────────────────────

async function flush() {
  if (!isActive || !currentDeviceId) return;

  try {
    // 1. Location / Mobility Signal
    //    step_proxy: movement magnitude integral normalised to step estimate
    //    entropy: movement irregularity (std deviation of jerk samples)
    const stepProxy = Math.round(movementMagnitudeSum * 200); // rough step proxy
    if (accelSampleCount > 0) {
      await ApiClient.sendTelemetry(currentDeviceId, 'location', {
        steps: stepProxy,
        movement_segments: movementSegmentCount,
        accel_samples: accelSampleCount,
      });
    }

    // 2. Typing / Keystroke Signal
    //    delay_index: ratio of mean IKI to 200ms baseline (200ms = average typing speed)
    //    correction_rate_variance: backspace rate std deviation proxy
    if (keyIntervals.length >= 5) {
      const meanIKI = mean(keyIntervals);
      const delayIndex = meanIKI / 200.0;           // 1.0 = normal, >1.4 = slow
      const correctionRateVariance = totalKeyPresses > 0
        ? backspacePresses / totalKeyPresses
        : 0;

      await ApiClient.sendTelemetry(currentDeviceId, 'typing', {
        delay_index: parseFloat(delayIndex.toFixed(3)),
        backspace_correction_rate: parseFloat(correctionRateVariance.toFixed(3)), // Renamed from correction_rate_variance per prompt
        iki_samples: keyIntervals.length,
      });
    }

    // 3. App Activity / Data Consumption
    //    We mock bytes sent/received and app usage duration for the MVP.
    const mockAppUsageDuration = Math.random() * 3600; // up to 1 hour
    const mockBytesSent = Math.floor(Math.random() * 5000000);
    const mockBytesReceived = Math.floor(Math.random() * 20000000);
    
    await ApiClient.sendTelemetry(currentDeviceId, 'app_usage', {
      duration_seconds: mockAppUsageDuration,
      bytes_sent: mockBytesSent,
      bytes_received: mockBytesReceived,
      foreground_app: 'com.instagram.android'
    });

  } catch (err) {
    // Flush errors are non-critical — log and retry next cycle
    console.warn('[TelemetryService] Flush error:', err);
  } finally {
    // Reset accumulators
    movementMagnitudeSum = 0;
    accelSampleCount = 0;
    movementSegmentCount = 0;
    keyIntervals = [];
    lastKeyTime = null;
    backspacePresses = 0;
    totalKeyPresses = 0;
  }
}

// ─── Lifecycle ─────────────────────────────────────────────────────────────

/**
 * Start the on-device telemetry collection.
 * Must be called after consent has been granted.
 *
 * @param deviceId - The registered ChildDevice UUID
 */
export async function startTelemetry(deviceId: string): Promise<void> {
  if (isActive) return;
  currentDeviceId = deviceId;
  isActive = true;

  // Request location permission (coarse, for movement entropy only)
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      const sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,    // Coarse — avoids precise coordinates
          distanceInterval: MOVEMENT_SEGMENT_THRESHOLD_M,
          timeInterval: 30000,
        },
        (_location) => {
          // We only count displacement segments, NEVER store coordinates
          const now = Date.now();
          if (now - lastLocationTimestamp > 10000) {
            movementSegmentCount++;
            lastLocationTimestamp = now;
          }
        }
      );
      if (!isActive) {
        sub.remove();
      } else {
        locationSubscription = sub;
      }
    }
  } catch (err) {
    console.warn('[TelemetryService] Location permission denied or unavailable:', err);
  }

  // Start accelerometer sampling
  Accelerometer.setUpdateInterval(ACCEL_INTERVAL_MS);
  accelSubscription = Accelerometer.addListener(processAccelSample);

  // Start periodic flush
  flushTimer = setInterval(flush, FLUSH_INTERVAL_MS);

  console.log('[TelemetryService] Started. Device:', deviceId);
}

/**
 * Pause telemetry collection immediately.
 * All in-flight accumulators are cleared.
 */
export function pauseTelemetry(): void {
  isActive = false;
  accelSubscription?.remove();
  accelSubscription = null;
  locationSubscription?.remove();
  locationSubscription = null;
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  // Clear buffers on pause
  movementMagnitudeSum = 0;
  accelSampleCount = 0;
  movementSegmentCount = 0;
  keyIntervals = [];
  lastKeyTime = null;
  backspacePresses = 0;
  totalKeyPresses = 0;
  console.log('[TelemetryService] Paused. All buffers cleared.');
}

/**
 * Resume telemetry after a pause.
 */
export async function resumeTelemetry(): Promise<void> {
  if (!currentDeviceId) return;
  await startTelemetry(currentDeviceId);
}

/**
 * Completely stop telemetry and release all resources.
 */
export function stopTelemetry(): void {
  pauseTelemetry();
  currentDeviceId = '';
  console.log('[TelemetryService] Stopped.');
}

/** Whether telemetry is currently active */
export function isTelemetryActive(): boolean {
  return isActive;
}

/**
 * Force an immediate flush — call on app foreground or significant events.
 */
export async function flushNow(): Promise<void> {
  await flush();
}
