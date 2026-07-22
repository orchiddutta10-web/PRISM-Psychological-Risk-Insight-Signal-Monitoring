import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Alert, Modal, SafeAreaView } from 'react-native';
import { MapPin, Keyboard, Smartphone, Play, Pause, Settings, RefreshCw, Bell, AlertTriangle, ShieldCheck, X } from 'lucide-react-native';
import { ApiClient, TokenManager } from '../services/api';
import {
  startTelemetry,
  pauseTelemetry,
  resumeTelemetry,
  isTelemetryActive,
  flushNow,
} from '../services/TelemetryService';

interface DashboardScreenProps {
  userId: string;
  deviceId: string;
  onNavigateToConsent: () => void;
  onLogout: () => void;
}

export default function DashboardScreen({ userId, deviceId, onNavigateToConsent, onLogout }: DashboardScreenProps) {
  const [monitoringPaused, setMonitoringPaused] = useState(false);
  const [lastTransmitted, setLastTransmitted] = useState<string>('Never');
  const [transmissionCount, setTransmissionCount] = useState<number>(0);
  const [activeAlert, setActiveAlert] = useState<any | null>(null);
  const [showAlertBanner, setShowAlertBanner] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  // Start real on-device telemetry collection on mount
  useEffect(() => {
    if (deviceId) {
      startTelemetry(deviceId).catch((err) =>
        console.warn('[DashboardScreen] Failed to start telemetry:', err)
      );
    }

    return () => {
      // Stop collecting when component unmounts (logout/nav away)
      pauseTelemetry();
    };
  }, [deviceId]);

  useEffect(() => {
    let ws: WebSocket | null = null;
    const connectWs = async () => {
      try {
        const token = await TokenManager.getToken();
        if (!token) return;
        
        const wsUrl = `ws://localhost:8000/api/v1/events/ws?token=${token}`;
        ws = new WebSocket(wsUrl);
        
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.severity_tier) {
              setActiveAlert(data);
              setShowAlertBanner(true);
            }
          } catch (e) {
            console.error('Error parsing device WS message:', e);
          }
        };

        ws.onclose = () => {
          // Reconnect logic
          setTimeout(connectWs, 3000);
        };
      } catch (err) {
        console.error('WS Connection error:', err);
      }
    };

    connectWs();

    return () => {
      if (ws) ws.close();
    };
  }, []);

  const triggerSimulation = async (type: 'location' | 'keystroke' | 'app_usage') => {
    if (monitoringPaused) {
      Alert.alert("Monitoring Paused", "Cannot send telemetry while monitoring is paused.");
      return;
    }

    let payload: Record<string, any> = {};
    if (type === 'location') {
      payload = {
        steps: 2000, // Homebound scenario drop
        entropy: 0.15
      };
    } else if (type === 'keystroke') {
      payload = {
        delay_index: 1.4, // 40% rise
        correction_rate_variance: 0.08
      };
    } else if (type === 'app_usage') {
      payload = {
        late_night_hours: 3.5, // usage spike
        baseline_hours: 1.0,
        new_installed_packages: ["com.anonymous.chat"] // registry co-signal
      };
    }

    try {
      const signalType = type === 'keystroke' ? 'typing' : type;
      const res = await ApiClient.sendTelemetry(deviceId, signalType, payload);
      if (res.status === 'accepted') {
        setLastTransmitted(new Date().toLocaleTimeString());
        setTransmissionCount(prev => prev + 1);
        Alert.alert("Success", `Telemetry transmitted. Risk models executed.`);
      }
    } catch (err: any) {
      Alert.alert("Telemetry Blocked", err.message || "Consent verification failed.");
    }
  };

  // Determine conversation starter based on factors/summary
  const getConversationStarter = () => {
    if (!activeAlert) return "";
    const summary = activeAlert.plain_language_summary.toLowerCase();
    
    if (summary.includes("late-night") || summary.includes("overnight")) {
      return "Hey, I noticed you were up late last night. Is there something on your mind, or did you just lose track of time? I want to make sure you're getting enough sleep.";
    } else if (summary.includes("withdrawal") || summary.includes("fatigue")) {
      return "Hey, you seemed a bit quieter and didn't move around as much this week. How are you feeling lately? Anything you'd like to talk about?";
    } else if (summary.includes("anonymous") || summary.includes("unsafe")) {
      return "Hey, I saw that a new anonymous chat app was active recently. I know it can be fun, but those places can sometimes be unsafe. Let's talk about staying safe on there.";
    }
    return "Hey, I noticed some shifts in your normal routine recently. Is there anything stressful going on, or anything you'd like to chat about?";
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Floating Push Notification Banner */}
      {showAlertBanner && activeAlert && (
        <TouchableOpacity 
          style={[styles.pushBanner, activeAlert.severity_tier === 'red' ? styles.bgRed : styles.bgAmber]}
          onPress={() => {
            setShowAlertBanner(false);
            setDetailModalVisible(true);
          }}
        >
          <Bell color="#F8FAFC" size={20} strokeWidth={2} style={styles.bannerIcon} />
          <View style={styles.bannerContent}>
            <Text style={styles.bannerTitle}>New Well-Being Alert</Text>
            <Text style={styles.bannerText} numberOfLines={1}>
              {activeAlert.plain_language_summary}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setShowAlertBanner(false)}>
            <X color="#F8FAFC" size={18} strokeWidth={2} />
          </TouchableOpacity>
        </TouchableOpacity>
      )}

      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        {/* Top Bar */}
        <View style={styles.topBar}>
          <Text style={styles.welcomeText}>Active Monitoring Status</Text>
          <TouchableOpacity style={styles.settingsButton} onPress={onNavigateToConsent}>
            <Settings color="#F8FAFC" size={24} strokeWidth={2} />
          </TouchableOpacity>
        </View>

        {/* Main Status Circle */}
        <View style={styles.statusContainer}>
          <View style={[styles.statusRing, monitoringPaused ? styles.ringPaused : styles.ringActive]}>
            <Text style={styles.statusLabel}>MONITORING</Text>
            <Text style={styles.statusState}>{monitoringPaused ? "PAUSED" : "ACTIVE"}</Text>
          </View>
        </View>

        {/* Stats Board */}
        <View style={styles.statsBoard}>
          <View style={styles.statCell}>
            <Text style={styles.statLabel}>Transmitted</Text>
            <Text style={styles.statNumber}>{transmissionCount}</Text>
          </View>
          <View style={styles.statCell}>
            <Text style={styles.statLabel}>Last Push</Text>
            <Text style={styles.statNumber}>{lastTransmitted}</Text>
          </View>
        </View>

        {/* Indicators */}
        <Text style={styles.sectionHeader}>Visible Indicators</Text>
        
        <View style={styles.indicatorRow}>
          <MapPin color={monitoringPaused ? "#64748B" : "#10B981"} size={22} strokeWidth={2} />
          <Text style={styles.indicatorText}>Location / GPS tracking is running (consented)</Text>
        </View>

        <View style={styles.indicatorRow}>
          <Keyboard color={monitoringPaused ? "#64748B" : "#10B981"} size={22} strokeWidth={2} />
          <Text style={styles.indicatorText}>Keystroke pause/typing rhythms enabled</Text>
        </View>

        <View style={styles.indicatorRow}>
          <Smartphone color={monitoringPaused ? "#64748B" : "#10B981"} size={22} strokeWidth={2} />
          <Text style={styles.indicatorText}>App category screen time limits monitored</Text>
        </View>

        {/* Simulation Tools */}
        <Text style={styles.sectionHeader}>Interactive Simulation Tools</Text>
        <Text style={styles.helperText}>Trigger specific scenario parameters to test the 4 async risk models.</Text>

        <TouchableOpacity style={styles.simButton} onPress={() => triggerSimulation('location')}>
          <Play color="#10B981" size={16} strokeWidth={2} />
          <Text style={styles.simButtonText}>Trigger Scenario B (Low Steps)</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.simButton} onPress={() => triggerSimulation('keystroke')}>
          <Play color="#10B981" size={16} strokeWidth={2} />
          <Text style={styles.simButtonText}>Trigger Scenario B (Slow Typing)</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.simButton} onPress={() => triggerSimulation('app_usage')}>
          <Play color="#10B981" size={16} strokeWidth={2} />
          <Text style={styles.simButtonText}>Trigger Scenario A/C (Risky App + Overnight)</Text>
        </TouchableOpacity>

        {/* Pause Toggles */}
        <TouchableOpacity 
          style={[styles.actionButton, monitoringPaused ? styles.resumeButton : styles.pauseButton]}
          onPress={async () => {
            if (monitoringPaused) {
              await resumeTelemetry();
              setMonitoringPaused(false);
            } else {
              pauseTelemetry();
              setMonitoringPaused(true);
            }
          }}
        >
          {monitoringPaused ? (
            <Play color="#F8FAFC" size={20} strokeWidth={2} />
          ) : (
            <Pause color="#F8FAFC" size={20} strokeWidth={2} />
          )}
          <Text style={styles.actionButtonText}>
            {monitoringPaused ? "Resume Monitoring" : "Pause Data Streaming"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.logoutButton} onPress={onLogout}>
          <Text style={styles.logoutText}>Log Out Account</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Alert Push Detail Modal Screen */}
      {activeAlert && (
        <Modal
          animationType="slide"
          transparent={false}
          visible={detailModalVisible}
          onRequestClose={() => setDetailModalVisible(false)}
        >
          <SafeAreaView style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View style={styles.flexRow}>
                <ShieldCheck color="#10B981" size={26} strokeWidth={2} />
                <Text style={styles.modalHeaderTitle}>PRISM Alert Insight</Text>
              </View>
              <TouchableOpacity onPress={() => setDetailModalVisible(false)} style={styles.closeButton}>
                <X color="#F8FAFC" size={24} strokeWidth={2} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalContent}>
              <View style={[styles.alertBadgeCard, activeAlert.severity_tier === 'red' ? styles.borderRed : styles.borderAmber]}>
                <AlertTriangle color={activeAlert.severity_tier === 'red' ? '#DC2626' : '#D97706'} size={32} strokeWidth={2} />
                <Text style={styles.alertDetailTitle}>{activeAlert.plain_language_summary}</Text>
                <Text style={styles.alertMeta}>Severity: <Text style={activeAlert.severity_tier === 'red' ? styles.textRed : styles.textAmber}>{activeAlert.severity_tier.toUpperCase()}</Text></Text>
              </View>

              {/* Factors */}
              <Text style={styles.modalSubHeader}>Contributing Factors</Text>
              <View style={styles.factorsCard}>
                {activeAlert.contributing_factors.map((factor: string, idx: number) => (
                  <Text key={idx} style={styles.factorText}>• {factor}</Text>
                ))}
              </View>

              {/* Mini Baseline Comparison Chart */}
              <Text style={styles.modalSubHeader}>Baseline Comparison Chart</Text>
              <View style={styles.miniChartCard}>
                <View style={styles.chartBarRow}>
                  <Text style={styles.chartLabel}>Baseline Profile</Text>
                  <View style={styles.chartBarTrack}>
                    <View style={[styles.chartBarFill, { width: '40%', backgroundColor: '#64748B' }]} />
                  </View>
                  <Text style={styles.chartVal}>Normal</Text>
                </View>
                <View style={styles.chartBarRow}>
                  <Text style={styles.chartLabel}>Current Activity</Text>
                  <View style={styles.chartBarTrack}>
                    <View style={[styles.chartBarFill, { width: '90%', backgroundColor: activeAlert.severity_tier === 'red' ? '#DC2626' : '#D97706' }]} />
                  </View>
                  <Text style={styles.chartVal}>Deviated</Text>
                </View>
              </View>

              {/* Conversation Starter */}
              <Text style={styles.modalSubHeader}>Suggested Conversation Starter</Text>
              <View style={styles.starterCard}>
                <Text style={styles.starterText}>"{getConversationStarter()}"</Text>
              </View>
            </ScrollView>
          </SafeAreaView>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  contentContainer: {
    padding: 24,
    paddingBottom: 48,
  },
  pushBanner: {
    position: 'absolute',
    top: 50,
    left: 16,
    right: 16,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
    zIndex: 999,
  },
  bgRed: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#DC2626',
  },
  bgAmber: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#D97706',
  },
  bannerIcon: {
    marginRight: 12,
  },
  bannerContent: {
    flex: 1,
  },
  bannerTitle: {
    color: '#000000',
    fontWeight: '800',
    fontSize: 14,
  },
  bannerText: {
    color: '#636366',
    fontSize: 12,
    marginTop: 2,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 20,
  },
  welcomeText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#8E8E93',
  },
  settingsButton: {
    padding: 8,
    backgroundColor: '#0D0D0E',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#222224',
  },
  statusContainer: {
    alignItems: 'center',
    marginVertical: 20,
  },
  statusRing: {
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 6,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0D0D0E',
  },
  ringActive: {
    borderColor: '#E6DFD3',
  },
  ringPaused: {
    borderColor: '#7F7F84',
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8E8E93',
    letterSpacing: 1.5,
  },
  statusState: {
    fontSize: 24,
    fontWeight: '900',
    color: '#FFFFFF',
    marginTop: 4,
    letterSpacing: 1,
  },
  statsBoard: {
    flexDirection: 'row',
    backgroundColor: '#0D0D0E',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#222224',
    padding: 16,
    marginBottom: 24,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8E8E93',
    textTransform: 'uppercase',
  },
  statNumber: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 6,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 12,
    marginTop: 12,
  },
  indicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0D0D0E',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#222224',
    marginBottom: 8,
  },
  indicatorText: {
    marginLeft: 12,
    fontSize: 14,
    color: '#CBD5E1',
  },
  helperText: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 12,
  },
  simButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0D0D0E',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#222224',
    marginBottom: 8,
  },
  simButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 12,
  },
  actionButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
  },
  pauseButton: {
    backgroundColor: '#7F7F84',
  },
  resumeButton: {
    backgroundColor: '#E6DFD3',
  },
  actionButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '800',
    marginLeft: 10,
  },
  logoutButton: {
    alignItems: 'center',
    padding: 16,
    marginTop: 10,
  },
  logoutText: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '600',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderColor: '#222224',
  },
  flexRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalHeaderTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    marginLeft: 10,
  },
  closeButton: {
    padding: 6,
  },
  modalContent: {
    padding: 24,
  },
  alertBadgeCard: {
    alignItems: 'center',
    backgroundColor: '#0D0D0E',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1.5,
    marginBottom: 24,
  },
  borderRed: {
    borderColor: '#DC2626',
  },
  borderAmber: {
    borderColor: '#D97706',
  },
  alertDetailTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 16,
  },
  alertMeta: {
    color: '#8E8E93',
    fontSize: 13,
    marginTop: 8,
  },
  textRed: {
    color: '#DC2626',
    fontWeight: '800',
  },
  textAmber: {
    color: '#D97706',
    fontWeight: '800',
  },
  modalSubHeader: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
    marginTop: 12,
  },
  factorsCard: {
    backgroundColor: '#0D0D0E',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#222224',
    padding: 16,
    marginBottom: 24,
  },
  factorText: {
    color: '#CBD5E1',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  miniChartCard: {
    backgroundColor: '#0D0D0E',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#222224',
    padding: 16,
    marginBottom: 24,
  },
  chartBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  chartLabel: {
    color: '#CBD5E1',
    fontSize: 12,
    width: 100,
  },
  chartBarTrack: {
    flex: 1,
    height: 12,
    backgroundColor: '#000000',
    borderRadius: 6,
    marginHorizontal: 12,
    overflow: 'hidden',
  },
  chartBarFill: {
    height: '100%',
    borderRadius: 6,
  },
  chartVal: {
    color: '#8E8E93',
    fontSize: 11,
    width: 60,
    textAlign: 'right',
  },
  starterCard: {
    backgroundColor: '#0D0D0E',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E6DFD3',
    padding: 16,
    marginBottom: 24,
  },
  starterText: {
    color: '#E6DFD3',
    fontSize: 14,
    fontStyle: 'italic',
    lineHeight: 22,
    textAlign: 'center',
  },
});
