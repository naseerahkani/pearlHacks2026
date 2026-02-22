"""
MeshSentinel - Offline-First P2P Community Safety Alert System
Backend: Flask REST API + TCP Socket Server + UDP Auto-Discovery + Hop Graph

Cross-verification model:
  - devices_reached : set of device IDs that have *received* this alert
  - cross_checks    : set of device IDs that have *re-broadcast* (relayed) this alert
                      i.e. independently witnessed it and passed it on
  - Trust is based on cross_checks count (independent verifications), not receipt count
"""

import json
import socket
import threading
import uuid
import time
import logging

try:
    import netifaces
    HAS_NETIFACES = True
except ImportError:
    HAS_NETIFACES = False

from flask import Flask, request, jsonify
from flask_cors import CORS

# ─────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────

SOCKET_PORT        = 5555
FLASK_PORT         = 5000
DISCOVERY_PORT     = 5556
DISCOVERY_INTERVAL = 3
PEER_TIMEOUT       = 15

MY_DEVICE_ID = f"DEVICE-{uuid.uuid4().hex[:8].upper()}"

# ─────────────────────────────────────────────
# In-Memory State
# ─────────────────────────────────────────────

event_log: dict = {}
# { event_id: {
#     packet           : original packet dict
#     devices_reached  : set of device IDs that received this alert
#     cross_checks     : set of device IDs that re-broadcast (verified) it
#     authorized_node  : bool — any authorized node confirmed it
#     trust            : "LOW" | "MEDIUM" | "HIGH"
#     max_hop          : highest hop number seen
#     first_seen       : unix timestamp
# }}

hop_log: dict = {}
# { event_id: [ { from_device, to_device, hop, ts, from_ip, to_ip } ] }

manual_peers:    list = []
discovered_peers: dict = {}   # { ip: last_seen_timestamp }
active_connections: list = []

peers_lock     = threading.Lock()
discovery_lock = threading.Lock()
event_lock     = threading.Lock()
hop_lock       = threading.Lock()

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(levelname)s %(message)s")
log = logging.getLogger("MeshSentinel")

# ─────────────────────────────────────────────
# Network Helpers
# ─────────────────────────────────────────────

def get_my_ips() -> list:
    ips = []
    if HAS_NETIFACES:
        try:
            for iface in netifaces.interfaces():
                addrs = netifaces.ifaddresses(iface)
                for a in addrs.get(netifaces.AF_INET, []):
                    ip = a.get("addr", "")
                    if ip and not ip.startswith("127."):
                        ips.append(ip)
        except Exception:
            pass
    if not ips:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ips.append(s.getsockname()[0])
            s.close()
        except Exception:
            ips.append("127.0.0.1")
    return ips


def get_broadcast_addresses() -> list:
    broadcasts = []
    if HAS_NETIFACES:
        try:
            for iface in netifaces.interfaces():
                addrs = netifaces.ifaddresses(iface)
                for a in addrs.get(netifaces.AF_INET, []):
                    bcast = a.get("broadcast", "")
                    if bcast and not bcast.startswith("127."):
                        broadcasts.append(bcast)
        except Exception:
            pass
    if not broadcasts:
        for ip in get_my_ips():
            parts = ip.rsplit(".", 1)
            if len(parts) == 2:
                broadcasts.append(parts[0] + ".255")
        broadcasts.append("255.255.255.255")
    return list(set(broadcasts))


def get_all_known_peers() -> list:
    now    = time.time()
    my_ips = set(get_my_ips())
    with discovery_lock:
        alive = [ip for ip, ts in discovered_peers.items()
                 if now - ts < PEER_TIMEOUT and ip not in my_ips]
    with peers_lock:
        manual = [ip for ip in manual_peers if ip not in my_ips]
    return list(set(alive + manual))

# ─────────────────────────────────────────────
# Trust Engine
# ─────────────────────────────────────────────

def calculate_trust(event_id: str) -> str:
    """
    Trust is based solely on independent cross-checks:
    how many *different* devices have re-broadcast this alert.
    A single device broadcasting does not count as a cross-check.
    """
    entry = event_log.get(event_id, {})
    if entry.get("authorized_node"):
        return "HIGH"
    # cross_checks is a set of device IDs that relayed the alert
    # exclude the original broadcaster from the cross-check count
    original = entry.get("packet", {}).get("device_id", "")
    checks = entry.get("cross_checks", set()) - {original}
    count = len(checks)
    if count >= 9:  return "HIGH"
    if count >= 2:  return "MEDIUM"
    return "LOW"

