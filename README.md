# MeshSentinel 🛰️

**Offline-First Peer-to-Peer Community Safety Alert System**  
*Pearl Hacks 2025 · UNC Chapel Hill*

---

## What It Does

MeshSentinel broadcasts emergency alerts between Windows devices over Wi-Fi Direct — **no internet, no router, no cell towers required**. It creates a Digital Neighborhood Watch that works precisely when everything else fails.

The core innovation is the **Trust Engine**: an alert only reaches HIGH confidence when multiple nearby, independent devices witness and relay the same event — filtering out false reports at the network level.

---

## Prerequisites

| Tool | Version | Download |
|------|---------|----------|
| Python | 3.10+ | https://python.org |
| Node.js | 18+   | https://nodejs.org |
| pip | latest | (included with Python) |

---

## Quick Start (Both Machines)

### Step 1 — Clone / Download the project
```
meshsentinel/
├── server.py              ← Flask backend + socket server
├── requirements.txt
├── start.bat              ← Windows one-click launcher
├── start.sh               ← Mac/Linux launcher
└── meshsentinel-ui/       ← React frontend
    ├── src/
    │   ├── App.jsx
    │   ├── components/
    │   │   ├── Header.jsx
    │   │   ├── EventFeed.jsx
    │   │   ├── PanicButton.jsx
    │   │   ├── PeerManager.jsx
    │   │   ├── Sidebar.jsx
    │   │   └── Toast.jsx
    │   ├── main.jsx
    │   └── index.css
    ├── index.html
    ├── vite.config.js
    └── package.json
```

### Step 2 — Install dependencies

**Backend:**
```bash
pip install -r requirements.txt
```

**Frontend:**
```bash
cd meshsentinel-ui
npm install
```

### Step 3 — Start both services

**Option A: One-click (Windows)**
```
Double-click start.bat
```

**Option B: Manual (two terminals)**

Terminal 1 — Backend:
```bash
python server.py
```

Terminal 2 — Frontend:
```bash
cd meshsentinel-ui
npm run dev
```

Open **http://localhost:5173** in your browser.

---

## Wi-Fi Direct Setup (Windows — for real P2P between two machines)

### On Machine A (Host):
1. Open **Settings** → **Network & Internet** → **Mobile Hotspot**
2. Turn the hotspot **ON**
3. Note the hotspot name and password
4. Run `ipconfig` in Command Prompt
5. Find the IPv4 address under "Mobile Hotspot Adapter" (e.g., `192.168.137.1`)

### On Machine B (Client):
1. Connect to Machine A's hotspot via Wi-Fi
2. Run `ipconfig` → note Machine B's IPv4 address (e.g., `192.168.137.2`)

### Add Peer IPs (Runtime — no restart required):
In the MeshSentinel UI, click **Manage Peers** (top right) and add each machine's IP.

Or via the API:
```bash
# On Machine A — add Machine B's IP
curl -X POST http://localhost:5000/api/peers \
  -H "Content-Type: application/json" \
  -d '{"ip": "192.168.137.2"}'

# On Machine B — add Machine A's IP
curl -X POST http://localhost:5000/api/peers \
  -H "Content-Type: application/json" \
  -d '{"ip": "192.168.137.1"}'
```

### Verify connection:
```
Machine B> ping 192.168.137.1
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                          Machine A                          │
│                                                             │
│  React Frontend (Vite, port 5173)                          │
│  ├── EventFeed    — live alert dashboard (polls /api/events)│
│  ├── PanicButton  — FIRE / MEDICAL / SECURITY modal         │
│  ├── Sidebar      — offline emergency contacts              │
│  └── PeerManager  — add/remove peer IPs                     │
│                            │                                │
│              HTTP proxy (vite.config.js)                    │
│                            ↓                                │
│  Flask Backend (port 5000)                                  │
│  ├── GET  /api/events       — returns event log             │
│  ├── POST /api/broadcast    — creates + relays alert        │
│  ├── GET  /api/peers        — active connections + IPs      │
│  ├── POST /api/peers        — add peer IP                   │
│  ├── DELETE /api/peers/:ip  — remove peer IP                │
│  ├── GET  /api/device       — this device's ID              │
│  ├── POST /api/events/:id/authorize — elevate to HIGH trust │
│  └── GET  /api/emergency-contacts   — offline contacts      │
│                            │                                │
│  TCP Socket Server (port 5555)    ←────────────────────────┤──
│  └── Relays JSON packets to KNOWN_PEERS                     │  │
│                                                             │  │ Wi-Fi Direct
│  In-Memory Event Store (Python dict)                        │  │
│  Trust Engine (LOW / MEDIUM / HIGH)                         │  │
└─────────────────────────────────────────────────────────────┘  │
                                                                  │
┌─────────────────────────────────────────────────────────────┐  │
│                          Machine B  ←───────────────────────┤──
│                    (same stack, different IP)                │
└─────────────────────────────────────────────────────────────┘
```

