# 💬 ChatPulse — WhatsApp Chat Analytics

A production-ready web application to analyze WhatsApp chat exports with a rich, interactive dashboard.

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
pip install flask flask-cors emoji
```

### 2. Run the Server

```bash
cd whatsapp-analytics
python backend/app.py
```

### 3. Open in Browser

```
http://localhost:5000
```

---

## 📂 Project Structure

```
whatsapp-analytics/
├── backend/
│   ├── app.py          # Flask server & API routes
│   ├── parser.py       # WhatsApp chat parser (multi-format)
│   └── analytics.py    # Analytics engine
├── frontend/
│   ├── templates/
│   │   └── index.html  # Main dashboard HTML
│   └── static/
│       ├── css/
│       │   └── style.css
│       └── js/
│           └── app.js
├── sample_chat.txt     # Sample chat for testing
├── requirements.txt
└── README.md
```

---

## ✨ Features

### Upload
- Drag & drop or click to upload `.txt` WhatsApp exports
- Built-in sample chat for instant demo
- File validation and error feedback

### Dashboard
- 8 key stat cards (messages, days, members, peak hour, etc.)
- Messages over time (line chart)
- Messages per user (bar chart)
- Contribution share (doughnut chart)
- Activity by hour & day of week

### Insights
- Personality badges: 👑 Group King, 👻 Ghost Member, 🦉 Night Owl, 🌅 Early Bird, 😂 Emoji King
- Activity heatmap (7 days × 24 hours)
- Top 10 emojis used
- Word frequency cloud

### User Profiles
- Individual cards for each member
- Messages, words, emoji count
- Peak activity hour
- Most-used words
- "Best time to message" suggestion

### Timeline
- Daily message volume chart
- Hourly distribution
- Day of week pattern
- Per-user best time suggestions

### UI/UX
- Dark / Light theme toggle
- Sidebar navigation
- Smooth animations & transitions
- Responsive (mobile-friendly)
- Glassmorphism-inspired cards

---

## 📱 How to Export WhatsApp Chat

1. Open WhatsApp → tap on any chat or group
2. Tap ⋮ (three dots) → **More** → **Export chat**
3. Choose **Without Media**
4. Save the `.txt` file
5. Upload it to ChatPulse

---

## 🧪 Supported Formats

| Format | Example |
|--------|---------|
| Android 12hr | `12/31/21, 11:59 PM - Name: Message` |
| Android 24hr | `12/31/21, 23:59 - Name: Message` |
| iOS 12hr | `[12/31/21, 11:59:00 PM] Name: Message` |
| iOS 24hr | `[12/31/21, 23:59:00] Name: Message` |
| Web 24hr | `31/12/2021, 23:59 - Name: Message` |

---

## 🔒 Privacy

All processing happens locally on your machine. No data is sent to any external server or stored permanently.
