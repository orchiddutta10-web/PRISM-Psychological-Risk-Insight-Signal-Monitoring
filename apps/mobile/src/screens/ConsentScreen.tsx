import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Switch, TouchableOpacity, Alert, Modal, SafeAreaView } from 'react-native';
import { Lock, CheckSquare, RefreshCw, UserCheck, Eye, ShieldAlert, X } from 'lucide-react-native';
import { ApiClient } from '../services/api';

interface ConsentScreenProps {
  guardianName: string;
  onConsentSaved: () => void;
  onBack: () => void;
}

export default function ConsentScreen({ guardianName, onConsentSaved, onBack }: ConsentScreenProps) {
  const [locationConsent, setLocationConsent] = useState(false);
  const [typingConsent, setTypingConsent] = useState(false);
  const [appActivityConsent, setAppActivityConsent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Teen Walkthrough Tour
  const [showTour, setShowTour] = useState(false);
  const [tourStep, setTourStep] = useState(1);

  useEffect(() => {
    // Check if first load
    // For demonstration, we always show it once per mount if not completed
    setShowTour(true);
  }, []);

  const handleSaveConsent = async () => {
    setIsSubmitting(true);
    try {
      await ApiClient.updateConsent({
        location_consent: locationConsent,
        typing_consent: typingConsent,
        app_activity_consent: appActivityConsent
      });
      Alert.alert(
        "Consent Saved",
        "Your well-being telemetry configurations have been updated. Your guardian has been notified.",
        [{ text: "OK", onPress: onConsentSaved }]
      );
    } catch (error: any) {
      Alert.alert("Error Saving Consent", error.message || "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  const finishTour = () => {
    setShowTour(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>Consent Control</Text>
      <Text style={styles.headerSubtitle}>Manage what data you share with PRISM.</Text>

      {/* Dual sign-off status card */}
      <View style={styles.guardianCard}>
        <UserCheck color="#10B981" size={24} strokeWidth={2} />
        <View style={styles.guardianInfo}>
          <Text style={styles.guardianTitle}>Guardian Active Link</Text>
          <Text style={styles.guardianText}>Linked to: <Text style={styles.bold}>{guardianName}</Text></Text>
          <Text style={styles.verificationBadge}>Dual Sign-off Verified</Text>
        </View>
      </View>

      {/* What We Never Collect (No spy mode) */}
      <View style={styles.neverCollectCard}>
        <Text style={styles.neverCollectTitle}>What We NEVER Collect</Text>
        <Text style={styles.neverCollectItem}>• No message text or chat content</Text>
        <Text style={styles.neverCollectItem}>• No audio recordings or voice calls</Text>
        <Text style={styles.neverCollectItem}>• No photos, screenshots, or camera access</Text>
        <Text style={styles.neverCollectItem}>• No video streams</Text>
      </View>

      {/* Switch Toggles */}
      <View style={styles.switchContainer}>
        <View style={styles.switchRow}>
          <View style={styles.switchLabels}>
            <Text style={styles.switchTitle}>Location & Travel Patterns</Text>
            <Text style={styles.switchSubtitle}>GPS & motion telemetry updates.</Text>
          </View>
          <Switch
            trackColor={{ false: '#334155', true: '#10B981' }}
            thumbColor={locationConsent ? '#F8FAFC' : '#94A3B8'}
            onValueChange={setLocationConsent}
            value={locationConsent}
          />
        </View>

        <View style={styles.switchRow}>
          <View style={styles.switchLabels}>
            <Text style={styles.switchTitle}>Typing Cadence Metadata</Text>
            <Text style={styles.switchSubtitle}>Typing pause and correction variance.</Text>
          </View>
          <Switch
            trackColor={{ false: '#334155', true: '#10B981' }}
            thumbColor={typingConsent ? '#F8FAFC' : '#94A3B8'}
            onValueChange={setTypingConsent}
            value={typingConsent}
          />
        </View>

        <View style={styles.switchRow}>
          <View style={styles.switchLabels}>
            <Text style={styles.switchTitle}>App Categories & Durations</Text>
            <Text style={styles.switchSubtitle}>Total screen time segments.</Text>
          </View>
          <Switch
            trackColor={{ false: '#334155', true: '#10B981' }}
            thumbColor={appActivityConsent ? '#F8FAFC' : '#94A3B8'}
            onValueChange={setAppActivityConsent}
            value={appActivityConsent}
          />
        </View>
      </View>

      {/* Action Buttons */}
      <TouchableOpacity 
        style={[styles.saveButton, isSubmitting && styles.disabledButton]} 
        onPress={handleSaveConsent}
        disabled={isSubmitting}
      >
        <Text style={styles.saveButtonText}>
          {isSubmitting ? "Saving..." : "Confirm & Save Toggles"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.backButton} onPress={onBack}>
        <Text style={styles.backButtonText}>Cancel & Go Back</Text>
      </TouchableOpacity>

      {/* Trust-Building Walkthrough Tour Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showTour}
        onRequestClose={finishTour}
      >
        <View style={styles.tourModalOverlay}>
          <View style={styles.tourCard}>
            <TouchableOpacity onPress={finishTour} style={styles.tourClose}>
              <X color="#94A3B8" size={20} strokeWidth={2} />
            </TouchableOpacity>

            <View style={styles.tourIconContainer}>
              <Eye color="#10B981" size={32} strokeWidth={2} />
            </View>

            {tourStep === 1 ? (
              <>
                <Text style={styles.tourTitle}>How PRISM Respects Your Privacy</Text>
                <Text style={styles.tourText}>
                  We collect stats on pauses and category time segments only. We NEVER look at what you write, who you speak to, or capture any photos/videos.
                </Text>
                <View style={styles.tourNavRow}>
                  <TouchableOpacity onPress={finishTour}>
                    <Text style={styles.tourSkipText}>Skip</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.tourNextButton} onPress={() => setTourStep(2)}>
                    <Text style={styles.tourNextText}>Next</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.tourTitle}>You Hold the Keys</Text>
                <Text style={styles.tourText}>
                  Your toggles are absolute. You can turn off GPS, typing metrics, or app logs at any time. When you pause tracking, all signal ingestion is blocked immediately.
                </Text>
                <View style={styles.tourNavRow}>
                  <TouchableOpacity onPress={() => setTourStep(1)}>
                    <Text style={styles.tourSkipText}>Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.tourNextButton, { backgroundColor: '#10B981' }]} onPress={finishTour}>
                    <Text style={[styles.tourNextText, { color: '#0F172A' }]}>Got it</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    padding: 24,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#F8FAFC',
    marginTop: 40,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#94A3B8',
    marginTop: 6,
    marginBottom: 24,
  },
  guardianCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1B4B',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#312E81',
    marginBottom: 20,
  },
  guardianInfo: {
    marginLeft: 16,
    flex: 1,
  },
  guardianTitle: {
    color: '#F8FAFC',
    fontWeight: '800',
    fontSize: 14,
  },
  guardianText: {
    color: '#CBD5E1',
    fontSize: 12,
    marginTop: 2,
  },
  bold: {
    fontWeight: '700',
  },
  verificationBadge: {
    color: '#10B981',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 6,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  neverCollectCard: {
    backgroundColor: '#1E1B4B',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DC2626',
    marginBottom: 24,
  },
  neverCollectTitle: {
    color: '#F8FAFC',
    fontWeight: '800',
    fontSize: 14,
    marginBottom: 8,
  },
  neverCollectItem: {
    color: '#FDA4AF',
    fontSize: 13,
    marginBottom: 4,
  },
  switchContainer: {
    marginBottom: 32,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: '#1E1B4B',
  },
  switchLabels: {
    flex: 1,
    marginRight: 16,
  },
  switchTitle: {
    color: '#F8FAFC',
    fontWeight: '700',
    fontSize: 14,
  },
  switchSubtitle: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },
  saveButton: {
    backgroundColor: '#10B981',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  disabledButton: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: '#0F172A',
    fontWeight: '800',
    fontSize: 16,
  },
  backButton: {
    alignItems: 'center',
    padding: 16,
    marginTop: 8,
  },
  backButtonText: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '600',
  },
  tourModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  tourCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#1E1B4B',
    borderWidth: 1,
    borderColor: '#312E81',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },
  tourClose: {
    position: 'absolute',
    top: 16,
    right: 16,
  },
  tourIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  tourTitle: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  tourText: {
    color: '#CBD5E1',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 20,
  },
  tourNavRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 8,
  },
  tourSkipText: {
    color: '#94A3B8',
    fontWeight: '600',
    fontSize: 13,
  },
  tourNextButton: {
    backgroundColor: '#312E81',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4338CA',
  },
  tourNextText: {
    color: '#F8FAFC',
    fontWeight: '700',
    fontSize: 13,
  },
});
