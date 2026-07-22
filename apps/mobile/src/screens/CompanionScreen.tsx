import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, FlatList, ActivityIndicator } from 'react-native';
import { ApiClient } from '../services/api';

interface Persona {
  id: string;
  display_name: string;
  description: string;
  system_prompt?: string;
}

interface Message {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: Date;
}

export default function CompanionScreen({ onBackToDashboard }: { onBackToDashboard: () => void }) {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingSession, setLoadingSession] = useState(false);

  // 1. Fetch available personas on mount
  useEffect(() => {
    async function fetchPersonas() {
      try {
        const data = await ApiClient.request('/companion/personas');
        setPersonas(data);
        if (data.length > 0) {
          // Default to Direct Coach or Listener
          handleSelectPersona(data[0]);
        }
      } catch (err) {
        console.warn('Error fetching personas:', err);
      }
    }
    fetchPersonas();
  }, []);

  // 2. Select/Switch persona and start session
  const handleSelectPersona = async (persona: Persona) => {
    setSelectedPersona(persona);
    setLoadingSession(true);
    setMessages([]);
    try {
      // Start session on backend (Consent for companion_chat must be seeded in dev/test)
      const sessionData = await ApiClient.request('/companion/sessions', {
        method: 'POST',
        body: JSON.stringify({ persona_id: persona.id })
      });
      setSessionId(sessionData.session_id);
      
      // Seed initial AI greeting
      setMessages([
        {
          id: 'initial',
          sender: 'ai',
          text: sessionData.initial_message,
          timestamp: new Date()
        }
      ]);
    } catch (err) {
      console.warn('Error starting companion session:', err);
      // Fallback greeting if consent is not granted or backend is offline
      setMessages([
        {
          id: 'error-fallback',
          sender: 'ai',
          text: `[Offline/No Consent] Hello! I'm your ${persona.display_name}. (${persona.description}) I'm an AI companion, not a licensed therapist or doctor. How can I help you today?`,
          timestamp: new Date()
        }
      ]);
    } finally {
      setLoadingSession(false);
    }
  };

  // 3. Send message
  const handleSendMessage = async () => {
    if (!inputText.trim() || !selectedPersona) return;
    
    const userMsgText = inputText.trim();
    setInputText('');
    
    // Add user message locally
    const userMsg: Message = {
      id: Math.random().toString(),
      sender: 'user',
      text: userMsgText,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMsg]);
    
    setLoading(true);

    try {
      if (sessionId) {
        const reply = await ApiClient.request(`/companion/sessions/${sessionId}/message`, {
          method: 'POST',
          body: JSON.stringify({ message: userMsgText })
        });
        
        setMessages(prev => [...prev, {
          id: Math.random().toString(),
          sender: 'ai',
          text: reply.response,
          timestamp: new Date()
        }]);
      } else {
        // Mock fallback if offline/no backend session was created
        setTimeout(() => {
          setMessages(prev => [...prev, {
            id: Math.random().toString(),
            sender: 'ai',
            text: `[Offline Mock] As your AI companion (not a therapist or doctor), I hear you. You said: "${userMsgText}".`,
            timestamp: new Date()
          }]);
          setLoading(false);
        }, 1000);
        return;
      }
    } catch (err) {
      console.warn('Error sending message:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Persistent safety disclosure banner */}
      <View style={styles.disclosureBanner}>
        <Text style={styles.disclosureText}>
          ⚠️ I'm an AI companion, not a licensed therapist or doctor.
        </Text>
      </View>

      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBackToDashboard}>
          <Text style={styles.backButtonText}>← Dashboard</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>AI Companion</Text>
        <TouchableOpacity 
          style={styles.voiceCallButton} 
          onPress={() => alert("Voice Call Channel: Coming Soon (Phase 2)")}
        >
          <Text style={styles.voiceCallText}>📞 Call (Soon)</Text>
        </TouchableOpacity>
      </View>

      {/* Persona Switcher Tabs */}
      <View style={styles.tabsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
          {personas.map((p) => {
            const isSelected = selectedPersona?.id === p.id;
            return (
              <TouchableOpacity 
                key={p.id} 
                style={[styles.tab, isSelected && styles.activeTab]}
                onPress={() => handleSelectPersona(p)}
              >
                <Text style={[styles.tabText, isSelected && styles.activeTabText]}>
                  {p.display_name.replace("The ", "")}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Chat Space */}
      {loadingSession ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#BB86FC" />
          <Text style={styles.loadingText}>Initializing session...</Text>
        </View>
      ) : (
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={[styles.messageBubble, item.sender === 'user' ? styles.userBubble : styles.aiBubble]}>
              <Text style={styles.messageText}>{item.text}</Text>
            </View>
          )}
          contentContainerStyle={styles.messageList}
        />
      )}

      {/* Input Tray */}
      <View style={styles.inputTray}>
        <TextInput
          style={styles.input}
          placeholder="Type a message..."
          placeholderTextColor="#666"
          value={inputText}
          onChangeText={setInputText}
          editable={!loading && !loadingSession}
        />
        <TouchableOpacity 
          style={[styles.sendButton, (!inputText.trim() || loading || loadingSession) && styles.disabledSend]}
          onPress={handleSendMessage}
          disabled={!inputText.trim() || loading || loadingSession}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <Text style={styles.sendButtonText}>Send</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  disclosureBanner: {
    backgroundColor: '#3E2723',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#FFB300',
    alignItems: 'center',
  },
  disclosureText: {
    color: '#FFB300',
    fontSize: 11,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    backgroundColor: '#121212',
  },
  backButton: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: '#222',
    borderRadius: 5,
  },
  backButtonText: {
    color: '#FFF',
    fontSize: 12,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  voiceCallButton: {
    paddingVertical: 5,
    paddingHorizontal: 8,
    backgroundColor: '#333',
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#444',
  },
  voiceCallText: {
    color: '#FFB300',
    fontSize: 10,
    fontWeight: 'bold',
  },
  tabsContainer: {
    backgroundColor: '#121212',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  tabsScroll: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#222',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  activeTab: {
    backgroundColor: '#BB86FC',
    borderColor: '#BB86FC',
  },
  tabText: {
    color: '#AAA',
    fontSize: 13,
  },
  activeTabText: {
    color: '#000',
    fontWeight: 'bold',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#888',
    marginTop: 10,
  },
  messageList: {
    padding: 15,
  },
  messageBubble: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
    maxWidth: '80%',
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#3700B3',
  },
  aiBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#1E1E1E',
  },
  messageText: {
    color: '#FFF',
    fontSize: 14,
    lineHeight: 20,
  },
  inputTray: {
    flexDirection: 'row',
    padding: 10,
    backgroundColor: '#121212',
    borderTopWidth: 1,
    borderTopColor: '#222',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    height: 40,
    backgroundColor: '#1E1E1E',
    borderRadius: 20,
    paddingHorizontal: 15,
    color: '#FFF',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#333',
    marginRight: 10,
  },
  sendButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#BB86FC',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabledSend: {
    backgroundColor: '#555',
  },
  sendButtonText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 14,
  }
});
