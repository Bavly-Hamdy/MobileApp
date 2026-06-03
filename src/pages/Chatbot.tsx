import React, { useState, useRef, useEffect } from "react";
import { useAppContext } from "@/contexts/AppContext";
import { useUserProfile } from "@/contexts/UserProfileContext";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar } from "@/components/ui/avatar";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useToast } from "@/hooks/use-toast";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { Send, Volume2, Bot, User, Search, Brain, Mic, Save, Heart, Share2, Menu, Paperclip, MicOff, AlertCircle, Languages, Sparkles, Activity, TrendingUp } from "lucide-react";
import MainLayout from "@/components/layout/MainLayout";
import { askGemini, askGeminiStream } from "@/api/geminiClient";
import ChatHistory from "@/components/chatbot/ChatHistory";
import ShareChat from "@/components/chatbot/ShareChat";
import FileAttachment from "@/components/chatbot/FileAttachment";
import { firebaseService } from "@/services/firebaseService";
import { auth } from "@/lib/firebase";
import { subscribeToHealthReadings, subscribeToBloodPressure } from "@/services/realtimeDbService";
import { useGlucoseReadings } from "@/hooks/useGlucoseReadings";
import "./Chatbot.css";

interface Message {
  id: string;
  role: "user" | "bot";
  content: string;
  timestamp: Date;
  isThinking?: boolean;
  isTyping?: boolean;
  isStreaming?: boolean;
  isSaved?: boolean;
  isFavorite?: boolean;
  attachments?: AttachedFile[];
}

interface AttachedFile {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
}

interface ChatEntry {
  id: string;
  title: string;
  timestamp: Date;
  isFavorite: boolean;
  messages: Message[];
}

interface VitalMetricState<T> {
  value: T;
  timestamp: Date;
  isLive: boolean;
}

const getLatest = <T,>(arr: T[]): T | undefined => {
  if (!arr || arr.length === 0) return undefined;
  return arr.slice(-1)[0];
};

