import React, { useState, useEffect, useMemo } from "react";
import { useAppContext } from "@/contexts/AppContext";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import MainLayout from "@/components/layout/MainLayout";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  ReferenceLine 
} from "recharts";
import { useGlucoseReadings } from "@/hooks/useGlucoseReadings";
import { 
  AlertCircle, 
  Plus, 
  Bluetooth, 
  Activity, 
  Heart, 
  ThermometerSun, 
  Droplet,
  Clock,
  Database,
  Smartphone,
  Info,
  CalendarDays
} from "lucide-react";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { useUserProfile } from "@/contexts/UserProfileContext";
import { useToast } from "@/hooks/use-toast";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import {
  storeHealthReading,
  storeBloodPressureReading,
  subscribeToHealthReadings,
  subscribeToBloodPressure,
  resetSession
} from "@/services/realtimeDbService";

// Custom type for Tooltip payload
type ChartDataPayload = {
  payload: {
    time: string;
    value: number;
    formattedTime: string;
  };
};

const getLatest = <T,>(arr: T[]): T | undefined => {
  if (!arr || arr.length === 0) return undefined;
  return arr.slice(-1)[0];
};

interface MetricReading {
  time: string;
  value: number;
  timestamp: number;
}

interface BPReading {
  time: string;
  systolic: number;
  diastolic: number;
  timestamp: number;
}

