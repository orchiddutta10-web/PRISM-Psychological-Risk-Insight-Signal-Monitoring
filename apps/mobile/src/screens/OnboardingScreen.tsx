import React, { useState, useEffect, useRef } from 'react';
import { 
  StyleSheet, Text, View, ScrollView, TextInput, TouchableOpacity, 
  Alert, ActivityIndicator, Platform, SafeAreaView, Modal, Switch, AppState, AppStateStatus
} from 'react-native';
import { 
  ArrowLeft, Lock, PlusCircle, User, Users, BookOpen, Shield, Check, Monitor, Clock, Bell, ChevronDown, ChevronUp, Calendar, Menu, Phone, Heart, Paperclip, Smile, Camera, Send, Volume2, Star
} from 'lucide-react-native';
import { ApiClient, TokenManager } from '../services/api';

// 1. Pricing configuration (Non-hardcoded single source)
const PRICING_CONFIG = {
  trialPrice: "₹3",
  originalPrice: "₹30",
  renewalPrice: "₹299/month",
  discountPercentage: "90% OFF",
  trialDays: 3,
  familyCount: "55,000 families protected",
  ratingText: "4.8+ rating"
};

// 2. Stubbed Payment Provider Interface
const PaymentProvider = {
  async processPayment(amount: string): Promise<boolean> {
    return new Promise((resolve) => {
      // Simulate payment gateway delay (e.g. Razorpay/UPI intent check)
      setTimeout(() => {
        resolve(true);
      }, 1500);
    });
  }
};

interface OnboardingScreenProps {
  onLinkSuccess: (deviceId: string, guardianName: string) => void;
}

// Reusable Confirmation Modal Component
interface ConfirmationModalProps {
  visible: boolean;
  headline: string;
  body: string;
  onCancel: () => void;
  onConfirm: () => void;
}

