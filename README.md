# 🚨 Rescue Link – Tactical Emergency Response System

> A highly scalable, ultra-low-latency crisis management and emergency dispatch platform designed for real-time tactical response, live incident tracking, AI-assisted decision making, and automated citizen safety verification.

---

## 🌐 Live Demo

🔗 **Demo:** [Add Your Deployment Link Here]

---

# 📖 Project Overview

**Rescue Link** is an advanced emergency response ecosystem built to coordinate first responders, analyze crisis situations using AI, and provide a centralized command center for real-time emergency management.

The platform introduces a powerful **"God Mode" Command Center**, enabling authorities to monitor incidents live, deploy resources intelligently, track responders in real time, and broadcast emergency alerts instantly.

By combining **SpaceTimeDB**, **Mapbox**, **Google Gemini AI**, and **WhatsApp Automation**, Rescue Link delivers an end-to-end tactical response system capable of operating at massive scale with near-zero latency.

---

# ✨ Key Features

## 🗺️ Live Command Center & Real-Time Tracking

A centralized tactical dashboard providing complete operational visibility.

### Features

* Real-time incident monitoring
* Live tracking of emergency units
* Dynamic route visualization
* Tactical responder deployment
* Instant SOS visibility

### Implementation

#### Custom Mapbox Integration

* Built using **Mapbox GL JS**
* Hardware-accelerated rendering
* Custom emergency-themed map styling

#### Live Entity Tracking

Tracks multiple entity types simultaneously:

* 🚓 Police Units
* 🚑 Ambulances
* 🚒 Fire Response Teams
* 🆘 Distressed Citizens

Markers update instantly as database state changes.

#### Dynamic Geo-Routing

Integrated:

* Mapbox Directions API
* Live route generation
* Turn-by-turn path visualization

---

# ⚡ Ultra-Fast Real-Time Architecture

Powered by **SpaceTimeDB** for globally synchronized state management.

## Why SpaceTimeDB?

Instead of relying on:

* REST APIs
* Polling
* Traditional WebSockets

Rescue Link uses a unified real-time database layer for:

* Instant synchronization
* Shared state
* Event-driven updates

### Live Tables

React components subscribe directly to SpaceTimeDB tables.

Benefits:

* Zero manual synchronization
* Automatic UI updates
* Reduced backend complexity

---

## 🚨 Instant SOS Broadcasting

### MinimalSOS System

A lightweight emergency trigger that:

1. Fires SpaceTimeDB reducers
2. Creates a Severity-5 emergency event
3. Registers the user as a live rescue node
4. Broadcasts instantly across all command centers

Result:

⚡ Near-zero latency emergency activation.

---

# 🤖 AI Dispatch Coordinator

Powered by **Google Gemini 2.5 Flash**.

The AI layer transforms raw crisis inputs into actionable tactical intelligence.

---

## 🎙️ Voice Emergency Processing

Supports:

* Voice recordings
* Audio distress calls
* Speech-to-text crisis reports

The AI processes incoming communication and extracts structured emergency information.

---

## 📊 Tactical Data Extraction

Custom prompt engineering forces Gemini to return:

```json
{
  "severity": 5,
  "category": "Medical Emergency",
  "summary": "Possible cardiac arrest",
  "confidence": 0.96
}
```

This allows automated downstream dispatch workflows.

---

## 🧠 Strategic Resource Allocation

AI evaluates:

* Emergency severity
* Incident type
* Available responders
* Geographic proximity
* Response capabilities

Then recommends optimal deployment strategies.

Example:

* Dispatch nearest ambulance
* Assign secondary police unit
* Request fire support

---

## 🖼️ Crisis Image Verification

Supports image-based emergency validation.

### Capabilities

* Base64 image analysis
* Crisis detection
* Incident verification
* Confidence scoring

Example Output:

```json
{
  "isEmergency": true,
  "confidence": 92,
  "description": "Vehicle collision detected"
}
```

---

# 🎨 Premium Tactical UI/UX

Designed to resemble modern emergency operations centers.

## Design Language

### Tactical Theme

* Espresso tones
* Terracotta highlights
* High-contrast panels

### Typography

* Tracking-widest uppercase headings
* Military-inspired interface hierarchy

### Fluid Motion

Powered by **Framer Motion**.

Features:

* Slide-in tactical panels
* Smooth state transitions
* Context-aware animations

### Micro Interactions

Visual indicators include:

* Pulsing distress beacons
* Active route indicators
* Live responder status signals

---

# 📱 Automated WhatsApp Proximity Alerts

Integrated with the **Meta WhatsApp API**.

When an incident is reported:

1. Nearby users receive an automated alert
2. Users confirm safety status
3. Unsafe users can escalate immediately

---

## One-Tap Safety Verification

Users respond:

* ✅ Yes — Safe
* ❌ No — Need Assistance

---

## Live Location SOS Escalation

If a user is unsafe:

* Location shared directly via WhatsApp
* High-priority SOS created
* Appears instantly on the Dispatch Map
* Emergency units notified automatically

---

# 🏗️ Technology Stack

## Frontend

* React 19
* TypeScript
* Vite

## Styling & Animations

* Tailwind CSS v4
* Framer Motion

## Mapping & Geospatial

* Mapbox GL JS
* Mapbox Directions API

## Real-Time Backend

* SpaceTimeDB

## Artificial Intelligence

* Google Gemini 2.5 Flash
* @google/genai SDK

## Communication

* WhatsApp Meta API

## Hosting & Infrastructure

* Oracle Cloud
* Vercel

## Routing

* React Router v7

---

# 🏛️ System Architecture

```text
Citizen SOS
      │
      ▼
 SpaceTimeDB
      │
      ▼
 AI Dispatch Coordinator (Gemini)
      │
 ┌────┼─────┐
 ▼    ▼     ▼
Police Ambulance Fire
      │
      ▼
 Mapbox Live Tracking
      │
      ▼
 Command Center Dashboard
```

---

# 🚀 Future Enhancements

* Drone-assisted surveillance integration
* Satellite imagery analysis
* Predictive disaster modeling
* AI-generated evacuation planning
* Offline emergency mesh networking
* Multi-city command federation
* Disaster heatmap forecasting

