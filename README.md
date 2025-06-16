# Health Monitoring System

An integrated health monitoring platform combining a portable wearable device, a responsive web dashboard, and a fully featured mobile application.

---

## 📝 Project Description

This project delivers a complete patient-care ecosystem developed collaboratively by our team:

* **Portable Device**: A custom-built wearable measuring blood pressure, heart rate, oxygen saturation, body temperature, and calorie burn.
* **Web Dashboard**: A React-based web application showcasing live device readings and user reports.
* **Mobile App**: A React Native (Expo) application featuring:

  * **Introduction & Authentication**: Multiple sign-up & login options (email/OTP).
  * **Home Screen**: Personalized welcome message with patient details.
  * **Chats**: Persistent support and guidance interface.
  * **Reports**: Daily health summaries, interactive charts, and notifications.
  * **Device Readings**: Real-time display of wearable data.
  * **Reminders**: Medication and test schedule alerts.
  * **Settings**: Profile management, theme selection, text-to-speech, and voice assistant options.

---

## 🚀 Getting Started

### Prerequisites

* Node.js (>=16.x)
* npm (>=8.x)
* nvm (optional, for version management)

### Installation

If you already have the project locally, install dependencies:

```bash
cd "C:/Users/ENGBa/OneDrive/Desktop/vital-sync-health-hub-11-main"
npm install
```

To clone a fresh copy:

```bash
git clone https://github.com/Bavly-Hamdy/MobileApp.git
cd MobileApp
npm install
```

### Running in Development

Start the web dashboard and mobile app concurrently:

```bash
# Web (Vite)
npm run dev:web

# Mobile (Expo)
npm run dev:mobile
```

---

## 📤 Publishing to GitHub

Use the commands below in your project root:

```bash
# Initialize git (if needed)
git init

# Add files and commit
git add .
git commit -m "Initial project upload: web, mobile, device firmware, docs"

# Link to GitHub and push
git remote add origin https://github.com/Bavly-Hamdy/MobileApp.git
git branch -M main
git push -u origin main
```

> Replace `main` with `master` if your default branch differs.

---

## 🔧 Architecture & Tech Stack

* **Front-end**: TypeScript, React, React Native (Expo)
* **Build Tools**: Vite (web)
* **Styling**: Tailwind CSS & shadcn-ui
* **Backend**: Firebase Auth & Realtime Database
* **Hardware**: MAX30100, MLX90614, AD8232, MPU6050, custom MCU firmware

---

## 🌟 Key Features

1. **Real-Time Monitoring** via wearable device.
2. **Interactive Web Dashboard** with live data and reports.
3. **Cross-Platform Mobile App** with reminders and summaries.
4. **Voice & Accessibility**: Text-to-speech and voice assistant.
5. **Persistent Chats** for ongoing support.

---

## 👥 Team Members & Roles

* **Bavly Hamdy** (Full Stack Developer)

  * Front-end (Web & Mobile)
  * Device data integration
  * UI/UX enhancements

* **Eyad Mahmoud** (Backend Engineer)

  * Firebase Auth & Database
  * API integration & CI/CD

* **Yehia Mohamed** (Data & Analytics Engineer)

  * Data processing & visualization
  * Chart development & reports

---

## 📂 Folder Structure

```text
├── web/      # React web dashboard
├── mobile/   # React Native (Expo) app
├── device/   # Firmware & schematics
└── docs/     # Documentation & specifications
```

---

## 📄 License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

---

*Built with ❤️ by our dedicated team.*
