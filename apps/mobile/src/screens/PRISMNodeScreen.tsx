import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';

// ALTERNATE BRAND NAMES RESEARCHED FOR THE HARDWARE LAYER:
// 1. "Pulse" - Focuses on cardiac PPG wave monitoring.
// 2. "Aura" - Represents the surrounding galvanic field / GSR.
// 3. "VitalLink" - Connects physiological metadata directly to well-being indicators.
// Core selection: "PRISM Node"

interface PRISMNodeScreenProps {
  deviceId: string;
  onBackToBehavior: () => void;
}

export default function PRISMNodeScreen({ deviceId, onBackToBehavior }: PRISMNodeScreenProps) {
  const [hr, setHr] = useState(72);
  const [gsr, setGsr] = useState(3.4);
  const [isConnected, setIsConnected] = useState(true);
  const [batteryLevel, setBatteryLevel] = useState(94);
  const [syncStatus, setSyncStatus] = useState<'syncing' | 'online' | 'offline'>('online');

  // Time-series history for chart components (last 15 readings)
  const [hrHistory, setHrHistory] = useState<number[]>([70, 72, 71, 74, 75, 73, 72, 71, 73, 74, 72, 71, 72, 73, 72]);
  const [gsrHistory, setGsrHistory] = useState<number[]>([3.2, 3.3, 3.4, 3.4, 3.5, 3.3, 3.2, 3.1, 3.3, 3.4, 3.3, 3.4, 3.5, 3.4, 3.4]);

  // Simulate real-time streams
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isConnected) {
      interval = setInterval(() => {
        setSyncStatus('syncing');
        const nextHr = Math.max(60, Math.min(100, hr + (Math.random() * 4 - 2)));
        const nextGsr = Math.max(1.0, Math.min(10.0, gsr + (Math.random() * 0.4 - 0.2)));
        
        setHr(nextHr);
        setGsr(nextGsr);

        setHrHistory(prev => [...prev.slice(1), nextHr]);
        setGsrHistory(prev => [...prev.slice(1), nextGsr]);

        // Slowly drain battery
        setBatteryLevel(prev => Math.max(5, prev - (Math.random() > 0.8 ? 1 : 0)));

        setTimeout(() => setSyncStatus('online'), 600);
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [isConnected, hr, gsr]);

  // Render a custom bar chart using native components
  const renderMiniChart = (data: number[], minVal: number, maxVal: number, barColor: string) => {
    const range = maxVal - minVal;
    return (
      <View style={styles.chartContainer}>
        {data.map((val, idx) => {
          // Calculate height percentage
          const percent = range > 0 ? ((val - minVal) / range) * 100 : 50;
          const barHeight = Math.max(10, Math.min(60, (percent / 100) * 60));
          return (
            <View key={idx} style={styles.chartBarWrapper}>
              <View style={[styles.chartBar, { height: barHeight, backgroundColor: barColor }]} />
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.brandTitle}>PRISM Node</Text>
          <Text style={styles.brandSubtitle}>Physiological IoT Layer</Text>
        </View>
        <TouchableOpacity style={styles.backButton} onPress={onBackToBehavior}>
          <Text style={styles.backButtonText}>Behavior Metrics</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Hardware / IoT status card */}
        <View style={styles.statusCard}>
          <Text style={styles.sectionTitle}>Wearable Status</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: syncStatus === 'syncing' ? '#FFC107' : '#00E5FF' }]} />
            <Text style={styles.statusText}>
              {syncStatus === 'syncing' ? 'Syncing buffer...' : 'Connected (BLE)'}
            </Text>
            <View style={styles.batteryContainer}>
              <Text style={styles.batteryText}>⚡ {batteryLevel}%</Text>
            </View>
          </View>
        </View>

        {/* Real-time Vitals Grid */}
        <View style={styles.metricsGrid}>
          {/* Heart Rate PPG */}
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Heart Rate (PPG)</Text>
            <Text style={styles.metricValue}>
              {hr.toFixed(0)} <Text style={styles.metricUnit}>BPM</Text>
            </Text>
            {renderMiniChart(hrHistory, 55, 105, '#FF1744')}
            <Text style={styles.metricDesc}>Nocturnal resting HR: 64 BPM</Text>
          </View>

          {/* Skin Conductance GSR */}
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Electrodermal (GSR)</Text>
            <Text style={styles.metricValue}>
              {gsr.toFixed(2)} <Text style={styles.metricUnit}>µS</Text>
            </Text>
            {renderMiniChart(gsrHistory, 1.5, 6.5, '#00E5FF')}
            <Text style={styles.metricDesc}>Baseline Arousal: Low</Text>
          </View>
        </View>

        {/* Inferred sleep timeline visual */}
        <View style={styles.sleepCard}>
          <Text style={styles.sectionTitle}>Sleep Window Inference (Circadian)</Text>
          <Text style={styles.sleepInfo}>Last Night: 11:15 PM - 7:30 AM</Text>
          
          {/* Visual Sleep Timeline */}
          <View style={styles.timelineBar}>
            <View style={styles.timelineActive} />
            <View style={styles.timelineSleep} />
            <View style={styles.timelineActive} />
          </View>
          <View style={styles.timelineLabels}>
            <Text style={styles.timelineLabelText}>10 PM</Text>
            <Text style={styles.timelineLabelText}>Sleep Block (8.25h)</Text>
            <Text style={styles.timelineLabelText}>8 AM</Text>
          </View>

          <Text style={styles.sleepDesc}>
            Sleep block detected via resting-HR plateau and low GSR variance, combined with accelerometer stillness.
          </Text>
        </View>

        {/* Modular Ethics Explainer */}
        <View style={styles.ethicsCard}>
          <Text style={styles.ethicsTitle}>What we measure and why</Text>
          <Text style={styles.ethicsText}>
            PRISM Node collects physiological markers—Galvanic Skin Response (GSR) and nocturnal heart rate (PPG)—to detect resting baselines, sleep boundaries, and physical stress. 
            {"\n\n"}
            This data is encrypted locally at rest and never contains diagnostic findings or raw health records. It maps trends to explain wellness indicators for you and your guardian.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#070707',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 30,
    paddingBottom: 15,
    backgroundColor: '#121212',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  brandTitle: {
    color: '#00E5FF',
    fontSize: 20,
    fontWeight: 'bold',
    letterSpacing: 1.2,
  },
  brandSubtitle: {
    color: '#666',
    fontSize: 10,
    marginTop: 2,
  },
  backButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#222',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#333',
  },
  backButtonText: {
    color: '#FFF',
    fontSize: 12,
  },
  scrollContent: {
    padding: 15,
  },
  statusCard: {
    backgroundColor: '#141414',
    padding: 15,
    borderRadius: 12,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#222',
  },
  sectionTitle: {
    color: '#888',
    fontSize: 11,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  batteryContainer: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#222',
    borderRadius: 5,
  },
  batteryText: {
    color: '#4CAF50',
    fontSize: 11,
    fontWeight: 'bold',
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  metricCard: {
    backgroundColor: '#141414',
    padding: 15,
    borderRadius: 12,
    width: '48%',
    borderWidth: 1,
    borderColor: '#222',
  },
  metricLabel: {
    color: '#888',
    fontSize: 11,
    marginBottom: 6,
  },
  metricValue: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  metricUnit: {
    fontSize: 12,
    color: '#666',
  },
  metricDesc: {
    color: '#666',
    fontSize: 10,
    marginTop: 8,
  },
  chartContainer: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    backgroundColor: '#111',
    borderRadius: 6,
    padding: 4,
  },
  chartBarWrapper: {
    flex: 1,
    alignItems: 'center',
  },
  chartBar: {
    width: 4,
    borderRadius: 2,
    opacity: 0.85,
  },
  sleepCard: {
    backgroundColor: '#141414',
    padding: 15,
    borderRadius: 12,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#222',
  },
  sleepInfo: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  timelineBar: {
    height: 8,
    backgroundColor: '#333',
    borderRadius: 4,
    flexDirection: 'row',
    overflow: 'hidden',
    marginBottom: 6,
  },
  timelineActive: {
    flex: 2,
    backgroundColor: '#555',
  },
  timelineSleep: {
    flex: 8,
    backgroundColor: '#BB86FC',
  },
  timelineLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  timelineLabelText: {
    color: '#555',
    fontSize: 10,
  },
  sleepDesc: {
    color: '#888',
    fontSize: 12,
    lineHeight: 18,
  },
  ethicsCard: {
    backgroundColor: 'rgba(0, 229, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.15)',
    padding: 15,
    borderRadius: 12,
  },
  ethicsTitle: {
    color: '#00E5FF',
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  ethicsText: {
    color: '#AAA',
    fontSize: 12,
    lineHeight: 18,
  }
});
