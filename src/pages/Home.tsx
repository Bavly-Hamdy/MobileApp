import React, { useEffect, useState, useMemo } from "react";
import { useAppContext } from "@/contexts/AppContext";
import { useUserProfile } from "@/contexts/UserProfileContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import MainLayout from "@/components/layout/MainLayout";
import { 
  Activity, 
  ThermometerSun, 
  Heart, 
  Droplet, 
  Sparkles, 
  PlusCircle, 
  MessageSquare, 
  Bell, 
  Brain, 
  ChevronRight, 
  RefreshCw,
  TrendingUp,
  Award
} from "lucide-react";
import { useReminders } from "@/hooks/useReminders";
import { useGlucoseReadings } from "@/hooks/useGlucoseReadings";
import { ProfileSkeleton } from "@/components/ProfileSkeleton";
import { auth, database } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { ref, get } from "firebase/database";
import { subscribeToHealthReadings, subscribeToBloodPressure } from "@/services/realtimeDbService";
import { askGemini } from "@/api/geminiClient";
import { useNavigate } from "react-router-dom";
import "./Home.css"; 

interface VitalMetricState<T> {
  value: T;
  timestamp: Date;
  isLive: boolean;
}

const getLatest = <T,>(arr: T[]): T | undefined => {
  if (!arr || arr.length === 0) return undefined;
  return arr.slice(-1)[0];
};

