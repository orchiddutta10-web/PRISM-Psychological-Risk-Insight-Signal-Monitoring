import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  SafeAreaView, Animated, RefreshControl,
} from 'react-native';
import {
  ArrowLeft, ShieldCheck, Bell, TrendingUp,
  CheckCircle, MessageCircle, Activity,
} from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography } from '../theme';
import { API_BASE_URL } from '../config/network';

const API = `${API_BASE_URL}/guardian`;

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  stable: { label: 'Stable', color: '#059669', bg: '#ECFDF5' },
  improving: { label: 'Improving', color: '#059669', bg: '#ECFDF5' },
  mild_change: { label: 'Mild Change', color: '#D97706', bg: '#FFFBEB' },
  needs_attention: { label: 'Needs Attention', color: '#EA580C', bg: '#FFF7ED' },
  high_concern: { label: 'High Concern', color: '#DC2626', bg: '#FEF2F2' },
};

const SEVERITY_COLORS: Record<string, string> = {
  info: '#6B7280', observation: '#D97706', attention: '#EA580C',
  urgent: '#DC2626', critical: '#991B1B', positive: '#059669',
};

interface GuardianAlert {
  id: string; severity: string; category: string; title: string;
  summary: string; contributing_observations: string[];
  interpretation: string | null; suggested_approach: string | null;
  conversation_starter: string | null; confidence: number;
  is_acknowledged: boolean; detected_at: string;
}

interface DashboardData {
  connection_id: string; device_name: string; current_status: string;
  status_summary: string; stability_score: number;
  recent_changes: string; positive_changes: string[]; unread_alerts: number;
}

interface Connection {
  id: string; device_id: string; device_name: string; status: string;
}

interface Props {
  onBack: () => void;
  token: string;
}

