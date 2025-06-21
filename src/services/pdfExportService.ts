import jsPDF from 'jspdf';
import { auth, database } from '@/lib/firebase';
import { ref, get } from 'firebase/database';

interface UserProfile {
  firstName: string;
  lastName: string;
  email: string;
  age: number;
  gender: string;
  dateOfBirth: string;
  height: number;
  weight: number;
  diabetesStatus: string;
  hypertensionStatus: string;
  strokeHistory: string;
  smokingStatus: string;
  bpMedicine: string;
  chronicConditions: string;
}

interface Reminder {
  title: string;
  time: string;
  days: string[];
  type: string;
}

interface GlucoseReading {
  value: number;
  timestamp: number;
}

interface ExportData {
  bmi?: number;
  bmiCategory?: string;
}

class PDFExportService {
  private addHeader(doc: jsPDF) {
    doc.setFillColor(9, 103, 210);
    doc.rect(0, 0, 210, 30, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('VitalSync Health Hub', 20, 20);
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text('Personal Health Report', 20, 26);
  }

  private async getUserProfile(): Promise<UserProfile | null> {
    const user = auth.currentUser;
    if (!user) return null;

    try {
      const snapshot = await get(ref(database, `users/${user.uid}`));
      return snapshot.val();
    } catch (error) {
      console.error('Error fetching user profile:', error);
      return null;
    }
  }

  private async getReminders(): Promise<Reminder[]> {
    const user = auth.currentUser;
    if (!user) return [];

    try {
      const snapshot = await get(ref(database, `users/${user.uid}/reminders`));
      if (!snapshot.exists()) return [];
      
      const reminders: Reminder[] = [];
      snapshot.forEach((childSnapshot) => {
        reminders.push(childSnapshot.val());
      });
      return reminders;
    } catch (error) {
      console.error('Error fetching reminders:', error);
      return [];
    }
  }

  private async getGlucoseReadings(): Promise<GlucoseReading[]> {
    const user = auth.currentUser;
    if (!user) return [];

    try {
      const snapshot = await get(ref(database, `users/${user.uid}/readings`));
      if (!snapshot.exists()) return [];
      
      const readings: GlucoseReading[] = [];
      snapshot.forEach((sessionSnapshot) => {
        sessionSnapshot.forEach((typeSnapshot) => {
          if (typeSnapshot.key === 'glucose') {
            typeSnapshot.forEach((readingSnapshot) => {
              readings.push(readingSnapshot.val());
            });
          }
        });
      });
      
      // Sort by timestamp
      return readings.sort((a, b) => a.timestamp - b.timestamp);
    } catch (error) {
      console.error('Error fetching glucose readings:', error);
      return [];
    }
  }

  private addUserInfo(doc: jsPDF, profile: UserProfile, yPos: number): number {
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Personal Information', 20, yPos);
    yPos += 10;

    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    
    const info = [
      `Name: ${profile.firstName} ${profile.lastName}`,
      `Email: ${profile.email}`,
      `Age: ${profile.age}`,
      `Gender: ${profile.gender}`,
      `Date of Birth: ${new Date(profile.dateOfBirth).toLocaleDateString()}`,
      `Height: ${profile.height} cm`,
      `Weight: ${profile.weight} kg`,
      `Diabetes Status: ${profile.diabetesStatus}`,
      `Hypertension Status: ${profile.hypertensionStatus}`,
      `Bp Medicine:${profile.bpMedicine}`,
      `Smoking Status: ${profile.smokingStatus}`
    ];

    info.forEach(item => {
      doc.text(item, 20, yPos);
      yPos += 7;
    });

    return yPos + 10;
  }

  private addBMIInfo(doc: jsPDF, bmi: number, category: string, yPos: number): number {
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('BMI Information', 20, yPos);
    yPos += 10;

    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`BMI: ${bmi.toFixed(1)}`, 20, yPos);
    yPos += 7;
    doc.text(`Category: ${category}`, 20, yPos);
    yPos += 7;

    let color = [0, 0, 0];
    if (bmi < 18.5) color = [240, 180, 41];
    else if (bmi < 25) color = [63, 145, 66];
    else if (bmi < 30) color = [240, 180, 41];
    else color = [225, 45, 57];

    doc.setTextColor(color[0], color[1], color[2]);
    doc.setFont('helvetica', 'bold');
    doc.text(`Status: ${category}`, 20, yPos);
    doc.setTextColor(0, 0, 0);

    return yPos + 15;
  }

  private addReminders(doc: jsPDF, reminders: Reminder[], yPos: number): number {
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Active Reminders', 20, yPos);
    yPos += 10;

    if (reminders.length === 0) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text('No active reminders', 20, yPos);
      return yPos + 15;
    }

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Title', 20, yPos);
    doc.text('Time', 80, yPos);
    doc.text('Days', 120, yPos);
    doc.text('Type', 160, yPos);
    yPos += 7;

