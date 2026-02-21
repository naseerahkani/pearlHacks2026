# MeshSentinel 🛰️

**Offline-First Peer-to-Peer Community Safety Alert System**
*Pearl Hacks 2025 · UNC Chapel Hill*

---

## What It Does

MeshSentinel broadcasts emergency alerts between devices over Wi-Fi Direct — **no internet, no router, no cell towers required**. It creates a Digital Neighborhood Watch that works precisely when everything else fails.

The core innovation is the **Trust Engine**: alerts gain credibility only when multiple *independent* devices re-broadcast them. Receiving an alert doesn't count as verification — you have to choose to relay it.

---

## How Cross-Verification Works

This is the most important concept to understand. There are three separate metrics on every alert:

### 1. Devices Reached
Every machine that **receives** the alert through the mesh. This measures how far the alert has *spread* — the size of the aware community. Receiving is passive; it doesn't mean anything about whether the alert is real.

### 2. Cross-Checks (verification)
Only devices that **re-broadcast** the alert count as a cross-check. When Machine B receives an alert from A and chooses to relay it onward, B is implicitly saying "I also witnessed this, and I'm passing it on." That's an independent verification — it cannot be faked by a single bad actor because it requires separate physical devices, in separate locations, all receiving and relaying the same signal.

**This is what determines Trust level:**
| Cross-checks | Trust Level |
|---|---|
| 0–1 | 🔴 LOW — single source, unverified |
| 2–8 | 🟡 MEDIUM — multiple independent verifications |
| 9+  | 🟢 HIGH — community-confirmed |
| Any Authorized Node | 🟢 HIGH — instantly |

### 3. Hops
How many relay jumps the alert has traveled through the mesh. Hop 0 = original broadcast. Hop 1 = first relay. This shows the depth of propagation, not the verification count.

### Why this prevents false alarms
A single bad actor presses the panic button → trust is LOW (0 cross-checks). Their neighbors' devices receive it but only relay it if they also witness the event. If nobody relays, trust stays LOW and the alert fades. Only a real emergency — where multiple independent devices in different locations all observe and relay the same event — reaches MEDIUM or HIGH trust.

---

## Auto-Discovery: No Setup Required

Every machine running MeshSentinel automatically finds its peers. You never need to type an IP address.

**How it works:**
1. Every 3 seconds, each machine broadcasts a tiny UDP announcement packet to the entire subnet: *"I'm here, I'm MeshSentinel, here's my device ID"*
2. Every machine listens for these announcements and automatically adds the sender as a known peer
3. Peers that stop announcing are automatically removed after 15 seconds
4. All alert relay uses TCP (reliable delivery) once peers are discovered

**You only need to:**
1. Put all machines on the same Wi-Fi network (or hotspot)
2. Run `python server.py` on each machine
3. Done — they find each other within ~5 seconds

The **Manage Peers** panel in the UI exists as a manual fallback (e.g. if a firewall blocks UDP port 5556) but you should never need it for a normal demo.

---

## Prerequisites

| Tool | Version | Download |
|------|---------|----------|
| Python | 3.10+ | https://python.org |
| Node.js | 18+ | https://nodejs.org |

---

## Quick Start

```bash
# 1. Install Python dependencies
pip install -r requirements.txt

# 2. Install frontend dependencies
cd meshsentinel-ui
npm install
cd ..

# 3a. Windows one-click:
start.bat

# 3b. Or manually in two terminals:
python server.py                      # Terminal 1
cd meshsentinel-ui && npm run dev     # Terminal 2

# 4. Open http://localhost:5173
```

---

## Wi-Fi Direct Setup (Windows — for real P2P demo)

### Machine A (Host):
1. Settings → Network & Internet → Mobile Hotspot → **Turn ON**
2. Note the hotspot name and password

### Machine B, C, etc.:
1. Connect to Machine A's hotspot via Wi-Fi
2. Run `python server.py`
3. That's it — auto-discovery handles the rest

