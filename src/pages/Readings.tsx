
import React, { useState } from "react";
import { useAppContext } from "@/contexts/AppContext";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import MainLayout from "@/components/layout/MainLayout";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useGlucoseReadings } from "@/hooks/useGlucoseReadings";
import { AlertCircle, Plus } from "lucide-react";

const Readings = () => {
  const { t } = useAppContext();
  const [glucoseValue, setGlucoseValue] = useState<string>("");
  const [inputError, setInputError] = useState<string>("");
  const { chartData, addReading, isLoading, hasError } = useGlucoseReadings();

  // Mock data for other charts (you can replace with real data later)
  const bloodPressureData = [
    { time: "Day 1", systolic: 120, diastolic: 80 },
    { time: "Day 2", systolic: 122, diastolic: 78 },
    { time: "Day 3", systolic: 118, diastolic: 76 },
    { time: "Day 4", systolic: 124, diastolic: 82 },
    { time: "Day 5", systolic: 121, diastolic: 79 },
    { time: "Day 6", systolic: 119, diastolic: 77 },
    { time: "Day 7", systolic: 117, diastolic: 75 },
  ];

  const heartRateData = [
    { time: "Day 1", value: 72 },
    { time: "Day 2", value: 74 },
    { time: "Day 3", value: 70 },
    { time: "Day 4", value: 76 },
    { time: "Day 5", value: 73 },
    { time: "Day 6", value: 71 },
    { time: "Day 7", value: 69 },
  ];

  const temperatureData = [
    { time: "Day 1", value: 36.8 },
    { time: "Day 2", value: 36.7 },
    { time: "Day 3", value: 36.9 },
    { time: "Day 4", value: 36.6 },
    { time: "Day 5", value: 37.0 },
    { time: "Day 6", value: 36.8 },
    { time: "Day 7", value: 36.7 },
  ];

  const oxygenSaturationData = [
    { time: "Day 1", value: 98 },
    { time: "Day 2", value: 97 },
    { time: "Day 3", value: 99 },
    { time: "Day 4", value: 97 },
    { time: "Day 5", value: 98 },
    { time: "Day 6", value: 98 },
    { time: "Day 7", value: 99 },
  ];

  const validateGlucoseInput = (value: string): boolean => {
    const numValue = Number(value);
    
    if (!value.trim()) {
      setInputError("Please enter a glucose value");
      return false;
    }
    
    if (isNaN(numValue)) {
      setInputError("Please enter a valid number");
      return false;
    }
    
    if (numValue < 20 || numValue > 600) {
      setInputError("Glucose value must be between 20-600 mg/dL");
      return false;
    }
    
    setInputError("");
    return true;
  };

  const handleGlucoseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateGlucoseInput(glucoseValue)) {
      return;
    }

    console.log(`Submitting glucose value: ${glucoseValue} mg/dL`);
    await addReading(Number(glucoseValue));
    setGlucoseValue(""); // Clear input immediately after successful submission
    setInputError("");
  };

  // Real-time glucose chart rendering
  const renderGlucoseChart = () => {
    if (hasError) {
      return (
        <div className="text-center py-8">
          <AlertCircle className="mx-auto mb-2 text-red-500" size={32} />
          <p className="text-muted-foreground">Unable to load glucose readings</p>
          <p className="text-sm text-muted-foreground">Please check your connection</p>
        </div>
      );
    }

    if (isLoading) {
      return (
        <div className="text-center py-8">
          <div className="animate-pulse text-muted-foreground">Loading readings...</div>
        </div>
      );
    }

    if (chartData.length === 0) {
      return (
        <div className="text-center py-8">
          <p className="text-muted-foreground mb-2">No glucose readings yet</p>
          <p className="text-sm text-muted-foreground">Add your first reading above to see the chart</p>
        </div>
      );
    }

    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis 
            dataKey="time" 
            tick={{ fontSize: 12 }} 
          />
          <YAxis 
            tick={{ fontSize: 12 }} 
            domain={['dataMin - 20', 'dataMax + 20']}
          />
          <Tooltip 
            formatter={(value: any, name: any) => [`${value} mg/dL`, 'Glucose Level']}
            labelFormatter={(label: any, payload: any) => {
              if (payload && payload[0] && payload[0].payload.formattedTime) {
                return payload[0].payload.formattedTime;
              }
              return label;
            }}
          />
          <Line 
            type="monotone" 
            dataKey="value" 
            stroke="#3f9142" 
            strokeWidth={2} 
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    );
  };

  return (
    <MainLayout>
      <div className="container p-4 md:p-6">
        <h1 className="text-2xl font-bold mb-6">{t("readings")}</h1>

        {/* Real-time Glucose Input and Chart */}
        <Card className="p-4 mb-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Plus size={20} className="text-green-600" />
            {t("glucoseLevel")} - Real-time Tracking
          </h2>
          
          <form onSubmit={handleGlucoseSubmit} className="mb-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div className="md:col-span-2 space-y-2">
                <Label htmlFor="glucose" className="text-sm font-medium">
                  Enter Glucose Reading (mg/dL) *
                </Label>
                <Input
                  id="glucose"
                  type="number"
                  placeholder="e.g., 120"
                  value={glucoseValue}
                  onChange={(e) => {
                    setGlucoseValue(e.target.value);
                    if (inputError) setInputError(""); // Clear error on input
                  }}
                  min="20"
                  max="600"
                  step="1"
                  required
                  className={inputError ? "border-red-500" : ""}
                />
                {inputError && (
                  <p className="text-sm text-red-500 mt-1">{inputError}</p>
                )}
              </div>
              <Button 
                type="submit" 
                disabled={isLoading || !glucoseValue.trim()}
                className="bg-green-600 hover:bg-green-700"
              >
                {isLoading ? "Adding..." : "Add Reading"}
              </Button>
            </div>
          </form>
          
          <div className="h-64">
            {renderGlucoseChart()}
          </div>
          
          {chartData.length > 0 && (
            <div className="mt-4 p-3 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">
                <strong>Latest Reading:</strong> {chartData[chartData.length - 1]?.value} mg/dL 
                <span className="ml-2">({chartData[chartData.length - 1]?.formattedTime})</span>
              </p>
              <p className="text-sm text-muted-foreground">
                <strong>Total Readings:</strong> {chartData.length}
              </p>
            </div>
          )}
        </Card>

        {/* Blood Pressure Chart */}
        <Card className="p-4 mb-6">
          <h2 className="text-lg font-semibold mb-2">{t("bloodPressure")}</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={bloodPressureData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="time" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line 
                  type="monotone" 
                  dataKey="systolic" 
                  stroke="#0967d2" 
                  strokeWidth={2} 
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
                <Line 
                  type="monotone" 
                  dataKey="diastolic" 
                  stroke="#7cc4fa" 
                  strokeWidth={2} 
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Heart Rate Chart */}
        <Card className="p-4 mb-6">
          <h2 className="text-lg font-semibold mb-2">{t("heartRate")}</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={heartRateData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="time" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line 
                  type="monotone" 
                  dataKey="value" 
                  stroke="#e12d39" 
                  strokeWidth={2} 
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Temperature Chart */}
        <Card className="p-4 mb-6">
          <h2 className="text-lg font-semibold mb-2">{t("temperature")}</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={temperatureData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="time" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} domain={[36, 37.5]} />
                <Tooltip />
                <Line 
                  type="monotone" 
                  dataKey="value" 
                  stroke="#f0b429" 
                  strokeWidth={2} 
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Oxygen Saturation Chart */}
        <Card className="p-4 mb-6">
          <h2 className="text-lg font-semibold mb-2">{t("oxygenSaturation")}</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={oxygenSaturationData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="time" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} domain={[95, 100]} />
                <Tooltip />
                <Line 
                  type="monotone" 
                  dataKey="value" 
                  stroke="#47a3f3" 
                  strokeWidth={2} 
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </MainLayout>
  );
};

export default Readings;