# ─────────────────────────────────────────────
# Hop Graph Recording
# ─────────────────────────────────────────────

def record_hop(event_id: str, from_device: str, to_device: str,
               hop_num: int, from_ip: str = "", to_ip: str = ""):
    with hop_lock:
        if event_id not in hop_log:
            hop_log[event_id] = []
        existing = [(h["from_device"], h["to_device"]) for h in hop_log[event_id]]
        if (from_device, to_device) not in existing:
            hop_log[event_id].append({
                "from_device": from_device,
                "to_device":   to_device,
                "hop":         hop_num,
                "ts":          time.time(),
                "from_ip":     from_ip,
                "to_ip":       to_ip,
            })

# ─────────────────────────────────────────────
# Packet Handling
# ─────────────────────────────────────────────

def handle_packet(packet: dict, relay: bool = True, received_from_ip: str = ""):
    """
    Process an incoming alert packet.

    relay=True  + received_from_ip=""  → originated here (UI broadcast button)
                                          Always send to peers. Not a cross-check.
    relay=True  + received_from_ip set → arrived via TCP from a peer.
                                          Send to peers (mesh relay). IS a cross-check.
    relay=False                         → internal only, no forwarding.

    devices_reached: every machine that receives the alert.  Measures spread.
    cross_checks:    machines that re-broadcast it (excluding original sender). Measures trust.
    """
    eid = packet.get("event_id")
    if not eid:
        return

    sender_device   = packet.get("device_id", "UNKNOWN")
    hop_num         = packet.get("hop_count", 0)
    my_device       = MY_DEVICE_ID
    my_ip           = get_my_ips()[0] if get_my_ips() else ""
    from_peer       = bool(received_from_ip)   # True only when received over TCP from another machine

    # Record relay graph edge: sender → this machine (only for incoming peer packets)
    if from_peer:
        record_hop(eid, sender_device, my_device, hop_num,
                   from_ip=received_from_ip, to_ip=my_ip)

    with event_lock:
        is_new = eid not in event_log
        if is_new:
            event_log[eid] = {
                "packet":          packet,
                "devices_reached": set(),
                "cross_checks":    set(),
                "authorized_node": bool(packet.get("is_authorized_node")),
                "trust":           "LOW",
                "max_hop":         0,
                "first_seen":      time.time(),
            }
            log.info(f"New event {eid[:8]}… type={packet.get('type')} description='{packet.get('description','')}'")
        else:
            # Already seen this event_id — ignore duplicate relays to prevent loops
            # but still update cross_checks if this is a new peer relaying it
            if from_peer:
                event_log[eid]["cross_checks"].add(sender_device)
                event_log[eid]["trust"] = calculate_trust(eid)
            return  # ← stop here, don't re-relay duplicates

        entry = event_log[eid]
        entry["devices_reached"].add(my_device)
        entry["devices_reached"].add(sender_device)
        entry["max_hop"] = max(entry["max_hop"], hop_num)

        if packet.get("is_authorized_node"):
            entry["authorized_node"] = True

        entry["trust"] = calculate_trust(eid)

    # Relay outward to all known peers
    if relay:
        # If this packet came from a peer (not from our own UI), we are a cross-check
        if from_peer:
            with event_lock:
                event_log[eid]["cross_checks"].add(my_device)
                event_log[eid]["trust"] = calculate_trust(eid)
            log.info(f"✓ Cross-check: {my_device[-8:]} verified event {eid[:8]}…")

        augmented = dict(packet)
        augmented["hop_count"] = hop_num + 1
        augmented["device_id"] = my_device
        relay_to_peers(augmented, origin_event_id=eid)

# ─────────────────────────────────────────────
# TCP Socket Layer
# ─────────────────────────────────────────────

def handle_connection(conn, addr):
    peer_ip = addr[0]
    try:
        with peers_lock:
            active_connections.append(conn)
        log.info(f"TCP peer connected: {addr}")
        buffer = b""
        while True:
            chunk = conn.recv(4096)
            if not chunk:
                break
            buffer += chunk
            while b"\n" in buffer:
                line, buffer = buffer.split(b"\n", 1)
                line = line.strip()
                if line:
                    try:
                        pkt = json.loads(line.decode())
                        handle_packet(pkt, received_from_ip=peer_ip)
                    except json.JSONDecodeError as e:
                        log.warning(f"Bad packet from {addr}: {e}")
    except Exception as e:
        log.warning(f"TCP error {addr}: {e}")
    finally:
        with peers_lock:
            if conn in active_connections:
                active_connections.remove(conn)
        conn.close()