function ConfirmationModal({ visible, headline, body, onCancel, onConfirm }: ConfirmationModalProps) {
  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={onCancel}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalHeadline}>{headline}</Text>
          <Text style={styles.modalBody}>{body}</Text>
          
          <View style={styles.modalDivider} />
          
          <View style={styles.modalActionRow}>
            <TouchableOpacity style={styles.modalActionCancel} onPress={onCancel}>
              <Text style={styles.modalCancelText}>Change</Text>
            </TouchableOpacity>
            <View style={styles.modalActionDivider} />
            <TouchableOpacity style={styles.modalActionConfirm} onPress={onConfirm}>
              <Text style={styles.modalConfirmText}>Confirm</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function OnboardingScreen({ onLinkSuccess }: OnboardingScreenProps) {
  const [step, setStep] = useState(1);
  const [selectedLanguage, setSelectedLanguage] = useState<'hinglish' | 'english' | 'hindi' | null>(null);
  
  // Phone OTP
  const [phoneNumber, setPhoneNumber] = useState('+91 ');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  
  // Name Capture
  const [fullName, setFullName] = useState('');
  
  // Phase 5: Relationship & Gender
  const [relationship, setRelationship] = useState<'Daughter' | 'Son' | 'Child' | null>(null);
  
  // Phase 5: Date of Birth
  const [dobDay, setDobDay] = useState(15);
  const [dobMonth, setDobMonth] = useState(6); // June
  const [dobYear, setDobYear] = useState(2012);
  
  // Phase 5: Typical Screen Time (minutes)
  const [screenTimeMins, setScreenTimeMins] = useState(270); // 4h 30m default
  const [screenTimeConfirmOpen, setScreenTimeConfirmOpen] = useState(false);

  // Phase 5: Bedtime
  const [bedtimeHour, setBedtimeHour] = useState(22); // 10 PM
  const [bedtimeMin, setBedtimeMin] = useState(30);   // 30 Mins
  const [bedtimeConfirmOpen, setBedtimeConfirmOpen] = useState(false);

  // Phase 6: Concern Grid selection
  const [selectedConcerns, setSelectedConcerns] = useState<string[]>([]);

  // Phase 7: Consent Toggles
  const [consentLocation, setConsentLocation] = useState(false);
  const [consentTyping, setConsentTyping] = useState(false);
  const [consentApps, setConsentApps] = useState(false);
  const [consentNotifications, setConsentNotifications] = useState(false);
  const [neverCollectExpanded, setNeverCollectExpanded] = useState(false);

  // Phase 8: Chat Screen States
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState('');
  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);

  // Phase 8: Trial Conversion States
  const [selectedPayment, setSelectedPayment] = useState<'upi' | 'card'>('upi');
  const [isVideoMuted, setIsVideoMuted] = useState(true);
  const [videoCaption, setVideoCaption] = useState("Introduction to PRISM safety features...");

  // UI States
  const [isFocused, setIsFocused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [deviceId, setDeviceId] = useState('');

  // Concern Card Definitions
  const concernList = [
    { id: "Screen Time & App Usage", label: "Screen Time & App Usage", icon: Monitor },
    { id: "Mood & Behavior Shifts", label: "Mood & Behavior Shifts", icon: User },
    { id: "Social Withdrawal", label: "Social Withdrawal", icon: Users },
    { id: "Sleep Disruption", label: "Sleep Disruption", icon: Clock },
    { id: "Late-Night Activity", label: "Late-Night Activity", icon: Clock },
    { id: "New or Unknown Contacts", label: "New or Unknown Contacts", icon: Shield },
    { id: "Academic Stress", label: "Academic Stress", icon: BookOpen },
    { id: "Online Safety", label: "Online Safety", icon: Lock }
  ];

  // Auto-fill OTP mock Helper
  useEffect(() => {
    if (otpSent) {
      const timer = setTimeout(() => {
        setOtpCode('123456');
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [otpSent]);

  // Sync Chat History and WebSocket connection on Step 14
  useEffect(() => {
    if (step === 14) {
      loadChatHistory();
      connectWebSocket();

      // AppState listener to handle reconnect on background -> foreground
      const handleAppStateChange = (nextAppState: AppStateStatus) => {
        if (nextAppState === 'active') {
          connectWebSocket();
        } else {
          disconnectWebSocket();
        }
      };

      const subscription = AppState.addEventListener('change', handleAppStateChange);
      return () => {
        subscription.remove();
        disconnectWebSocket();
      };
    }
  }, [step]);

  const loadChatHistory = async () => {
    try {
      const history = await ApiClient.request('/chat/history', { method: 'GET' });
      setChatMessages(history);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (err) {
      console.log("Error loading chat history:", err);
    }
  };

  const connectWebSocket = async () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      return;
    }
    try {
      const token = await TokenManager.getToken();
      if (!token) return;

      const wsUrl = `ws://localhost:8000/api/v1/events/ws?token=${token}`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log("WebSocket chat connection established.");
      };

      ws.onmessage = (event) => {
        try {
          const payload = jsonParse(event.data);
          if (payload && payload.type === "chat_message") {
            setChatMessages(prev => {
              // Avoid duplicates
              if (prev.some(m => m.id === payload.id)) return prev;
              return [...prev, payload];
            });
            setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
          }
        } catch (e) {
          // Non-chat event payload ignored
        }
      };

      ws.onclose = () => {
        console.log("WebSocket chat connection closed. Retrying in 3 seconds...");
        setTimeout(connectWebSocket, 3000);
      };

      wsRef.current = ws;
    } catch (err) {
      console.log("WebSocket connect error:", err);
    }
  };

  const disconnectWebSocket = () => {
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
  };

  const jsonParse = (data: string) => {
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  };

  const handleSendChatMessage = () => {
    if (!chatInput.trim() || !wsRef.current) return;
    
    // Broadcast text to server WebSocket
    wsRef.current.send(JSON.stringify({ text: chatInput.trim() }));
    
    // Optimistic local update
    const tempMsg = {
      id: `temp-${Date.now()}`,
      guardian_id: "me",
      sender: "guardian",
      text: chatInput.trim(),
      timestamp: new Date().toISOString()
    };
    setChatMessages(prev => [...prev, tempMsg]);
    setChatInput('');
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  // Video Caption ticker simulation
  useEffect(() => {
    if (step === 15) {
      const captions = [
        "Welcome to PRISM, built to keep your child supported.",
        "Your ₹3 contribution configures your profile immediately.",
        "We never read message contents, only safety metadata patterns.",
        "Spot early shifts in sleep, routines, or mood cadence.",
        "Steady support and clear signals, 24/7."
      ];
      let idx = 0;
      const interval = setInterval(() => {
        idx = (idx + 1) % captions.length;
        setVideoCaption(captions[idx]);
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [step]);

  const handleSendOTP = async () => {
    if (phoneNumber.trim().length < 8) {
      Alert.alert("Invalid Number", "Please enter a valid phone number.");
      return;
    }
    setIsLoading(true);
    try {
      const res = await ApiClient.sendOTP(phoneNumber);
      setOtpSent(true);
      Alert.alert("Code Sent", `A verification code has been generated. For testing, use code: ${res.code}`);
    } catch (err: any) {
      Alert.alert("Failed", err.message || "Could not send verification code.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (otpCode.length !== 6) {
      Alert.alert("Invalid Code", "Please enter the 6-digit verification code.");
      return;
    }
    setIsLoading(true);
    try {
      const res = await ApiClient.verifyOTP(phoneNumber, otpCode);
      const mappedToken = `token-phone-${phoneNumber.replace(/\s+/g, '')}-${Platform.OS}`;
      const devRes = await ApiClient.registerDevice(
        "Teen's Phone",
        Platform.OS === 'ios' ? 'ios' : 'android',
        mappedToken
      );
      setDeviceId(devRes.device.id);

      if (res.is_new_user) {
        setStep(4);
      } else {
        setFullName(res.user?.full_name || "Guardian");
        setStep(6);
      }
    } catch (err: any) {
      Alert.alert("Verification Failed", err.message || "Incorrect code entered.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegisterName = async () => {
    if (fullName.trim().length === 0) {
      Alert.alert("Name Required", "Please enter your name.");
      return;
    }
    setIsLoading(true);
    try {
      await ApiClient.registerOTP(phoneNumber, fullName);
      setStep(5);
    } catch (err: any) {
      Alert.alert("Registration Failed", err.message || "Could not save your name.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveConsentAndBaselines = async () => {
    setIsLoading(true);
    try {
      const dobStr = `${dobYear}-${String(dobMonth).padStart(2, '0')}-${String(dobDay).padStart(2, '0')}`;
      const bedtimeStr = `${String(bedtimeHour).padStart(2, '0')}:${String(bedtimeMin).padStart(2, '0')}`;

      // 1. Submit seeded values (demographics, sliders, concerns)
      await ApiClient.seedBaselines({
        device_id: deviceId || "dummy-device-id",
        relationship: relationship || "Child",
        date_of_birth: dobStr,
        daily_screen_time_mins: screenTimeMins,
        usual_bedtime: bedtimeStr,
        concerns: selectedConcerns
      });

      // 2. Submit each granted consent record
      const consents = [
        { type: 'location', granted: consentLocation },
        { type: 'typing', granted: consentTyping },
        { type: 'app_usage', granted: consentApps },
        { type: 'notifications', granted: consentNotifications }
      ];

      for (const item of consents) {
        await ApiClient.request('/consent', {
          method: 'POST',
          body: JSON.stringify({
            signal_type: item.type,
            granted: item.granted,
            consent_copy_version: '1.0'
          })
        });
      }

      setStep(13);
    } catch (err: any) {
      Alert.alert("Error Saving Settings", err.message || "Failed to commit permissions configurations.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleProcessCheckout = async () => {
    setIsLoading(true);
    try {
      const success = await PaymentProvider.processPayment(PRICING_CONFIG.trialPrice);
      if (success) {
        Alert.alert("Payment Success", "Thank you! Your trial plan is active.");
        onLinkSuccess(deviceId || "dummy-device-id", fullName || "Guardian");
      }
    } catch (err) {
      Alert.alert("Payment Failed", "Payment gateway connection timed out.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleConcern = (id: string) => {
    if (selectedConcerns.includes(id)) {
      setSelectedConcerns(selectedConcerns.filter((c) => c !== id));
    } else {
      setSelectedConcerns([...selectedConcerns, id]);
    }
  };

  // Render Overlay Overlap Circle Watermark (Splash screen only)
  const Watermark = () => (
    <View style={styles.watermarkContainer}>
      <View style={[styles.watermarkCircle, { top: 0, right: 30 }]} />
      <View style={[styles.watermarkCircle, { top: 25, right: 0 }]} />
      <View style={[styles.watermarkCircle, { top: 25, right: 60 }]} />
      <View style={[styles.watermarkCircle, { top: 50, right: 30 }]} />
    </View>
  );

  // --- SCREEN 1: Splash / Value Prop Screen ---
  if (step === 1) {
    return (
      <View style={[styles.container, { backgroundColor: '#0A0A0A' }]}>
        <Watermark />
        
        <ScrollView contentContainerStyle={styles.splashContent}>
          <View style={styles.splashTitleSection}>
            <Text style={styles.brandTitle}>PRISM</Text>
            <Text style={styles.splashHeadline}>Your trusted partner for</Text>
            <Text style={[styles.splashHeadline, { fontWeight: '900' }]}>Digital Wellbeing & Safety</Text>
            <Text style={styles.splashSubhead}>
              Behavior, sleep, and screen patterns. Support before it becomes a crisis.
            </Text>
          </View>

          <View style={styles.lockCard}>
            <View style={styles.lockIconBox}>
              <Lock color="#FFFFFF" size={18} strokeWidth={2} />
            </View>
            <View style={styles.lockTextContainer}>
              <Text style={styles.lockTitle}>Private and consent-first</Text>
              <Text style={styles.lockText}>Your family's data stays secure & confidential.</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.pillButton} onPress={() => setStep(2)}>
            <Text style={styles.pillButtonText}>Let's Get Started</Text>
          </TouchableOpacity>

          <Text style={styles.splashFooter}>
            By clicking, you agree to our <Text style={styles.underline}>Terms of Service</Text> and <Text style={styles.underline}>Privacy Policy</Text>.
          </Text>
        </ScrollView>
      </View>
    );
  }

  // --- SCREEN 2: Language Selection ---
  if (step === 2) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: '#FFFFFF' }]}>
        <View style={styles.lightContent}>
          <Text style={styles.lightHeadline}>Choose your preferred language.</Text>
          
          <View style={styles.cardsContainer}>
            <TouchableOpacity 
              style={[styles.languageCard, selectedLanguage === 'hinglish' ? styles.cardSelected : styles.cardUnselected]}
              onPress={() => setSelectedLanguage('hinglish')}
            >
              <PlusCircle color={selectedLanguage === 'hinglish' ? '#000000' : '#8E8E93'} size={20} />
              <View style={styles.languageTextContainer}>
                <Text style={styles.languageTitle}>Hinglish</Text>
                <Text style={styles.languageSub}>Hum aise talk/type karna prefer karte hain</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.languageCard, selectedLanguage === 'english' ? styles.cardSelected : styles.cardUnselected]}
              onPress={() => setSelectedLanguage('english')}
            >
              <PlusCircle color={selectedLanguage === 'english' ? '#000000' : '#8E8E93'} size={20} />
              <View style={styles.languageTextContainer}>
                <Text style={styles.languageTitle}>English</Text>
                <Text style={styles.languageSub}>I prefer to talk/type like this</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.languageCard, selectedLanguage === 'hindi' ? styles.cardSelected : styles.cardUnselected]}
              onPress={() => setSelectedLanguage('hindi')}
            >
              <PlusCircle color={selectedLanguage === 'hindi' ? '#000000' : '#8E8E93'} size={20} />
              <View style={styles.languageTextContainer}>
                <Text style={styles.languageTitle}>Hindi</Text>
                <Text style={styles.languageSub}>मैं इस तरह बात/टाइप करना पसंद करता हूँ</Text>
              </View>
            </TouchableOpacity>
          </View>

          <View style={styles.bottomNav}>
            <TouchableOpacity 
              style={[styles.blackButton, !selectedLanguage && styles.disabledBlackButton]}
              disabled={!selectedLanguage}
              onPress={() => setStep(3)}
            >
              <Text style={styles.blackButtonText}>Next</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // --- SCREEN 3: Phone Authentication ---
  if (step === 3) {
    const isValidPhone = phoneNumber.trim().replace(/\D/g, '').length >= 10;
    const isValidOtp = otpCode.length === 6;

    return (
      <SafeAreaView style={[styles.container, { backgroundColor: '#FFFFFF' }]}>
        <View style={styles.lightContent}>
          
          <View style={styles.lightHeader}>
            <TouchableOpacity onPress={() => { if (otpSent) { setOtpSent(false); } else { setStep(2); } }} style={styles.backButton}>
              <ArrowLeft color="#000000" size={24} />
            </TouchableOpacity>
            <Text style={styles.minibrand}>PRISM</Text>
          </View>

          {!otpSent ? (
            <>
              <Text style={styles.lightHeadline}>Enter your number to continue!</Text>
              
              <View style={[styles.inputWrapper, isFocused && styles.inputWrapperFocused]}>
                <TextInput
                  placeholder="Phone Number"
                  placeholderTextColor="#8E8E93"
                  keyboardType="phone-pad"
                  style={styles.lightInput}
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                />
              </View>

              <TouchableOpacity 
                style={[styles.blackButton, (!isValidPhone || isLoading) && styles.disabledBlackButton]}
                disabled={!isValidPhone || isLoading}
                onPress={handleSendOTP}
              >
                {isLoading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.blackButtonText}>Send Code</Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.lightHeadline}>Enter the 6-digit verification code</Text>
              
              <View style={[styles.inputWrapper, isFocused && styles.inputWrapperFocused]}>
                <TextInput
                  placeholder="Verification Code"
                  placeholderTextColor="#8E8E93"
                  keyboardType="number-pad"
                  maxLength={6}
                  style={styles.lightInput}
                  value={otpCode}
                  onChangeText={setOtpCode}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  textContentType="oneTimeCode"
                />
              </View>

              <TouchableOpacity 
                style={[styles.blackButton, (!isValidOtp || isLoading) && styles.disabledBlackButton]}
                disabled={!isValidOtp || isLoading}
                onPress={handleVerifyOTP}
              >
                {isLoading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.blackButtonText}>Verify OTP</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // --- SCREEN 4: Name Capture ---
  if (step === 4) {
    const isValidName = fullName.trim().length > 0;

    return (
      <SafeAreaView style={[styles.container, { backgroundColor: '#FFFFFF' }]}>
        <View style={styles.lightContent}>
          
          <View style={styles.lightHeader}>
            <TouchableOpacity onPress={() => setStep(3)} style={styles.backButton}>
              <ArrowLeft color="#000000" size={24} />
            </TouchableOpacity>
          </View>

          <Text style={styles.lightHeadline}>What should I call you?</Text>
          
          <View style={[styles.inputWrapper, isFocused && styles.inputWrapperFocused]}>
            <TextInput
              placeholder="Your Full Name"
              placeholderTextColor="#8E8E93"
              style={styles.lightInput}
              value={fullName}
              onChangeText={setFullName}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              autoFocus
            />
          </View>

          <TouchableOpacity 
            style={[styles.blackButton, (!isValidName || isLoading) && styles.disabledBlackButton]}
            disabled={!isValidName || isLoading}
            onPress={handleRegisterName}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.blackButtonText}>Next</Text>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // --- SCREEN 5: AI Companion Intro ---
  if (step === 5) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: '#FFFFFF' }]}>
        <View style={styles.lightContent}>
          
          <View style={styles.aiHeader}>
            <Text style={styles.aiHeadline}>
              Hi! I'm <Text style={styles.aiName}>Aria</Text>
            </Text>
            <Text style={styles.aiSubhead}>Your family's AI safety guide.</Text>
          </View>

          <View style={styles.aiFlowContainer}>
            <View style={[styles.chatBubble, styles.bubbleLeft]}>
              <Text style={styles.chatText}>I'm here to help you understand what's going on — calmly.</Text>
            </View>

            <View style={styles.avatarCircle}>
              <View style={styles.avatarInner} />
              <View style={styles.avatarEyeLeft} />
              <View style={styles.avatarEyeRight} />
            </View>

            <View style={[styles.chatBubble, styles.bubbleRight]}>
              <Text style={styles.chatText}>Reach me by call or chat, 24/7.</Text>
            </View>
          </View>

          <View style={styles.reassuranceCard}>
            <Text style={styles.reassuranceText}>No judgment. Just clear signals and steady support.</Text>
          </View>

          <View style={styles.bottomNav}>
            <TouchableOpacity style={styles.blackButton} onPress={() => setStep(6)}>
              <Text style={styles.blackButtonText}>Next</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // --- SCREEN 6: Relationship & Gender ---
  if (step === 6) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: '#FFFFFF' }]}>
        <View style={styles.lightContent}>
          
          <View style={styles.lightHeader}>
            <TouchableOpacity onPress={() => setStep(5)} style={styles.backButton}>
              <ArrowLeft color="#000000" size={24} />
            </TouchableOpacity>
          </View>

          <Text style={styles.lightHeadline}>Tell me about your child</Text>
          
          <View style={styles.genderRow}>
            <TouchableOpacity 
              style={[styles.genderCard, relationship === 'Daughter' ? styles.cardSelected : styles.cardUnselected]}
              onPress={() => setRelationship('Daughter')}
            >
              <User color={relationship === 'Daughter' ? '#000000' : '#8E8E93'} size={28} />
              <Text style={[styles.genderLabel, relationship === 'Daughter' && styles.boldText]}>Daughter</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.genderCard, relationship === 'Son' ? styles.cardSelected : styles.cardUnselected]}
              onPress={() => setRelationship('Son')}
            >
              <User color={relationship === 'Son' ? '#000000' : '#8E8E93'} size={28} />
              <Text style={[styles.genderLabel, relationship === 'Son' && styles.boldText]}>Son</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.genderCard, relationship === 'Child' ? styles.cardSelected : styles.cardUnselected]}
              onPress={() => setRelationship('Child')}
            >
              <User color={relationship === 'Child' ? '#000000' : '#8E8E93'} size={28} />
              <Text style={[styles.genderLabel, relationship === 'Child' && styles.boldText]}>Child</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.bottomNav}>
            <TouchableOpacity 
              style={[styles.blackButton, !relationship && styles.disabledBlackButton]}
              disabled={!relationship}
              onPress={() => setStep(7)}
            >
              <Text style={styles.blackButtonText}>Next</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // --- SCREEN 7: Date of Birth Picker ---
  if (step === 7) {
    const handleIncrement = (type: 'day' | 'month' | 'year', dir: 'up' | 'down') => {
      if (type === 'day') {
        const offset = dir === 'up' ? 1 : -1;
        let nd = dobDay + offset;
        if (nd < 1) nd = 31;
        if (nd > 31) nd = 1;
        setDobDay(nd);
      } else if (type === 'month') {
        const offset = dir === 'up' ? 1 : -1;
        let nm = dobMonth + offset;
        if (nm < 1) nm = 12;
        if (nm > 12) nm = 1;
        setDobMonth(nm);
      } else if (type === 'year') {
        const offset = dir === 'up' ? 1 : -1;
        let ny = dobYear + offset;
        if (ny < 2008) ny = 2026;
        if (ny > 2026) ny = 2008;
        setDobYear(ny);
      }
    };

    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    return (
      <SafeAreaView style={[styles.container, { backgroundColor: '#FFFFFF' }]}>
        <View style={styles.lightContent}>
          
          <View style={styles.lightHeader}>
            <TouchableOpacity onPress={() => setStep(6)} style={styles.backButton}>
              <ArrowLeft color="#000000" size={24} />
            </TouchableOpacity>
          </View>

          <View>
            <Text style={styles.lightHeadline}>Child's Date of Birth</Text>
            <Text style={styles.lightSubhead}>Important for age-appropriate guidance.</Text>
          </View>

          <View style={styles.pickerWheelContainer}>
            <View style={styles.pickerColumn}>
              <TouchableOpacity onPress={() => handleIncrement('month', 'up')} style={styles.wheelArrow}><Text style={styles.arrowChar}>&and;</Text></TouchableOpacity>
              <View style={styles.wheelSelectionBox}>
                <Text style={styles.wheelLabel}>{months[dobMonth - 1]}</Text>
              </View>
              <TouchableOpacity onPress={() => handleIncrement('month', 'down')} style={styles.wheelArrow}><Text style={styles.arrowChar}>&or;</Text></TouchableOpacity>
            </View>

            <View style={styles.pickerColumn}>
              <TouchableOpacity onPress={() => handleIncrement('day', 'up')} style={styles.wheelArrow}><Text style={styles.arrowChar}>&and;</Text></TouchableOpacity>
              <View style={styles.wheelSelectionBox}>
                <Text style={styles.wheelLabel}>{String(dobDay).padStart(2, '0')}</Text>
              </View>
              <TouchableOpacity onPress={() => handleIncrement('day', 'down')} style={styles.wheelArrow}><Text style={styles.arrowChar}>&or;</Text></TouchableOpacity>
            </View>

            <View style={styles.pickerColumn}>
              <TouchableOpacity onPress={() => handleIncrement('year', 'up')} style={styles.wheelArrow}><Text style={styles.arrowChar}>&and;</Text></TouchableOpacity>
              <View style={styles.wheelSelectionBox}>
                <Text style={styles.wheelLabel}>{dobYear}</Text>
              </View>
              <TouchableOpacity onPress={() => handleIncrement('year', 'down')} style={styles.wheelArrow}><Text style={styles.arrowChar}>&or;</Text></TouchableOpacity>
            </View>
          </View>

          <View style={styles.accessibilityInputs}>
            <Text style={styles.accessibilityLabel}>Keyboard entry alternative:</Text>
            <View style={styles.manualDateRow}>
              <TextInput 
                style={styles.manualInput} 
                keyboardType="numeric" 
                maxLength={2} 
                placeholder="DD"
                value={String(dobDay)} 
                onChangeText={(val) => { const n = parseInt(val) || 1; if (n >= 1 && n <= 31) setDobDay(n); }}
              />
              <TextInput 
                style={styles.manualInput} 
                keyboardType="numeric" 
                maxLength={2} 
                placeholder="MM"
                value={String(dobMonth)} 
                onChangeText={(val) => { const n = parseInt(val) || 1; if (n >= 1 && n <= 12) setDobMonth(n); }}
              />
              <TextInput 
                style={styles.manualInput} 
                keyboardType="numeric" 
                maxLength={4} 
                placeholder="YYYY"
                value={String(dobYear)} 
                onChangeText={(val) => { const n = parseInt(val) || 2012; if (n >= 2008 && n <= 2026) setDobYear(n); }}
              />
            </View>
          </View>

          <View style={styles.bottomNav}>
            <TouchableOpacity style={styles.blackButton} onPress={() => setStep(8)}>
              <Text style={styles.blackButtonText}>Next</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // --- SCREEN 8: Typical Daily Screen Time ---
  if (step === 8) {
    const hours = Math.floor(screenTimeMins / 60);
    const mins = screenTimeMins % 60;
    const ticks = Array.from({ length: 16 }, (_, i) => 30 + i * 30);

    return (
      <SafeAreaView style={[styles.container, { backgroundColor: '#FFFFFF' }]}>
        <View style={styles.lightContent}>
          
          <View style={styles.lightHeader}>
            <TouchableOpacity onPress={() => setStep(7)} style={styles.backButton}>
              <ArrowLeft color="#000000" size={24} />
            </TouchableOpacity>
          </View>

          <View>
            <Text style={styles.lightHeadline}>Typical Daily Screen Time</Text>
            <Text style={styles.lightSubhead}>Helps set a realistic starting baseline.</Text>
          </View>

          <View style={styles.sliderDisplayContainer}>
            <Text style={styles.sliderDisplayValue}>
              <Text style={styles.sliderNumber}>{hours}</Text>
              <Text style={styles.sliderUnit}> Hrs </Text>
              {mins > 0 && (
                <>
                  <Text style={styles.sliderNumber}>{mins}</Text>
                  <Text style={styles.sliderUnit}> Min</Text>
                </>
              )}
            </Text>
          </View>

          <View style={styles.ticksContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ticksScroll}>
              {ticks.map((t) => {
                const isSelected = screenTimeMins === t;
                return (
                  <TouchableOpacity 
                    key={t}
                    style={styles.tickWrapper}
                    onPress={() => setScreenTimeMins(t)}
                  >
                    <View style={[styles.tickLine, isSelected ? styles.tickLineSelected : styles.tickLineNormal]} />
                    <Text style={[styles.tickLabel, isSelected && styles.tickLabelSelected]}>{Math.round(t / 60)}h</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <Text style={styles.sliderInstruction}>Slide (left/right) or tap ticks to adjust.</Text>
          </View>

          <View style={styles.accessibilityStepper}>
            <TouchableOpacity style={styles.stepperBtn} onPress={() => { if (screenTimeMins > 30) setScreenTimeMins(screenTimeMins - 30); }}>
              <Text style={styles.stepperBtnText}>- 30m</Text>
            </TouchableOpacity>
            <TextInput
              style={styles.stepperInput}
              keyboardType="numeric"
              value={String(screenTimeMins)}
              onChangeText={(val) => { const n = parseInt(val) || 30; if (n >= 30 && n <= 720) setScreenTimeMins(n); }}
            />
            <Text style={styles.stepperUnit}>mins</Text>
            <TouchableOpacity style={styles.stepperBtn} onPress={() => { if (screenTimeMins < 720) setScreenTimeMins(screenTimeMins + 30); }}>
              <Text style={styles.stepperBtnText}>+ 30m</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.bottomNav}>
            <TouchableOpacity style={styles.blackButton} onPress={() => setScreenTimeConfirmOpen(true)}>
              <Text style={styles.blackButtonText}>Next</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ConfirmationModal
          visible={screenTimeConfirmOpen}
          headline="Just checking"
          body={`Their typical daily screen time is around ${hours} Hrs ${mins > 0 ? `${mins} Min` : ''}?`}
          onCancel={() => setScreenTimeConfirmOpen(false)}
          onConfirm={() => {
            setScreenTimeConfirmOpen(false);
            setStep(9);
          }}
        />
      </SafeAreaView>
    );
  }

  // --- SCREEN 9: Usual Bedtime ---
  if (step === 9) {
    const isPM = bedtimeHour >= 12;
    const dispHour = bedtimeHour % 12 === 0 ? 12 : bedtimeHour % 12;
    const dispTime = `${dispHour}:${String(bedtimeMin).padStart(2, '0')} ${isPM ? 'PM' : 'AM'}`;
    const ticks = Array.from({ length: 25 }, (_, i) => 20.0 + i * 0.25);

    const handleTickPress = (val: number) => {
      const totalMins = Math.round(val * 60);
      const h = Math.floor(totalMins / 60) % 24;
      const m = totalMins % 60;
      setBedtimeHour(h);
      setBedtimeMin(m);
    };

    const getTickDisplayVal = (val: number) => {
      const hour = Math.floor(val) % 24;
      const pm = hour >= 12;
      const dh = hour % 12 === 0 ? 12 : hour % 12;
      return `${dh} ${pm ? 'PM' : 'AM'}`;
    };

    return (
      <SafeAreaView style={[styles.container, { backgroundColor: '#FFFFFF' }]}>
        <View style={styles.lightContent}>
          
          <View style={styles.lightHeader}>
            <TouchableOpacity onPress={() => setStep(8)} style={styles.backButton}>
              <ArrowLeft color="#000000" size={24} />
            </TouchableOpacity>
          </View>

          <View>
            <Text style={styles.lightHeadline}>Usual Bedtime</Text>
            <Text style={styles.lightSubhead}>Helps flag late-night activity that's out of the ordinary.</Text>
          </View>

          <View style={styles.sliderDisplayContainer}>
            <Text style={styles.sliderDisplayValue}>
              <Text style={styles.sliderNumber}>{dispHour}</Text>
              <Text style={styles.sliderTimeColon}>:</Text>
              <Text style={styles.sliderNumber}>{String(bedtimeMin).padStart(2, '0')}</Text>
              <Text style={styles.sliderUnit}> {isPM ? 'PM' : 'AM'}</Text>
            </Text>
          </View>

          <View style={styles.ticksContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ticksScroll}>
              {ticks.map((t) => {
                const tMins = Math.round(t * 60);
                const currentMins = bedtimeHour * 60 + bedtimeMin;
                const isSelected = Math.abs(tMins - currentMins) < 5;
                
                return (
                  <TouchableOpacity 
                    key={t}
                    style={styles.tickWrapper}
                    onPress={() => handleTickPress(t)}
                  >
                    <View style={[styles.tickLine, isSelected ? styles.tickLineSelected : styles.tickLineNormal]} />
                    <Text style={[styles.tickLabel, isSelected && styles.tickLabelSelected]}>{getTickDisplayVal(t)}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <Text style={styles.sliderInstruction}>Slide (left/right) or tap ticks to adjust.</Text>
          </View>

          <View style={styles.accessibilityStepper}>
            <TouchableOpacity style={styles.stepperBtn} onPress={() => { 
              let nm = bedtimeMin - 15;
              let nh = bedtimeHour;
              if (nm < 0) { nm = 45; nh = (bedtimeHour - 1 + 24) % 24; }
              setBedtimeHour(nh); setBedtimeMin(nm);
            }}>
              <Text style={styles.stepperBtnText}>- 15m</Text>
            </TouchableOpacity>
            <Text style={styles.stepperBedtimeDisplay}>{dispTime}</Text>
            <TouchableOpacity style={styles.stepperBtn} onPress={() => { 
              let nm = bedtimeMin + 15;
              let nh = bedtimeHour;
              if (nm >= 60) { nm = 0; nh = (bedtimeHour + 1) % 24; }
              setBedtimeHour(nh); setBedtimeMin(nm);
            }}>
              <Text style={styles.stepperBtnText}>+ 15m</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.bottomNav}>
            <TouchableOpacity style={styles.blackButton} onPress={() => setBedtimeConfirmOpen(true)}>
              <Text style={styles.blackButtonText}>Next</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ConfirmationModal
          visible={bedtimeConfirmOpen}
          headline="Just checking"
          body={`Their usual bedtime is around ${dispTime}?`}
          onCancel={() => setBedtimeConfirmOpen(false)}
          onConfirm={() => {
            setBedtimeConfirmOpen(false);
            setStep(10);
          }}
        />
      </SafeAreaView>
    );
  }

  // --- SCREEN 10: Concern Selection Grid ---
  if (step === 10) {
    const hasSelection = selectedConcerns.length > 0;

    return (
      <SafeAreaView style={[styles.container, { backgroundColor: '#FFFFFF' }]}>
        <View style={styles.lightContent}>
          <View style={styles.lightHeader}>
            <TouchableOpacity onPress={() => setStep(9)} style={styles.backButton}>
              <ArrowLeft color="#000000" size={24} />
            </TouchableOpacity>
          </View>

          <Text style={styles.lightHeadline}>What would you like support with?</Text>

          <ScrollView contentContainerStyle={styles.concernGridContainer} showsVerticalScrollIndicator={false}>
            <View style={styles.gridRow}>
              {concernList.map((item) => {
                const isSelected = selectedConcerns.includes(item.id);
                const IconComponent = item.icon;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.concernCard,
                      isSelected ? styles.concernCardSelected : styles.concernCardUnselected
                    ]}
                    onPress={() => handleToggleConcern(item.id)}
                  >
                    {isSelected && (
                      <View style={styles.checkmarkBadge}>
                        <Check color="#FFFFFF" size={10} strokeWidth={3} />
                      </View>
                    )}
                    <View style={[styles.concernIconBox, isSelected ? styles.iconBoxSelected : styles.iconBoxUnselected]}>
                      <IconComponent color={isSelected ? '#000000' : '#8E8E93'} size={24} />
                    </View>
                    <Text style={[styles.concernLabel, isSelected && styles.boldText]}>{item.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          <View style={styles.bottomNav}>
            <TouchableOpacity 
              style={[styles.blackButton, !hasSelection && styles.disabledBlackButton]}
              disabled={!hasSelection}
              onPress={() => setStep(11)}
            >
              <Text style={styles.blackButtonText}>Next</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // --- SCREEN 11: Personalized Trust Screen ---
  if (step === 11) {
    const topConcern = selectedConcerns[0] || "Wellbeing Support";

    return (
      <SafeAreaView style={[styles.container, { backgroundColor: '#FFFFFF' }]}>
        <ScrollView contentContainerStyle={styles.trustScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.trustBannerGraphic}>
            <View style={styles.bannerPrismShape} />
            <View style={[styles.bannerCircleShape, { top: 20, left: '10%' }]} />
            <View style={[styles.bannerCircleShape, { bottom: 10, right: '15%' }]} />
            <View style={styles.bannerGridLines} />
          </View>

          <View style={styles.trustCardOverlay}>
            <Text style={styles.trustHeadline}>{fullName}, you're in the right place</Text>
            
            <View style={styles.concernPillContainer}>
              <View style={styles.concernPill}>
                <Text style={styles.concernPillText}>{topConcern}</Text>
              </View>
            </View>

            <View style={styles.trustDivider} />

            <Text style={styles.trustBody}>
              This is one of the most common shifts families catch early with PRISM. 
              We've supported 12,000+ families, and most report feeling calmer and more informed within weeks.
            </Text>

            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Users color="#000000" size={24} />
                <Text style={styles.statNumber}>12,000+</Text>
                <Text style={styles.statLabel}>Families Supported</Text>
              </View>
              <View style={styles.statCard}>
                <Shield color="#000000" size={24} />
                <Text style={styles.statNumber}>80%</Text>
                <Text style={styles.statLabel}>Felt More Confident</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.blackButton} onPress={() => setStep(12)}>
              <Text style={styles.blackButtonText}>Set Up Protection &rarr;</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // --- SCREEN 12: Consent & Permissions Screen ---
  if (step === 12) {
    const hasAtLeastOneConsent = consentLocation || consentTyping || consentApps || consentNotifications;

    return (
      <SafeAreaView style={[styles.container, { backgroundColor: '#FFFFFF' }]}>
        <View style={styles.lightContent}>
          <View style={styles.lightHeader}>
            <TouchableOpacity onPress={() => setStep(11)} style={styles.backButton}>
              <ArrowLeft color="#000000" size={24} />
            </TouchableOpacity>
            <Text style={styles.minibrand}>PRISM</Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, paddingBottom: 20 }}>
            <Text style={styles.lightHeadline}>Just need a couple of quick permissions.</Text>
            
            <View style={styles.togglesList}>
              <View style={styles.toggleRow}>
                <View style={styles.toggleTextContainer}>
                  <Text style={styles.toggleTitle}>Location & Movement Patterns</Text>
                  <Text style={styles.toggleSub}>Estimates wellness metrics like entropy and daily steps.</Text>
                </View>
                <Switch
                  value={consentLocation}
                  onValueChange={setConsentLocation}
                  trackColor={{ false: '#E5E5EA', true: '#000000' }}
                  thumbColor={Platform.OS === 'ios' ? '#FFFFFF' : consentLocation ? '#FFFFFF' : '#8E8E93'}
                />
              </View>

              <View style={styles.toggleRow}>
                <View style={styles.toggleTextContainer}>
                  <Text style={styles.toggleTitle}>Typing Rhythm (never message content)</Text>
                  <Text style={styles.toggleSub}>Measures cadence shifts to evaluate cognitive stress.</Text>
                </View>
                <Switch
                  value={consentTyping}
                  onValueChange={setConsentTyping}
                  trackColor={{ false: '#E5E5EA', true: '#000000' }}
                  thumbColor={Platform.OS === 'ios' ? '#FFFFFF' : consentTyping ? '#FFFFFF' : '#8E8E93'}
                />
              </View>

              <View style={styles.toggleRow}>
                <View style={styles.toggleTextContainer}>
                  <Text style={styles.toggleTitle}>App Usage Categories</Text>
                  <Text style={styles.toggleSub}>Monitors total screen-time duration per app type.</Text>
                </View>
                <Switch
                  value={consentApps}
                  onValueChange={setConsentApps}
                  trackColor={{ false: '#E5E5EA', true: '#000000' }}
                  thumbColor={Platform.OS === 'ios' ? '#FFFFFF' : consentApps ? '#FFFFFF' : '#8E8E93'}
                />
              </View>

              <View style={styles.toggleRow}>
                <View style={styles.toggleTextContainer}>
                  <Text style={styles.toggleTitle}>Notification Access</Text>
                  <Text style={styles.toggleSub}>Triggers secure baseline updates in the background.</Text>
                </View>
                <Switch
                  value={consentNotifications}
                  onValueChange={setConsentNotifications}
                  trackColor={{ false: '#E5E5EA', true: '#000000' }}
                  thumbColor={Platform.OS === 'ios' ? '#FFFFFF' : consentNotifications ? '#FFFFFF' : '#8E8E93'}
                />
              </View>
            </View>

            <View style={styles.neverCollectContainer}>
              <TouchableOpacity 
                style={styles.neverCollectHeader} 
                onPress={() => setNeverCollectExpanded(!neverCollectExpanded)}
              >
                <Text style={styles.neverCollectTitle}>What we never collect</Text>
                {neverCollectExpanded ? <ChevronUp color="#000000" size={16} /> : <ChevronDown color="#000000" size={16} />}
              </TouchableOpacity>

              {neverCollectExpanded && (
                <View style={styles.neverCollectContent}>
                  <Text style={styles.neverCollectItem}>&bull; No raw message texts or chat inputs are read</Text>
                  <Text style={styles.neverCollectItem}>&bull; No voice records or call audio content</Text>
                  <Text style={styles.neverCollectItem}>&bull; No personal photos or private video captures</Text>
                  <Text style={styles.neverCollectItem}>&bull; No browser history or raw page content logs</Text>
                </View>
              )}
            </View>

            <Text style={styles.consentFooterNote}>
              Your child will always be able to see what's being monitored, and can pause it anytime.
            </Text>
          </ScrollView>

          <View style={styles.bottomNav}>
            <TouchableOpacity 
              style={[styles.blackButton, (!hasAtLeastOneConsent || isLoading) && styles.disabledBlackButton]}
              disabled={!hasAtLeastOneConsent || isLoading}
              onPress={handleSaveConsentAndBaselines}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.blackButtonText}>Continue &rarr;</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // --- SCREEN 13: Journey Roadmap Screen ---
  if (step === 13) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: '#FFFFFF' }]}>
        <View style={styles.lightContent}>
          <View style={styles.lightHeader}>
            <TouchableOpacity onPress={() => setStep(12)} style={styles.backButton}>
              <ArrowLeft color="#000000" size={24} />
            </TouchableOpacity>
            <Text style={styles.minibrand}>SAFETY PATH</Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.roadmapScroll}>
            <Text style={styles.lightHeadline}>Your Safety Journey</Text>

            <View style={styles.timelineContainer}>
              <View style={styles.timelineLine} />

              <View style={styles.timelineNodeRow}>
                <View style={[styles.nodeIconCircle, styles.nodeChecked]}>
                  <Check color="#FFFFFF" size={12} strokeWidth={3} />
                </View>
                <View style={styles.nodeTextContainer}>
                  <Text style={styles.nodeTitle}>Profile ready!</Text>
                  <Text style={styles.nodeSub}>I've understood your concerns. Now it's time to build your plan.</Text>
                </View>
              </View>

              <View style={styles.timelineNodeRow}>
                <View style={[styles.nodeIconCircle, styles.nodeActive]}>
                  <Check color="#000000" size={12} strokeWidth={3} />
                </View>
                <View style={styles.nodeTextContainer}>
                  <View style={styles.highlightedCard}>
                    <Text style={styles.cardHeaderTitle}>Unlock Your Family Safety Plan for just {PRICING_CONFIG.trialPrice}</Text>
                    <Text style={styles.cardHeaderSub}>
                      Built after a short consultation call, understanding your family's routines and concerns.
                    </Text>
                    
                    <View style={styles.cardFeaturesList}>
                      <View style={styles.featureItem}>
                        <Shield color="#000000" size={14} />
                        <Text style={styles.featureLabel}>Risk Report</Text>
                      </View>
                      <View style={styles.featureItem}>
                        <Bell color="#000000" size={14} />
                        <Text style={styles.featureLabel}>Alert Setup</Text>
                      </View>
                      <View style={styles.featureItem}>
                        <Calendar color="#000000" size={14} />
                        <Text style={styles.featureLabel}>Weekly Digest</Text>
                      </View>
                    </View>
                  </View>
                </View>
              </View>

              <View style={styles.timelineNodeRow}>
                <View style={[styles.nodeIconCircle, styles.nodeInactive]}>
                  <Bell color="#8E8E93" size={12} />
                </View>
                <View style={styles.nodeTextContainer}>
                  <Text style={[styles.nodeTitle, styles.inactiveText]}>Trial ends</Text>
                  <Text style={styles.nodeSub}>I'll remind you before the trial ends.</Text>
                </View>
              </View>

              <View style={styles.timelineNodeRow}>
                <View style={[styles.nodeIconCircle, styles.nodeInactive]}>
                  <Lock color="#8E8E93" size={12} />
                </View>
                <View style={styles.nodeTextContainer}>
                  <Text style={[styles.nodeTitle, styles.inactiveText]}>Then {PRICING_CONFIG.renewalPrice} after trial</Text>
                  <Text style={styles.nodeSub}>No hidden charges. Cancel anytime.</Text>
                </View>
              </View>
            </View>

            <View style={styles.roadmapGraphic}>
              <View style={styles.graphicBlock} />
              <View style={[styles.graphicBlock, { width: 120, height: 6, backgroundColor: '#E5E5EA' }]} />
              <View style={[styles.graphicCircle, { right: 40 }]} />
            </View>
          </ScrollView>

          <View style={styles.bottomNav}>
            <TouchableOpacity style={styles.blackButton} onPress={() => setStep(14)}>
              <Text style={styles.blackButtonText}>Try for {PRICING_CONFIG.trialDays} Days &rarr;</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // --- SCREEN 14: AI Companion Chat Screen (Phase 8 Task 1) ---
  if (step === 14) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: '#FFFFFF' }]}>
        {/* Chat Header */}
        <View style={styles.chatHeader}>
          <TouchableOpacity style={styles.headerBtn}>
            <Menu color="#000000" size={24} />
          </TouchableOpacity>
          
          <View style={styles.headerAvatarContainer}>
            <View style={styles.headerAvatar}>
              <View style={styles.ariaTinyInner} />
            </View>
            <View style={styles.headerTitleContainer}>
              <Text style={styles.chatHeaderName}>Aria</Text>
              <Text style={styles.chatHeaderStatus}>online</Text>
            </View>
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.headerBtn}>
              <Phone color="#000000" size={20} />
            </TouchableOpacity>
            
            {/* Pill My Plan button on the right */}
            <TouchableOpacity style={styles.myPlanPill} onPress={() => setStep(15)}>
              <Heart color="#000000" size={14} />
              <Text style={styles.myPlanText}>My Plan</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Chat Background & Message Scroll Container */}
        <View style={styles.chatArea}>
          {/* Subtle Watermark Grid overlay */}
          <View style={styles.chatWatermarkOverlay}>
            <View style={styles.watermarkGridRow}>
              <Shield color="#E5E5EA" size={20} style={{ opacity: 0.2 }} />
              <Bell color="#E5E5EA" size={20} style={{ opacity: 0.2 }} />
              <Monitor color="#E5E5EA" size={20} style={{ opacity: 0.2 }} />
            </View>
            <View style={styles.watermarkGridRow}>
              <Clock color="#E5E5EA" size={20} style={{ opacity: 0.2 }} />
              <Phone color="#E5E5EA" size={20} style={{ opacity: 0.2 }} />
              <Users color="#E5E5EA" size={20} style={{ opacity: 0.2 }} />
            </View>
          </View>

          <ScrollView 
            ref={scrollRef}
            contentContainerStyle={styles.chatMessagesList}
            showsVerticalScrollIndicator={false}
          >
            {/* Today pill */}
            <View style={styles.datePillContainer}>
              <View style={styles.datePill}>
                <Text style={styles.datePillText}>Today</Text>
              </View>
            </View>

            {/* Iterated chat history */}
            {chatMessages.map((msg) => {
              const isMe = msg.sender === 'guardian';
              return (
                <View 
                  key={msg.id}
                  style={[styles.msgRow, isMe ? styles.msgRowRight : styles.msgRowLeft]}
                >
                  <View style={[styles.msgBubble, isMe ? styles.msgBubbleRight : styles.msgBubbleLeft]}>
                    <Text style={[styles.msgText, isMe && styles.msgBubbleRightText]}>{msg.aria_utterance ?? msg.text}</Text>
                    <Text style={styles.msgTime}>
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>

        {/* Input Bar */}
        <View style={styles.chatInputBar}>
          <View style={styles.chatInputContainer}>
            <TouchableOpacity style={styles.inputActionBtn}>
              <Smile color="#8E8E93" size={22} />
            </TouchableOpacity>
            <TextInput
              placeholder="Message"
              placeholderTextColor="#8E8E93"
              style={styles.chatTextInputField}
              value={chatInput}
              onChangeText={setChatInput}
            />
            <TouchableOpacity style={styles.inputActionBtn}>
              <Paperclip color="#8E8E93" size={20} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.inputActionBtn}>
              <Camera color="#8E8E93" size={20} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.chatSendBtn} onPress={handleSendChatMessage}>
            <Send color="#FFFFFF" size={16} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // --- SCREEN 15: Trial Conversion Screen (Phase 8 Task 2) ---
  if (step === 15) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: '#FFFFFF' }]}>
        <View style={styles.lightContent}>
          
          <View style={styles.lightHeader}>
            <TouchableOpacity onPress={() => setStep(14)} style={styles.backButton}>
              <ArrowLeft color="#000000" size={24} />
            </TouchableOpacity>
            <Text style={styles.minibrand}>PRISM PROTECT</Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.conversionScroll}>
            
            {/* Custom Video Player area */}
            <View style={styles.videoPlayerContainer}>
              <View style={styles.videoAvatarHeader}>
                <View style={styles.videoAvatarCircle} />
                <Text style={styles.videoAvatarName}>Aria safety preview</Text>
              </View>
              
              <TouchableOpacity style={styles.videoMuteBtn} onPress={() => setIsVideoMuted(!isVideoMuted)}>
                <Volume2 color={isVideoMuted ? "#8E8E93" : "#FFFFFF"} size={18} />
              </TouchableOpacity>

              {/* Subtitle / Caption bar */}
              <View style={styles.videoCaptionBar}>
                <Text style={styles.videoCaptionText}>{videoCaption}</Text>
              </View>
            </View>

            {/* Price Plan Card */}
            <View style={styles.pricingCard}>
              {/* 90% OFF badge top-right */}
              <View style={styles.badgeDiscount}>
                <Text style={styles.badgeDiscountText}>{PRICING_CONFIG.discountPercentage}</Text>
              </View>

              <Text style={styles.pricingHeadline}>Start {PRICING_CONFIG.trialDays}-day trial for</Text>
              
              <View style={styles.pricingDigitsRow}>
                <Text style={styles.priceTrial}>{PRICING_CONFIG.trialPrice}</Text>
                <Text style={styles.priceOriginal}>{PRICING_CONFIG.originalPrice}</Text>
              </View>

              <View style={styles.pricingCardDivider} />

              <View style={styles.ratingsRow}>
                <View style={styles.ratingSubitem}>
                  <View style={styles.ratingGreenDot} />
                  <Text style={styles.ratingSubLabel}>{PRICING_CONFIG.familyCount}</Text>
                </View>
                <View style={styles.ratingSubitem}>
                  <Star color="#000000" fill="#000000" size={14} />
                  <Text style={styles.ratingSubLabel}>{PRICING_CONFIG.ratingText}</Text>
                </View>
              </View>
            </View>

            {/* Recommended payment section */}
            <View style={styles.paymentSection}>
              <Text style={styles.paymentLabel}>Recommended Payment App</Text>
              
              {/* UPI Option */}
              <TouchableOpacity 
                style={[styles.paymentMethodCard, selectedPayment === 'upi' ? styles.paymentSelected : styles.paymentUnselected]}
                onPress={() => setSelectedPayment('upi')}
              >
                <View style={[styles.paymentIndicatorDot, selectedPayment === 'upi' && styles.indicatorActive]} />
                <View style={styles.paymentTextCol}>
                  <Text style={styles.paymentMethodTitle}>UPI (GPay / PhonePe / Paytm)</Text>
                  <Text style={styles.paymentMethodSub}>Instant setup via your mobile payment apps</Text>
                </View>
              </TouchableOpacity>

              {/* Credit / Debit Card Option */}
              <TouchableOpacity 
                style={[styles.paymentMethodCard, selectedPayment === 'card' ? styles.paymentSelected : styles.paymentUnselected]}
                onPress={() => setSelectedPayment('card')}
              >
                <View style={[styles.paymentIndicatorDot, selectedPayment === 'card' && styles.indicatorActive]} />
                <View style={styles.paymentTextCol}>
                  <Text style={styles.paymentMethodTitle}>Credit or Debit Card</Text>
                  <Text style={styles.paymentMethodSub}>Visa, MasterCard, RuPay accepted</Text>
                </View>
              </TouchableOpacity>
            </View>
          </ScrollView>

          {/* Action Footer */}
          <View style={styles.paymentFooter}>
            <TouchableOpacity 
              style={[styles.blackButton, isLoading && styles.disabledBlackButton]}
              onPress={handleProcessCheckout}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.blackButtonText}>Pay {PRICING_CONFIG.trialPrice}</Text>
              )}
            </TouchableOpacity>
            <Text style={styles.paymentFooterNote}>
              {PRICING_CONFIG.renewalPrice} after trial. Cancel anytime.
            </Text>
          </View>

        </View>
      </SafeAreaView>
    );
  }

  // Fallback indicator
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: '#FFFFFF' }]}>
      <View style={styles.centered}>
        <ActivityIndicator color="#000000" size="large" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Watermark
  watermarkContainer: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 200,
    height: 200,
  },
  watermarkCircle: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#222224',
    opacity: 0.08,
  },
  // Splash Screen Layout
  splashContent: {
    paddingHorizontal: 24,
    paddingTop: 80,
    paddingBottom: 48,
    flexGrow: 1,
    justifyContent: 'space-between',
  },
  brandTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#8E8E93',
    letterSpacing: 2,
    marginBottom: 20,
  },
  splashTitleSection: {
    marginTop: 40,
    marginBottom: 40,
  },
  splashHeadline: {
    fontSize: 32,
    color: '#FFFFFF',
    fontWeight: '300',
    lineHeight: 40,
  },
  splashSubhead: {
    fontSize: 15,
    color: '#8E8E93',
    marginTop: 16,
    lineHeight: 24,
  },
  lockCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0D0D0E',
    borderWidth: 1.5,
    borderColor: '#222224',
    padding: 16,
    borderRadius: 14,
    marginBottom: 40,
  },
  lockIconBox: {
    padding: 8,
    backgroundColor: '#1E1E20',
    borderRadius: 8,
    marginRight: 14,
  },
  lockTextContainer: {
    flex: 1,
  },
  lockTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  lockText: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  pillButton: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
    borderRadius: 30,
    alignItems: 'center',
    marginBottom: 24,
  },
  pillButtonText: {
    color: '#000000',
    fontWeight: '900',
    fontSize: 15,
  },
  splashFooter: {
    fontSize: 11,
    color: '#7F7F84',
    textAlign: 'center',
    lineHeight: 18,
  },
  underline: {
    textDecorationLine: 'underline',
    color: '#FFFFFF',
  },
  // Light Screens Common
  lightContent: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
    justifyContent: 'space-between',
    paddingBottom: 24,
  },
  lightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  backButton: {
    padding: 4,
  },
  minibrand: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '900',
    color: '#000000',
  },
  lightHeadline: {
    fontSize: 24,
    fontWeight: '800',
    color: '#000000',
    marginBottom: 8,
    lineHeight: 32,
  },
  lightSubhead: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 16,
  },
  cardsContainer: {
    flexGrow: 1,
  },
  languageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  cardSelected: {
    borderWidth: 2,
    borderColor: '#000000',
  },
  cardUnselected: {
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  languageTextContainer: {
    marginLeft: 14,
    flex: 1,
  },
  languageTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#000000',
  },
  languageSub: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  inputWrapper: {
    borderWidth: 1.5,
    borderColor: '#E5E5EA',
    borderRadius: 12,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    marginBottom: 24,
  },
  inputWrapperFocused: {
    borderColor: '#000000',
  },
  lightInput: {
    height: 50,
    color: '#000000',
    fontSize: 16,
  },
  bottomNav: {
    marginTop: 'auto',
    width: '100%',
  },
  blackButton: {
    backgroundColor: '#000000',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    width: '100%',
  },
  disabledBlackButton: {
    backgroundColor: '#E5E5EA',
  },
  blackButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
  // Screen 5 Aria UI
  aiHeader: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 30,
  },
  aiHeadline: {
    fontSize: 26,
    color: '#8E8E93',
    fontWeight: '400',
  },
  aiName: {
    color: '#000000',
    fontWeight: '900',
  },
  aiSubhead: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 6,
  },
  aiFlowContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 20,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 16,
    backgroundColor: '#FFFFFF',
  },
  avatarInner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E5E5EA',
  },
  avatarEyeLeft: {
    position: 'absolute',
    top: 30,
    left: 28,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#000000',
  },
  avatarEyeRight: {
    position: 'absolute',
    top: 30,
    right: 28,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#000000',
  },
  chatBubble: {
    backgroundColor: '#F2F2F7',
    borderRadius: 16,
    padding: 14,
    maxWidth: '85%',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  bubbleLeft: {
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 2,
  },
  bubbleRight: {
    alignSelf: 'flex-end',
    borderBottomRightRadius: 2,
  },
  chatText: {
    color: '#000000',
    fontSize: 13,
    lineHeight: 18,
  },
  reassuranceCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 14,
    padding: 16,
    marginVertical: 20,
  },
  reassuranceText: {
    color: '#000000',
    fontSize: 13,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  // Screen 6 Relationship & Gender Styles
  genderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 40,
    gap: 12,
  },
  genderCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
  },
  genderLabel: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 10,
    fontWeight: '600',
  },
  boldText: {
    color: '#000000',
    fontWeight: '800',
  },
  // Screen 7 Date of Birth Scroll-Wheel representation
  pickerWheelContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    height: 180,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 16,
    backgroundColor: '#FAFAFB',
    paddingHorizontal: 12,
  },
  pickerColumn: {
    flex: 1,
    alignItems: 'center',
  },
  wheelArrow: {
    padding: 8,
  },
  arrowChar: {
    fontSize: 18,
    fontWeight: '900',
    color: '#8E8E93',
  },
  wheelSelectionBox: {
    borderWidth: 1.5,
    borderColor: '#000000',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    minWidth: 70,
    alignItems: 'center',
  },
  wheelLabel: {
    fontSize: 18,
    fontWeight: '900',
    color: '#000000',
  },
  accessibilityInputs: {
    marginTop: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 12,
  },
  accessibilityLabel: {
    fontSize: 12,
    color: '#8E8E93',
    marginBottom: 8,
  },
  manualDateRow: {
    flexDirection: 'row',
    gap: 12,
  },
  manualInput: {
    flex: 1,
    height: 40,
    borderWidth: 1.5,
    borderColor: '#E5E5EA',
    borderRadius: 8,
    textAlign: 'center',
    fontSize: 14,
    color: '#000000',
  },
  // Screen 8-9 Slider Styles
  sliderDisplayContainer: {
    alignItems: 'center',
    marginVertical: 30,
  },
  sliderDisplayValue: {
    fontSize: 36,
  },
  sliderNumber: {
    fontWeight: '900',
    color: '#000000',
  },
  sliderTimeColon: {
    fontWeight: '800',
    color: '#000000',
  },
  sliderUnit: {
    color: '#8E8E93',
    fontSize: 20,
    fontWeight: '500',
  },
  ticksContainer: {
    alignItems: 'center',
    marginVertical: 20,
  },
  ticksScroll: {
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  tickWrapper: {
    alignItems: 'center',
    width: 60,
  },
  tickLine: {
    width: 2,
    borderRadius: 1,
  },
  tickLineSelected: {
    height: 36,
    backgroundColor: '#000000',
  },
  tickLineNormal: {
    height: 20,
    backgroundColor: '#E5E5EA',
  },
  tickLabel: {
    fontSize: 11,
    color: '#8E8E93',
    marginTop: 6,
  },
  tickLabelSelected: {
    color: '#000000',
    fontWeight: '800',
  },
  sliderInstruction: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 14,
    textAlign: 'center',
  },
  accessibilityStepper: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 14,
    marginVertical: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 12,
  },
  stepperBtn: {
    backgroundColor: '#FAFAFB',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  stepperBtnText: {
    fontSize: 12,
    color: '#000000',
    fontWeight: '700',
  },
  stepperInput: {
    width: 60,
    height: 36,
    borderWidth: 1.5,
    borderColor: '#E5E5EA',
    borderRadius: 8,
    textAlign: 'center',
    fontSize: 14,
    color: '#000000',
  },
  stepperUnit: {
    fontSize: 13,
    color: '#8E8E93',
  },
  stepperBedtimeDisplay: {
    fontSize: 14,
    fontWeight: '800',
    color: '#000000',
    width: 90,
    textAlign: 'center',
  },
  // Reusable Confirmation Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 300,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingTop: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  modalHeadline: {
    fontSize: 18,
    fontWeight: '900',
    color: '#000000',
    marginBottom: 8,
    textAlign: 'center',
  },
  modalBody: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    paddingHorizontal: 16,
    lineHeight: 20,
    marginBottom: 20,
  },
  modalDivider: {
    height: 1,
    backgroundColor: '#E5E5EA',
    width: '100%',
  },
  modalActionRow: {
    flexDirection: 'row',
    width: '100%',
    height: 50,
  },
  modalActionCancel: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalActionConfirm: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalActionDivider: {
    width: 1,
    backgroundColor: '#E5E5EA',
    height: '100%',
  },
  modalCancelText: {
    color: '#8E8E93',
    fontSize: 14,
    fontWeight: '600',
  },
  modalConfirmText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '900',
  },
  // Concern Selection Grid Styles
  concernGridContainer: {
    paddingVertical: 12,
  },
  gridRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  concernCard: {
    width: '48%',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    position: 'relative',
  },
  concernCardSelected: {
    borderColor: '#000000',
    backgroundColor: '#E5E5EA', 
  },
  concernCardUnselected: {
    borderColor: '#E5E5EA',
    backgroundColor: '#FFFFFF',
  },
  checkmarkBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  concernIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  iconBoxSelected: {
    backgroundColor: '#FFFFFF',
  },
  iconBoxUnselected: {
    backgroundColor: '#FAFAFB',
  },
  concernLabel: {
    fontSize: 12,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 16,
    fontWeight: '600',
  },
  // Personalized Trust Screen Styles
  trustScroll: {
    flexGrow: 1,
    backgroundColor: '#FFFFFF',
  },
  trustBannerGraphic: {
    height: 160,
    backgroundColor: '#0A0A0A',
    position: 'relative',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bannerPrismShape: {
    width: 80,
    height: 80,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    opacity: 0.15,
    transform: [{ rotate: '45deg' }],
  },
  bannerCircleShape: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    opacity: 0.08,
  },
  bannerGridLines: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  trustCardOverlay: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: '#FFFFFF',
    marginTop: -20,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 48,
    flex: 1,
  },
  trustHeadline: {
    fontSize: 22,
    fontWeight: '900',
    color: '#000000',
    textAlign: 'center',
    lineHeight: 28,
  },
  concernPillContainer: {
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 20,
  },
  concernPill: {
    backgroundColor: '#FAFAFB',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  concernPillText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '700',
  },
  trustDivider: {
    height: 1,
    backgroundColor: '#E5E5EA',
    marginVertical: 12,
  },
  trustBody: {
    fontSize: 14,
    color: '#8E8E93',
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 28,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 36,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FAFAFB',
    borderWidth: 1.2,
    borderColor: '#E5E5EA',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 18,
    fontWeight: '900',
    color: '#000000',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 11,
    color: '#8E8E93',
    marginTop: 2,
    textAlign: 'center',
  },
  // Screen 12: Consent & Toggles List Styles
  togglesList: {
    marginVertical: 16,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  toggleTextContainer: {
    flex: 1,
    marginRight: 16,
  },
  toggleTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#000000',
  },
  toggleSub: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 4,
    lineHeight: 16,
  },
  neverCollectContainer: {
    marginTop: 20,
    backgroundColor: '#FAFAFB',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 12,
    overflow: 'hidden',
  },
  neverCollectHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
  },
  neverCollectTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#000000',
  },
  neverCollectContent: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 8,
  },
  neverCollectItem: {
    fontSize: 12,
    color: '#8E8E93',
  },
  consentFooterNote: {
    fontSize: 11,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 20,
    paddingHorizontal: 16,
  },
  // Screen 13: Journey Roadmap Screen Styles
  roadmapScroll: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  timelineContainer: {
    marginVertical: 24,
    paddingLeft: 10,
    position: 'relative',
  },
  timelineLine: {
    position: 'absolute',
    top: 10,
    left: 21,
    bottom: 40,
    width: 2,
    backgroundColor: '#E5E5EA',
  },
  timelineNodeRow: {
    flexDirection: 'row',
    marginBottom: 28,
  },
  nodeIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    marginRight: 16,
  },
  nodeChecked: {
    backgroundColor: '#000000',
  },
  nodeActive: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#000000',
  },
  nodeInactive: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E5E5EA',
  },
  nodeTextContainer: {
    flex: 1,
  },
  nodeTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#000000',
  },
  nodeSub: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 4,
    lineHeight: 16,
  },
  inactiveText: {
    color: '#8E8E93',
  },
  highlightedCard: {
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 14,
    padding: 16,
    backgroundColor: '#FFFFFF',
  },
  cardHeaderTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#000000',
  },
  cardHeaderSub: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 4,
    lineHeight: 16,
  },
  cardFeaturesList: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  featureLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#000000',
  },
  roadmapGraphic: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginVertical: 20,
    height: 40,
    position: 'relative',
  },
  graphicBlock: {
    width: 60,
    height: 6,
    backgroundColor: '#000000',
    borderRadius: 3,
  },
  graphicCircle: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#000000',
    backgroundColor: '#FFFFFF',
  },
  // Screen 14: Chat Screen Styles
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    backgroundColor: '#FFFFFF',
  },
  headerBtn: {
    padding: 6,
  },
  headerAvatarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginLeft: 10,
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  ariaTinyInner: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#E5E5EA',
  },
  headerTitleContainer: {
    marginLeft: 10,
  },
  chatHeaderName: {
    fontSize: 14,
    fontWeight: '900',
    color: '#000000',
  },
  chatHeaderStatus: {
    fontSize: 11,
    color: '#8E8E93',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  myPlanPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FAFAFB',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  myPlanText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000000',
  },
  chatArea: {
    flex: 1,
    backgroundColor: '#F2F2F7',
    position: 'relative',
  },
  chatWatermarkOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-around',
    paddingVertical: 100,
    zIndex: 1,
  },
  watermarkGridRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
  chatMessagesList: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    zIndex: 10,
  },
  datePillContainer: {
    alignItems: 'center',
    marginVertical: 12,
  },
  datePill: {
    backgroundColor: '#E5E5EA',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  datePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8E8E93',
  },
  msgRow: {
    flexDirection: 'row',
    marginVertical: 6,
    width: '100%',
  },
  msgRowLeft: {
    justifyContent: 'flex-start',
  },
  msgRowRight: {
    justifyContent: 'flex-end',
  },
  msgBubble: {
    padding: 12,
    borderRadius: 16,
    maxWidth: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 1,
    elevation: 1,
  },
  msgBubbleLeft: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 2,
  },
  msgBubbleRight: {
    backgroundColor: '#000000',
    borderBottomRightRadius: 2,
  },
  msgText: {
    fontSize: 13,
    lineHeight: 18,
    color: '#000000',
  },
  msgBubbleRightText: {
    color: '#FFFFFF',
  },
  msgTime: {
    fontSize: 10,
    color: '#8E8E93',
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  chatInputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
    backgroundColor: '#FFFFFF',
    gap: 8,
  },
  chatInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    backgroundColor: '#FAFAFB',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 24,
    paddingHorizontal: 12,
    height: 40,
  },
  inputActionBtn: {
    padding: 4,
  },
  chatTextInputField: {
    flex: 1,
    color: '#000000',
    fontSize: 14,
    paddingHorizontal: 8,
    height: '100%',
  },
  chatSendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Screen 15: Trial Conversion Screen Styles
  conversionScroll: {
    paddingBottom: 24,
  },
  videoPlayerContainer: {
    height: 180,
    backgroundColor: '#000000',
    borderRadius: 16,
    position: 'relative',
    marginVertical: 16,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  videoAvatarHeader: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  videoAvatarCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#222224',
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  videoAvatarName: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  videoMuteBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    padding: 6,
  },
  videoCaptionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  videoCaptionText: {
    color: '#FFFFFF',
    fontSize: 12,
    textAlign: 'center',
  },
  pricingCard: {
    backgroundColor: '#FAFAFB',
    borderWidth: 1.5,
    borderColor: '#E5E5EA',
    borderRadius: 16,
    padding: 20,
    position: 'relative',
    marginBottom: 24,
  },
  badgeDiscount: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: '#000000',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeDiscountText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
  pricingHeadline: {
    fontSize: 15,
    color: '#8E8E93',
    fontWeight: '700',
  },
  pricingDigitsRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
    marginVertical: 12,
  },
  priceTrial: {
    fontSize: 36,
    fontWeight: '900',
    color: '#000000',
  },
  priceOriginal: {
    fontSize: 18,
    color: '#8E8E93',
    textDecorationLine: 'line-through',
  },
  pricingCardDivider: {
    height: 1,
    backgroundColor: '#E5E5EA',
    marginVertical: 14,
  },
  ratingsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  ratingSubitem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ratingGreenDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#000000', // monochrome dot instead of green
  },
  ratingSubLabel: {
    fontSize: 12,
    color: '#8E8E93',
    fontWeight: '700',
  },
  paymentSection: {
    marginBottom: 20,
  },
  paymentLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#000000',
    marginBottom: 12,
  },
  paymentMethodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1.5,
  },
  paymentSelected: {
    borderColor: '#000000',
    backgroundColor: '#FAFAFB',
  },
  paymentUnselected: {
    borderColor: '#E5E5EA',
    backgroundColor: '#FFFFFF',
  },
  paymentIndicatorDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: '#8E8E93',
    marginRight: 14,
  },
  indicatorActive: {
    borderColor: '#000000',
    backgroundColor: '#000000',
  },
  paymentTextCol: {
    flex: 1,
  },
  paymentMethodTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#000000',
  },
  paymentMethodSub: {
    fontSize: 11,
    color: '#8E8E93',
    marginTop: 2,
  },
  paymentFooter: {
    marginTop: 'auto',
    alignItems: 'center',
    width: '100%',
  },
  paymentFooterNote: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 8,
    textAlign: 'center',
  },
});