    doc.setFont('helvetica', 'normal');
    reminders.forEach(reminder => {
      if (yPos > 270) {
        doc.addPage();
        yPos = 20;
      }
      
      doc.text(reminder.title.substring(0, 25), 20, yPos);
      doc.text(reminder.time, 80, yPos);
      doc.text(reminder.days.join(', '), 120, yPos);
      doc.text(reminder.type, 160, yPos);
      yPos += 6;
    });

    return yPos + 10;
  }

  private addGlucoseReadings(doc: jsPDF, readings: GlucoseReading[], yPos: number): number {
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Recent Glucose Readings', 20, yPos);
    yPos += 10;

    if (readings.length === 0) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text('No glucose readings recorded', 20, yPos);
      return yPos + 15;
    }

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Date', 20, yPos);
    doc.text('Value (mg/dL)', 80, yPos);
    doc.text('Status', 140, yPos);
    yPos += 7;

    doc.setFont('helvetica', 'normal');
    const recentReadings = readings.slice(-10);
    
    recentReadings.forEach(reading => {
      if (yPos > 270) {
        doc.addPage();
        yPos = 20;
      }
      
      const date = new Date(reading.timestamp).toLocaleDateString();
      doc.text(date, 20, yPos);
      doc.text(reading.value.toString(), 80, yPos);
      
      let status = 'Normal';
      if (reading.value < 70) status = 'Low';
      else if (reading.value > 140) status = 'High';
      
      doc.text(status, 140, yPos);
      yPos += 6;
    });

    return yPos + 10;
  }

  private addHealthRisks(doc: jsPDF, yPos: number): number {
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Health Risk Predictions', 20, yPos);
    yPos += 10;

    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text('Diabetes Risk: 35%', 20, yPos);
    yPos += 7;
    doc.text('Heart Disease Risk: 25%', 20, yPos);
    yPos += 7;

    return yPos + 15;
  }

  private addHealthRecommendations(doc: jsPDF, yPos: number): number {
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Health Recommendations', 20, yPos);
    yPos += 10;

    const recommendations = [
      'Schedule regular check-ups with your healthcare provider',
      'Monitor your blood pressure daily',
      'Maintain a balanced diet low in sodium and sugar',
      'Aim for 30 minutes of moderate exercise at least 5 days a week',
      'Ensure proper medication adherence'
    ];

    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    recommendations.forEach((rec, index) => {
      if (yPos > 270) {
        doc.addPage();
        yPos = 20;
      }
      doc.text(`• ${rec}`, 20, yPos);
      yPos += 7;
    });

    return yPos + 10;
  }

  private addFooter(doc: jsPDF) {
    const pageCount = doc.getNumberOfPages();
    const pageSize = doc.internal.pageSize;
    const pageHeight = pageSize.height || pageSize.getHeight();

    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(128, 128, 128);
      doc.text(
        `Generated on ${new Date().toLocaleDateString()} | Page ${i} of ${pageCount}`,
        20,
        pageHeight - 10
      );
      doc.text('VitalSync Health Hub', 150, pageHeight - 10);
    }
  }

  async exportToPDF(data: ExportData): Promise<void> {
    try {
      const doc = new jsPDF();
      
      // Fetch data from Firebase
      const profile = await this.getUserProfile();
      const reminders = await this.getReminders();
      const glucoseReadings = await this.getGlucoseReadings();

      if (!profile) {
        throw new Error('User profile not found');
      }

      // Add header
      this.addHeader(doc);
      
      let yPos = 45;
      
      // Add user information
      yPos = this.addUserInfo(doc, profile, yPos);
      
      // Add BMI information if available
      if (data.bmi && data.bmiCategory) {
        yPos = this.addBMIInfo(doc, data.bmi, data.bmiCategory, yPos);
      } else if (profile.height && profile.weight) {
        // Calculate BMI if not provided
        const heightM = profile.height / 100;
        const bmi = profile.weight / (heightM * heightM);
        const category = 
          bmi < 18.5 ? 'Underweight' :
          bmi < 25 ? 'Normal' :
          bmi < 30 ? 'Overweight' : 'Obese';
        yPos = this.addBMIInfo(doc, bmi, category, yPos);
      }
      
      // Add health risks
      yPos = this.addHealthRisks(doc, yPos);
      
      // Add reminders
      yPos = this.addReminders(doc, reminders, yPos);
      
      // Add glucose readings
      if (yPos > 200) {
        doc.addPage();
        yPos = 20;
      }
      yPos = this.addGlucoseReadings(doc, glucoseReadings, yPos);
      
      // Add health recommendations
      if (yPos > 200) {
        doc.addPage();
        yPos = 20;
      }
      this.addHealthRecommendations(doc, yPos);
      
      // Add footer
      this.addFooter(doc);
      
      // Save the PDF
      const fileName = `VitalSync_Report_${profile.firstName}_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);
      
      console.log('PDF exported successfully');
    } catch (error) {
      console.error('Error exporting PDF:', error);
      throw error;
    }
  }
}

export const pdfExportService = new PDFExportService();