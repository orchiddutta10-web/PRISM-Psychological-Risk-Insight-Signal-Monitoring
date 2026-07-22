import React, { useState } from 'react';
import { SafeAreaView, StyleSheet, StatusBar, View, TouchableOpacity, Text } from 'react-native';
import OnboardingScreen from './src/screens/OnboardingScreen';
import ConsentScreen from './src/screens/ConsentScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import PRISMNodeScreen from './src/screens/PRISMNodeScreen';
import CompanionScreen from './src/screens/CompanionScreen';

type ScreenState = 'onboarding' | 'consent' | 'dashboard' | 'prism_node' | 'companion';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<ScreenState>('onboarding');
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [guardianName, setGuardianName] = useState<string>('');

  const handleLinkSuccess = (linkedDeviceId: string, linkedGuardianName: string) => {
    setDeviceId(linkedDeviceId);
    setGuardianName(linkedGuardianName);
    setCurrentScreen('consent');
  };

  const handleConsentSaved = () => {
    setCurrentScreen('dashboard');
  };

  const handleBackToOnboarding = () => {
    setCurrentScreen('onboarding');
  };

  const handleLogout = () => {
    setDeviceId(null);
    setGuardianName('');
    setCurrentScreen('onboarding');
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      {currentScreen === 'onboarding' && (
        <OnboardingScreen onLinkSuccess={handleLinkSuccess} />
      )}
      {currentScreen === 'consent' && deviceId && (
        <ConsentScreen 
          guardianName={guardianName}
          onConsentSaved={handleConsentSaved}
          onBack={handleBackToOnboarding} 
        />
      )}
      {currentScreen === 'dashboard' && deviceId && (
        <View style={{flex: 1}}>
          <DashboardScreen 
            userId={guardianName} 
            deviceId={deviceId}
            onNavigateToConsent={() => setCurrentScreen('consent')}
            onLogout={handleLogout}
          />
          <View style={styles.floatingButtonsContainer}>
            <TouchableOpacity 
              style={styles.nodeButton} 
              onPress={() => setCurrentScreen('prism_node')}
            >
              <Text style={styles.nodeButtonText}>PRISM Node</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.companionButton} 
              onPress={() => setCurrentScreen('companion')}
            >
              <Text style={styles.companionButtonText}>AI Companion</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      {currentScreen === 'prism_node' && deviceId && (
        <PRISMNodeScreen 
          deviceId={deviceId}
          onBackToBehavior={() => setCurrentScreen('dashboard')}
        />
      )}
      {currentScreen === 'companion' && deviceId && (
        <CompanionScreen 
          onBackToDashboard={() => setCurrentScreen('dashboard')}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  floatingButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
  },
  nodeButton: {
    backgroundColor: '#00E5FF',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
    elevation: 5,
    shadowColor: '#00E5FF',
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  nodeButtonText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 14,
  },
  companionButton: {
    backgroundColor: '#BB86FC',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
    elevation: 5,
    shadowColor: '#BB86FC',
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  companionButtonText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 14,
  }
});