---

## Alert Packet Schema

```json
{
  "event_id":          "550e8400-e29b-41d4-a716-446655440000",
  "type":              "FIRE | MEDICAL | SECURITY",
  "timestamp":         1708512000,
  "device_id":         "DEVICE-AB12CD34",
  "hop_count":         0,
  "verification_weight": 1,
  "confirmed_by":      ["DEVICE-AB12CD34", "DEVICE-EF56GH78"],
  "is_authorized_node": false
}
```

---

## Trust Engine

| Level  | Condition |
|--------|-----------|
| LOW    | 1 unique Device ID has reported this event |
| MEDIUM | 3+ unique Device IDs |
| HIGH   | 10+ unique Device IDs OR any Authorized Node confirmation |

Alerts fade out after **10 minutes** (frontend only).

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/events` | Get all events (sorted newest first) |
| POST | `/api/broadcast` | Broadcast a new alert |
| GET | `/api/peers` | Get peer info and connection count |
| POST | `/api/peers` | Add a peer IP `{"ip": "x.x.x.x"}` |
| DELETE | `/api/peers/:ip` | Remove a peer IP |
| GET | `/api/device` | Get this device's ID |
| POST | `/api/events/:id/authorize` | Mark event as Authorized Node confirmed |
| DELETE | `/api/events` | Clear all events |
| GET | `/api/emergency-contacts` | Get cached offline emergency contacts |

---

## Testing the Full Flow

1. Start `server.py` on both machines
2. Start `npm run dev` on both machines
3. Add each machine's IP to the other's peer list
4. Press the red **BROADCAST ALERT** button on Machine A
5. Within ~2 seconds, the alert appears on Machine B
6. Press BROADCAST ALERT on Machine B for the same event type
7. Watch the confirmation count rise and trust level update on both machines

---

## Troubleshooting

**Backend won't start:**
- Check Python 3.10+ is installed: `python --version`
- Install deps: `pip install flask flask-cors`
- Check port 5000 and 5555 are free: `netstat -ano | findstr :5000`

**Frontend can't reach backend:**
- Ensure `server.py` is running
- The Vite proxy forwards `/api` calls to `localhost:5000`
- Check browser console for CORS or connection errors

**Peer not receiving alerts:**
- Verify Wi-Fi Direct connection: `ping <peer-ip>`
- Confirm you've added the correct peer IPs via Manage Peers
- Check Windows Firewall: allow Python through for private networks
- Ensure both machines are on the same hotspot subnet

**Windows Firewall blocking port 5555:**
```
netsh advfirewall firewall add rule name="MeshSentinel" ^
  dir=in action=allow protocol=TCP localport=5555
```

---

## Demo Script (2 Minutes)

1. **Problem (20s):** "NC ranks 5th in power outages. Ring, Nextdoor — all go dark in a crisis."
2. **Solution (20s):** "MeshSentinel runs over Wi-Fi Direct. No internet. No towers. The Trust Engine verifies alerts through independent cross-checks."
3. **Demo (60s):** Press FIRE on Machine A → watch it propagate to Machine B → show trust upgrading from LOW → MEDIUM → HIGH
4. **Impact (20s):** "Under 3 minutes from first report to campus-wide high-trust alert. No infrastructure required."

**FAQ prep:**
- *"Doesn't Bridgefy do this?"* — Bridgefy is transport. MeshSentinel adds the trust verification layer.
- *"What about rural isolated users?"* — Out of scope. Optimized for semi-urban density like UNC campus.

---

*Good luck. You've got this. 🎯*
