import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, FlatList, ActivityIndicator } from 'react-native';
import { useCompanionChat } from '../hooks/useCompanionChat';

export default function CompanionScreen({ onBackToDashboard }: { onBackToDashboard: () => void }) {
  const [inputText, setInputText] = useState('');
  const {
    personas,
    selectedPersona,
    messages,
    loading,
    loadingSession,
    handleSelectPersona,
    sendMessage
  } = useCompanionChat();

  const handleSendMessage = () => {
    sendMessage(inputText);
    setInputText('');
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