def start_socket_server():
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(("0.0.0.0", SOCKET_PORT))
    srv.listen(10)
    log.info(f"TCP server on port {SOCKET_PORT}")
    while True:
        try:
            conn, addr = srv.accept()
            threading.Thread(target=handle_connection, args=(conn, addr), daemon=True).start()
        except Exception as e:
            log.error(f"TCP server error: {e}")


def relay_to_peers(packet: dict, origin_event_id: str = ""):
    data = (json.dumps(packet) + "\n").encode()
    my_device = MY_DEVICE_ID
    hop_num   = packet.get("hop_count", 0)

    for peer_ip in get_all_known_peers():
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(2)
            s.connect((peer_ip, SOCKET_PORT))
            s.sendall(data)
            s.close()
            # Record outgoing graph edge
            if origin_event_id:
                record_hop(origin_event_id, my_device, f"PEER@{peer_ip}",
                           hop_num,
                           from_ip=get_my_ips()[0] if get_my_ips() else "",
                           to_ip=peer_ip)
        except Exception as e:
            log.debug(f"Could not reach peer {peer_ip}: {e}")

# ─────────────────────────────────────────────
# UDP Auto-Discovery
# ─────────────────────────────────────────────

DISCOVERY_MAGIC = b"MESHSENTINEL_HELLO_v1|"

def build_announcement() -> bytes:
    meta = json.dumps({
        "device_id":  MY_DEVICE_ID,
        "tcp_port":   SOCKET_PORT,
        "flask_port": FLASK_PORT,
        "version":    "1.0",
    }).encode()
    return DISCOVERY_MAGIC + meta


def start_discovery_announcer():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    payload = build_announcement()
    log.info(f"UDP announcer started (every {DISCOVERY_INTERVAL}s)")
    while True:
        try:
            for bcast in get_broadcast_addresses():
                try:
                    sock.sendto(payload, (bcast, DISCOVERY_PORT))
                except Exception as e:
                    log.debug(f"Announce to {bcast} failed: {e}")
        except Exception as e:
            log.warning(f"Announcer error: {e}")
        time.sleep(DISCOVERY_INTERVAL)


def start_discovery_listener():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEPORT, 1)
    except (AttributeError, OSError):
        pass
    sock.bind(("0.0.0.0", DISCOVERY_PORT))
    sock.settimeout(5)
    log.info(f"UDP listener on port {DISCOVERY_PORT}")

    while True:
        try:
            data, addr = sock.recvfrom(2048)
            peer_ip = addr[0]
            my_ips  = set(get_my_ips())
            if peer_ip in my_ips:
                continue
            if not data.startswith(DISCOVERY_MAGIC):
                continue
            try:
                meta = json.loads(data[len(DISCOVERY_MAGIC):].decode())
            except Exception:
                continue
            with discovery_lock:
                is_new = peer_ip not in discovered_peers
                discovered_peers[peer_ip] = time.time()
            if is_new:
                log.info(f"✅ Discovered peer: {peer_ip} [{meta.get('device_id','?')}]")
        except socket.timeout:
            continue
        except Exception as e:
            log.warning(f"Discovery listener error: {e}")
            time.sleep(1)


def start_peer_reaper():
    while True:
        time.sleep(PEER_TIMEOUT)
        now = time.time()
        with discovery_lock:
            expired = [ip for ip, ts in discovered_peers.items() if now - ts > PEER_TIMEOUT]
            for ip in expired:
                del discovered_peers[ip]
                log.info(f"⏰ Peer timed out: {ip}")

# ─────────────────────────────────────────────
# Flask Application
# ─────────────────────────────────────────────

app = Flask(__name__)
CORS(app)


def serialize_event(eid: str) -> dict:
    entry = event_log[eid]
    p     = entry["packet"]
    original = p.get("device_id", "")
    # cross_checks excludes the original broadcaster
    verified_checks = entry["cross_checks"] - {original}
    return {
        "event_id":           eid,
        "type":               p.get("type", "UNKNOWN"),
        "timestamp":          p.get("timestamp", 0),
        "origin_device":      original,
        "max_hop":            entry["max_hop"],
        # How many unique devices have received this alert
        "devices_reached":    len(entry["devices_reached"]),
        "devices_reached_ids": list(entry["devices_reached"]),
        # How many devices independently re-broadcast it (verified it)
        "cross_checks":       len(verified_checks),
        "cross_check_ids":    list(verified_checks),
        "trust":              entry["trust"],
        "authorized_node":    entry["authorized_node"],
        "first_seen":         entry["first_seen"],
        "is_authorized_node": p.get("is_authorized_node", False),
        "description":        p.get("description", ""),
        "location":           p.get("location", ""),
    }


