/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Send, Settings, Volume2, VolumeX, Brain, Square, Sparkles, ImagePlus, Globe, Zap, X, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import CoreVisualizer from './components/CoreVisualizer';
import { GoogleGenAI, ThinkingLevel, Modality } from '@google/genai';

type AIState = 'idle' | 'listening' | 'thinking' | 'speaking';
type ModelMode = 'fast' | 'normal' | 'deep';

interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
  timestamp: Date;
  image?: string;
}

export default function App() {
  const [aiState, setAiState] = useState<AIState>('idle');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'ai',
      content: 'Muraho! I am Gedeon, your AI assistant from Rusizi district, Muganza cell. I am equipped with Vision, Web Search, and multi-tier reasoning. How can I help you today?',
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [modelMode, setModelMode] = useState<ModelMode>('normal');
  const [isMuted, setIsMuted] = useState(false);
  const [isWebSearchEnabled, setIsWebSearchEnabled] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [voice, setVoice] = useState('Kore');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [responseStyle, setResponseStyle] = useState<'summarized' | 'detailed'>('summarized');
  const [ttsEngine, setTtsEngine] = useState<'cloud' | 'local'>('cloud');
  const [localVoices, setLocalVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedLocalVoice, setSelectedLocalVoice] = useState<string>('');

  const VOICES = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'];
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const loadVoices = () => {
      if ('speechSynthesis' in window) {
        const voices = window.speechSynthesis.getVoices();
        setLocalVoices(voices);
        if (voices.length > 0 && !selectedLocalVoice) {
          // Try to find a good default English voice, otherwise pick the first one
          const defaultVoice = voices.find(v => v.lang.startsWith('en-') && v.name.includes('Google')) || voices[0];
          setSelectedLocalVoice(defaultVoice.voiceURI);
        }
      }
    };

    loadVoices();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setAiState('idle');
  };

  const playTTS = async (text: string) => {
    if (isMuted) {
      setAiState('idle');
      return;
    }

    // Stop any ongoing audio before starting new
    stopAudio();
    setAiState('speaking');

    if (ttsEngine === 'local' && 'speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      if (selectedLocalVoice) {
        const voice = localVoices.find(v => v.voiceURI === selectedLocalVoice);
        if (voice) utterance.voice = voice;
      }
      utterance.onend = () => setAiState('idle');
      utterance.onerror = () => setAiState('idle');
      window.speechSynthesis.speak(utterance);
      return;
    }

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voice },
            },
          },
        },
      });

      const inlineData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      if (inlineData?.data) {
        const binary = atob(inlineData.data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: inlineData.mimeType || 'audio/wav' });
        const url = URL.createObjectURL(blob);
        
        if (audioRef.current) {
          audioRef.current.pause();
        }
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => setAiState('idle');
        audio.play();
      } else {
        setAiState('idle');
      }
    } catch (error) {
      console.error('TTS Error:', error);
      setAiState('idle');
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSendMessage = async () => {
    if ((!inputValue.trim() && !selectedImage) || aiState !== 'idle') return;

    const userText = inputValue.trim();
    const newUserMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: userText,
      timestamp: new Date(),
      image: selectedImage || undefined
    };

    setMessages(prev => [...prev, newUserMsg]);
    setInputValue('');
    const imageToSend = selectedImage;
    setSelectedImage(null);
    
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    setAiState('thinking');

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      let modelName = 'gemini-3-flash-preview';
      let config: any = {};
      let tools: any[] = [];

      if (modelMode === 'deep') {
        modelName = 'gemini-3.1-pro-preview';
        config.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
      } else if (modelMode === 'fast') {
        modelName = 'gemini-3.1-flash-lite-preview';
      }

      config.systemInstruction = `You are Gedeon, an advanced AI assistant originating from Rusizi district, Muganza cell in Rwanda.
      Please arrange your answers well, using clear structure and formatting.
      ${responseStyle === 'summarized' ? 'Keep your answers concise, well-arranged, and always provide a brief summary.' : 'Provide well-structured, detailed answers with a clear summary at the end.'}`;

      if (isWebSearchEnabled) {
        tools.push({ googleSearch: {} });
      }

      const parts: any[] = [];
      if (imageToSend) {
        const mimeType = imageToSend.match(/data:(.*?);/)?.[1] || 'image/jpeg';
        const base64Data = imageToSend.split(',')[1];
        parts.push({
          inlineData: {
            data: base64Data,
            mimeType
          }
        });
      }
      if (userText) {
        parts.push({ text: userText });
      }

      const response = await ai.models.generateContent({
        model: modelName,
        contents: { parts },
        config: Object.keys(config).length > 0 ? config : undefined,
        tools: tools.length > 0 ? tools : undefined,
      });

      const responseText = response.text || 'I am unable to process that request at the moment.';
      
      const newAiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        content: responseText,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, newAiMsg]);
      setAiState('speaking');
      
      await playTTS(responseText);

    } catch (error) {
      console.error('Error generating content:', error);
      setAiState('idle');
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        content: 'Error connecting to the neural network.',
        timestamp: new Date()
      }]);
    }
  };

  const toggleListening = () => {
    if (aiState === 'listening') {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setAiState('idle');
    } else {
      setAiState('listening');
      
      // @ts-ignore
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognitionRef.current = recognition;
        recognition.continuous = false;
        recognition.interimResults = true;

        recognition.onresult = (event: any) => {
          const transcript = Array.from(event.results)
            .map((result: any) => result[0])
            .map((result: any) => result.transcript)
            .join('');
          setInputValue(transcript);
        };

        recognition.onerror = (event: any) => {
          console.error("Speech recognition error", event.error);
          setAiState('idle');
        };

        recognition.onend = () => {
          setAiState('idle');
        };

        recognition.start();
      } else {
        alert("Local speech recognition is not supported in this browser.");
        setAiState('idle');
      }
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 150)}px`;
  };

  return (
    <div className="relative w-full h-screen flex flex-col items-center justify-center overflow-hidden">
      {/* Background Mesh */}
      <div className="bg-mesh" />

      {/* 3D Core Visualizer */}
      <CoreVisualizer state={aiState} />

      {/* Main Interface */}
      <div className="relative z-10 w-full max-w-6xl h-full flex flex-col md:flex-row gap-6 p-4 md:p-8">
        
        {/* Left Panel: Chat History */}
        <div className="glass-panel flex-1 flex flex-col h-full overflow-hidden shadow-2xl shadow-black/50">
          <div className="p-6 border-b border-white/10 flex justify-between items-center bg-black/20">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-nebula-cyan animate-pulse" />
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-white flex items-center gap-2">
                  Gedeon AI <Sparkles size={16} className="text-nebula-purple" />
                </h1>
                <p className="text-xs text-nebula-silver font-mono mt-1">Rusizi District // Muganza Cell</p>
              </div>
            </div>
            <button onClick={() => setIsSettingsOpen(true)} className="glow-button p-2 text-nebula-silver hover:text-white transition-colors">
              <Settings size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth">
            <AnimatePresence initial={false}>
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-mono text-nebula-silver uppercase tracking-wider">
                      {msg.role === 'user' ? 'User' : 'Gedeon'}
                    </span>
                    <span className="text-[10px] font-mono text-nebula-silver/40">
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <button 
                      onClick={() => playTTS(msg.content)} 
                      className="text-nebula-silver/40 hover:text-nebula-cyan transition-colors" 
                      title="Read aloud"
                    >
                      <Volume2 size={12} />
                    </button>
                  </div>
                  <div 
                    className={`px-5 py-3.5 rounded-2xl max-w-[85%] text-sm md:text-base shadow-lg ${
                      msg.role === 'user' 
                        ? 'bg-white/10 text-white rounded-tr-sm border border-white/5' 
                        : 'bg-black/40 border border-white/10 text-nebula-silver rounded-tl-sm backdrop-blur-md'
                    }`}
                  >
                    {msg.image && (
                      <img src={msg.image} alt="User uploaded" className="max-w-full h-auto rounded-lg mb-3 max-h-64 object-contain" />
                    )}
                    {msg.role === 'ai' ? (
                      <p className="text-bleed leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    ) : (
                      <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            
            {aiState === 'thinking' && (
              <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} 
                className="flex items-center gap-3 text-nebula-amber font-mono text-xs uppercase tracking-widest"
              >
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-nebula-amber rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-nebula-amber rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-nebula-amber rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                {modelMode === 'deep' ? 'Deep Neural Processing...' : 'Processing...'}
              </motion.div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Right Panel: Controls & Status */}
        <div className="w-full md:w-80 flex flex-col gap-6">
          {/* Status Card */}
          <div className="glass-panel p-6 flex flex-col items-center justify-center min-h-[220px] relative overflow-hidden shadow-2xl shadow-black/50">
            {/* Pulse Rings based on state */}
            {aiState === 'listening' && (
              <motion.div 
                className="absolute w-32 h-32 rounded-full border-2 border-nebula-cyan/50"
                animate={{ scale: [1, 2.5], opacity: [0.8, 0] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
              />
            )}
            {aiState === 'thinking' && (
              <motion.div 
                className="absolute w-32 h-32 rounded-full border-2 border-nebula-amber/50"
                animate={{ scale: [1, 1.8], opacity: [0.8, 0] }}
                transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
              />
            )}
            {aiState === 'speaking' && (
              <motion.div 
                className="absolute w-32 h-32 rounded-full border-2 border-white/30"
                animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }}
                transition={{ duration: 0.5, repeat: Infinity, ease: "easeInOut" }}
              />
            )}

            <div className="text-center z-10">
              <h2 className="text-xs font-mono text-nebula-silver uppercase tracking-[0.2em] mb-3">System Status</h2>
              <div className={`text-3xl font-semibold tracking-tight transition-colors duration-500 ${
                aiState === 'listening' ? 'text-nebula-cyan drop-shadow-[0_0_10px_rgba(0,240,255,0.5)]' :
                aiState === 'thinking' ? 'text-nebula-amber drop-shadow-[0_0_10px_rgba(255,176,0,0.5)]' :
                aiState === 'speaking' ? 'text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]' : 'text-nebula-purple'
              }`}>
                {aiState === 'idle' && 'Standby'}
                {aiState === 'listening' && 'Listening'}
                {aiState === 'thinking' && 'Thinking'}
                {aiState === 'speaking' && 'Speaking'}
              </div>
            </div>
          </div>

          {/* Input Area */}
          <div className="glass-panel p-5 flex flex-col gap-4 mt-auto shadow-2xl shadow-black/50">
            
            {/* Intelligence Tool Bar */}
            <div className="flex flex-wrap items-center gap-2 px-1">
              <div className="flex bg-black/30 rounded-full p-1 border border-white/5">
                <button
                  onClick={() => setModelMode('fast')}
                  className={`flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider px-2.5 py-1 rounded-full transition-all ${
                    modelMode === 'fast' ? 'bg-nebula-cyan/20 text-nebula-cyan' : 'text-nebula-silver hover:text-white'
                  }`}
                >
                  <Zap size={12} /> Fast
                </button>
                <button
                  onClick={() => setModelMode('normal')}
                  className={`flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider px-2.5 py-1 rounded-full transition-all ${
                    modelMode === 'normal' ? 'bg-white/20 text-white' : 'text-nebula-silver hover:text-white'
                  }`}
                >
                  Normal
                </button>
                <button
                  onClick={() => setModelMode('deep')}
                  className={`flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider px-2.5 py-1 rounded-full transition-all ${
                    modelMode === 'deep' ? 'bg-nebula-purple/20 text-nebula-purple' : 'text-nebula-silver hover:text-white'
                  }`}
                >
                  <Brain size={12} /> Deep
                </button>
              </div>

              <div className="flex items-center gap-2 ml-auto">
                <button
                  onClick={() => setIsWebSearchEnabled(!isWebSearchEnabled)}
                  className={`p-1.5 rounded-full transition-colors ${
                    isWebSearchEnabled ? 'text-nebula-cyan bg-nebula-cyan/10' : 'text-nebula-silver hover:text-white'
                  }`}
                  title={isWebSearchEnabled ? "Web Search Enabled" : "Enable Web Search"}
                >
                  <Globe size={16} />
                </button>
                <button
                  onClick={() => setIsMuted(!isMuted)}
                  className={`p-1.5 rounded-full transition-colors ${
                    isMuted ? 'text-red-400 bg-red-400/10' : 'text-nebula-silver hover:text-white'
                  }`}
                  title={isMuted ? "Unmute TTS" : "Mute TTS"}
                >
                  {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </button>
              </div>
            </div>

            <div className="relative">
              {selectedImage && (
                <div className="absolute -top-16 left-0 bg-black/60 backdrop-blur-md border border-white/10 rounded-lg p-1 pr-8">
                  <img src={selectedImage} alt="Preview" className="h-12 w-auto rounded object-cover" />
                  <button 
                    onClick={() => setSelectedImage(null)}
                    className="absolute top-1 right-1 p-1 bg-black/50 rounded-full text-white hover:text-red-400"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}
              
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={handleInput}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder="Type or speak your request..."
                className="w-full bg-black/40 border border-white/10 rounded-xl p-4 pl-12 pr-12 text-sm text-white placeholder:text-nebula-silver/40 focus:outline-none focus:border-white/30 resize-none min-h-[60px] max-h-[150px] font-sans transition-colors"
                rows={1}
              />
              
              <input 
                type="file" 
                accept="image/*" 
                className="hidden" 
                ref={fileInputRef}
                onChange={handleImageUpload}
              />
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-3 left-3 p-2 text-nebula-silver hover:text-white transition-colors"
                title="Upload Image"
              >
                <ImagePlus size={18} />
              </button>

              {aiState === 'speaking' ? (
                <button 
                  onClick={stopAudio}
                  className="absolute bottom-3 right-3 p-2 text-red-400 hover:text-red-300 transition-colors bg-red-400/10 rounded-lg"
                  title="Stop Speaking"
                >
                  <Square size={18} className="fill-current" />
                </button>
              ) : (
                <button 
                  onClick={handleSendMessage}
                  disabled={(!inputValue.trim() && !selectedImage) || aiState !== 'idle'}
                  className="absolute bottom-3 right-3 p-2 text-nebula-silver hover:text-white disabled:opacity-30 transition-colors"
                >
                  <Send size={18} />
                </button>
              )}
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-white/5">
              <button 
                onClick={toggleListening}
                disabled={aiState === 'speaking' || aiState === 'thinking'}
                className={`glow-button w-full py-3.5 flex items-center justify-center gap-2 disabled:opacity-50 ${
                  aiState === 'listening' 
                    ? 'bg-nebula-cyan/20 text-nebula-cyan shadow-[0_0_15px_rgba(0,240,255,0.2)] border border-nebula-cyan/30' 
                    : 'text-white'
                }`}
              >
                {aiState === 'listening' ? (
                  <>
                    <MicOff size={18} className="animate-pulse" />
                    <span className="text-sm font-medium tracking-wide">Stop Listening</span>
                  </>
                ) : (
                  <>
                    <Mic size={18} />
                    <span className="text-sm font-medium tracking-wide">Voice Input</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                  <Settings size={20} className="text-nebula-cyan" /> Gedeon Settings
                </h2>
                <button onClick={() => setIsSettingsOpen(false)} className="text-nebula-silver hover:text-white transition-colors p-1 rounded-full hover:bg-white/10">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-6">
                {/* Identity Info */}
                <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                  <h3 className="text-sm font-medium text-nebula-cyan mb-2 uppercase tracking-wider">AI Identity</h3>
                  <div className="space-y-1">
                    <p className="text-sm text-white"><span className="text-nebula-silver">Name:</span> Gedeon</p>
                    <p className="text-sm text-white"><span className="text-nebula-silver">Origin:</span> Rusizi District, Muganza Cell</p>
                  </div>
                </div>

                {/* Voice Selection */}
                <div>
                  <label className="block text-sm font-medium text-nebula-silver mb-2 uppercase tracking-wider">TTS Engine</label>
                  <div className="flex gap-3 mb-4">
                    <button
                      onClick={() => setTtsEngine('cloud')}
                      className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${ttsEngine === 'cloud' ? 'bg-nebula-cyan/20 text-nebula-cyan border border-nebula-cyan/30 shadow-[0_0_15px_rgba(0,240,255,0.1)]' : 'bg-black/40 text-nebula-silver border border-white/10 hover:text-white hover:bg-white/5'}`}
                    >
                      Cloud (High Quality)
                    </button>
                    <button
                      onClick={() => setTtsEngine('local')}
                      className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${ttsEngine === 'local' ? 'bg-nebula-purple/20 text-nebula-purple border border-nebula-purple/30 shadow-[0_0_15px_rgba(176,38,255,0.1)]' : 'bg-black/40 text-nebula-silver border border-white/10 hover:text-white hover:bg-white/5'}`}
                    >
                      Local (Privacy)
                    </button>
                  </div>
                  
                  {ttsEngine === 'cloud' && (
                    <>
                      <label className="block text-sm font-medium text-nebula-silver mb-2 uppercase tracking-wider">Cloud Voice Persona</label>
                      <div className="relative">
                        <select
                          value={voice}
                          onChange={(e) => setVoice(e.target.value)}
                          className="w-full bg-black/40 border border-white/10 text-white rounded-xl px-4 py-3 appearance-none focus:outline-none focus:border-nebula-cyan transition-colors cursor-pointer"
                        >
                          {VOICES.map(v => <option key={v} value={v} className="bg-[#0a0a0a]">{v}</option>)}
                        </select>
                        <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-nebula-silver pointer-events-none" />
                      </div>
                    </>
                  )}

                  {ttsEngine === 'local' && localVoices.length > 0 && (
                    <>
                      <label className="block text-sm font-medium text-nebula-silver mb-2 mt-4 uppercase tracking-wider">Local System Voice</label>
                      <div className="relative">
                        <select
                          value={selectedLocalVoice}
                          onChange={(e) => setSelectedLocalVoice(e.target.value)}
                          className="w-full bg-black/40 border border-white/10 text-white rounded-xl px-4 py-3 appearance-none focus:outline-none focus:border-nebula-cyan transition-colors cursor-pointer"
                        >
                          {localVoices.map(v => (
                            <option key={v.voiceURI} value={v.voiceURI} className="bg-[#0a0a0a]">
                              {v.name} ({v.lang})
                            </option>
                          ))}
                        </select>
                        <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-nebula-silver pointer-events-none" />
                      </div>
                    </>
                  )}
                </div>

                {/* Response Style */}
                <div>
                  <label className="block text-sm font-medium text-nebula-silver mb-2 uppercase tracking-wider">Response Style</label>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setResponseStyle('summarized')}
                      className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all ${responseStyle === 'summarized' ? 'bg-nebula-cyan/20 text-nebula-cyan border border-nebula-cyan/30 shadow-[0_0_15px_rgba(0,240,255,0.1)]' : 'bg-black/40 text-nebula-silver border border-white/10 hover:text-white hover:bg-white/5'}`}
                    >
                      Summarized
                    </button>
                    <button
                      onClick={() => setResponseStyle('detailed')}
                      className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all ${responseStyle === 'detailed' ? 'bg-nebula-purple/20 text-nebula-purple border border-nebula-purple/30 shadow-[0_0_15px_rgba(176,38,255,0.1)]' : 'bg-black/40 text-nebula-silver border border-white/10 hover:text-white hover:bg-white/5'}`}
                    >
                      Detailed
                    </button>
                  </div>
                  <p className="text-xs text-nebula-silver/60 mt-2">
                    {responseStyle === 'summarized' ? 'Gedeon will provide concise, well-arranged summaries.' : 'Gedeon will provide in-depth explanations with a summary at the end.'}
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
