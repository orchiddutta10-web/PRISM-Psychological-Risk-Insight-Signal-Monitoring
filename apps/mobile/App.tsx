import React, { useState } from 'react';
import { SafeAreaView, StyleSheet, StatusBar } from 'react-native';
import WelcomeScreen from './src/screens/WelcomeScreen';
import BehaviorIntelligenceScreen from './src/screens/BehaviorIntelligenceScreen';
import PrivacyScreen from './src/screens/PrivacyScreen';
import ConsentNewScreen from './src/screens/ConsentNewScreen';
import ProfileScreen, { ProfileData } from './src/screens/ProfileScreen';
import PermissionsScreen from './src/screens/PermissionsScreen';
import HomeScreen from './src/screens/HomeScreen';
import { Colors } from './src/theme';

type Screen =
  | 'welcome'
  | 'behavior'
  | 'privacy'
  | 'consent'
  | 'profile'
  | 'permissions'
  | 'home';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('welcome');

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.surface.primary} />

      {currentScreen === 'welcome' && (
        <WelcomeScreen onGetStarted={() => setCurrentScreen('behavior')} />
      )}

      {currentScreen === 'behavior' && (
        <BehaviorIntelligenceScreen onContinue={() => setCurrentScreen('privacy')} />
      )}

      {currentScreen === 'privacy' && (
        <PrivacyScreen onContinue={() => setCurrentScreen('consent')} />
      )}

      {currentScreen === 'consent' && (
        <ConsentNewScreen onAccept={() => setCurrentScreen('profile')} />
      )}

      {currentScreen === 'profile' && (
        <ProfileScreen onSubmit={(_data: ProfileData) => setCurrentScreen('permissions')} />
      )}

      {currentScreen === 'permissions' && (
        <PermissionsScreen onComplete={() => setCurrentScreen('home')} />
      )}

      {currentScreen === 'home' && <HomeScreen />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface.primary,
  },
});
