import React from 'react';
import { Modal, SafeAreaView, View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { ShieldCheck, X, AlertTriangle } from 'lucide-react-native';

interface AlertDetailModalProps {
  visible: boolean;
  activeAlert: any;
  onClose: () => void;
  getConversationStarter: () => string;
}

export function AlertDetailModal({ visible, activeAlert, onClose, getConversationStarter }: AlertDetailModalProps) {
  if (!activeAlert) return null;

  return (
    <Modal
      animationType="slide"
      transparent={false}
      visible={visible}
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <View style={styles.flexRow}>
            <ShieldCheck color="#10B981" size={26} strokeWidth={2} />
            <Text style={styles.modalHeaderTitle}>PRISM Alert Insight</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
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
  );
}

const styles = StyleSheet.create({
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
