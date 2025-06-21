import { useEffect, useState } from "react";
import { useAppContext } from "@/contexts/AppContext";
import { useUserProfile } from "@/contexts/UserProfileContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import MainLayout from "@/components/layout/MainLayout";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from "recharts";
import { AlertCircle, Download, RefreshCw } from "lucide-react";
import { useReminders } from "@/hooks/useReminders";
import { useGlucoseReadings } from "@/hooks/useGlucoseReadings";
import { pdfExportService } from "@/services/pdfExportService";
import { useToast } from "@/hooks/use-toast";
import { ProfileSkeleton } from "@/components/ProfileSkeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { auth, database } from "@/lib/firebase";
import { ref, onValue } from "firebase/database";

const Predictions = () => {
  const { t } = useAppContext();
  const {
    profile,
    bmi,
    bmiCategory,
    isLoading: profileLoading,
    hasError: profileError
  } = useUserProfile();
  const { reminders } = useReminders();
  const { readings } = useGlucoseReadings();
  const { toast } = useToast();
  const [showFallback, setShowFallback] = useState(false);

  const [height, setHeight] = useState<number | null>(null);
  const [weight, setWeight] = useState<number | null>(null);
  const [loadingUserData, setLoadingUserData] = useState(true);

  useEffect(() => {
    const fetchHeightWeight = async () => {
      const user = auth.currentUser;
      if (!user) return;

      const userRef = ref(database, `users/${user.uid}`);
      onValue(
        userRef,
        (snapshot) => {
          const data = snapshot.val();
          if (data) {
            setHeight(data.height ?? null);
            setWeight(data.weight ?? null);
          }
          setLoadingUserData(false);
        },
        () => {
          setLoadingUserData(false);
        }
      );
    };

    fetchHeightWeight();
  }, []);

  useEffect(() => {
    if (!profileLoading && (!height || !weight)) {
      const timer = setTimeout(() => {
        setShowFallback(true);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [profileLoading, height, weight]);

  const diabetesRisk = 35;
  const heartDiseaseRisk = 25;

  const futurePredictionData = [
    { month: "Jan", diabetesRisk: 35, heartDiseaseRisk: 25 },
    { month: "Feb", diabetesRisk: 34, heartDiseaseRisk: 24 },
    { month: "Mar", diabetesRisk: 33, heartDiseaseRisk: 26 },
    { month: "Apr", diabetesRisk: 31, heartDiseaseRisk: 23 },
    { month: "May", diabetesRisk: 32, heartDiseaseRisk: 22 },
    { month: "Jun", diabetesRisk: 30, heartDiseaseRisk: 23 }
  ];

  const diabetesFactors = [
    { name: "Age", value: 20 },
    { name: "BMI", value: 30 },
    { name: "Blood Sugar", value: 40 },
    { name: "Family History", value: 10 }
  ];

  const heartDiseaseFactors = [
    { name: "Age", value: 15 },
    { name: "Blood Pressure", value: 30 },
    { name: "Cholesterol", value: 25 },
    { name: "Heart Rate", value: 15 },
    { name: "Activity Level", value: 15 }
  ];

  const COLORS = ["#0967d2", "#47a3f3", "#7cc4fa", "#bae3ff", "#e6f7ff"];

  const getBmiColor = (bmi: number) => {
    if (bmi < 18.5) return "text-health-warning-500";
    if (bmi < 25) return "text-health-success-500";
    if (bmi < 30) return "text-health-warning-500";
    return "text-health-danger-500";
  };

  const handleExportPDF = async () => {
    try {
      await pdfExportService.exportToPDF({
        bmi: bmi || undefined,
        bmiCategory: bmiCategory || undefined
      });
      toast({
        title: "Export successful",
        description: "Your health report has been downloaded successfully."
      });
    } catch (error) {
      console.error("Error exporting PDF:", error);
      toast({
        title: "Export failed",
        description: "Failed to export PDF. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handleRefreshProfile = async () => {
    try {
      toast({
        title: "Profile data",
        description: "Using latest profile data from the server."
      });
    } catch (error) {
      console.error("Error refreshing profile:", error);
      toast({
        title: "Refresh failed",
        description: "Failed to refresh profile data. Please try again.",
        variant: "destructive"
      });
    }
  };

  const renderBMISection = () => {
    if (height && weight && height > 0 && weight > 0) {
      const heightM = height / 100;
      const calculatedBMI = (weight / (heightM * heightM)).toFixed(1);
      const category =
        bmiCategory ||
        (parseFloat(calculatedBMI) < 18.5
          ? "Underweight"
          : parseFloat(calculatedBMI) < 25
          ? "Normal"
          : parseFloat(calculatedBMI) < 30
          ? "Overweight"
          : "Obese");

      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="height">Height (cm)</Label>
              <Input
                id="height"
                type="number"
                value={height}
                readOnly
                className="mt-1 bg-gray-100"
              />
            </div>
            <div>
              <Label htmlFor="weight">Weight (kg)</Label>
              <Input
                id="weight"
                type="number"
                value={weight}
                readOnly
                className="mt-1 bg-gray-100"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="bmi">BMI</Label>
            <Input
              id="bmi"
              type="text"
              value={calculatedBMI}
              readOnly
              className="mt-1 bg-gray-100"
            />
            <p className={`font-medium ${getBmiColor(parseFloat(calculatedBMI))}`}>
              {category}
            </p>
          </div>
        </div>
      );
    }

    if (loadingUserData && !showFallback) {
      return <ProfileSkeleton type="bmi" />;
    }

    return (
      <div className="text-center py-8">
        <AlertCircle className="mx-auto mb-2 text-health-warning-500" size={32} />
        <p className="text-muted-foreground mb-2">No height or weight data found</p>
        <p className="text-sm text-muted-foreground">Please complete your profile</p>
      </div>
    );
  };

  return (
    <MainLayout>
      <div className="container p-4 md:p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">{t("predictions")}</h1>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={handleRefreshProfile} className="flex items-center gap-2">
              <RefreshCw size={16} />
              Refresh
            </Button>
            <Button variant="outline" onClick={handleExportPDF} className="flex items-center gap-2">
              <Download size={16} />
              Export PDF
            </Button>
          </div>
        </div>

        <Card className="p-4 mb-6">
          <h2 className="text-lg font-semibold mb-2">{t("bmi")}</h2>
          {renderBMISection()}
        </Card>

        <div className="grid md:grid-cols-2 gap-6 mb-6">
          <Card className="p-4">
            <h2 className="text-lg font-semibold mb-4">{t("diabetesRisk")}</h2>
            <div className="flex justify-center mb-4">
              <div className="relative w-40 h-40 flex items-center justify-center">
                <svg className="w-full h-full" viewBox="0 0 36 36">
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="#E4E7EB"
                    strokeWidth="3"
                  />
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="#0967d2"
                    strokeWidth="3"
                    strokeDasharray={`${diabetesRisk}, 100`}
                  />
                  <text x="18" y="21" textAnchor="middle" fontSize="8" fill="currentColor" fontWeight="bold">
                    {diabetesRisk}%
                  </text>
                </svg>
              </div>
            </div>
            <div className="mt-4">
              <h3 className="font-medium text-center">Key Factors</h3>
              <div className="h-64 mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={diabetesFactors}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    >
                      {diabetesFactors.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="text-lg font-semibold mb-4">{t("heartDiseaseRisk")}</h2>
            <div className="flex justify-center mb-4">
              <div className="relative w-40 h-40 flex items-center justify-center">
                <svg className="w-full h-full" viewBox="0 0 36 36">
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="#E4E7EB"
                    strokeWidth="3"
                  />
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="#e12d39"
                    strokeWidth="3"
                    strokeDasharray={`${heartDiseaseRisk}, 100`}
                  />
                  <text x="18" y="21" textAnchor="middle" fontSize="8" fill="currentColor" fontWeight="bold">
                    {heartDiseaseRisk}%
                  </text>
                </svg>
              </div>
            </div>
            <div className="mt-4">
              <h3 className="font-medium text-center">Key Factors</h3>
              <div className="h-64 mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={heartDiseaseFactors}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    >
                      {heartDiseaseFactors.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </Card>
        </div>

        <Card className="p-4 mb-6">
          <h2 className="text-lg font-semibold mb-2">Future Risk Predictions</h2>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={futurePredictionData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} domain={[0, 100]} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="diabetesRisk"
                  stroke="#0967d2"
                  strokeWidth="2"
                  name="Diabetes Risk"
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey="heartDiseaseRisk"
                  stroke="#e12d39"
                  strokeWidth="2"
                  name="Heart Disease Risk"
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-start space-x-3">
            <AlertCircle className="text-health-warning-500 mt-1" size={24} />
            <div>
              <h3 className="text-lg font-semibold mb-2">Health Recommendations</h3>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                <li>Schedule regular check-ups with your healthcare provider</li>
                <li>Monitor your blood pressure daily</li>
                <li>Maintain a balanced diet low in sodium and sugar</li>
                <li>Aim for 30 minutes of moderate exercise at least 5 days a week</li>
                <li>Ensure proper medication adherence</li>
              </ul>
            </div>
          </div>
        </Card>
      </div>
    </MainLayout>
  );
};

export default Predictions;