const Chatbot = () => {
  const { t, language } = useAppContext();
  const { profile } = useUserProfile();
  const { readings: glucoseReadings } = useGlucoseReadings();
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const [asrLanguage, setAsrLanguage] = useState<'en' | 'ar'>('en'); // New ASR language state
  
  // Authenticated state for Realtime DB subscriptions
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

  // Vitals State
  const [heartRate, setHeartRate] = useState<VitalMetricState<number>>({
    value: 72,
    timestamp: new Date(),
    isLive: false
  });
  const [spo2, setSpo2] = useState<VitalMetricState<number>>({
    value: 98,
    timestamp: new Date(),
    isLive: false
  });
  const [temperature, setTemperature] = useState<VitalMetricState<number>>({
    value: 36.8,
    timestamp: new Date(),
    isLive: false
  });
  const [bloodPressure, setBloodPressure] = useState<VitalMetricState<{ systolic: number; diastolic: number }>>({
    value: { systolic: 120, diastolic: 80 },
    timestamp: new Date(),
    isLive: false
  });
  const [steps, setSteps] = useState<VitalMetricState<number>>({
    value: 4120,
    timestamp: new Date(),
    isLive: false
  });
  const [calories, setCalories] = useState<VitalMetricState<number>>({
    value: 185,
    timestamp: new Date(),
    isLive: false
  });

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "bot",
      content: language === 'ar' 
        ? "# مرحباً بك في VitalSync Health Hub\n\n## مساعدك الذكي للصحة\n\nأهلاً وسهلاً! أنا مساعدك الصحي المدعوم بتقنية Gemini AI.\n\n### كيف يمكنني مساعدتك اليوم؟\n- استشارات صحية عامة\n- تحليل القراءات الطبية\n- نصائح للعناية بالصحة\n- إرشادات طبية موثوقة"
        : "# Welcome to VitalSync Health Hub\n\n## Your Intelligent Health Assistant\n\nHello! I'm your health assistant powered by Gemini AI.\n\n### How can I help you today?\n- General health consultations\n- Medical readings analysis\n- Health care tips\n- Reliable medical guidance",
      timestamp: new Date(),
    },
  ]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [deepThinking, setDeepThinking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [selectedChatForShare, setSelectedChatForShare] = useState<string>("");
  const [chatHistory, setChatHistory] = useState<ChatEntry[]>([]);
  const [savedChats, setSavedChats] = useState<ChatEntry[]>([]);
  const [currentChatId] = useState(`chat-${Date.now()}`);
  const [savedMessageIds, setSavedMessageIds] = useState<Set<string>>(new Set());
  const [favoriteMessageIds, setFavoriteMessageIds] = useState<Set<string>>(new Set());
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Monitor Auth for realtime database subscriptions
  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      setIsAuthenticated(!!user);
    });
    return () => unsubscribeAuth();
  }, []);

  // Sync Vitals from Firebase Realtime Database
  useEffect(() => {
    if (!isAuthenticated) return;

    // Subscribe to heart rate readings
    const hrUnsub = subscribeToHealthReadings('heartRate', (readings) => {
      const latest = getLatest(readings);
      if (latest) {
        setHeartRate({
          value: latest.value,
          timestamp: new Date(latest.timestamp),
          isLive: true
        });
      }
    });

    // Subscribe to SpO2 readings
    const spo2Unsub = subscribeToHealthReadings('spo2', (readings) => {
      const latest = getLatest(readings);
      if (latest) {
        setSpo2({
          value: latest.value,
          timestamp: new Date(latest.timestamp),
          isLive: true
        });
      }
    });

    // Subscribe to temperature readings
    const tempUnsub = subscribeToHealthReadings('temperature', (readings) => {
      const latest = getLatest(readings);
      if (latest) {
        setTemperature({
          value: latest.value,
          timestamp: new Date(latest.timestamp),
          isLive: true
        });
      }
    });

    // Subscribe to blood pressure readings
    const bpUnsub = subscribeToBloodPressure((readings) => {
      const latest = getLatest(readings);
      if (latest) {
        setBloodPressure({
          value: { systolic: latest.systolic, diastolic: latest.diastolic },
          timestamp: new Date(latest.timestamp),
          isLive: true
        });
      }
    });

    // Subscribe to steps readings
    const stepsUnsub = subscribeToHealthReadings('steps', (readings) => {
      const latest = getLatest(readings);
      if (latest) {
        setSteps({
          value: latest.value,
          timestamp: new Date(latest.timestamp),
          isLive: true
        });
      }
    });

    // Subscribe to calories readings
    const caloriesUnsub = subscribeToHealthReadings('calories', (readings) => {
      const latest = getLatest(readings);
      if (latest) {
        setCalories({
          value: latest.value,
          timestamp: new Date(latest.timestamp),
          isLive: true
        });
      }
    });

    return () => {
      hrUnsub();
      spo2Unsub();
      tempUnsub();
      bpUnsub();
      stepsUnsub();
      caloriesUnsub();
    };
  }, [isAuthenticated]);

  // Helper to compile latest vitals into a structured prompt
  const compileVitalsText = () => {
    const latestGlucose = getLatest(glucoseReadings);
    
    if (language === 'ar') {
      return `مرحباً، يرجى تحليل قراءاتي الصحية الأخيرة بناءً على البيانات التالية المستقاة من أجهزتي الطبية وملفي الشخصي:
- **معدل ضربات القلب:** ${heartRate.value} نبضة في الدقيقة ${heartRate.isLive ? '(مباشر)' : '(افتراضي)'}
- **نسبة الأكسجين في الدم (SpO2):** ${spo2.value}% ${spo2.isLive ? '(مباشر)' : '(افتراضي)'}
- **درجة حرارة الجسم:** ${temperature.value}°م ${temperature.isLive ? '(مباشر)' : '(افتراضي)'}
- **ضغط الدم:** ${bloodPressure.value.systolic}/${bloodPressure.value.diastolic} ملم زئبق ${bloodPressure.isLive ? '(مباشر)' : '(افتراضي)'}
- **مستوى السكر في الدم:** ${latestGlucose ? `${latestGlucose.value} ملغ/ديسيلتر (${latestGlucose.type === 'fasting' ? 'صائم' : 'بعد الأكل'})` : 'غير متوفر حالياً (يجب إدخاله يدوياً)'}
- **الخطوات اليومية:** ${steps.value} خطوة
- **السعرات الحرارية المحروقة:** ${calories.value} سعرة حرارية

يرجى تزويدي بتقييم صحي مفصل، وتوضيح ما إذا كانت هذه القراءات في النطاق الطبيعي، وتوجيه نصائح وإرشادات طبية مخصصة ومباشرة بطريقة ودية وتنسيق Markdown واضح مع العناوين والرموز التعبيرية المناسبة.`;
    } else {
      return `Hello, please analyze my latest health readings based on the following data from my medical monitors and profile:
- **Heart Rate:** ${heartRate.value} BPM ${heartRate.isLive ? '(live)' : '(default)'}
- **Oxygen Saturation (SpO2):** ${spo2.value}% ${spo2.isLive ? '(live)' : '(default)'}
- **Body Temperature:** ${temperature.value}°C ${temperature.isLive ? '(live)' : '(default)'}
- **Blood Pressure:** ${bloodPressure.value.systolic}/${bloodPressure.value.diastolic} mmHg ${bloodPressure.isLive ? '(live)' : '(default)'}
- **Blood Glucose Level:** ${latestGlucose ? `${latestGlucose.value} mg/dL (${latestGlucose.type === 'fasting' ? 'fasting' : 'after meal'})` : 'Not logged yet (must be recorded manually)'}
- **Daily Steps:** ${steps.value} steps
- **Calories Burned:** ${calories.value} kcal

Please provide a detailed health assessment, explain if these readings fall within normal ranges, and offer direct, actionable medical guidance in a friendly, conversational manner using clean Markdown formatting with headings and bullet points.`;
    }
  };

  const presetCards = language === 'ar' ? [
    { 
      title: "📊 تحليل قراءاتي الصحية", 
      desc: "احصل على مراجعة سريرية متكاملة لضربات القلب والضغط والسكر والحرارة",
      icon: <Activity className="h-5 w-5 text-primary" />,
      query: "vitals_analysis" 
    },
    { 
      title: "❤️ نصائح لصحة القلب", 
      desc: "أهم الممارسات اليومية والتمارين للحفاظ على صحة الأوعية الدموية",
      icon: <Heart className="h-5 w-5 text-red-500" />,
      query: "ما هي أهم النصائح والتمارين اليومية للحفاظ على صحة القلب والشرايين وخفض الكولسترول؟" 
    },
    { 
      title: "🩺 دليل ضغط الدم", 
      desc: "شرح كامل لمستويات ضغط الدم وكيفية تفسير المعدلات المرتفعة والمنخفضة",
      icon: <TrendingUp className="h-5 w-5 text-emerald-500" />,
      query: "اشرح لي مستويات ضغط الدم (الطبيعي، المرتفع، والمنخفض) وكيف أتعامل مع كل منها؟" 
    },
    { 
      title: "🧠 تمارين إزالة التوتر", 
      desc: "تقنيات تنفس واسترخاء سريعة المفعول لتهدئة الجهاز العصبي فوراً",
      icon: <Brain className="h-5 w-5 text-purple-500" />,
      query: "أعطني تمارين تنفس واسترخاء سريعة وفعالة لتخفيف التوتر والضغط العصبي فوراً." 
    }
  ] : [
    { 
      title: "📊 Analyze my Vitals", 
      desc: "Receive a professional clinical breakdown of your live device measurements",
      icon: <Activity className="h-5 w-5 text-primary" />,
      query: "vitals_analysis" 
    },
    { 
      title: "❤️ Cardiovascular Advice", 
      desc: "Core exercises and habits to optimize heart and vessel performance",
      icon: <Heart className="h-5 w-5 text-red-500" />,
      query: "What are the best daily practices and exercises to maintain cardiovascular health and lower cholesterol?" 
    },
    { 
      title: "🩺 Blood Pressure Guide", 
      desc: "Detailed interpretation of systolic/diastolic levels and how to regulate them",
      icon: <TrendingUp className="h-5 w-5 text-emerald-500" />,
      query: "Explain blood pressure ranges (normal, elevated, hypertension, hypotension) and how to manage them." 
    },
    { 
      title: "🧠 Stress Control Exercises", 
      desc: "Fast somatic relaxation and breathing techniques to reset anxiety",
      icon: <Brain className="h-5 w-5 text-purple-500" />,
      query: "Provide quick, effective breathing and relaxation exercises to relieve acute stress and anxiety." 
    }
  ];

  const handleSelectPreset = (query: string) => {
    let finalQuery = query;
    if (query === "vitals_analysis") {
      finalQuery = compileVitalsText();
    }
    handleSendMessage(finalQuery);
  };

  // Typewriter streaming animation states & refs
  const textBufferRef = useRef("");
  const isStreamingActiveRef = useRef(false);
  const typingIntervalRef = useRef<any>(null);

  // Clean up typing interval on unmount
  useEffect(() => {
    return () => {
      if (typingIntervalRef.current) {
        clearInterval(typingIntervalRef.current);
      }
    };
  }, []);

  // Initialize Speech Recognition Hook with explicit language selection
  const speechRecognition = useSpeechRecognition({
    language: asrLanguage, // Use explicit ASR language selection
    onTranscriptChange: (transcript) => {
      setMessage(transcript);
    },
    onFinalTranscript: (transcript) => {
      setMessage(transcript);
    }
  });

  // Load saved and favorite message IDs from Firebase on mount
  useEffect(() => {
    const loadSavedFavoriteStatus = async () => {
      try {
        // Subscribe to saved messages to get their IDs
        const unsubscribeSaved = firebaseService.subscribeToSavedMessages('saved', (savedMessages) => {
          const savedIds = new Set(savedMessages.map(msg => msg.messageId));
          setSavedMessageIds(savedIds);
          
          // Update message state to reflect saved status
          setMessages(prevMessages => 
            prevMessages.map(msg => ({
              ...msg,
              isSaved: savedIds.has(msg.id)
            }))
          );
        });

        // Subscribe to favorite messages to get their IDs
        const unsubscribeFavorite = firebaseService.subscribeToSavedMessages('favorite', (favoriteMessages) => {
          const favoriteIds = new Set(favoriteMessages.map(msg => msg.messageId));
          setFavoriteMessageIds(favoriteIds);
          
          // Update message state to reflect favorite status
          setMessages(prevMessages => 
            prevMessages.map(msg => ({
              ...msg,
              isFavorite: favoriteIds.has(msg.id)
            }))
          );
        });

        // Clean up subscriptions on unmount
        return () => {
          unsubscribeSaved();
          unsubscribeFavorite();
        };
      } catch (error) {
        console.error('Error loading saved/favorite status:', error);
      }
    };

    loadSavedFavoriteStatus();
  }, []);

  // Auto-scroll to bottom when new messages are added
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages]);

  // Detect language and dialect
  const detectLanguage = (text: string) => {
    const arabicRegex = /[\u0600-\u06FF]/;
    const egyptianColloquialWords = /\b(إزيك|إيه|ازيك|كدا|كده|بقى|علشان|عشان|اهو|اهي|يلا|ماشي|طب|هو|هي)\b/i;
    
    if (arabicRegex.test(text)) {
      if (egyptianColloquialWords.test(text)) {
        return 'egyptian';
      }
      return 'arabic';
    }
    return 'english';
  };

  const addTypingMessage = (): string => {
    const typingId = `typing-${Date.now()}`;
    const typingMessage: Message = {
      id: typingId,
      role: "bot",
      content: language === 'ar' ? "جاري الكتابة..." : "Typing...",
      timestamp: new Date(),
      isTyping: true,
    };
    
    setMessages((prev) => [...prev, typingMessage]);
    return typingId;
  };

  const addThinkingMessage = (): string => {
    const thinkingId = `thinking-${Date.now()}`;
    const thinkingContent = language === 'ar' 
      ? (deepThinking ? "## 🧠 التفكير العميق\n### جاري تحليل استفسارك بعناية..." : "## 💭 جاري التفكير\n### معالجة طلبك...")
      : (deepThinking ? "## 🧠 Deep Thinking\n### Analyzing your query carefully..." : "## 💭 Thinking\n### Processing your request...");
    
    const thinkingMessage: Message = {
      id: thinkingId,
      role: "bot",
      content: thinkingContent,
      timestamp: new Date(),
      isThinking: true,
    };
    
    setMessages((prev) => [...prev, thinkingMessage]);
    return thinkingId;
  };

  const removeMessage = (messageId: string) => {
    setMessages((prev) => prev.filter(msg => msg.id !== messageId));
  };

  const handleSendMessage = async (overrideMessage?: string) => {
    const rawMessage = typeof overrideMessage === 'string' ? overrideMessage : message;
    if ((!rawMessage.trim() && attachedFiles.length === 0) || isLoading) return;

    const userMessage = rawMessage.trim();
    const detectedLanguage = detectLanguage(userMessage);
    
    // Clear input immediately and stop listening
    setMessage("");
    setIsLoading(true);

    if (speechRecognition.isListening) {
      speechRecognition.stopListening();
    }

    // Get user's first name for dynamic heading
    const userFirstName = profile?.firstName || (language === 'ar' ? 'المستخدم' : 'User');
    const headerText = `### ${userFirstName}`;
    
    // Create content with attachments
    let content = `${headerText}\n${userMessage}`;
    if (attachedFiles.length > 0 && !overrideMessage) {
      const attachmentText = language === 'ar' ? '\n\n**الملفات المرفقة:**\n' : '\n\n**Attached Files:**\n';
      content += attachmentText + attachedFiles.map(file => `- ${file.name}`).join('\n');
    }
    
    const newUserMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: content,
      timestamp: new Date(),
      attachments: overrideMessage ? [] : [...attachedFiles],
    };
    
    setMessages((prev) => [...prev, newUserMessage]);
    if (!overrideMessage) {
      setAttachedFiles([]); // Clear attachments after sending
    }

    // Add thinking placeholder or typing indicator immediately
    const thinkingId = deepThinking ? addThinkingMessage() : addTypingMessage();
    
    // Call Gemini API without artificial delay
    handleGeminiCall(userMessage, detectedLanguage, thinkingId);
  };

  const handleGeminiCall = async (userMessage: string, detectedLanguage: string, thinkingId: string | null) => {
    let botMessageId = (Date.now() + 1).toString();
    let hasCreatedBotMessage = false;

    // Reset typewriter buffer and streaming state
    textBufferRef.current = "";
    isStreamingActiveRef.current = true;
    if (typingIntervalRef.current) {
      clearInterval(typingIntervalRef.current);
      typingIntervalRef.current = null;
    }

    try {
      // Enhanced prompt based on detected language (not UI language)
      let enhancedPrompt = userMessage;
      
      if (detectedLanguage === 'arabic') {
        enhancedPrompt = `أجب بالعربية الفصحى فقط واستخدم تنسيق Markdown مع العناوين والتنظيم المناسب. استخدم **النص** للنص العريض وليس ****النص****. لا تخلط اللغات في الرد. السؤال: ${userMessage}`;
      } else if (detectedLanguage === 'egyptian') {
        enhancedPrompt = `أجب بالعامية المصرية فقط واستخدم تنسيق Markdown مع العناوين والتنظيم المناسب. استخدم **النص** للنص العريض وليس ****النص****. لا تخلط اللغات في الرد. السؤال: ${userMessage}`;
      } else {
        enhancedPrompt = `Reply in English only using proper Markdown formatting with headings and organization. Use **text** for bold text, not ****text****. Do not mix languages in your response. Question: ${userMessage}`;
      }

      // Typing animation loop state
      let displayedText = "";
      let lastIndex = 0;

      const startTypingLoop = () => {
        if (typingIntervalRef.current) return;

        typingIntervalRef.current = setInterval(() => {
          const buffer = textBufferRef.current;

          if (lastIndex < buffer.length) {
            // Adaptive speed: catch up if the stream starts writing ahead
            const charsAhead = buffer.length - lastIndex;
            const charsToAdd = charsAhead > 50 ? 8 : (charsAhead > 20 ? 4 : (charsAhead > 5 ? 2 : 1));

            const nextChunk = buffer.slice(lastIndex, lastIndex + charsToAdd);
            lastIndex += charsToAdd;
            displayedText += nextChunk;

            if (!hasCreatedBotMessage) {
              hasCreatedBotMessage = true;
              if (thinkingId) {
                removeMessage(thinkingId);
              }
              const botReply: Message = {
                id: botMessageId,
                role: "bot",
                content: displayedText,
                timestamp: new Date(),
                isStreaming: true,
              };
              setMessages((prev) => [...prev, botReply]);
            } else {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === botMessageId
                    ? { ...msg, content: displayedText }
                    : msg
                )
              );
            }
          } else if (!isStreamingActiveRef.current) {
            // Stream is complete and typewriter finished typing out all text
            clearInterval(typingIntervalRef.current);
            typingIntervalRef.current = null;

            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === botMessageId
                  ? { ...msg, isStreaming: false }
                  : msg
              )
            );
          }
        }, 25); // 25ms interval for ultra-smooth typing effect
      };

      await askGeminiStream(
        enhancedPrompt,
        (chunk) => {
          textBufferRef.current += chunk;
          startTypingLoop();
        },
        deepThinking
      );

      // Signal stream is complete and make sure typing loop is active to finish the remainder
      isStreamingActiveRef.current = false;
      startTypingLoop();

    } catch (error) {
      console.error('Error sending message to Gemini:', error);
      
      // Cancel typing interval immediately
      isStreamingActiveRef.current = false;
      if (typingIntervalRef.current) {
        clearInterval(typingIntervalRef.current);
        typingIntervalRef.current = null;
      }

      // Remove thinking message if it exists
      if (thinkingId) {
        removeMessage(thinkingId);
      }
      
      // If we partially created the bot response, remove it to show clean error instead
      if (hasCreatedBotMessage) {
        removeMessage(botMessageId);
      }
      
      // Show error message based on UI language - dynamic and descriptive
      const errorMessageString = error instanceof Error ? error.message : '';
      const isRateLimit = errorMessageString.includes('تجاوز الحد') || errorMessageString.includes('RATE_LIMIT');
      const isHighDemand = errorMessageString.includes('ضغط') || errorMessageString.includes('demand') || errorMessageString.includes('503') || errorMessageString.includes('UNAVAILABLE') || errorMessageString.includes('النموذج يواجه ضغط');

      let errorContent = "";
      let toastDesc = "";
      if (language === 'ar') {
        if (isHighDemand) {
          errorContent = "## ⚠️ الخدمة غير متوفرة مؤقتاً\n### عذراً، النموذج يواجه ضغطاً كبيراً حالياً.\n**يرجى إعادة المحاولة بعد قليل.**";
          toastDesc = "النموذج يواجه ضغطًا كبيرًا حاليًا. يرجى المحاولة لاحقًا.";
        } else if (isRateLimit) {
          errorContent = "## ⚠️ تم تجاوز حد الطلبات\n### لقد قمت بإرسال عدد كبير من الطلبات.\n**يرجى الانتظار دقيقة ثم المحاولة مجدداً.**";
          toastDesc = "تم تجاوز حد الطلبات المسموح به. يرجى الانتظار دقيقة.";
        } else {
          errorContent = `## ⚠️ خطأ في الاتصال\n### عذراً، حدث خطأ أثناء الاتصال بـ Gemini.\n**الرجاء المحاولة لاحقاً.**\n*تفاصيل الخطأ: ${errorMessageString || 'غير معروف'}*`;
          toastDesc = "فشل الاتصال بـ Gemini AI. يرجى إعادة المحاولة.";
        }
      } else {
        if (isHighDemand) {
          errorContent = "## ⚠️ Service Temporarily Unavailable\n### Sorry, the model is currently experiencing high demand.\n**Please try again in a few moments.**";
          toastDesc = "The model is currently experiencing high demand. Please try again shortly.";
        } else if (isRateLimit) {
          errorContent = "## ⚠️ Rate Limit Exceeded\n### You have sent too many requests.\n**Please wait a minute and try again.**";
          toastDesc = "Rate limit exceeded. Please wait a minute.";
        } else {
          errorContent = `## ⚠️ Connection Error\n### Sorry, an error occurred while connecting to Gemini.\n**Please try again later.**\n*Details: ${errorMessageString || 'unknown'}*`;
          toastDesc = "Failed to connect to Gemini AI. Please try again.";
        }
      }
      
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "bot",
        content: errorContent,
        timestamp: new Date(),
      };
      
      setMessages((prev) => [...prev, errorMessage]);
      
      toast({
        title: language === 'ar' ? "خطأ في الاتصال" : "Connection Error",
        description: toastDesc,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };


  // Enhanced save message with Firebase persistence and retry logic
  const handleSaveMessage = async (messageId: string) => {
    const message = messages.find(msg => msg.id === messageId);
    if (!message) return;

    const isCurrentlySaved = savedMessageIds.has(messageId);

    if (isCurrentlySaved) {
      toast({
        title: language === 'ar' ? "محفوظ مسبقاً" : "Already Saved",
        description: language === 'ar' ? "هذه الرسالة محفوظة بالفعل" : "This message is already saved",
      });
      return;
    }

    let retryCount = 0;
    const maxRetries = 2;

    const attemptSave = async (): Promise<void> => {
      try {
        await firebaseService.saveMessage(
          messageId,
          currentChatId,
          message.content,
          message.timestamp,
          'saved'
        );

        // Update local state
        setSavedMessageIds(prev => new Set([...prev, messageId]));
        setMessages(prev => prev.map(msg => 
          msg.id === messageId ? { ...msg, isSaved: true } : msg
        ));

        toast({
          title: language === 'ar' ? "تم الحفظ ✅" : "Saved ✅",
          description: language === 'ar' ? "تم حفظ الرسالة بنجاح" : "Message saved successfully",
        });
      } catch (error) {
        console.error('Error saving message:', error);
        
        if (retryCount < maxRetries) {
          retryCount++;
          console.log(`Retrying save operation, attempt ${retryCount}`);
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
          await attemptSave();
        } else {
          toast({
            title: language === 'ar' ? "فشل الحفظ" : "Save Failed",
            description: language === 'ar' 
              ? "غير قادر على الحفظ—يرجى المحاولة مرة أخرى"
              : "Unable to save—please retry",
            variant: "destructive",
          });
        }
      }
    };

    await attemptSave();
  };

  // Enhanced favorite message with Firebase persistence and retry logic
  const handleFavoriteMessage = async (messageId: string) => {
    const message = messages.find(msg => msg.id === messageId);
    if (!message) return;

    const isCurrentlyFavorite = favoriteMessageIds.has(messageId);

    if (isCurrentlyFavorite) {
      toast({
        title: language === 'ar' ? "مفضل مسبقاً" : "Already Favorited",
        description: language === 'ar' ? "هذه الرسالة مفضلة بالفعل" : "This message is already favorited",
      });
      return;
    }

    let retryCount = 0;
    const maxRetries = 2;

    const attemptFavorite = async (): Promise<void> => {
      try {
        await firebaseService.saveMessage(
          messageId,
          currentChatId,
          message.content,
          message.timestamp,
          'favorite'
        );

        // Update local state
        setFavoriteMessageIds(prev => new Set([...prev, messageId]));
        setMessages(prev => prev.map(msg => 
          msg.id === messageId ? { ...msg, isFavorite: true } : msg
        ));

        toast({
          title: language === 'ar' ? "تمت الإضافة للمفضلة ⭐️" : "Favorited ⭐️",
          description: language === 'ar' ? "تمت إضافة الرسالة للمفضلة بنجاح" : "Message added to favorites successfully",
        });
      } catch (error) {
        console.error('Error favoriting message:', error);
        
        if (retryCount < maxRetries) {
          retryCount++;
          console.log(`Retrying favorite operation, attempt ${retryCount}`);
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
          await attemptFavorite();
        } else {
          toast({
            title: language === 'ar' ? "فشل التفضيل" : "Favorite Failed",
            description: language === 'ar' 
              ? "غير قادر على الحفظ—يرجى المحاولة مرة أخرى"
              : "Unable to save—please retry",
            variant: "destructive",
          });
        }
      }
    };

    await attemptFavorite();
  };

  const handleShareMessage = (messageId: string) => {
    setSelectedChatForShare(messageId);
    setShareDialogOpen(true);
  };

  const handleFileAttach = (file: AttachedFile) => {
    setAttachedFiles(prev => [...prev, file]);
  };

  const handleFileRemove = (fileId: string) => {
    setAttachedFiles(prev => prev.filter(file => file.id !== fileId));
  };

  const saveCurrentChat = () => {
    if (messages.length <= 1) return;
    
    const chatTitle = messages[1]?.content?.split('\n')[1]?.substring(0, 50) + '...' || 
                     (language === 'ar' ? 'محادثة صحية' : 'Health Chat');
    
    const newChat: ChatEntry = {
      id: Date.now().toString(),
      title: chatTitle,
      timestamp: new Date(),
      isFavorite: false,
      messages: [...messages],
    };
    
    setChatHistory(prev => [newChat, ...prev.slice(0, 19)]); // Keep last 20 chats
    
    toast({
      title: language === 'ar' ? "تم حفظ المحادثة" : "Chat Saved",
      description: language === 'ar' ? "تم حفظ المحادثة الحالية" : "Current chat saved",
    });
  };

  const startNewChat = () => {
    setMessages([messages[0]]); // Keep only the welcome message
    setAttachedFiles([]);
    setMessage("");
    toast({
      title: language === 'ar' ? "محادثة جديدة" : "New Chat",
      description: language === 'ar' ? "تم بدء محادثة جديدة" : "Started a new chat",
    });
  };

  const loadChat = (chat: ChatEntry) => {
    setMessages(chat.messages);
    toast({
      title: language === 'ar' ? "تم تحميل المحادثة" : "Chat Loaded",
      description: language === 'ar' ? "تم تحميل المحادثة بنجاح" : "Chat loaded successfully",
    });
  };

  const deleteChat = (chatId: string) => {
    setChatHistory(prev => prev.filter(chat => chat.id !== chatId));
    setSavedChats(prev => prev.filter(chat => chat.id !== chatId));
  };

  const toggleChatFavorite = (chatId: string) => {
    const chat = chatHistory.find(c => c.id === chatId) || savedChats.find(c => c.id === chatId);
    if (!chat) return;
    
    if (chat.isFavorite) {
      setSavedChats(prev => prev.filter(c => c.id !== chatId));
    } else {
      setSavedChats(prev => [...prev, { ...chat, isFavorite: true }]);
    }
    
    setChatHistory(prev => prev.map(c => 
      c.id === chatId ? { ...c, isFavorite: !c.isFavorite } : c
    ));
  };

  // Split text by language for proper TTS handling
  const splitByLanguage = (text: string) => {
    const arabicRegex = /[\u0600-\u06FF]/;
    const segments = [];
    let currentSegment = "";
    let isArabic = null;

    for (const char of text) {
      const charIsArabic = arabicRegex.test(char);
      
      if (isArabic === null) {
        isArabic = charIsArabic;
        currentSegment += char;
      } else if (isArabic === charIsArabic) {
        currentSegment += char;
      } else {
        if (currentSegment.trim()) {
          segments.push({ text: currentSegment.trim(), isArabic });
        }
        currentSegment = char;
        isArabic = charIsArabic;
      }
    }

    if (currentSegment.trim()) {
      segments.push({ text: currentSegment.trim(), isArabic });
    }

    return segments;
  };

  // Enhanced Text-to-Speech with better Arabic support and hash removal
  const cleanTextForTTS = (text: string) => {
    // Remove markdown formatting and hash symbols
    return text
      .replace(/#{1,6}\s*/g, '') // Remove # headers
      .replace(/\*\*(.*?)\*\*/g, '$1') // Remove **bold** formatting
      .replace(/\*(.*?)\*/g, '$1') // Remove *italic* formatting
      .replace(/\n{2,}/g, '. ') // Replace multiple newlines with periods
      .replace(/\n/g, ' ') // Replace single newlines with spaces
      .replace(/\s+/g, ' ') // Normalize spaces
      .trim();
  };

  const handleTextToSpeech = (text: string) => {
    if ('speechSynthesis' in window) {
      // Stop any ongoing speech
      window.speechSynthesis.cancel();
      
      // Clean text for better TTS
      const cleanedText = cleanTextForTTS(text);
      
      if (!cleanedText.trim()) return;
      
      // Split text by language for proper pronunciation
      const segments = splitByLanguage(cleanedText);
      
      segments.forEach((segment, index) => {
        const utterance = new SpeechSynthesisUtterance(segment.text);
        
        // Enhanced voice settings for better quality
        if (segment.isArabic) {
          utterance.lang = 'ar-SA';
          utterance.rate = 0.85; // Slightly slower for Arabic
          utterance.pitch = 1.1; // Higher pitch for better clarity
          utterance.volume = 0.9;
        } else {
          utterance.lang = 'en-US';
          utterance.rate = 0.9;
          utterance.pitch = 1.0;
          utterance.volume = 0.9;
        }
        
        // Add natural pauses between segments
        setTimeout(() => {
          window.speechSynthesis.speak(utterance);
        }, index * 200);
      });
      
      toast({
        title: language === 'ar' ? 'تشغيل الصوت' : 'Playing Audio',
        description: language === 'ar' ? 'جاري قراءة النص' : 'Reading text aloud',
      });
    } else {
      toast({
        title: language === 'ar' ? "غير مدعوم" : "Not Supported",
        description: language === 'ar' 
          ? "تحويل النص إلى كلام غير مدعوم في هذا المتصفح."
          : "Text-to-speech is not supported in this browser.",
        variant: "destructive",
      });
    }
  };

  const handleVoiceAssistant = () => {
    if (!speechRecognition.isSupported) {
      toast({
        title: language === 'ar' ? "غير مدعوم" : "Not Supported",
        description: language === 'ar' 
          ? "التعرف على الصوت غير مدعوم في هذا المتصفح."
          : "Speech recognition is not supported in this browser",
        variant: "destructive",
      });
      return;
    }

    if (speechRecognition.isListening) {
      speechRecognition.stopListening();
    } else {
      speechRecognition.startListening();
    }
  };

  const handleSearch = () => {
    if (!searchQuery.trim()) return;
    
    // Filter messages that contain the search query
    const filteredMessages = messages.filter(msg => 
      msg.content.toLowerCase().includes(searchQuery.toLowerCase()) && !msg.isThinking
    );
    
    if (filteredMessages.length === 0) {
      toast({
        title: language === 'ar' ? "لا توجد نتائج" : "No Results",
        description: language === 'ar'
          ? `لم يتم العثور على رسائل تحتوي على "${searchQuery}".`
          : `No messages found containing "${searchQuery}".`,
      });
    } else {
      toast({
        title: language === 'ar' ? "نتائج البحث" : "Search Results",
        description: language === 'ar'
          ? `تم العثور على ${filteredMessages.length} رسالة تحتوي على "${searchQuery}".`
          : `Found ${filteredMessages.length} message(s) containing "${searchQuery}".`,
      });
    }
  };

  const toggleSearch = () => {
    setIsSearchVisible(!isSearchVisible);
    if (!isSearchVisible) {
      setSearchQuery("");
    }
  };

  const formatTimestamp = (date: Date) => {
    return new Intl.DateTimeFormat(language === 'ar' ? 'ar-SA' : 'en-US', { 
      hour: 'numeric', 
      minute: 'numeric',
      hour12: true 
    }).format(date);
  };

  const renderMessageContent = (content: string, isStreaming?: boolean) => {
    // Helper to parse inline bold, italic, and code markdown
    const parseInlineFormatting = (text: string) => {
      const regex = /(\*\*.*?\*\*|\*.*?\*|`.*?`)/g;
      const parts = text.split(regex);
      
      return parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={index} className="font-bold text-foreground">{part.slice(2, -2)}</strong>;
        } else if (part.startsWith('*') && part.endsWith('*')) {
          return <em key={index} className="italic text-foreground/90">{part.slice(1, -1)}</em>;
        } else if (part.startsWith('`') && part.endsWith('`')) {
          return <code key={index} className="px-1.5 py-0.5 rounded bg-muted/60 text-xs font-mono font-semibold text-primary">{part.slice(1, -1)}</code>;
        }
        return part;
      });
    };

    const lines = content.split('\n');
    const renderedLines = lines.map((line, index) => {
      const isLastLine = index === lines.length - 1;
      const cursor = isLastLine && isStreaming ? <span className="typing-cursor" /> : null;
      
      const trimmedLine = line.trim();
      
      // Horizontal Rules
      if (trimmedLine === '---' || trimmedLine === '***' || trimmedLine === '___') {
        return (
          <div key={index} className="my-3 border-t border-border/40 w-full">
            {cursor}
          </div>
        );
      }
      
      // Headers
      const headerMatch = line.match(/^(#{1,6})\s+(.*)$/);
      if (headerMatch) {
        const level = headerMatch[1].length;
        const text = headerMatch[2];
        const inlineContent = parseInlineFormatting(text);
        
        let className = "font-bold mb-2 text-primary flex items-center flex-wrap";
        if (level === 1) className += " text-xl mt-3";
        else if (level === 2) className += " text-lg mt-3";
        else if (level === 3) className += " text-base mt-2";
        else className += " text-sm mt-1.5 text-muted-foreground"; // H4, H5, H6
        
        return (
          <div key={index} className={className}>
            {inlineContent}
            {cursor}
          </div>
        );
      }
      
      // Bullet lists
      const bulletMatch = line.match(/^(\s*)[-\*•]\s+(.*)$/);
      if (bulletMatch) {
        const text = bulletMatch[2];
        return (
          <li key={index} className="ml-4 list-disc mb-1 text-sm leading-relaxed">
            {parseInlineFormatting(text)}
            {cursor}
          </li>
        );
      }
      
      // Numbered lists
      const numberMatch = line.match(/^(\s*)\d+\.\s+(.*)$/);
      if (numberMatch) {
        const text = numberMatch[2];
        const originalPrefix = line.match(/^(\s*\d+\.\s+)/)?.[0] || "";
        return (
          <p key={index} className="ml-1 mb-1 text-sm leading-relaxed">
            <span className="font-semibold text-foreground/80">{originalPrefix}</span>
            {parseInlineFormatting(text)}
            {cursor}
          </p>
        );
      }
      
      // Empty lines
      if (trimmedLine === '') {
        return isLastLine && isStreaming ? <p key={index} className="mb-1">{cursor}</p> : <div key={index} className="h-2" />;
      }
      
      // Standard Paragraph
      return (
        <p key={index} className="mb-1 text-sm leading-relaxed">
          {parseInlineFormatting(line)}
          {cursor}
        </p>
      );
    });
    
    return <div className="space-y-1.5">{renderedLines}</div>;
  };

  return (
    <MainLayout>
      <div className="relative overflow-hidden min-h-[calc(100vh-80px)]">
        {/* Ambient Glassmorphic Background Blobs */}
        <div className="chat-ambient-blob chat-ambient-blob-primary" />
        <div className="chat-ambient-blob chat-ambient-blob-secondary" />

        <div className="container relative z-10 p-4 md:p-6 max-w-xl mx-auto">
          {/* Header Section */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Bot className="h-6 w-6 text-primary" />
                {t('chatbot')}
              </h1>
              <p className="text-sm text-muted-foreground">
                {language === 'ar' ? 'مساعدك الطبي الذكي والآمن' : 'Your safe medical chatbot companion'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={toggleSearch} className="hover:bg-primary/10">
                <Search size={20} />
              </Button>
              <Button variant="ghost" size="icon" onClick={saveCurrentChat} className="hover:bg-primary/10">
                <Save size={20} />
              </Button>
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="hover:bg-primary/10">
                    <Menu size={20} />
                  </Button>
                </SheetTrigger>
                <SheetContent side={language === 'ar' ? 'left' : 'right'} className="w-80 glass-panel">
                  <ChatHistory
                    chatHistory={chatHistory}
                    savedChats={savedChats}
                    onLoadChat={loadChat}
                    onDeleteChat={deleteChat}
                    onToggleFavorite={toggleChatFavorite}
                    onNewChat={startNewChat}
                  />
                </SheetContent>
              </Sheet>
            </div>
          </div>

          {isSearchVisible && (
            <div className="mb-4 flex gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={language === 'ar' ? 'البحث في المحادثة...' : 'Search conversation...'}
                className="flex-1 bg-white/50 dark:bg-gray-900/50"
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              />
              <Button onClick={handleSearch} size="sm">
                {language === 'ar' ? 'بحث' : 'Search'}
              </Button>
            </div>
          )}

          {/* Language Toggle for ASR */}
          <div className="mb-4 flex items-center justify-center">
            <div className="flex items-center gap-2 p-1.5 bg-white/40 dark:bg-black/20 backdrop-blur-md rounded-xl border border-white/20 dark:border-white/5">
              <Languages size={15} className="text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium">
                {language === 'ar' ? 'لغة التعرف على الصوت:' : 'Speech Language:'}
              </span>
              <ToggleGroup
                type="single"
                value={asrLanguage}
                onValueChange={(value) => {
                  if (value) {
                    setAsrLanguage(value as 'en' | 'ar');
                    if (speechRecognition.isListening) {
                      speechRecognition.stopListening();
                    }
                  }
                }}
                className="bg-white/80 dark:bg-gray-800 rounded-lg p-0.5"
              >
                <ToggleGroupItem 
                  value="en" 
                  className="text-xs px-2.5 py-1 h-7 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                >
                  {language === 'ar' ? 'الإنجليزية' : 'EN'}
                </ToggleGroupItem>
                <ToggleGroupItem 
                  value="ar" 
                  className="text-xs px-2.5 py-1 h-7 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                >
                  {language === 'ar' ? 'العربية' : 'Arabic'}
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>

          {/* Expanded Chat Window */}
          <Card className="flex flex-col h-[calc(100vh-250px)] glass-panel border-white/20 dark:border-white/10 shadow-xl rounded-2xl overflow-hidden relative z-10">
            <div className="p-4 border-b bg-white/20 dark:bg-black/25 backdrop-blur-md flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Bot className="h-5 w-5 text-primary" />
                  {language === 'ar' ? 'نافذة المحادثة الطبية' : 'Medical Chat Room'}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {asrLanguage === 'ar' 
                    ? (language === 'ar' ? 'التعرف على الصوت: العربية' : 'Speech Recognition: Arabic')
                    : (language === 'ar' ? 'التعرف على الصوت: الإنجليزية' : 'Speech Recognition: English')
                  }
                </p>
              </div>

              {/* Live sync badge */}
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-green-500/10 dark:bg-green-500/20 text-green-600 dark:text-green-400 rounded-full border border-green-500/20">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                <span className="text-[10px] font-bold tracking-wide">
                  {language === 'ar' ? 'قنوات حية' : 'LIVE SYNC'}
                </span>
              </div>
            </div>
            
            <ScrollArea className="flex-1 p-4 custom-chat-scrollbar" ref={scrollAreaRef}>
              <div className="space-y-4">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${
                      msg.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`flex gap-2.5 max-w-[85%] ${
                        msg.role === "user" ? "flex-row-reverse" : "flex-row"
                      }`}
                    >
                      <Avatar className="h-8 w-8 flex-shrink-0 border shadow-sm">
                        {msg.role === "user" ? <User size={15} /> : <Bot size={15} />}
                      </Avatar>
                      <div
                        className={`p-3 rounded-2xl shadow-sm message-bubble-animate ${
                          msg.role === "user"
                            ? "bg-gradient-to-br from-[#0284c7] to-[#4f46e5] text-white ml-auto rounded-tr-none"
                            : msg.isThinking || msg.isTyping
                            ? "bg-white/40 dark:bg-white/5 border border-white/20 dark:border-white/5 backdrop-blur-md rounded-tl-none"
                            : "bg-white/80 dark:bg-gray-800/80 border border-white/30 dark:border-white/5 backdrop-blur-md rounded-tl-none text-foreground"
                        }`}
                      >
                        <div className="text-sm leading-relaxed">
                          {msg.isThinking ? (
                            <div className="flex flex-col gap-2">
                              <div className="flex items-center gap-2 text-primary font-semibold">
                                <Brain className="h-4 w-4 animate-bounce text-primary" />
                                <span>{deepThinking ? (language === 'ar' ? 'التفكير العميق المتقدم...' : 'Advanced Deep Thinking...') : (language === 'ar' ? 'جاري التحليل والمعالجة...' : 'Thinking...')}</span>
                              </div>
                              <div className="text-xs text-muted-foreground leading-normal">
                                {deepThinking 
                                  ? (language === 'ar' ? 'يقوم المساعد بمراجعة القواميس الطبية وقراءاتك الحية بدقة...' : 'Assistant is carefully cross-referencing clinical indexes & live vitals...')
                                  : (language === 'ar' ? 'البحث عن أفضل التوجيهات الطبية...' : 'Fetching relevant medical guidelines...')}
                              </div>
                              <div className="flex items-center gap-1 mt-1">
                                <div className="thinking-dots-container">
                                  <div className="thinking-dot-node" />
                                  <div className="thinking-dot-node" />
                                  <div className="thinking-dot-node" />
                                </div>
                              </div>
                            </div>
                          ) : msg.isTyping ? (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <div className="thinking-dots-container">
                                <div className="thinking-dot-node" />
                                <div className="thinking-dot-node" />
                                <div className="thinking-dot-node" />
                              </div>
                              <span className="text-xs">{language === 'ar' ? 'جاري الكتابة...' : 'Typing...'}</span>
                            </div>
                          ) : (
                            renderMessageContent(msg.content, msg.isStreaming)
                          )}
                          
                          {msg.attachments && msg.attachments.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {msg.attachments.map((file) => (
                                <div key={file.id} className="text-xs bg-background/50 p-2 rounded-lg border border-border/30 flex items-center gap-1.5">
                                  <span>📎</span>
                                  <span className="font-medium truncate">{file.name}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-border/40 text-[10px] opacity-75">
                          <span className="opacity-70">
                            {formatTimestamp(msg.timestamp)}
                          </span>
                          {msg.role === "bot" && !msg.isThinking && !msg.isTyping && !msg.isStreaming && (
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 hover:bg-primary/10"
                                onClick={() => handleTextToSpeech(msg.content)}
                              >
                                <Volume2 size={13} />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 hover:bg-primary/10"
                                onClick={() => handleSaveMessage(msg.id)}
                              >
                                <Save size={13} className={msg.isSaved ? "fill-primary" : ""} />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 hover:bg-primary/10"
                                onClick={() => handleFavoriteMessage(msg.id)}
                              >
                                <Heart size={13} className={msg.isFavorite ? "fill-red-500 text-red-500" : ""} />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 hover:bg-primary/10"
                                onClick={() => handleShareMessage(msg.id)}
                              >
                                <Share2 size={13} />
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {/* Grid of suggestion cards shown under the welcome card when chat is new */}
                {messages.length <= 1 && (
                  <div className="mt-6 pt-4 border-t border-border/40 animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <p className="text-xs font-bold text-muted-foreground mb-3 flex items-center gap-1.5 px-1 uppercase tracking-wider">
                      <Sparkles size={13} className="text-primary animate-pulse" />
                      {language === 'ar' ? 'استشارات طبية مقترحة:' : 'Suggested Inquiries:'}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-1">
                      {presetCards.map((preset, index) => (
                        <button
                          key={index}
                          type="button"
                          onClick={() => handleSelectPreset(preset.query)}
                          className="flex items-start text-left rtl:text-right gap-3 p-3.5 rounded-xl bg-white/40 dark:bg-gray-800/40 border border-white/10 dark:border-white/5 hover:border-primary/40 hover:bg-primary/5 dark:hover:bg-primary/10 active:scale-[0.98] transition-all duration-200 shadow-sm"
                        >
                          <div className="p-2 rounded-lg bg-primary/10 dark:bg-primary/20 flex-shrink-0 mt-0.5">
                            {preset.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-xs font-semibold text-foreground mb-1 leading-snug">
                              {preset.title}
                            </h4>
                            <p className="text-[10px] text-muted-foreground leading-normal line-clamp-2">
                              {preset.desc}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Compact Input Controls */}
            <div className="p-3 border-t bg-white/25 dark:bg-black/20 backdrop-blur-md">
              {/* File Attachments Display */}
              {attachedFiles.length > 0 && (
                <div className="mb-2 space-y-1">
                  {attachedFiles.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center gap-2 p-2 bg-white/50 dark:bg-gray-800/50 rounded-lg border border-border/30 text-xs animate-in fade-in zoom-in-95 duration-150"
                    >
                      <Paperclip size={12} className="text-muted-foreground" />
                      <span className="flex-1 truncate font-medium">{file.name}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4 hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => handleFileRemove(file.id)}
                      >
                        ×
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Enhanced Voice Recognition Error Display */}
              {speechRecognition.error && (
                <div className="mb-2 p-2 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-2 text-xs text-destructive animate-in slide-in-from-bottom-2 duration-200">
                  <AlertCircle size={14} className="flex-shrink-0" />
                  <span className="flex-1 font-medium">{speechRecognition.error}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={speechRecognition.retryListening}
                    className="h-6 text-[10px] px-2 bg-background border-destructive/20 hover:bg-destructive/10"
                  >
                    {language === 'ar' ? 'إعادة المحاولة' : 'Retry'}
                  </Button>
                </div>
              )}
              
              {/* Compact Input Bar */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="flex items-center gap-1"
              >
                <div className="flex-1 relative">
                  <Input
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={
                      speechRecognition.isListening 
                        ? (asrLanguage === 'ar' 
                            ? 'جاري الاستماع للعربية... تحدث الآن'
                            : 'Listening for English... speak now'
                          )
                        : (asrLanguage === 'ar' 
                            ? 'اكتب رسالتك أو استخدم الميكروفون للعربية...'
                            : 'Type your message or use microphone for English...'
                          )
                    }
                    className="pl-20 pr-20 h-11 bg-white/60 dark:bg-gray-900/60 border-white/20 dark:border-white/10 rounded-xl"
                    disabled={isLoading}
                  />
                  
                  {/* Left Side Controls */}
                  <div className="absolute left-2 top-1/2 transform -translate-y-1/2 flex items-center gap-1.5">
                    <FileAttachment
                      attachedFiles={attachedFiles}
                      onFileAttach={handleFileAttach}
                      onFileRemove={handleFileRemove}
                      compact={true}
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className={`h-7 w-7 rounded-lg transition-all duration-200 ${deepThinking ? 'bg-primary/20 text-primary border border-primary/20 animate-pulse' : 'hover:bg-primary/10'}`}
                      onClick={() => setDeepThinking(!deepThinking)}
                      disabled={isLoading}
                      title={language === 'ar' ? 'وضع التفكير العميق' : 'Deep Thinking Mode'}
                    >
                      <Brain size={15} />
                    </Button>
                  </div>
                  
                  {/* Enhanced Right Side Controls with Language-Aware Mic Button */}
                  <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center gap-1.5">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className={`h-7 w-7 rounded-full relative transition-all duration-300 ${
                        speechRecognition.isListening 
                          ? 'bg-red-500 text-white scale-110 shadow-lg shadow-red-500/30' 
                          : speechRecognition.error
                          ? 'bg-destructive/10 text-destructive'
                          : 'hover:bg-primary/10'
                      }`}
                      disabled={isLoading}
                      onClick={handleVoiceAssistant}
                      title={
                        speechRecognition.isListening
                          ? (language === 'ar' ? 'إيقاف الاستماع' : 'Stop listening')
                          : (asrLanguage === 'ar' 
                              ? 'مساعد صوتي للعربية'
                              : 'Voice Assistant for English'
                            )
                      }
                    >
                      {speechRecognition.isListening ? (
                        <div className="relative flex items-center justify-center">
                          <Mic size={14} className="relative z-10" />
                          <div className="mic-ripple-glow" />
                          <div className="mic-ripple-glow mic-ripple-glow-delayed" />
                        </div>
                      ) : speechRecognition.error ? (
                        <MicOff size={14} />
                      ) : (
                        <Mic size={14} />
                      )}
                    </Button>
                    <Button 
                      type="submit" 
                      size="icon" 
                      variant="default"
                      className="h-7 w-7 rounded-lg bg-primary hover:bg-primary/95 text-white"
                      disabled={isLoading || (!message.trim() && attachedFiles.length === 0)}
                    >
                      <Send size={14} />
                    </Button>
                  </div>
                </div>
              </form>
              
              {/* Enhanced Live Transcription Status with Language Display */}
              {speechRecognition.isListening && (
                <div className="mt-2 text-xs text-center text-muted-foreground animate-pulse">
                  <div className="flex items-center justify-center gap-2">
                    <div className="flex space-x-1">
                      <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-bounce" />
                      <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-bounce delay-100" />
                      <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-bounce delay-200" />
                    </div>
                    <span className="recording-status-text font-medium text-red-500">
                      {asrLanguage === 'ar' 
                        ? 'جاري الاستماع للعربية الفصحى والعامية...'
                        : 'Listening for English (verbatim capture)...'
                      }
                    </span>
                    <div className="flex space-x-1">
                      <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-bounce delay-200" />
                      <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-bounce delay-100" />
                      <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-bounce" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Share Dialog */}
          <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
            <DialogContent className="max-w-md glass-panel">
              <ShareChat
                chatId={selectedChatForShare}
                chatTitle={language === 'ar' ? 'محادثة صحية' : 'Health Chat'}
                onClose={() => setShareDialogOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </MainLayout>
  );
};

export default Chatbot;