export default function GuardianDashboardScreen({ onBack, token }: Props) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [activeConn, setActiveConn] = useState<Connection | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [alerts, setAlerts] = useState<GuardianAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedAlert, setExpandedAlert] = useState<string | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    fetchConnections();
  }, []);

  useEffect(() => {
    if (activeConn) { fetchDashboard(); fetchAlerts(); }
  }, [activeConn]);

  const fetchConnections = async () => {
    try {
      const res = await fetch(`${API}/connections`, { headers });
      if (res.ok) {
        const data = await res.json();
        setConnections(data);
        if (data.length > 0) setActiveConn(data[0]); else setLoading(false);
      }
    } catch { setLoading(false); }
  };

  const fetchDashboard = async () => {
    if (!activeConn) return;
    try {
      const res = await fetch(`${API}/dashboard/${activeConn.id}`, { headers });
      if (res.ok) setDashboard(await res.json());
    } catch {} finally { setLoading(false); }
  };

  const fetchAlerts = async () => {
    if (!activeConn) return;
    try {
      const res = await fetch(`${API}/alerts/${activeConn.id}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setAlerts(data.alerts || []);
      }
    } catch {}
  };

  const acknowledgeAlert = async (alertId: string) => {
    if (!activeConn) return;
    try {
      await fetch(`${API}/alerts/${alertId}/acknowledge`, {
        method: 'POST', headers,
        body: JSON.stringify({ connection_id: activeConn.id }),
      });
      setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, is_acknowledged: true } : a));
    } catch {}
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchDashboard(), fetchAlerts()]);
    setRefreshing(false);
  };

  const statusCfg = dashboard ? STATUS_CONFIG[dashboard.current_status] || STATUS_CONFIG.stable : STATUS_CONFIG.stable;

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingView}>
          <Text style={styles.loadingText}>Loading Guardian Dashboard…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <ArrowLeft size={20} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Guardian</Text>
        <View style={{ width: 40 }} />
      </View>

      <Animated.ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        style={{ opacity: fadeAnim }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent[300]} />}
      >
        {/* Status Hero */}
        <View style={[styles.statusCard, { backgroundColor: `${statusCfg.color}08` }]}>
          <View style={[styles.statusBadge, { backgroundColor: `${statusCfg.color}18` }]}>
            <Text style={[styles.statusBadgeText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
          </View>
          <Text style={styles.deviceName}>{dashboard?.device_name || 'Unknown'}</Text>
          <Text style={styles.statusSummary}>{dashboard?.status_summary}</Text>
          <View style={styles.stabilityRow}>
            <View style={styles.stabilityRing}>
              <Text style={styles.stabilityValue}>{dashboard?.stability_score ?? '—'}</Text>
            </View>
            <Text style={styles.stabilityLabel}>Behaviour Stability</Text>
          </View>
        </View>

        {/* Recent Changes */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Activity size={16} color={Colors.text.muted} />
            <Text style={styles.sectionTitle}>Recent Behavioural Change</Text>
          </View>
          <Text style={styles.changeText}>{dashboard?.recent_changes}</Text>
        </View>

        {/* Alerts */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Bell size={16} color={Colors.text.muted} />
            <Text style={styles.sectionTitle}>
              Alerts{dashboard?.unread_alerts ? ` (${dashboard.unread_alerts})` : ''}
            </Text>
          </View>

          {alerts.length === 0 ? (
            <View style={styles.emptyAlerts}>
              <Bell size={24} color={Colors.gray[600]} />
              <Text style={styles.emptyAlertsText}>No alerts to display</Text>
            </View>
          ) : (
            alerts.map(alert => {
              const sevColor = SEVERITY_COLORS[alert.severity] || '#6B7280';
              const isExpanded = expandedAlert === alert.id;
              return (
                <TouchableOpacity
                  key={alert.id}
                  style={[styles.alertCard, !alert.is_acknowledged && { borderLeftWidth: 3, borderLeftColor: sevColor }]}
                  onPress={() => setExpandedAlert(isExpanded ? null : alert.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.alertHeader}>
                    <View style={styles.alertLeft}>
                      <View style={[styles.alertSeverityBag, { backgroundColor: `${sevColor}18` }]}>
                        <Text style={[styles.alertSeverityText, { color: sevColor }]}>{alert.severity}</Text>
                      </View>
                      <Text style={styles.alertTitle} numberOfLines={1}>{alert.title}</Text>
                    </View>
                    <View style={styles.alertRight}>
                      <Text style={styles.alertConfidence}>{alert.confidence}%</Text>
                      {!alert.is_acknowledged && <View style={[styles.unreadDot, { backgroundColor: sevColor }]} />}
                    </View>
                  </View>
                  <Text style={styles.alertSummary}>{alert.summary}</Text>

                  {isExpanded && (
                    <View style={styles.alertExpanded}>
                      {alert.contributing_observations.map((obs, i) => (
                        <View key={i} style={styles.obsRow}>
                          <View style={styles.obsDot} />
                          <Text style={styles.obsText}>{obs}</Text>
                        </View>
                      ))}
                      {alert.interpretation ? (
                        <View style={styles.interpretationBox}>
                          <Text style={styles.interpretationTitle}>What This Means</Text>
                          <Text style={styles.interpretationText}>{alert.interpretation}</Text>
                        </View>
                      ) : null}
                      {alert.conversation_starter ? (
                        <View style={styles.conversationBox}>
                          <MessageCircle size={12} color={Colors.accent[300]} />
                          <Text style={styles.conversationText}>{alert.conversation_starter}</Text>
                        </View>
                      ) : null}
                      {!alert.is_acknowledged ? (
                        <TouchableOpacity style={styles.acknowledgeBtn} onPress={() => acknowledgeAlert(alert.id)}>
                          <CheckCircle size={14} color={Colors.white} />
                          <Text style={styles.acknowledgeText}>Acknowledge</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {/* Positive Changes */}
        {dashboard?.positive_changes && dashboard.positive_changes.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <TrendingUp size={16} color={Colors.status.baseline} />
              <Text style={styles.sectionTitle}>Positive Changes</Text>
            </View>
            <View style={styles.positiveCard}>
              {dashboard.positive_changes.map((change, i) => (
                <View key={i} style={styles.positiveRow}>
                  <CheckCircle size={14} color={Colors.status.baseline} />
                  <Text style={styles.positiveText}>{change}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* Privacy */}
        <View style={styles.section}>
          <View style={styles.privacyCard}>
            <ShieldCheck size={14} color={Colors.text.muted} />
            <Text style={styles.privacyText}>
              Trend summaries only — never messages, conversations, or private content.
            </Text>
          </View>
        </View>

        <View style={{ height: Spacing.massive }} />
      </Animated.ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface.primary },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.xxl, paddingVertical: Spacing.lg,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  backBtn: { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { ...Typography.h3, fontSize: 16 },
  loadingView: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { ...Typography.body, color: Colors.text.muted },
  scroll: { padding: Spacing.xxl, paddingBottom: Spacing.massive },

  statusCard: { borderRadius: Radius.xxl, padding: Spacing.xxl, marginBottom: Spacing.xl, alignItems: 'center', gap: Spacing.lg },
  statusBadge: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.xs, borderRadius: Radius.full },
  statusBadgeText: { ...Typography.label, fontSize: 10 },
  deviceName: { ...Typography.h1, fontSize: 22, textAlign: 'center' },
  statusSummary: { ...Typography.body, textAlign: 'center', lineHeight: 22 },
  stabilityRow: { alignItems: 'center', gap: Spacing.md },
  stabilityRing: {
    width: 80, height: 80, borderRadius: 40,
    borderWidth: 5, borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  stabilityValue: { ...Typography.monoLarge, fontSize: 20 },
  stabilityLabel: { ...Typography.caption },

  section: { marginBottom: Spacing.xl },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
  sectionTitle: { ...Typography.label, fontSize: 11, flex: 1 },
  changeText: { ...Typography.body, lineHeight: 22 },

  emptyAlerts: { padding: Spacing.xxl, alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.surface.card, borderRadius: Radius.lg },
  emptyAlertsText: { ...Typography.bodySmall, color: Colors.text.muted },

  alertCard: { backgroundColor: Colors.surface.card, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.md },
  alertHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  alertLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  alertSeverityBag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.full },
  alertSeverityText: { ...Typography.badge, fontSize: 9, textTransform: 'capitalize' },
  alertTitle: { ...Typography.h3, fontSize: 13, flex: 1 },
  alertRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  alertConfidence: { ...Typography.monoSmall, fontSize: 10 },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },
  alertSummary: { ...Typography.bodySmall, lineHeight: 19 },

  alertExpanded: { marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', gap: Spacing.md },
  obsRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  obsDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.text.primary, marginTop: 6 },
  obsText: { ...Typography.bodySmall, flex: 1, lineHeight: 19 },
  interpretationBox: { padding: Spacing.md, backgroundColor: Colors.surface.elevated, borderRadius: Radius.md },
  interpretationTitle: { ...Typography.label, fontSize: 10, marginBottom: 4 },
  interpretationText: { ...Typography.bodySmall, lineHeight: 19 },
  conversationBox: {
    flexDirection: 'row', gap: 8, padding: Spacing.md,
    backgroundColor: `${Colors.accent[500]}10`, borderRadius: Radius.md,
    borderWidth: 1, borderColor: `${Colors.accent[500]}20`,
  },
  conversationText: { ...Typography.bodySmall, flex: 1, lineHeight: 19, color: Colors.accent[300] },
  acknowledgeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-end',
    paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.accent[500], borderRadius: Radius.md,
  },
  acknowledgeText: { ...Typography.bodySmall, color: Colors.white, fontWeight: '600' },

  positiveCard: { backgroundColor: `${Colors.status.baseline}08`, borderRadius: Radius.lg, padding: Spacing.xl, gap: Spacing.sm, borderWidth: 1, borderColor: `${Colors.status.baseline}20` },
  positiveRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  positiveText: { ...Typography.body, fontSize: 14, color: Colors.status.baseline },

  privacyCard: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: Spacing.md, backgroundColor: Colors.surface.elevated, borderRadius: Radius.md },
  privacyText: { ...Typography.caption, flex: 1, fontSize: 10, lineHeight: 15 },
});