const Readings = () => {
  const { t, language } = useAppContext();
  const { chartData: glucoseChartData, addReading, isLoading: glucoseLoading, hasError: glucoseError } = useGlucoseReadings();
  const { profile } = useUserProfile();
  const { toast } = useToast();

  // States for BLE data
  const [bloodPressureData, setBloodPressureData] = useState<BPReading[]>([]);
  const [heartRateData, setHeartRateData] = useState<MetricReading[]>([]);
  const [temperatureData, setTemperatureData] = useState<MetricReading[]>([]);
  const [oxygenSaturationData, setOxygenSaturationData] = useState<MetricReading[]>([]);
  const [caloriesData, setCaloriesData] = useState<MetricReading[]>([]);
  const [stepsData, setStepsData] = useState<MetricReading[]>([]);
  
  const [isConnected, setIsConnected] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [userWeight, setUserWeight] = useState<number>(70); 
  const [userHeight, setUserHeight] = useState<number>(170); 
  const [device, setDevice] = useState<BluetoothDevice | null>(null);
  const [gattServer, setGattServer] = useState<BluetoothRemoteGATTServer | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

  // Manual entry dialog states
  const [isManualLogOpen, setIsManualLogOpen] = useState(false);
  const [logType, setLogType] = useState<string>("glucose");
  const [value1, setValue1] = useState<string>("");
  const [value2, setValue2] = useState<string>(""); // diastolic for BP
  const [isSubmitting, setIsSubmitting] = useState(false);

  // BLE UUIDs
  const SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
  const HEART_RATE_CHAR_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";
  const SPO2_CHAR_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a9";
  const TEMP_CHAR_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26aa";
  const BP_CHAR_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26ab";
  const STEPS_CHAR_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26ac";

  // Check Bluetooth availability
  const isBluetoothAvailable = !!navigator.bluetooth;

  // Load user profile from Firebase
  useEffect(() => {
    if (profile) {
      if (profile.weight && profile.weight >= 30 && profile.weight <= 150) {
        setUserWeight(profile.weight);
      }
      if (profile.height && profile.height >= 100 && profile.height <= 250) {
        setUserHeight(profile.height);
      }
    }
  }, [profile]);

  // Monitor authentication state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsAuthenticated(!!user);
      if (user) {
        resetSession();
      }
    });
    return () => unsubscribe();
  }, []);

  // Subscribe to health readings from Firebase Realtime DB
  useEffect(() => {
    if (!isAuthenticated) return;

    // Subscribe to heart rate readings
    const heartRateUnsubscribe = subscribeToHealthReadings('heartRate', (readings) => {
      const formattedData = readings.map(reading => ({
        time: new Date(reading.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        value: reading.value,
        timestamp: reading.timestamp
      }));
      setHeartRateData(formattedData);
    });

    // Subscribe to SpO2 readings
    const spo2Unsubscribe = subscribeToHealthReadings('spo2', (readings) => {
      const formattedData = readings.map(reading => ({
        time: new Date(reading.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        value: reading.value,
        timestamp: reading.timestamp
      }));
      setOxygenSaturationData(formattedData);
    });

    // Subscribe to temperature readings
    const temperatureUnsubscribe = subscribeToHealthReadings('temperature', (readings) => {
      const formattedData = readings.map(reading => ({
        time: new Date(reading.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        value: reading.value,
        timestamp: reading.timestamp
      }));
      setTemperatureData(formattedData);
    });

    // Subscribe to steps readings
    const stepsUnsubscribe = subscribeToHealthReadings('steps', (readings) => {
      const formattedData = readings.map(reading => ({
        time: new Date(reading.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        value: reading.value,
        timestamp: reading.timestamp
      }));
      setStepsData(formattedData);
    });

    // Subscribe to calories readings
    const caloriesUnsubscribe = subscribeToHealthReadings('calories', (readings) => {
      const formattedData = readings.map(reading => ({
        time: new Date(reading.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        value: reading.value,
        timestamp: reading.timestamp
      }));
      setCaloriesData(formattedData);
    });

    // Subscribe to blood pressure readings
    const bloodPressureUnsubscribe = subscribeToBloodPressure((readings) => {
      const formattedData = readings.map(reading => ({
        time: new Date(reading.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        systolic: reading.systolic,
        diastolic: reading.diastolic,
        timestamp: reading.timestamp
      }));
      setBloodPressureData(formattedData);
    });

    // Cleanup subscriptions
    return () => {
      heartRateUnsubscribe();
      spo2Unsubscribe();
      temperatureUnsubscribe();
      stepsUnsubscribe();
      caloriesUnsubscribe();
      bloodPressureUnsubscribe();
    };
  }, [isAuthenticated]);

  // Clean up BLE connection on unmount
  useEffect(() => {
    return () => {
      if (gattServer) {
        gattServer.disconnect();
        setIsConnected(false);
        setIsScanning(false);
        setDevice(null);
        setGattServer(null);
      }
    };
  }, [gattServer]);

  // Validate health readings
  const validateReading = (type: string, value: number): boolean => {
    switch (type) {
      case "heartRate":
        return value >= 50 && value <= 110;
      case "spo2":
        return value >= 85 && value <= 100;
      case "temperature":
        return value >= 25 && value <= 45;
      case "systolic":
        return value >= 80 && value <= 200;
      case "diastolic":
        return value >= 50 && value <= 130;
      case "glucose":
        return value >= 20 && value <= 600;
      case "steps":
        return value >= 0;
      default:
        return true;
    }
  };

  const calculateCaloriesBurned = (steps: number): number => {
    const distanceKm = steps * 0.7 / 1000; 
    const hours = distanceKm / 4; 
    const calories = 3.5 * userWeight * hours; 
    return Math.round(Math.min(calories, 1000)); 
  };

  // Store readings in Firebase
  const storeReadingInFirebase = async (reading: {
    heartRate?: number;
    spo2?: number;
    temperature?: number;
    systolic?: number;
    diastolic?: number;
    steps?: number;
    caloriesBurned?: number;
  }) => {
    if (!auth.currentUser) {
      console.error("Cannot store reading: User not authenticated");
      return;
    }
    
    try {
      // Store heart rate
      if (reading.heartRate !== undefined) {
        await storeHealthReading('heartRate', reading.heartRate);
      }
      
      // Store SpO2
      if (reading.spo2 !== undefined) {
        await storeHealthReading('spo2', reading.spo2);
      }
      
      // Store temperature
      if (reading.temperature !== undefined) {
        await storeHealthReading('temperature', reading.temperature);
      }
      
      // Store blood pressure
      if (reading.systolic !== undefined && reading.diastolic !== undefined) {
        await storeBloodPressureReading(reading.systolic, reading.diastolic);
      }
      
      // Store steps
      if (reading.steps !== undefined) {
        await storeHealthReading('steps', reading.steps);
      }
      
      // Store calories
      if (reading.caloriesBurned !== undefined) {
        await storeHealthReading('calories', reading.caloriesBurned);
      }
    } catch (error) {
      console.error("Error storing reading in Firebase:", error);
      toast({
        title: "Storage Error",
        description: "Failed to save reading to Firebase. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Connect to BLE device with retries
  const connectToDevice = async () => {
    if (!navigator.bluetooth) {
      toast({
        title: "Bluetooth Unavailable",
        description: "Please use a browser with Web Bluetooth support (e.g., Chrome).",
        variant: "destructive",
      });
      return;
    }
    if (!isAuthenticated) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to connect to your device.",
        variant: "destructive",
      });
      return;
    }
    if (isConnected) return;

    setIsScanning(true);
    const maxRetries = 3;
    let retryCount = 0;

    while (retryCount < maxRetries) {
      try {
        const device = await navigator.bluetooth.requestDevice({
          filters: [
            { name: "PortableHealthMonitor" },
            { services: [SERVICE_UUID] }
          ],
          optionalServices: [SERVICE_UUID],
        });
        setDevice(device);

        const connectWithTimeout = async (device: BluetoothDevice, timeoutMs = 10000) => {
          return Promise.race([
            device.gatt!.connect(),
            new Promise<never>((_, reject) => {
              setTimeout(() => reject(new Error("Connection timeout")), timeoutMs);
            })
          ]);
        };
        
        const server = await connectWithTimeout(device);
        setGattServer(server);
        
        const service = await server.getPrimaryService(SERVICE_UUID).catch((error) => {
          console.error("Service not found:", error);
          throw new Error(`Required service ${SERVICE_UUID} not found on device`);
        });

        device.addEventListener("gattserverdisconnected", () => {
          setIsConnected(false);
          setIsScanning(false);
          setDevice(null);
          setGattServer(null);
          toast({
            title: "Device Disconnected",
            description: "The device has been disconnected.",
            variant: "destructive",
          });
        });

        const setupCharacteristic = async (uuid: string, type: string, handler: (value: string) => void) => {
          try {
            const characteristic = await service.getCharacteristic(uuid);
            characteristic.addEventListener("characteristicvaluechanged", (event) => {
              try {
                const target = event.target as BluetoothRemoteGATTCharacteristic;
                const value = new TextDecoder().decode(target.value);
                handler(value);
              } catch (error) {
                console.error(`Error processing ${type} data:`, error);
              }
            });
            await characteristic.startNotifications();
            return true;
          } catch (error) {
            console.error(`Error setting up ${type} characteristic:`, error);
            return false;
          }
        };
        
        let successCount = 0;
        
        // HR
        const hrSuccess = await setupCharacteristic(HEART_RATE_CHAR_UUID, "Heart Rate", (value) => {
          const heartRate = parseInt(value);
          if (validateReading("heartRate", heartRate)) {
            storeReadingInFirebase({ heartRate });
          }
        });
        if (hrSuccess) successCount++;
        
        // SpO2
        const spo2Success = await setupCharacteristic(SPO2_CHAR_UUID, "SpO2", (value) => {
          const spo2 = parseInt(value);
          if (validateReading("spo2", spo2)) {
            storeReadingInFirebase({ spo2 });
          }
        });
        if (spo2Success) successCount++;
        
        // Temp
        const tempSuccess = await setupCharacteristic(TEMP_CHAR_UUID, "Temperature", (value) => {
          const temperature = parseFloat(value);
          if (validateReading("temperature", temperature)) {
            storeReadingInFirebase({ temperature });
          }
        });
        if (tempSuccess) successCount++;
        
        // BP
        const bpSuccess = await setupCharacteristic(BP_CHAR_UUID, "Blood Pressure", (value) => {
          const [systolic, diastolic] = value.split("/").map(Number);
          if (validateReading("systolic", systolic) && validateReading("diastolic", diastolic)) {
            storeReadingInFirebase({ systolic, diastolic });
          }
        });
        if (bpSuccess) successCount++;
        
        // Steps
        const stepsSuccess = await setupCharacteristic(STEPS_CHAR_UUID, "Steps", (value) => {
          const steps = parseInt(value);
          if (validateReading("steps", steps)) {
            const caloriesBurned = calculateCaloriesBurned(steps);
            storeReadingInFirebase({ steps, caloriesBurned });
          }
        });
        if (stepsSuccess) successCount++;
        
        if (successCount > 0) {
          setIsConnected(true);
          setIsScanning(false);
          toast({
            title: "Device Connected",
            description: `Successfully connected to Portable Health Monitor. ${successCount}/5 sensors active.`,
          });
          return;
        } else {
          throw new Error("Failed to set up any device characteristics");
        }
      } catch (error: any) {
        retryCount++;
        console.error(`BLE Connection Attempt ${retryCount} Failed:`, error);
        
        let errorMessage = "Could not connect to your device. Ensure it is powered on and in range.";
        if (error.name === "NotFoundError") {
          errorMessage = "Device not found. Make sure your Portable Health Monitor is powered on and in range.";
        }
        
        if (retryCount === maxRetries) {
          setIsScanning(false);
          toast({
            title: "Connection Failed",
            description: errorMessage,
            variant: "destructive",
          });
        } else {
          const backoffTime = Math.min(1000 * Math.pow(2, retryCount - 1), 5000);
          await new Promise((resolve) => setTimeout(resolve, backoffTime));
        }
      }
    }
  };

  const disconnectFromDevice = () => {
    if (gattServer) {
      gattServer.disconnect();
      setIsConnected(false);
      setIsScanning(false);
      setDevice(null);
      setGattServer(null);
      toast({
        title: "Disconnected",
        description: "Disconnected from Portable Health Monitor.",
      });
    }
  };

  // Severity Evaluators
  const getBloodPressureStatus = (systolic: number, diastolic: number) => {
    if (systolic > 180 || diastolic > 120) return { label: "critical", color: "text-red-500 bg-red-50 dark:bg-red-950/20" };
    if (systolic >= 140 || diastolic >= 90) return { label: "high", color: "text-red-500 bg-red-50 dark:bg-red-950/20" };
    if (systolic >= 130 || diastolic >= 80) return { label: "elevated", color: "text-amber-500 bg-amber-50 dark:bg-amber-950/20" };
    return { label: "normal", color: "text-green-500 bg-green-50 dark:bg-green-950/20" };
  };

  const getHeartRateStatus = (bpm: number) => {
    if (bpm < 60 || bpm > 100) return { label: bpm < 60 ? "low" : "high", color: "text-amber-500 bg-amber-50 dark:bg-amber-950/20" };
    return { label: "normal", color: "text-green-500 bg-green-50 dark:bg-green-950/20" };
  };

  const getTemperatureStatus = (celsius: number) => {
    if (celsius > 38.0) return { label: "high", color: "text-red-500 bg-red-50 dark:bg-red-950/20" };
    if (celsius > 37.2) return { label: "elevated", color: "text-amber-500 bg-amber-50 dark:bg-amber-950/20" };
    if (celsius < 36.0) return { label: "low", color: "text-amber-500 bg-amber-50 dark:bg-amber-950/20" };
    return { label: "normal", color: "text-green-500 bg-green-50 dark:bg-green-950/20" };
  };

  const getOxygenStatus = (percent: number) => {
    if (percent < 90) return { label: "critical", color: "text-red-500 bg-red-50 dark:bg-red-950/20" };
    if (percent < 95) return { label: "low", color: "text-amber-500 bg-amber-50 dark:bg-amber-950/20" };
    return { label: "normal", color: "text-green-500 bg-green-50 dark:bg-green-950/20" };
  };

  const getGlucoseStatus = (mgdl: number) => {
    if (mgdl < 70 || mgdl >= 200) return { label: mgdl < 70 ? "low" : "critical", color: "text-red-500 bg-red-50 dark:bg-red-950/20" };
    if (mgdl >= 140) return { label: "elevated", color: "text-amber-500 bg-amber-50 dark:bg-amber-950/20" };
    return { label: "normal", color: "text-green-500 bg-green-50 dark:bg-green-950/20" };
  };

  // Unified Manual Logger Submit
  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) {
      toast({
        title: "Auth Required",
        description: "Please sign in to log readings.",
        variant: "destructive"
      });
      return;
    }

    const val1 = Number(value1);
    const val2 = Number(value2);

    if (isNaN(val1) || (logType === "bloodPressure" && isNaN(val2))) {
      toast({
        title: "Invalid input",
        description: "Please enter numeric values only.",
        variant: "destructive"
      });
      return;
    }

    if (!validateReading(logType === "bloodPressure" ? "systolic" : logType, val1)) {
      toast({
        title: "Out of range",
        description: "The value logged exceeds standard safety bounds. Please verify.",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);

    try {
      if (logType === "glucose") {
        await storeHealthReading('glucose', val1);
        await addReading(val1);
      } else if (logType === "bloodPressure") {
        if (!validateReading("diastolic", val2)) {
          toast({
            title: "Out of range",
            description: "Diastolic value is out of acceptable bounds.",
            variant: "destructive"
          });
          setIsSubmitting(false);
          return;
        }
        await storeBloodPressureReading(val1, val2);
      } else {
        // heartRate, temperature, spo2, steps
        await storeHealthReading(logType as any, val1);
        if (logType === "steps") {
          const caloriesBurned = calculateCaloriesBurned(val1);
          await storeHealthReading('calories', caloriesBurned);
        }
      }

      toast({
        title: "Reading Saved",
        description: "Your health reading was successfully synchronized with Firebase.",
      });

      // Reset form
      setValue1("");
      setValue2("");
      setIsManualLogOpen(false);
    } catch (err) {
      console.error(err);
      toast({
        title: "Error Saving",
        description: "Failed to upload reading. Please check your network.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Sort Helpers for Historical Tables (newest first)
  const sortedGlucoseLogs = useMemo(() => {
    return [...glucoseChartData].reverse().slice(0, 10);
  }, [glucoseChartData]);

  const sortedBpLogs = useMemo(() => {
    return [...bloodPressureData].reverse().slice(0, 10);
  }, [bloodPressureData]);

  const sortedHrLogs = useMemo(() => {
    return [...heartRateData].reverse().slice(0, 10);
  }, [heartRateData]);

  const sortedTempLogs = useMemo(() => {
    return [...temperatureData].reverse().slice(0, 10);
  }, [temperatureData]);

  const sortedOxygenLogs = useMemo(() => {
    return [...oxygenSaturationData].reverse().slice(0, 10);
  }, [oxygenSaturationData]);

  const getMetricPlaceholderText = () => {
    switch (logType) {
      case "glucose": return "e.g., 110 mg/dL";
      case "bloodPressure": return "Systolic e.g. 120";
      case "heartRate": return "e.g., 72 bpm";
      case "temperature": return "e.g., 36.6 °C";
      case "spo2": return "e.g., 98 %";
      case "steps": return "e.g., 5000 steps";
      default: return "";
    }
  };

  return (
    <MainLayout>
      <div className="container p-4 md:p-6 max-w-md mx-auto pb-24">
        {/* Header with Manual Log Trigger */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t("readings")}</h1>
            <p className="text-xs text-muted-foreground mt-1">
              {language === "ar" ? "تتبع المؤشرات الحيوية والمزامنة" : "Track metrics and sync hardware"}
            </p>
          </div>
          
          {/* Dialog for Unified Manual Log Entry */}
          <Dialog open={isManualLogOpen} onOpenChange={setIsManualLogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-primary hover:bg-primary/95 flex items-center gap-1.5 rounded-xl shadow-md">
                <Plus size={16} />
                {language === "ar" ? "سجل قراءة" : "Log Vitals"}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[340px] rounded-2xl">
              <DialogHeader>
                <DialogTitle className="text-lg font-bold">
                  {language === "ar" ? "تسجيل مؤشر حيوي جديد" : "Log New Vital Metric"}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleManualSubmit} className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="metric-select">{language === "ar" ? "نوع المؤشر" : "Vital Type"}</Label>
                  <Select value={logType} onValueChange={(val) => {
                    setLogType(val);
                    setValue1("");
                    setValue2("");
                  }}>
                    <SelectTrigger id="metric-select" className="rounded-xl">
                      <SelectValue placeholder="Select vital sign" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="glucose">{t("glucoseLevel") || "Glucose"}</SelectItem>
                      <SelectItem value="bloodPressure">{t("bloodPressure") || "Blood Pressure"}</SelectItem>
                      <SelectItem value="heartRate">{t("heartRate") || "Heart Rate"}</SelectItem>
                      <SelectItem value="temperature">{t("temperature") || "Temperature"}</SelectItem>
                      <SelectItem value="spo2">{t("oxygenSaturation") || "Oxygen Saturation (SpO2)"}</SelectItem>
                      <SelectItem value="steps">{language === "ar" ? "الخطوات اليومية" : "Daily Steps"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="metric-value-1">
                    {logType === "bloodPressure" 
                      ? (language === "ar" ? "الضغط الانقباضي (Systolic)" : "Systolic Pressure") 
                      : (language === "ar" ? "القيمة" : "Value")
                    }
                  </Label>
                  <Input
                    id="metric-value-1"
                    type="number"
                    step="any"
                    required
                    placeholder={getMetricPlaceholderText()}
                    value={value1}
                    onChange={(e) => setValue1(e.target.value)}
                    className="rounded-xl"
                  />
                </div>

                {logType === "bloodPressure" && (
                  <div className="space-y-2">
                    <Label htmlFor="metric-value-2">
                      {language === "ar" ? "الضغط الانبساطي (Diastolic)" : "Diastolic Pressure"}
                    </Label>
                    <Input
                      id="metric-value-2"
                      type="number"
                      step="any"
                      required
                      placeholder="Diastolic e.g. 80"
                      value={value2}
                      onChange={(e) => setValue2(e.target.value)}
                      className="rounded-xl"
                    />
                  </div>
                )}

                <DialogFooter className="pt-2">
                  <Button type="submit" disabled={isSubmitting} className="w-full rounded-xl">
                    {isSubmitting ? (language === "ar" ? "جاري الحفظ..." : "Saving...") : (language === "ar" ? "حفظ القراءة" : "Save Reading")}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Tabbed View Wrapper */}
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="grid grid-cols-5 w-full bg-muted/60 p-1 rounded-xl h-11">
            <TabsTrigger value="overview" className="text-xs rounded-lg py-1.5">{language === "ar" ? "الكل" : "All"}</TabsTrigger>
            <TabsTrigger value="glucose" className="text-xs rounded-lg py-1.5">{language === "ar" ? "سكر" : "Glu"}</TabsTrigger>
            <TabsTrigger value="bp" className="text-xs rounded-lg py-1.5">{language === "ar" ? "ضغط" : "BP"}</TabsTrigger>
            <TabsTrigger value="heart" className="text-xs rounded-lg py-1.5">{language === "ar" ? "نبض" : "HR"}</TabsTrigger>
            <TabsTrigger value="vitals" className="text-xs rounded-lg py-1.5">{language === "ar" ? "حيوية" : "Vit"}</TabsTrigger>
          </TabsList>

          {/* OVERVIEW TAB */}
          <TabsContent value="overview" className="space-y-4 focus:outline-none">
            {/* BLE Connection Controls */}
            <Card className="p-4 rounded-2xl glass-panel relative overflow-hidden">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2.5 rtl:space-x-reverse">
                  <div className={`p-2 rounded-xl ${isConnected ? "bg-green-500/10 text-green-500" : "bg-primary/10 text-primary"} ${isScanning ? "animate-pulse" : ""}`}>
                    <Bluetooth size={20} />
                  </div>
                  <div>
                    <h2 className="font-semibold text-sm leading-none">{language === "ar" ? "جهاز القياس الحيوي" : "Portable Health Monitor"}</h2>
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1 mt-1">
                      <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? "bg-green-500 animate-ping" : "bg-gray-400"}`} />
                      {isConnected ? (language === "ar" ? "متصل" : "Connected") : (language === "ar" ? "غير متصل" : "Disconnected")}
                    </span>
                  </div>
                </div>

                {isBluetoothAvailable ? (
                  isAuthenticated ? (
                    isConnected ? (
                      <Button onClick={disconnectFromDevice} variant="outline" size="sm" className="rounded-xl h-8 text-xs border-red-200 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20">
                        {t("disconnectDevice")}
                      </Button>
                    ) : (
                      <Button onClick={connectToDevice} disabled={isScanning} size="sm" className="rounded-xl h-8 text-xs bg-primary hover:bg-primary/90">
                        {isScanning ? (language === "ar" ? "جاري البحث..." : "Scanning...") : t("connectDevice")}
                      </Button>
                    )
                  ) : (
                    <span className="text-[10px] text-amber-500 font-medium">{t("signInToConnect")}</span>
                  )
                ) : (
                  <span className="text-[10px] text-red-500 font-medium">{t("bluetoothNotSupported")}</span>
                )}
              </div>

              {isScanning && (
                <div className="flex flex-col items-center justify-center py-6 border border-dashed rounded-xl mb-3 bg-muted/20 animate-pulse">
                  <Bluetooth className="text-primary animate-bounce mb-2" size={32} />
                  <p className="text-xs font-semibold text-primary">{language === "ar" ? "جاري فحص الأجهزة المحيطة..." : "Searching for PortableHealthMonitor..."}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">{language === "ar" ? "تأكد من تشغيل البلوتوث والجهاز" : "Ensure BLE device is turned on and close by"}</p>
                </div>
              )}

              {/* Dynamic Connected Sensor Metrics */}
              {isConnected ? (
                <div className="space-y-2 mt-2 pt-2 border-t border-border/50">
                  <p className="text-[11px] font-semibold text-primary">{language === "ar" ? "المستشعرات النشطة بالجهاز:" : "Active Hardware Streams:"}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 rounded-xl bg-background border flex items-center space-x-2 rtl:space-x-reverse">
                      <Heart className="text-red-500 animate-pulse" size={14} />
                      <span className="text-[10px] text-muted-foreground">{language === "ar" ? "ضربات القلب (نشط)" : "Heart Rate (Active)"}</span>
                    </div>
                    <div className="p-2 rounded-xl bg-background border flex items-center space-x-2 rtl:space-x-reverse">
                      <Droplet className="text-cyan-500 animate-pulse" size={14} />
                      <span className="text-[10px] text-muted-foreground">{language === "ar" ? "أكسجين الدم (نشط)" : "Blood Oxygen (Active)"}</span>
                    </div>
                    <div className="p-2 rounded-xl bg-background border flex items-center space-x-2 rtl:space-x-reverse">
                      <ThermometerSun className="text-amber-500 animate-pulse" size={14} />
                      <span className="text-[10px] text-muted-foreground">{language === "ar" ? "حرارة الجسم (نشط)" : "Body Temp (Active)"}</span>
                    </div>
                    <div className="p-2 rounded-xl bg-background border flex items-center space-x-2 rtl:space-x-reverse">
                      <Activity className="text-blue-500 animate-pulse" size={14} />
                      <span className="text-[10px] text-muted-foreground">{language === "ar" ? "ضغط الدم (نشط)" : "Blood Pressure (Active)"}</span>
                    </div>
                    <div className="p-2 rounded-xl bg-background border flex items-center space-x-2 rtl:space-x-reverse col-span-2">
                      <Clock className="text-orange-500 animate-pulse" size={14} />
                      <span className="text-[10px] text-muted-foreground">{language === "ar" ? "حرق السعرات والخطوات (نشط)" : "Steps & Calories (Active)"}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-muted/30 rounded-xl flex items-start gap-2.5">
                  <Info size={14} className="text-muted-foreground mt-0.5" />
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    {language === "ar" 
                      ? "يدعم التطبيق التوصيل التلقائي مع أجهزة الاستشعار عبر BLE. في حال عدم توفر الجهاز، يمكنك النقر فوق زر 'سجل قراءة' لإضافة البيانات يدويًا."
                      : "This application supports direct hardware synchronization with BLE sensors. If you do not have the device, tap the 'Log Vitals' button above to record your readings manually."
                    }
                  </p>
                </div>
              )}
            </Card>

            {/* Quick Summary Widgets */}
            <div className="grid grid-cols-2 gap-3">
              <Card className="p-4 rounded-2xl glass-panel">
                <span className="text-xs text-muted-foreground block font-medium mb-1">{language === "ar" ? "نبض القلب الحالي" : "Current Pulse"}</span>
                <div className="flex items-baseline space-x-1 rtl:space-x-reverse">
                  <span className="text-2xl font-bold tracking-tight">{heartRateData[0]?.value || "--"}</span>
                  <span className="text-xs text-muted-foreground">{t("bpm")}</span>
                </div>
                <span className="text-[9px] text-muted-foreground block mt-1">
                  {heartRateData[0] ? `${language === "ar" ? "آخر تحديث" : "Last sync"} ${heartRateData[0].time}` : (language === "ar" ? "لا توجد قراءات" : "No readings recorded")}
                </span>
              </Card>

              <Card className="p-4 rounded-2xl glass-panel">
                <span className="text-xs text-muted-foreground block font-medium mb-1">{t("glucoseLevel")}</span>
                <div className="flex items-baseline space-x-1 rtl:space-x-reverse">
                  <span className="text-2xl font-bold tracking-tight">{getLatest(glucoseChartData)?.value || "--"}</span>
                  <span className="text-xs text-muted-foreground">{t("mgdL")}</span>
                </div>
                <span className="text-[9px] text-muted-foreground block mt-1">
                  {getLatest(glucoseChartData) ? (language === "ar" ? "محدث مؤخرًا" : "Synced recently") : (language === "ar" ? "لا توجد قراءات" : "No readings recorded")}
                </span>
              </Card>
            </div>
          </TabsContent>

          {/* GLUCOSE TAB */}
          <TabsContent value="glucose" className="space-y-4 focus:outline-none">
            <Card className="p-4 rounded-2xl glass-panel">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-semibold flex items-center gap-1.5">
                  <Activity className="text-emerald-500" size={16} />
                  {language === "ar" ? "مستويات السكر في الدم" : "Blood Sugar Trend"}
                </h3>
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Clock size={12} />
                  {language === "ar" ? "قراءات تفاعلية" : "Interactive logs"}
                </span>
              </div>
              <div className="h-56">
                {glucoseError ? (
                  <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                    {t("glucoseLoadError")}
                  </div>
                ) : glucoseLoading ? (
                  <div className="h-full flex items-center justify-center text-xs text-muted-foreground animate-pulse">
                    {t("loading")}
                  </div>
                ) : glucoseChartData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-muted-foreground text-center p-4">
                    {t("noGlucoseData")}
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={glucoseChartData}>
                      <defs>
                        <linearGradient id="colorGlucose" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
                      <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} domain={["dataMin - 15", "dataMax + 15"]} />
                      <Tooltip />
                      <ReferenceLine y={140} stroke="#f59e0b" strokeDasharray="3 3" strokeWidth={1} label={{ value: 'Target', position: 'top', fill: '#f59e0b', fontSize: 9 }} />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke="#10b981"
                        fillOpacity={1}
                        fill="url(#colorGlucose)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>

            {/* Glucose Logs List */}
            <Card className="p-4 rounded-2xl glass-panel">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                <Database size={16} className="text-muted-foreground" />
                {language === "ar" ? "قائمة السجلات الأخيرة" : "Historical Logs"}
              </h3>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">{language === "ar" ? "التوقيت" : "Time"}</TableHead>
                      <TableHead className="text-xs">{language === "ar" ? "القيمة" : "Level"}</TableHead>
                      <TableHead className="text-xs">{language === "ar" ? "الحالة" : "Status"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedGlucoseLogs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-xs text-muted-foreground py-6">
                          {language === "ar" ? "لا توجد سجلات" : "No logs available"}
                        </TableCell>
                      </TableRow>
                    ) : (
                      sortedGlucoseLogs.map((log, idx) => {
                        const status = getGlucoseStatus(log.value);
                        return (
                          <TableRow key={idx}>
                            <TableCell className="text-xs py-2">{log.formattedTime || log.time}</TableCell>
                            <TableCell className="text-xs font-semibold py-2">{log.value} mg/dL</TableCell>
                            <TableCell className="text-xs py-2">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${status.color}`}>
                                {t(status.label)}
                              </span>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </TabsContent>

          {/* BLOOD PRESSURE TAB */}
          <TabsContent value="bp" className="space-y-4 focus:outline-none">
            <Card className="p-4 rounded-2xl glass-panel">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-semibold flex items-center gap-1.5">
                  <Activity className="text-blue-500" size={16} />
                  {t("bloodPressure")}
                </h3>
              </div>
              <div className="h-56">
                {bloodPressureData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-muted-foreground text-center p-4">
                    {t("noBloodPressureData")}
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={bloodPressureData}>
                      <defs>
                        <linearGradient id="colorSystolic" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0967d2" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#0967d2" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorDiastolic" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#7cc4fa" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#7cc4fa" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
                      <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <ReferenceLine y={120} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'BP Target', position: 'insideTopLeft', fill: '#ef4444', fontSize: 9 }} />
                      <Area
                        type="monotone"
                        dataKey="systolic"
                        stroke="#0967d2"
                        fillOpacity={1}
                        fill="url(#colorSystolic)"
                        strokeWidth={2}
                      />
                      <Area
                        type="monotone"
                        dataKey="diastolic"
                        stroke="#7cc4fa"
                        fillOpacity={1}
                        fill="url(#colorDiastolic)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>

            {/* BP Logs */}
            <Card className="p-4 rounded-2xl glass-panel">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                <Database size={16} className="text-muted-foreground" />
                {language === "ar" ? "سجلات ضغط الدم" : "BP Logs"}
              </h3>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">{language === "ar" ? "التوقيت" : "Time"}</TableHead>
                      <TableHead className="text-xs">{language === "ar" ? "الانقباضي/الانبساطي" : "BP"}</TableHead>
                      <TableHead className="text-xs">{language === "ar" ? "الحالة" : "Status"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedBpLogs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-xs text-muted-foreground py-6">
                          {language === "ar" ? "لا توجد سجلات" : "No logs available"}
                        </TableCell>
                      </TableRow>
                    ) : (
                      sortedBpLogs.map((log, idx) => {
                        const status = getBloodPressureStatus(log.systolic, log.diastolic);
                        return (
                          <TableRow key={idx}>
                            <TableCell className="text-xs py-2">{log.time}</TableCell>
                            <TableCell className="text-xs font-semibold py-2">{log.systolic}/{log.diastolic} mmHg</TableCell>
                            <TableCell className="text-xs py-2">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${status.color}`}>
                                {t(status.label)}
                              </span>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </TabsContent>

          {/* HEART RATE TAB */}
          <TabsContent value="heart" className="space-y-4 focus:outline-none">
            <Card className="p-4 rounded-2xl glass-panel">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-semibold flex items-center gap-1.5">
                  <Heart className="text-red-500 animate-pulse" size={16} />
                  {t("heartRate")}
                </h3>
              </div>
              <div className="h-56">
                {heartRateData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-muted-foreground text-center p-4">
                    {t("noHeartRateData")}
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={heartRateData}>
                      <defs>
                        <linearGradient id="colorHeart" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
                      <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke="#ef4444"
                        fillOpacity={1}
                        fill="url(#colorHeart)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>

            {/* Pulse logs */}
            <Card className="p-4 rounded-2xl glass-panel">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                <Database size={16} className="text-muted-foreground" />
                {language === "ar" ? "سجلات نبضات القلب" : "Pulse Logs"}
              </h3>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">{language === "ar" ? "التوقيت" : "Time"}</TableHead>
                      <TableHead className="text-xs">{language === "ar" ? "النبض" : "Rate"}</TableHead>
                      <TableHead className="text-xs">{language === "ar" ? "الحالة" : "Status"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedHrLogs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-xs text-muted-foreground py-6">
                          {language === "ar" ? "لا توجد سجلات" : "No logs available"}
                        </TableCell>
                      </TableRow>
                    ) : (
                      sortedHrLogs.map((log, idx) => {
                        const status = getHeartRateStatus(log.value);
                        return (
                          <TableRow key={idx}>
                            <TableCell className="text-xs py-2">{log.time}</TableCell>
                            <TableCell className="text-xs font-semibold py-2">{log.value} bpm</TableCell>
                            <TableCell className="text-xs py-2">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${status.color}`}>
                                {t(status.label)}
                              </span>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </TabsContent>

          {/* VITALS (TEMP & SPO2) TAB */}
          <TabsContent value="vitals" className="space-y-4 focus:outline-none">
            <Card className="p-4 rounded-2xl glass-panel">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                <ThermometerSun className="text-orange-500" size={16} />
                {t("temperature")}
              </h3>
              <div className="h-44">
                {temperatureData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-muted-foreground text-center">
                    {t("noTemperatureData")}
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={temperatureData}>
                      <defs>
                        <linearGradient id="colorTemp" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
                      <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} domain={[35, 40]} />
                      <Tooltip />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke="#f59e0b"
                        fillOpacity={1}
                        fill="url(#colorTemp)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>

            <Card className="p-4 rounded-2xl glass-panel">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                <Droplet className="text-cyan-500" size={16} />
                {t("oxygenSaturation")}
              </h3>
              <div className="h-44">
                {oxygenSaturationData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-muted-foreground text-center">
                    {t("noOxygenSaturationData")}
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={oxygenSaturationData}>
                      <defs>
                        <linearGradient id="colorO2" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
                      <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} domain={[90, 100]} />
                      <Tooltip />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke="#06b6d4"
                        fillOpacity={1}
                        fill="url(#colorO2)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>

            {/* Combined Temperature & SpO2 logs */}
            <Card className="p-4 rounded-2xl glass-panel">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                <Database size={16} className="text-muted-foreground" />
                {language === "ar" ? "سجلات الحرارة والأكسجين" : "Vitals logs"}
              </h3>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">{language === "ar" ? "التوقيت" : "Time"}</TableHead>
                      <TableHead className="text-xs">{language === "ar" ? "الحرارة" : "Temp"}</TableHead>
                      <TableHead className="text-xs">{language === "ar" ? "الأكسجين" : "SpO2"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedTempLogs.length === 0 && sortedOxygenLogs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-xs text-muted-foreground py-6">
                          {language === "ar" ? "لا توجد سجلات" : "No logs available"}
                        </TableCell>
                      </TableRow>
                    ) : (
                      // Display temperature data and look up matching timestamp SpO2 if exists, or show side-by-side
                      sortedTempLogs.map((log, idx) => {
                        const spo2Log = sortedOxygenLogs.find(o => Math.abs(o.timestamp - log.timestamp) < 5000); // within 5s
                        const tStatus = getTemperatureStatus(log.value);
                        const oStatus = spo2Log ? getOxygenStatus(spo2Log.value) : null;
                        
                        return (
                          <TableRow key={idx}>
                            <TableCell className="text-xs py-2">{log.time}</TableCell>
                            <TableCell className="text-xs py-2">
                              <span className="font-semibold block">{log.value.toFixed(1)} °C</span>
                              <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${tStatus.color}`}>
                                {t(tStatus.label)}
                              </span>
                            </TableCell>
                            <TableCell className="text-xs py-2">
                              {spo2Log ? (
                                <>
                                  <span className="font-semibold block">{spo2Log.value} %</span>
                                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${oStatus?.color}`}>
                                    {t(oStatus?.label || "")}
                                  </span>
                                </>
                              ) : (
                                <span className="text-muted-foreground">--</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
};

export default Readings;