const Home = () => {
  const { t, language } = useAppContext();
  const { profile, isLoading: profileLoading, hasError: profileError } = useUserProfile();
  const { reminders, isLoading: remindersLoading, hasError: remindersError, toggleComplete } = useReminders();
  const { readings: glucoseReadings } = useGlucoseReadings();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [showFallback, setShowFallback] = useState(false);
  const [firebaseFirstName, setFirebaseFirstName] = useState<string | null>(null);

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

  // AI Daily Tip state
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState<boolean>(false);

  // Authenticated state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

  // Monitor Auth and fetch firstName directly
  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      setIsAuthenticated(!!user);
      if (user) {
        const userRef = ref(database, `users/${user.uid}`);
        get(userRef)
          .then((snapshot) => {
            if (snapshot.exists()) {
              const data = snapshot.val();
              setFirebaseFirstName(data.firstName || null);
            }
          })
          .catch((error) => {
            console.error("Error fetching user data:", error);
          });
      }
    });

    return () => unsubscribeAuth();
  }, []);

  // Sync Vitals from Firebase Realtime Database
  useEffect(() => {
    if (!isAuthenticated) return;

    console.log("Setting up Realtime DB listeners for Home Page vitals");

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

  // Sync Glucose Vitals from Firestore Readings hook
  const latestGlucose = useMemo((): VitalMetricState<number> => {
    const latest = getLatest(glucoseReadings);
    if (latest) {
      return {
        value: latest.value,
        timestamp: new Date(latest.timestamp),
        isLive: true
      };
    }
    return {
      value: 110,
      timestamp: new Date(),
      isLive: false
    };
  }, [glucoseReadings]);

  // Set timeout fallback for profile loading
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowFallback(true);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  // Vitals Severity Evaluation Helpers
  const getBloodPressureStatus = (systolic: number, diastolic: number) => {
    if (systolic > 180 || diastolic > 120) return { label: "critical", severity: "critical" };
    if (systolic >= 140 || diastolic >= 90) return { label: "high", severity: "critical" };
    if (systolic >= 130 || diastolic >= 80) return { label: "elevated", severity: "warning" };
    if (systolic >= 120 && systolic < 130 && diastolic < 80) return { label: "elevated", severity: "warning" };
    return { label: "normal", severity: "normal" };
  };

  const getHeartRateStatus = (bpm: number) => {
    if (bpm < 60 || bpm > 100) return { label: bpm < 60 ? "low" : "high", severity: "warning" };
    return { label: "normal", severity: "normal" };
  };

  const getTemperatureStatus = (celsius: number) => {
    if (celsius > 38.0) return { label: "high", severity: "critical" };
    if (celsius > 37.2) return { label: "elevated", severity: "warning" };
    if (celsius < 36.0) return { label: "low", severity: "warning" };
    return { label: "normal", severity: "normal" };
  };

  const getOxygenStatus = (percent: number) => {
    if (percent < 90) return { label: "critical", severity: "critical" };
    if (percent < 95) return { label: "low", severity: "warning" };
    return { label: "normal", severity: "normal" };
  };

  const getGlucoseStatus = (mgdl: number) => {
    if (mgdl < 70 || mgdl >= 200) return { label: mgdl < 70 ? "low" : "critical", severity: "critical" };
    if (mgdl >= 140) return { label: "elevated", severity: "warning" };
    return { label: "normal", severity: "normal" };
  };

  // Severity Class mapper
  const getSeverityClasses = (severity: string) => {
    switch (severity) {
      case "normal":
        return { text: "text-health-success-500", bg: "bg-health-success-50 dark:bg-green-950/20", border: "border-health-success-100", statusClass: "status-normal" };
      case "warning":
        return { text: "text-health-warning-500", bg: "bg-health-warning-50 dark:bg-yellow-950/20", border: "border-health-warning-100", statusClass: "status-elevated" };
      case "critical":
        return { text: "text-health-danger-500", bg: "bg-health-danger-50 dark:bg-red-950/20", border: "border-health-danger-100", statusClass: "status-critical" };
      default:
        return { text: "", bg: "", border: "", statusClass: "" };
    }
  };

  // Time-of-day greeting helper
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) {
      return language === "ar" ? "صباح الخير" : "Good Morning";
    }
    if (hour >= 12 && hour < 17) {
      return language === "ar" ? "مساء الخير" : "Good Afternoon";
    }
    if (hour >= 17 && hour < 22) {
      return language === "ar" ? "مساء الخير" : "Good Evening";
    }
    return language === "ar" ? "طاب مساؤك" : "Good Night";
  };

  const getInitials = () => {
    const first = firebaseFirstName || profile?.firstName || "";
    const last = profile?.lastName || "";
    if (first && last) {
      return `${first[0]}${last[0]}`.toUpperCase();
    }
    if (first) return first[0].toUpperCase();
    return "G";
  };

  // Format Time
  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat(language === "ar" ? "ar-SA" : "en-US", {
      hour: 'numeric',
      minute: 'numeric',
      hour12: true
    }).format(date);
  };

  // Fetch AI daily health tips via Gemini
  const fetchAIInsight = async (forceRefresh = false) => {
    const userId = auth.currentUser?.uid || "guest";
    const cacheKey = `daily_health_tip_${userId}`;
    const cacheTimeKey = `${cacheKey}_time`;

    if (!forceRefresh) {
      const cachedTip = localStorage.getItem(cacheKey);
      const cachedTime = localStorage.getItem(cacheTimeKey);

      if (cachedTip && cachedTime && Date.now() - Number(cachedTime) < 4 * 60 * 60 * 1000) {
        setAiInsight(cachedTip);
        return;
      }
    }

    setAiLoading(true);
    try {
      const name = firebaseFirstName || profile?.firstName || "user";
      const ageText = profile?.age ? `Age: ${profile.age}` : "";
      const genderText = profile?.gender ? `Gender: ${profile.gender}` : "";
      const weightText = profile?.weight ? `Weight: ${profile.weight}kg` : "";
      const heightText = profile?.height ? `Height: ${profile.height}cm` : "";
      
      const conditions = [];
      if (profile?.diabetesStatus && profile.diabetesStatus !== "no") {
        conditions.push(`Diabetes: ${profile.diabetesStatus}`);
      }
      if (profile?.hypertensionStatus && profile.hypertensionStatus !== "no") {
        conditions.push(`Hypertension: ${profile.hypertensionStatus}`);
      }
      if (profile?.smokingStatus && profile.smokingStatus !== "never") {
        conditions.push(`Smoking: ${profile.smokingStatus}`);
      }

      const vitalsSummary = [
        `BP: ${bloodPressure.value.systolic}/${bloodPressure.value.diastolic} mmHg`,
        `HR: ${heartRate.value} bpm`,
        `Temp: ${temperature.value} °C`,
        `SpO2: ${spo2.value} %`,
        `Glucose: ${latestGlucose.value} mg/dL`
      ].join(", ");

      const prompt = `
        You are a medical advisor chatbot. Draft a brief, 1-2 sentence supportive, healthy advice card tailored specifically to a patient named ${name}. 
        User parameters: ${ageText} ${genderText} ${weightText} ${heightText}. Conditions: ${conditions.join(", ") || "None"}.
        Latest metrics: ${vitalsSummary}.
        Make the advice directly address these parameters if any stand out, or suggest general wellness tips (hydration, steps, sleep).
        End with a brackets disclaimer "[Disclaimer: This is AI generated advice. Consult your doctor for medical concerns.]" or in Arabic "[إخلاء مسؤولية: هذه نصيحة مدعومة بالذكاء الاصطناعي. يرجى استشارة الطبيب للمخاوف الطبية.]".
        Generate the content in ${language === 'ar' ? 'Arabic' : 'English'} according to the request. Keep it warm and polite.
      `;

      const response = await askGemini(prompt, false);
      setAiInsight(response);
      localStorage.setItem(cacheKey, response);
      localStorage.setItem(cacheTimeKey, Date.now().toString());
    } catch (error) {
      console.error("Failed to generate AI health tip:", error);
      // Localized Fallbacks
      if (language === "ar") {
        setAiInsight("تذكير صحي اليومي: تأكد من شرب 8 أكواب من الماء والمشي لمدة 30 دقيقة للحفاظ على نشاط دورتك الدموية ومستويات طاقة مستقرة. [إخلاء مسؤولية: نصيحة عامة]");
      } else {
        setAiInsight("Daily Health Reminder: Make sure to drink 8 glasses of water today and aim for a 30-minute walk to keep your circulation active and support healthy cardiac rhythms. [Disclaimer: General tip]");
      }
    } finally {
      setAiLoading(false);
    }
  };

  // Trigger AI tip on profile/metrics loaded
  useEffect(() => {
    if (!profileLoading) {
      fetchAIInsight();
    }
  }, [profileLoading, heartRate.value, bloodPressure.value.systolic, latestGlucose.value]);

  const handleToggleReminder = async (reminderId: string, completed: boolean) => {
    try {
      await toggleComplete(reminderId, !completed);
    } catch (error) {
      console.error("Error toggling reminder:", error);
      toast({
        title: "Error",
        description: "Failed to update reminder. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Reminders list rendering
  const renderReminders = () => {
    const upcomingReminders = reminders.filter(reminder => !reminder.completed).slice(0, 3);

    if (remindersLoading) {
      return (
        <div className="space-y-2 py-2">
          <div className="h-10 bg-muted animate-pulse rounded-md" />
          <div className="h-10 bg-muted animate-pulse rounded-md" />
        </div>
      );
    }

    if (remindersError) {
      return (
        <div className="text-center py-4 text-sm text-muted-foreground">
          {language === "ar" ? "تعذر تحميل التذكيرات" : "Unable to load reminders"}
        </div>
      );
    }

    if (upcomingReminders.length === 0) {
      return (
        <div className="text-center py-6 text-sm text-muted-foreground">
          <p>{language === "ar" ? "لا توجد تذكيرات قادمة اليوم" : "No upcoming reminders today"}</p>
          <Button 
            variant="link" 
            size="sm" 
            onClick={() => navigate("/reminders")}
            className="text-primary mt-1"
          >
            {language === "ar" ? "+ إضافة تذكير" : "+ Add Reminder"}
          </Button>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {upcomingReminders.map((reminder) => (
          <div key={reminder.id} className="p-3 rounded-xl border bg-background hover:bg-muted/30 transition-all flex items-center justify-between">
            <div className="flex items-center space-x-3 rtl:space-x-reverse">
              <div className={`p-2 rounded-lg ${reminder.type === 'medication' ? 'bg-blue-50 text-blue-500 dark:bg-blue-950/20' : 'bg-purple-50 text-purple-500 dark:bg-purple-950/20'}`}>
                <Bell size={16} />
              </div>
              <div>
                <h3 className="font-medium text-sm leading-none mb-1">{reminder.title}</h3>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary/70 animate-pulse" />
                  {reminder.time}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="text-xs text-health-success-500 border-health-success-200 hover:bg-health-success-50 hover:text-health-success-600 h-8"
              onClick={() => handleToggleReminder(reminder.id, reminder.completed)}
            >
              {t("done")} ✅
            </Button>
          </div>
        ))}
      </div>
    );
  };

  // Dynamic Avatar Card component
  const renderHeader = () => {
    const greeting = getGreeting();
    const name = firebaseFirstName || profile?.firstName || (language === "ar" ? "ضيف" : "Guest");

    return (
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 tracking-tight">
            {greeting}, {name}
            <span className="inline-block animate-bounce origin-bottom">👋</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            {new Date().toLocaleDateString(language === "ar" ? "ar-EG" : undefined, { 
              weekday: 'long', 
              month: 'long', 
              day: 'numeric' 
            })}
          </p>
        </div>
        
        {/* Clickable Profile Initials Badge */}
        <button 
          onClick={() => navigate("/settings")}
          className="w-11 h-11 rounded-full bg-gradient-to-tr from-primary to-accent text-primary-foreground font-semibold flex items-center justify-center shadow-md hover:scale-105 transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          aria-label="Navigate to Settings"
        >
          {profileLoading ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            getInitials()
          )}
        </button>
      </div>
    );
  };

  // AI Insight Card
  const renderAIInsightCard = () => {
    return (
      <Card className="ai-insight-card p-5 mb-6 glass-panel rounded-2xl relative">
        <div className="ai-insight-glow-element" />
        <div className="flex items-center justify-between mb-3 relative z-10">
          <div className="flex items-center space-x-2 rtl:space-x-reverse">
            <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
              <Sparkles size={18} className="animate-pulse" />
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-primary">
              {language === "ar" ? "مساعد الصحة الذكي ✦" : "Smart Health Insight ✦"}
            </span>
          </div>
          <button 
            onClick={() => fetchAIInsight(true)}
            disabled={aiLoading}
            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-full hover:bg-muted/50"
            title="Refresh tip"
          >
            <RefreshCw size={14} className={aiLoading ? "animate-spin" : ""} />
          </button>
        </div>

        <div className="relative z-10">
          {aiLoading ? (
            <div className="space-y-2 py-1">
              <div className="h-4 bg-muted shimmer-bg rounded w-full" />
              <div className="h-4 bg-muted shimmer-bg rounded w-5/6" />
            </div>
          ) : (
            <p className="text-sm font-medium leading-relaxed">
              {aiInsight || (language === "ar" ? "جاري توليد التوصيات الصحية الخاصة بك..." : "Generating your custom health recommendation...")}
            </p>
          )}
        </div>
      </Card>
    );
  };

  // Steps and Calories Circular Progress panel
  const renderGoalStatus = () => {
    const stepsGoal = 10000;
    const stepsPercent = Math.min(Math.round((steps.value / stepsGoal) * 100), 100);
    const caloriesGoal = 500;
    const caloriesPercent = Math.min(Math.round((calories.value / caloriesGoal) * 100), 100);

    return (
      <Card className="p-4 mb-6 glass-panel rounded-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Award className="text-amber-500" size={16} />
            {language === "ar" ? "أهداف النشاط اليومي" : "Daily Activity Progress"}
          </h2>
          <span className="text-xs font-medium text-primary">
            {language === "ar" ? "رائع! استمر في التحرك" : "Great job! Keep moving"}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Steps Progress */}
          <div className="flex flex-col">
            <div className="flex justify-between items-baseline mb-1">
              <span className="text-xs text-muted-foreground">{language === "ar" ? "الخطوات" : "Steps"}</span>
              <span className="text-xs font-semibold">{steps.value.toLocaleString()} / {stepsGoal.toLocaleString()}</span>
            </div>
            <div className="w-full bg-muted dark:bg-gray-800 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-gradient-to-r from-blue-500 to-indigo-500 h-full rounded-full transition-all duration-1000"
                style={{ width: `${stepsPercent}%` }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground mt-1 self-end">{stepsPercent}% {language === "ar" ? "مكتمل" : "completed"}</span>
          </div>

          {/* Calories Progress */}
          <div className="flex flex-col">
            <div className="flex justify-between items-baseline mb-1">
              <span className="text-xs text-muted-foreground">{language === "ar" ? "السعرات الحرارية" : "Calories"}</span>
              <span className="text-xs font-semibold">{calories.value} / {caloriesGoal} kcal</span>
            </div>
            <div className="w-full bg-muted dark:bg-gray-800 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-gradient-to-r from-orange-500 to-red-500 h-full rounded-full transition-all duration-1000"
                style={{ width: `${caloriesPercent}%` }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground mt-1 self-end">{caloriesPercent}% {language === "ar" ? "مكتمل" : "completed"}</span>
          </div>
        </div>
      </Card>
    );
  };

  // Quick Action Pill Launchers
  const renderQuickActions = () => {
    const actions = [
      {
        id: "log",
        title: language === "ar" ? "تسجيل القراءات" : "Log Vitals",
        icon: <PlusCircle size={20} />,
        color: "bg-blue-500/10 text-blue-500 hover:bg-blue-500/20",
        path: "/readings"
      },
      {
        id: "chat",
        title: language === "ar" ? "استشارة الذكاء" : "Ask AI",
        icon: <MessageSquare size={20} />,
        color: "bg-teal-500/10 text-teal-500 hover:bg-teal-500/20",
        path: "/chatbot"
      },
      {
        id: "remind",
        title: language === "ar" ? "التذكيرات" : "Reminders",
        icon: <Bell size={20} />,
        color: "bg-purple-500/10 text-purple-500 hover:bg-purple-500/20",
        path: "/reminders"
      },
      {
        id: "predict",
        title: language === "ar" ? "التوقعات" : "AI Report",
        icon: <Brain size={20} />,
        color: "bg-amber-500/10 text-amber-500 hover:bg-amber-500/20",
        path: "/predictions"
      }
    ];

    return (
      <div className="mb-6">
        <h2 className="text-sm font-semibold mb-3 px-1">{language === "ar" ? "الوصول السريع" : "Quick Actions"}</h2>
        <div className="grid grid-cols-4 gap-2">
          {actions.map((act) => (
            <button
              key={act.id}
              onClick={() => navigate(act.path)}
              className="quick-action-pill p-3 rounded-2xl glass-panel text-center focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <div className={`icon-container ${act.color}`}>
                {act.icon}
              </div>
              <span className="text-[11px] font-medium leading-tight text-muted-foreground hover:text-foreground">
                {act.title}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  };

  // Vitals Grid helper
  const renderVitalCard = (
    title: string,
    value: string,
    unit: string,
    status: { label: string; severity: string },
    icon: React.ReactNode,
    stateObj: VitalMetricState<any>,
    delayClass: string
  ) => {
    const sevClass = getSeverityClasses(status.severity);

    return (
      <div 
        onClick={() => navigate("/readings")}
        className={`vital-card-enhanced glass-panel p-4 rounded-2xl flex flex-col justify-between cursor-pointer animate-float-slow ${delayClass} ${sevClass.statusClass}`}
      >
        <div className="flex items-start justify-between mb-2">
          <div className="p-2 rounded-xl bg-background shadow-inner">
            {icon}
          </div>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1 ${
            stateObj.isLive 
              ? (title === t("glucoseLevel") ? "bg-blue-50 text-blue-500 dark:bg-blue-950/20" : "bg-green-50 text-green-500 dark:bg-green-950/20") 
              : "bg-gray-100 text-gray-500 dark:bg-gray-800"
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${stateObj.isLive ? (title === t("glucoseLevel") ? "bg-blue-500" : "bg-green-500 animate-pulse") : "bg-gray-400"}`} />
            {stateObj.isLive 
              ? (title === t("glucoseLevel") ? (language === "ar" ? "يدوي" : "Manual") : (language === "ar" ? "مباشر" : "Live")) 
              : (language === "ar" ? "تجريبي" : "Demo")}
          </span>
        </div>

        <div>
          <span className="text-xs text-muted-foreground block font-medium mb-1">{title}</span>
          <div className="flex items-baseline space-x-1 rtl:space-x-reverse">
            <span className="text-lg font-bold tracking-tight">{value}</span>
            <span className="text-xs text-muted-foreground font-normal">{unit}</span>
          </div>
        </div>

        <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/40">
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${sevClass.text} ${sevClass.bg}`}>
            {t(status.label)}
          </span>
          <span className="text-[9px] text-muted-foreground font-medium">
            {formatTime(stateObj.timestamp)}
          </span>
        </div>
      </div>
    );
  };

  return (
    <MainLayout>
      <div className="container p-4 md:p-6 max-w-md mx-auto pb-24">
        {/* Greetings */}
        {renderHeader()}

        {/* AI smart suggestion box */}
        {renderAIInsightCard()}

        {/* Goals widget */}
        {renderGoalStatus()}

        {/* Launchpad buttons */}
        {renderQuickActions()}

        {/* Health Readings */}
        <section className="mb-6">
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="text-primary" size={16} />
              {t("latestReading")}
            </h2>
            <Button 
              variant="link" 
              size="sm" 
              onClick={() => navigate("/readings")}
              className="text-xs text-primary p-0 flex items-center gap-1 font-medium"
            >
              {language === "ar" ? "عرض التفاصيل" : "View Details"}
              <ChevronRight size={14} />
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Blood Pressure */}
            {renderVitalCard(
              t("bloodPressure"),
              `${bloodPressure.value.systolic}/${bloodPressure.value.diastolic}`,
              t("mmHg"),
              getBloodPressureStatus(bloodPressure.value.systolic, bloodPressure.value.diastolic),
              <Activity className="text-blue-500" size={18} />,
              bloodPressure,
              "delay-100"
            )}

            {/* Heart Rate */}
            {renderVitalCard(
              t("heartRate"),
              heartRate.value.toString(),
              t("bpm"),
              getHeartRateStatus(heartRate.value),
              <Heart className="text-red-500 animate-pulse-gentle" size={18} />,
              heartRate,
              "delay-200"
            )}

            {/* Temperature */}
            {renderVitalCard(
              t("temperature"),
              temperature.value.toFixed(1),
              t("celsius"),
              getTemperatureStatus(temperature.value),
              <ThermometerSun className="text-orange-500" size={18} />,
              temperature,
              "delay-300"
            )}

            {/* Oxygen Saturation */}
            {renderVitalCard(
              t("oxygenSaturation"),
              spo2.value.toString(),
              t("percent"),
              getOxygenStatus(spo2.value),
              <Droplet className="text-cyan-500" size={18} />,
              spo2,
              "delay-400"
            )}

            {/* Glucose Level - taking up full width at bottom of grid */}
            <div className="col-span-2">
              {renderVitalCard(
                t("glucoseLevel"),
                latestGlucose.value.toString(),
                t("mgdL"),
                getGlucoseStatus(latestGlucose.value),
                <Activity className="text-emerald-500" size={18} />,
                latestGlucose,
                "delay-500"
              )}
            </div>
          </div>
        </section>

        {/* Reminders section */}
        <section>
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="text-sm font-semibold">{t("upcomingReminders")}</h2>
            <Button 
              variant="link" 
              size="sm" 
              onClick={() => navigate("/reminders")}
              className="text-xs text-primary p-0 flex items-center gap-1 font-medium"
            >
              {language === "ar" ? "إدارة الكل" : "Manage All"}
              <ChevronRight size={14} />
            </Button>
          </div>

          <Card className="p-4 glass-panel rounded-2xl">
            {renderReminders()}
          </Card>
        </section>
      </div>
    </MainLayout>
  );
};

export default Home;
