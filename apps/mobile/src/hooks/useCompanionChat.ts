import { useState, useEffect } from 'react';
import { ApiClient } from '../services/api';

export interface Persona {
  id: string;
  display_name: string;
  description: string;
  system_prompt?: string;
}

export interface Message {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: Date;
}

export function useCompanionChat() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingSession, setLoadingSession] = useState(false);

  useEffect(() => {
    async function fetchPersonas() {
      try {
        const data = await ApiClient.request('/companion/personas');
        setPersonas(data);
        if (data.length > 0) {
          handleSelectPersona(data[0]);
        }
      } catch (err) {
        console.warn('Error fetching personas:', err);
      }
    }
    fetchPersonas();
  }, []);

  const handleSelectPersona = async (persona: Persona) => {
    setSelectedPersona(persona);
    setLoadingSession(true);
    setMessages([]);
    try {
      const sessionData = await ApiClient.request('/companion/sessions', {
        method: 'POST',
        body: JSON.stringify({ persona_id: persona.id })
      });
      setSessionId(sessionData.session_id);
      
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

  const sendMessage = async (inputText: string) => {
    if (!inputText.trim() || !selectedPersona) return;
    
    const userMsgText = inputText.trim();
    
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
      setMessages(prev => [...prev, {
        id: Math.random().toString(),
        sender: 'ai',
        text: '⚠️ Sorry, I had trouble connecting to the server. Please try sending your message again.',
        timestamp: new Date()
      }]);
    } finally {
      setLoading(false);
    }
  };

  return {
    personas,
    selectedPersona,
    messages,
    loading,
    loadingSession,
    handleSelectPersona,
    sendMessage
  };
}