**Firewall note:** If peers aren't being discovered, allow Python through Windows Firewall for private networks, and ensure UDP port 5556 and TCP port 5555 are not blocked.

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│  React Frontend (Vite, port 5173)                    │
│  ├── Live Alerts tab  — event cards with trust stats │
│  └── Network Graph tab — animated mesh visualization │
│                ↕ HTTP proxy (/api → :5000)           │
│  Flask Backend (port 5000)                           │
│  ├── Trust Engine  — cross_checks-based scoring      │
│  ├── Event Store   — devices_reached + cross_checks  │
│  └── Hop Logger    — records relay graph per event   │
│                ↕                                     │
│  TCP Socket Server (port 5555) — alert relay         │
│  UDP Discovery     (port 5556) — peer announcements  │
└──────────────────────────────────────────────────────┘
              ↕ Wi-Fi Direct / hotspot subnet
┌───────────────┐        ┌───────────────┐
│   Machine B   │  ←──→  │   Machine C   │
│ (same stack)  │        │ (same stack)  │
└───────────────┘        └───────────────┘
```

---

## Alert Packet Schema

```json
{
  "event_id":           "uuid-v4",
  "type":               "FIRE | MEDICAL | SECURITY",
  "timestamp":          1708512000,
  "device_id":          "DEVICE-AB12CD34",
  "hop_count":          0,
  "is_authorized_node": false
}
```

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/events` | All events with devices_reached, cross_checks, trust |
| POST | `/api/broadcast` | Broadcast a new alert |
| GET | `/api/peers` | Peer info — discovered + manual |
| POST | `/api/peers` | Add a peer IP manually `{"ip": "x.x.x.x"}` |
| DELETE | `/api/peers/:ip` | Remove a peer |
| GET | `/api/device` | This device's ID and IPs |
| GET | `/api/hops` | Full relay graph (nodes + edges) for Network Graph |
| POST | `/api/events/:id/authorize` | Mark as Authorized Node confirmed |
| DELETE | `/api/events` | Clear all events |
| GET | `/api/emergency-contacts` | Cached offline emergency contacts |

---

## Event Response Fields Explained

```json
{
  "event_id":            "...",
  "type":                "FIRE",
  "origin_device":       "DEVICE-AB12CD34",   // who first broadcast it
  "devices_reached":     3,                   // how many machines got it
  "devices_reached_ids": ["DEVICE-AA", ...],  // their IDs
  "cross_checks":        2,                   // how many independently re-broadcast it
  "cross_check_ids":     ["DEVICE-BB", ...],  // verifying device IDs (excludes origin)
  "max_hop":             2,                   // deepest relay chain
  "trust":               "MEDIUM",            // LOW / MEDIUM / HIGH
  "authorized_node":     false,
  "first_seen":          1708512000.0
}
```

---

## Demo Script (2 Minutes)

**Setup:** 3 laptops on the same hotspot, all running `python server.py` and `npm run dev`.

1. **(20s — Problem)** "NC ranks 5th in power outages. Ring, Nextdoor, Citizen — all go dark the moment infrastructure fails. There's also no way to know if an alert is real or a false alarm."

2. **(20s — Solution)** "MeshSentinel runs entirely over Wi-Fi Direct. No internet required. The Trust Engine verifies alerts through independent cross-checks — not a server, not a moderator — the mesh itself."

3. **(60s — Demo)**
   - Show Network Graph tab — 3 nodes visible, all auto-discovered
   - Machine A: press FIRE alert → graph shows packet traveling A → B
   - Machine B: receives, relays to C → cross-checks = 1, still LOW
   - Machine C: receives, relays back → cross-checks = 2 → **trust flips to MEDIUM live**
   - Show the alert card: devices reached = 3, cross-checks = 2, trust = MEDIUM
   - *"One bad actor can't do this. It took three independent devices to reach MEDIUM."*

4. **(20s — Impact)** "Under 3 minutes from first report to MEDIUM-trust community alert. No internet. No cell signal. No central server."

**FAQ prep:**
- *"Doesn't Bridgefy do this?"* — Bridgefy handles transport. MeshSentinel adds the trust verification layer on top — Bridgefy has no concept of cross-checks or trust levels.
- *"What about rural isolated users?"* — Out of scope for v1. Optimized for semi-urban density like a campus or neighborhood.
- *"Why does cross-check start at 0 when I broadcast?"* — By design. You can't verify your own alert. Trust is earned when *other* independent devices witness and relay it.

---

*Good luck. You've got this. 🎯*
