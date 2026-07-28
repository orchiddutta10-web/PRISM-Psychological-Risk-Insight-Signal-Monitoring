import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, ScrollView, Animated, KeyboardAvoidingView, Platform,
} from 'react-native';
import { User, Calendar, Ruler, Weight, Target, Clock, Globe, ChevronRight, ChevronLeft } from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography } from '../theme';

interface Props {
  onSubmit: (data: ProfileData) => void;
  onBack?: () => void;
}

export interface ProfileData {
  name: string;
  age: string;
  gender: string;
  height: string;
  weight: string;
  goals: string[];
  occupation?: string;
  timezone: string;
  units: string;
}

const GOALS_OPTIONS = [
  'Emotional wellbeing',
  'Sleep & routine stability',
  'Screen time balance',
  'Social confidence',
  'Academic resilience',
];

const GENDER_OPTIONS = ['Prefer not to say', 'Male', 'Female', 'Non-binary'];
const UNIT_OPTIONS = ['Metric (kg, cm)', 'Imperial (lb, in)'];

type Step = 'name' | 'details' | 'goals' | 'settings';

export default function ProfileScreen({ onSubmit, onBack }: Props) {
  const [step, setStep] = useState<Step>('name');
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('Prefer not to say');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [goals, setGoals] = useState<string[]>([]);
  const [occupation, setOccupation] = useState('');
  const [timezone, setTimezone] = useState('Auto-detect');
  const [units, setUnits] = useState('Metric (kg, cm)');
  const slideAnim = useRef(new Animated.Value(0)).current;

  const animateStep = () => {
    slideAnim.setValue(20);
    Animated.spring(slideAnim, {
      toValue: 0,
      damping: 18,
      stiffness: 150,
      useNativeDriver: true,
    }).start();
  };

  const nextStep = () => {
    const steps: Step[] = ['name', 'details', 'goals', 'settings'];
    const idx = steps.indexOf(step);
    if (idx < steps.length - 1) {
      setStep(steps[idx + 1]);
      animateStep();
    } else {
      onSubmit({
        name, age, gender, height, weight,
        goals, occupation, timezone, units,
      });
    }
  };

  const prevStep = () => {
    const steps: Step[] = ['name', 'details', 'goals', 'settings'];
    const idx = steps.indexOf(step);
    if (idx > 0) {
      setStep(steps[idx - 1]);
      animateStep();
    } else if (onBack) {
      onBack();
    }
  };

  const toggleGoal = (g: string) => {
    setGoals(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]);
  };

  const stepIndex = ['name', 'details', 'goals', 'settings'].indexOf(step) + 1;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Progress bar */}
        <View style={styles.progressBar}>
          {[1, 2, 3, 4].map(i => (
            <View key={i} style={[styles.progressStep, i <= stepIndex && styles.progressActive]} />
          ))}
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Animated.View style={{ transform: [{ translateY: slideAnim }] }}>
            {step === 'name' && (
              <View style={styles.stepContent}>
                <View style={styles.stepIcon}>
                  <User size={28} color={Colors.accent[300]} />
                </View>
                <Text style={styles.stepTitle}>What should we{'\n'}call you?</Text>
                <Text style={styles.stepSubtitle}>This helps PRISM personalize your experience.</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Your name"
                  placeholderTextColor={Colors.gray[600]}
                  value={name}
                  onChangeText={setName}
                  autoFocus
                />
              </View>
            )}

            {step === 'details' && (
              <View style={styles.stepContent}>
                <View style={styles.stepIcon}>
                  <Calendar size={28} color={Colors.accent[300]} />
                </View>
                <Text style={styles.stepTitle}>A few details</Text>
                <Text style={styles.stepSubtitle}>Basic data helps calibrate your behavioural baselines.</Text>

                <Text style={styles.fieldLabel}>Age</Text>
                <TextInput style={styles.input} placeholder="e.g. 16" placeholderTextColor={Colors.gray[600]} value={age} onChangeText={setAge} keyboardType="numeric" />

                <Text style={styles.fieldLabel}>Gender</Text>
                <View style={styles.chipRow}>
                  {GENDER_OPTIONS.map(g => (
                    <TouchableOpacity
                      key={g}
                      style={[styles.chip, gender === g && styles.chipActive]}
                      onPress={() => setGender(g)}
                    >
                      <Text style={[styles.chipText, gender === g && styles.chipTextActive]}>{g}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Height (cm)</Text>
                    <TextInput style={styles.input} placeholder="165" placeholderTextColor={Colors.gray[600]} value={height} onChangeText={setHeight} keyboardType="numeric" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Weight (kg)</Text>
                    <TextInput style={styles.input} placeholder="55" placeholderTextColor={Colors.gray[600]} value={weight} onChangeText={setWeight} keyboardType="numeric" />
                  </View>
                </View>
              </View>
            )}

            {step === 'goals' && (
              <View style={styles.stepContent}>
                <View style={styles.stepIcon}>
                  <Target size={28} color={Colors.accent[300]} />
                </View>
                <Text style={styles.stepTitle}>What matters{'\n'}to you?</Text>
                <Text style={styles.stepSubtitle}>Select your focus areas. PRISM will prioritize relevant insights.</Text>

                <View style={styles.goalsList}>
                  {GOALS_OPTIONS.map(g => {
                    const active = goals.includes(g);
                    return (
                      <TouchableOpacity
                        key={g}
                        style={[styles.goalItem, active && styles.goalActive]}
                        onPress={() => toggleGoal(g)}
                      >
                        <Text style={[styles.goalText, active && styles.goalTextActive]}>{g}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {step === 'settings' && (
              <View style={styles.stepContent}>
                <View style={styles.stepIcon}>
                  <Globe size={28} color={Colors.accent[300]} />
                </View>
                <Text style={styles.stepTitle}>Almost there</Text>
                <Text style={styles.stepSubtitle}>Optional preferences for a better experience.</Text>

                <Text style={styles.fieldLabel}>Occupation (optional)</Text>
                <TextInput style={styles.input} placeholder="e.g. Student" placeholderTextColor={Colors.gray[600]} value={occupation} onChangeText={setOccupation} />

                <Text style={styles.fieldLabel}>Units</Text>
                {UNIT_OPTIONS.map(u => (
                  <TouchableOpacity
                    key={u}
                    style={[styles.unitOption, units === u && styles.unitActive]}
                    onPress={() => setUnits(u)}
                  >
                    <Text style={[styles.unitText, units === u && styles.unitTextActive]}>{u}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </Animated.View>
        </ScrollView>

        {/* Footer nav */}
        <View style={styles.footer}>
          <TouchableOpacity onPress={prevStep} style={styles.footerBack}>
            <ChevronLeft size={20} color={Colors.text.muted} />
            <Text style={styles.footerBackText}>Back</Text>
          </TouchableOpacity>

          <View style={styles.footerDots}>
            {[1, 2, 3, 4].map(i => (
              <View key={i} style={[styles.dot, i === stepIndex && styles.dotActive]} />
            ))}
          </View>

          <TouchableOpacity onPress={nextStep} style={styles.footerNext}>
            <Text style={styles.footerNextText}>{step === 'settings' ? 'Done' : 'Next'}</Text>
            <ChevronRight size={20} color={Colors.white} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface.primary,
  },
  progressBar: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: Spacing.xxl,
    paddingTop: Spacing.lg,
  },
  progressStep: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.gray[700],
  },
  progressActive: {
    backgroundColor: Colors.accent[500],
  },
  scroll: {
    flexGrow: 1,
    padding: Spacing.xxl,
  },
  stepContent: {
    flex: 1,
    paddingTop: Spacing.xxxl,
  },
  stepIcon: {
    width: 64,
    height: 64,
    borderRadius: Radius.xl,
    backgroundColor: Colors.glass.light,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xxl,
  },
  stepTitle: {
    ...Typography.h1,
    marginBottom: Spacing.md,
  },
  stepSubtitle: {
    ...Typography.body,
    marginBottom: Spacing.xxxl,
  },
  fieldLabel: {
    ...Typography.label,
    marginBottom: Spacing.sm,
    marginTop: Spacing.xl,
  },
  input: {
    backgroundColor: Colors.surface.elevated,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    color: Colors.text.primary,
    fontSize: 16,
    fontFamily: 'System',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  chip: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: Colors.surface.elevated,
  },
  chipActive: {
    backgroundColor: Colors.accent[500],
    borderColor: Colors.accent[500],
  },
  chipText: {
    ...Typography.bodySmall,
  },
  chipTextActive: {
    color: Colors.white,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  goalsList: {
    gap: Spacing.sm,
  },
  goalItem: {
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: Colors.surface.card,
  },
  goalActive: {
    borderColor: Colors.accent[500],
    backgroundColor: `${Colors.accent[500]}10`,
  },
  goalText: {
    ...Typography.body,
    color: Colors.text.secondary,
  },
  goalTextActive: {
    color: Colors.accent[300],
    fontWeight: '600',
  },
  unitOption: {
    padding: Spacing.lg,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: Colors.surface.card,
    marginBottom: Spacing.sm,
  },
  unitActive: {
    borderColor: Colors.accent[500],
    backgroundColor: `${Colors.accent[500]}10`,
  },
  unitText: {
    ...Typography.body,
  },
  unitTextActive: {
    color: Colors.accent[300],
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    backgroundColor: Colors.surface.primary,
  },
  footerBack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: Spacing.sm,
  },
  footerBackText: {
    ...Typography.bodySmall,
    color: Colors.text.muted,
  },
  footerDots: {
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.gray[700],
  },
  dotActive: {
    backgroundColor: Colors.accent[400],
  },
  footerNext: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.accent[500],
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: Radius.xl,
  },
  footerNextText: {
    ...Typography.h3,
    color: Colors.white,
    fontSize: 14,
  },
});
