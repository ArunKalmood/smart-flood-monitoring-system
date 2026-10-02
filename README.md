# Smart Flood Monitoring and Early Warning System

An AI-enabled IoT-based flood monitoring and early warning platform that combines **ESP32 sensors, Machine Learning, Generative AI, and a React-Python web application** to monitor water levels, analyze rainfall and environmental conditions, predict flood risk, generate alerts, and support emergency response.

---

## Project Overview

Floods can cause significant damage to human life, infrastructure, agriculture, and property. Conventional flood monitoring systems often depend on manual monitoring or fixed threshold-based alerts, which may result in delayed warnings and limited situational awareness.

This project proposes a **Smart Flood Monitoring and Early Warning System** that integrates:

- IoT-based real-time environmental monitoring
- ESP32-based sensor nodes
- Machine Learning for flood-risk prediction
- Generative AI for information summarization and decision support
- Real-time flood alerts
- Emergency SOS management
- Volunteer coordination
- Emergency resource tracking
- Evacuation center management
- Route optimization
- Public information portal
- Offline-first capabilities

The system is designed to provide a centralized platform for **flood monitoring, early warning, and emergency response**.

---

#  Objectives

The major objectives of this project are:

1. Monitor water levels and environmental conditions in real time.
2. Collect sensor data using ESP32-based IoT nodes.
3. Store and process sensor and historical data.
4. Apply Machine Learning algorithms to estimate flood risk.
5. Compare multiple ML and Deep Learning models.
6. Generate timely flood-risk alerts.
7. Provide a centralized monitoring dashboard.
8. Allow users to send emergency SOS requests.
9. Enable volunteer registration and coordination.
10. Track emergency resources.
11. Manage evacuation centers.
12. Provide route information during emergencies.
13. Use Generative AI for feedback analysis and information summarization.
14. Support basic operation during temporary network failures.

---

#  System Architecture

```text
                    ┌─────────────────────────┐
                    │     Physical Environment │
                    │ Rainfall / Water Level  │
                    └────────────┬────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │          ESP32          │
                    │      IoT Sensor Node    │
                    └────────────┬────────────┘
                                 │
                           Wi-Fi / IoT
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │      Python Backend     │
                    │        FastAPI          │
                    └────────────┬────────────┘
                                 │
                ┌────────────────┼────────────────┐
                │                │                │
                ▼                ▼                ▼
        ┌─────────────┐  ┌──────────────┐  ┌──────────────┐
        │ PostgreSQL  │  │ ML Prediction│  │ Alert Engine │
        │  Database   │  │    Engine    │  │              │
        └─────────────┘  └──────┬───────┘  └──────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │   Flood Risk    │
                       │ Safe / Warning  │
                       │    / Critical   │
                       └────────┬────────┘
                                │
                   ┌────────────┴────────────┐
                   ▼                         ▼
          ┌─────────────────┐       ┌─────────────────┐
          │   React Web     │       │    GenAI Layer  │
          │    Dashboard    │       │ Explanation /   │
          │                 │       │ Summarization   │
          └────────┬────────┘       └─────────────────┘
                   │
       ┌───────────┼────────────┬───────────────┐
       ▼           ▼            ▼               ▼
     Admin       Public      Volunteers       SOS
    Dashboard    Portal      Management      System