@app.route("/api/events", methods=["GET"])
def get_events():
    with event_lock:
        events = [serialize_event(eid) for eid in event_log]
    events.sort(key=lambda e: e["first_seen"], reverse=True)
    return jsonify(events)


@app.route("/api/broadcast", methods=["POST"])
def broadcast():
    data = request.get_json(force=True)
    for field in ["event_id", "type", "device_id"]:
        if field not in data:
            return jsonify({"error": f"Missing field: {field}"}), 400
    packet = {
        "event_id":            data["event_id"],
        "type":                data["type"],
        "timestamp":           data.get("timestamp", int(time.time())),
        "device_id":           data["device_id"],
        "hop_count":           0,
        "is_authorized_node":  data.get("is_authorized_node", False),
        "description":         data.get("description", "").strip()[:280],
        "location":            data.get("location", "").strip()[:100],
    }
    handle_packet(packet, relay=True)
    return jsonify({"status": "ok", "event_id": packet["event_id"]})


@app.route("/api/peers", methods=["GET"])
def get_peers():
    with peers_lock:
        active = len(active_connections)
    now = time.time()
    with discovery_lock:
        disc = [{"ip": ip, "last_seen_ago": round(now - ts, 1), "source": "auto"}
                for ip, ts in discovered_peers.items() if now - ts < PEER_TIMEOUT]
    with peers_lock:
        manual = [{"ip": ip, "source": "manual"} for ip in manual_peers]
    return jsonify({
        "active_connections": active,
        "known_peers":        get_all_known_peers(),
        "discovered_peers":   disc,
        "manual_peers":       manual,
        "device_id":          MY_DEVICE_ID,
        "my_ips":             get_my_ips(),
    })


@app.route("/api/peers", methods=["POST"])
def add_peer():
    data = request.get_json(force=True)
    ip = data.get("ip", "").strip()
    if not ip:
        return jsonify({"error": "Missing 'ip' field"}), 400
    with peers_lock:
        if ip not in manual_peers:
            manual_peers.append(ip)
    return jsonify({"status": "ok", "known_peers": get_all_known_peers()})


@app.route("/api/peers/<ip>", methods=["DELETE"])
def remove_peer(ip: str):
    with peers_lock:
        if ip in manual_peers:
            manual_peers.remove(ip)
    with discovery_lock:
        discovered_peers.pop(ip, None)
    return jsonify({"status": "ok", "known_peers": get_all_known_peers()})


@app.route("/api/device", methods=["GET"])
def get_device():
    return jsonify({"device_id": MY_DEVICE_ID, "my_ips": get_my_ips()})


@app.route("/api/hops", methods=["GET"])
def get_hops():
    filter_eid = request.args.get("event_id", None)
    node_set   = {}
    edges      = []

    def clean_label(device_id: str) -> str:
        if device_id.startswith("PEER@"):  return device_id[5:]
        if device_id.startswith("DEVICE-"): return device_id[7:]
        return device_id[:10]

    with hop_lock:
        items = [(filter_eid, hop_log[filter_eid])] \
                if filter_eid and filter_eid in hop_log \
                else list(hop_log.items())
        for eid, hops in items:
            for h in hops:
                fd, td = h["from_device"], h["to_device"]
                for did in [fd, td]:
                    if did not in node_set:
                        node_set[did] = {
                            "id":      did,
                            "label":   clean_label(did),
                            "is_self": did == MY_DEVICE_ID,
                            "ip":      h.get("from_ip","") if did==fd else h.get("to_ip",""),
                        }
                edges.append({"from": fd, "to": td, "hop": h["hop"], "ts": h["ts"], "event_id": eid})

    with event_lock:
        events_meta = {}
        for eid in hop_log:
            if eid in event_log:
                e = event_log[eid]
                original = e["packet"].get("device_id","")
                verified = e["cross_checks"] - {original}
                events_meta[eid] = {
                    "type":            e["packet"].get("type","UNKNOWN"),
                    "trust":           e["trust"],
                    "devices_reached": len(e["devices_reached"]),
                    "cross_checks":    len(verified),
                }

    now = time.time()
    with discovery_lock:
        for ip, ts in discovered_peers.items():
            if now - ts < PEER_TIMEOUT:
                fid = f"PEER@{ip}"
                if fid not in node_set:
                    node_set[fid] = {"id": fid, "label": ip, "is_self": False, "ip": ip, "online": True}

    if MY_DEVICE_ID not in node_set:
        my_ip = get_my_ips()[0] if get_my_ips() else ""
        node_set[MY_DEVICE_ID] = {
            "id": MY_DEVICE_ID,
            "label": MY_DEVICE_ID[7:] if MY_DEVICE_ID.startswith("DEVICE-") else MY_DEVICE_ID,
            "is_self": True, "ip": my_ip,
        }

    return jsonify({"nodes": list(node_set.values()), "edges": edges,
                    "events": events_meta, "self_id": MY_DEVICE_ID})


@app.route("/api/events/<event_id>/authorize", methods=["POST"])
def authorize_event(event_id: str):
    with event_lock:
        if event_id not in event_log:
            return jsonify({"error": "Event not found"}), 404
        event_log[event_id]["authorized_node"] = True
        event_log[event_id]["trust"] = "HIGH"
    return jsonify({"status": "ok", "trust": "HIGH"})


@app.route("/api/events/<event_id>/verify", methods=["POST"])
def verify_event(event_id: str):
    """
    Manual cross-check: the current device explicitly confirms they can witness
    this event and want to add their verification. This is separate from the
    automatic relay-based cross-check — this is a deliberate human action.
    """
    with event_lock:
        if event_id not in event_log:
            return jsonify({"error": "Event not found"}), 404

        original = event_log[event_id]["packet"].get("device_id", "")

        # Don't let the original broadcaster verify their own alert
        if MY_DEVICE_ID == original:
            return jsonify({"error": "Cannot verify your own alert"}), 400

        # Add this device as a cross-check
        event_log[event_id]["cross_checks"].add(MY_DEVICE_ID)
        event_log[event_id]["trust"] = calculate_trust(event_id)
        new_trust = event_log[event_id]["trust"]
        cross_check_count = len(event_log[event_id]["cross_checks"] - {original})

    log.info(f"Manual verify: {MY_DEVICE_ID[-8:]} confirmed event {event_id[:8]}… trust={new_trust}")

    # Also relay the alert onward with our verification attached
    entry  = event_log[event_id]
    packet = dict(entry["packet"])
    packet["hop_count"]  = entry["packet"].get("hop_count", 0) + 1
    packet["device_id"]  = MY_DEVICE_ID
    relay_to_peers(packet, origin_event_id=event_id)

    return jsonify({
        "status":            "ok",
        "verified_by":       MY_DEVICE_ID,
        "cross_checks":      cross_check_count,
        "trust":             new_trust,
    })


@app.route("/api/events", methods=["DELETE"])
def clear_events():
    with event_lock:
        event_log.clear()
    with hop_lock:
        hop_log.clear()
    return jsonify({"status": "ok"})


@app.route("/api/emergency-contacts", methods=["GET"])
def emergency_contacts():
    return jsonify([
        {"name": "UNC Campus Police",          "number": "919-962-8100", "type": "police"},
        {"name": "Chapel Hill Police Dispatch", "number": "919-968-2760", "type": "police"},
        {"name": "UNC Health ER",               "number": "919-966-4131", "type": "medical"},
        {"name": "Chapel Hill Fire Dept",       "number": "919-968-2784", "type": "fire"},
        {"name": "Orange County 911",           "number": "911",          "type": "emergency"},
        {"name": "Duke Energy Outage Line",     "number": "800-769-3766", "type": "utility"},
        {"name": "NC Emergency Management",     "number": "919-825-2500", "type": "state"},
        {"name": "Poison Control",              "number": "800-222-1222", "type": "medical"},
    ])


# ─────────────────────────────────────────────
# Entry Point
# ─────────────────────────────────────────────

if __name__ == "__main__":
    log.info("═══════════════════════════════════════════")
    log.info("  MeshSentinel Starting")
    log.info(f"  Device ID : {MY_DEVICE_ID}")
    log.info(f"  My IPs    : {get_my_ips()}")
    log.info(f"  netifaces : {'yes' if HAS_NETIFACES else 'no (fallback mode)'}")
    log.info("═══════════════════════════════════════════")

    threading.Thread(target=start_socket_server,       daemon=True).start()
    threading.Thread(target=start_discovery_announcer, daemon=True).start()
    threading.Thread(target=start_discovery_listener,  daemon=True).start()
    threading.Thread(target=start_peer_reaper,         daemon=True).start()

    log.info(f"Flask API → http://0.0.0.0:{FLASK_PORT}")
    app.run(host="0.0.0.0", port=FLASK_PORT, debug=False, threaded=True)