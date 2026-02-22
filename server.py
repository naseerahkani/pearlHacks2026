"""
MeshSentinel - Offline-First P2P Community Safety Alert System
Backend: Flask REST API + TCP Socket Server + UDP Auto-Discovery + Hop Graph

Cross-verification model:
  - devices_reached    : set of device IDs that have *received* this alert
  - cross_checks       : set of device IDs that have *manually verified* this alert
  - pending_verify     : set of event IDs that arrived from peers and await human decision
  - Trust is based on cross_checks count (manual human verifications only)
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
DISCOVERY_INTERVAL = 2          # announce more frequently (was 3)
PEER_TIMEOUT       = 30         # longer timeout so one missed beat doesn't drop peer (was 15)

MY_DEVICE_ID = f"DEVICE-{uuid.uuid4().hex[:8].upper()}"

# ─────────────────────────────────────────────
# In-Memory State
# ─────────────────────────────────────────────

event_log: dict = {}
hop_log:   dict = {}

manual_peers:       list = []
discovered_peers:   dict = {}
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
            # Offline fallback — try connecting to a LAN address to get our IP
            try:
                s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                s.connect(("192.168.1.1", 80))
                ips.append(s.getsockname()[0])
                s.close()
            except Exception:
                ips.append("127.0.0.1")
    return list(set(ips))


def get_broadcast_addresses() -> list:
    """
    Return all subnet broadcast addresses we should announce on.
    Also always includes 255.255.255.255 as a fallback.
    WiFi Direct typically uses 192.168.49.x or 192.168.137.x subnets.
    """
    broadcasts = set()
    broadcasts.add("255.255.255.255")

    if HAS_NETIFACES:
        try:
            for iface in netifaces.interfaces():
                addrs = netifaces.ifaddresses(iface)
                for a in addrs.get(netifaces.AF_INET, []):
                    bcast = a.get("broadcast", "")
                    if bcast and not bcast.startswith("127."):
                        broadcasts.add(bcast)
        except Exception:
            pass

    # Always derive broadcast from our own IPs as a fallback
    for ip in get_my_ips():
        parts = ip.rsplit(".", 1)
        if len(parts) == 2:
            broadcasts.add(parts[0] + ".255")

    return list(broadcasts)


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
    entry = event_log.get(event_id, {})
    if entry.get("authorized_node"):
        return "HIGH"
    original = entry.get("packet", {}).get("device_id", "")
    checks   = entry.get("cross_checks", set()) - {original}
    count    = len(checks)
    if count >= 9: return "HIGH"
    if count >= 2: return "MEDIUM"
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
    eid = packet.get("event_id")
    if not eid:
        return

    sender_device = packet.get("device_id", "UNKNOWN")
    hop_num       = packet.get("hop_count", 0)
    my_device     = MY_DEVICE_ID
    my_ip         = get_my_ips()[0] if get_my_ips() else ""
    from_peer     = bool(received_from_ip)

    if from_peer:
        record_hop(eid, sender_device, my_device, hop_num,
                   from_ip=received_from_ip, to_ip=my_ip)

    with event_lock:
        if eid in event_log:
            event_log[eid]["devices_reached"].add(sender_device)
            return

        event_log[eid] = {
            "packet":          packet,
            "devices_reached": {my_device, sender_device},
            "cross_checks":    set(),
            "pending_verify":  from_peer,
            "dismissed":       False,
            "authorized_node": bool(packet.get("is_authorized_node")),
            "trust":           "LOW",
            "max_hop":         hop_num,
            "first_seen":      time.time(),
        }
        if packet.get("is_authorized_node"):
            event_log[eid]["authorized_node"] = True
        event_log[eid]["trust"] = calculate_trust(eid)
        log.info(f"{'📥 Received' if from_peer else '📤 Originated'} event {eid[:8]}… "
                 f"type={packet.get('type')} pending_verify={from_peer}")

    if relay:
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
        # Register as discovered peer whenever a TCP connection arrives
        with discovery_lock:
            discovered_peers[peer_ip] = time.time()
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
    data      = (json.dumps(packet) + "\n").encode()
    my_device = MY_DEVICE_ID
    hop_num   = packet.get("hop_count", 0)
    for peer_ip in get_all_known_peers():
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(3)
            s.connect((peer_ip, SOCKET_PORT))
            s.sendall(data)
            s.close()
            if origin_event_id:
                record_hop(origin_event_id, my_device, f"PEER@{peer_ip}",
                           hop_num,
                           from_ip=get_my_ips()[0] if get_my_ips() else "",
                           to_ip=peer_ip)
        except Exception as e:
            log.debug(f"Could not reach peer {peer_ip}: {e}")

# ─────────────────────────────────────────────
# UDP Auto-Discovery  (primary method)
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
    log.info(f"UDP announcer started (every {DISCOVERY_INTERVAL}s)")
    while True:
        try:
            payload   = build_announcement()   # rebuild each time — IPs may change
            brodcasts = get_broadcast_addresses()
            for bcast in brodcasts:
                try:
                    sock.sendto(payload, (bcast, DISCOVERY_PORT))
                    log.debug(f"UDP announcement → {bcast}:{DISCOVERY_PORT}")
                except Exception as e:
                    log.debug(f"Broadcast to {bcast} failed: {e}")
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
            if peer_ip in set(get_my_ips()):
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
                log.info(f"✅ Discovered peer via UDP: {peer_ip} [{meta.get('device_id','?')}]")
            else:
                log.debug(f"Refreshed peer: {peer_ip}")
        except socket.timeout:
            continue
        except Exception as e:
            log.warning(f"Discovery listener error: {e}")
            time.sleep(1)


def start_peer_reaper():
    """Remove peers we haven't heard from in PEER_TIMEOUT seconds."""
    while True:
        time.sleep(PEER_TIMEOUT // 2)
        now = time.time()
        with discovery_lock:
            expired = [ip for ip, ts in discovered_peers.items() if now - ts > PEER_TIMEOUT]
            for ip in expired:
                del discovered_peers[ip]
                log.info(f"⏰ Peer timed out: {ip}")


# ─────────────────────────────────────────────
# TCP Peer Keepalive  (secondary/backup discovery)
# Periodically pings all known peers over TCP so they register
# us in their discovered_peers even if UDP broadcast is blocked.
# ─────────────────────────────────────────────

KEEPALIVE_INTERVAL = 5   # seconds between keepalive pings

def build_keepalive_packet() -> dict:
    return {
        "type":      "KEEPALIVE",
        "device_id": MY_DEVICE_ID,
        "event_id":  None,          # no event — just a presence ping
        "hop_count": 0,
        "timestamp": int(time.time()),
    }

def start_tcp_keepalive():
    """
    Send a KEEPALIVE packet to every known peer every few seconds.
    When the peer's TCP server receives this connection it registers
    our IP in discovered_peers (see handle_connection above).
    We intentionally send a packet that handle_packet will ignore
    (event_id is None) — the value is the TCP connection itself.
    """
    time.sleep(5)   # let other threads start first
    log.info(f"TCP keepalive started (every {KEEPALIVE_INTERVAL}s)")
    while True:
        for peer_ip in get_all_known_peers():
            try:
                s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                s.settimeout(2)
                s.connect((peer_ip, SOCKET_PORT))
                # Send a minimal keepalive — peer will register our IP on connect
                ka = (json.dumps(build_keepalive_packet()) + "\n").encode()
                s.sendall(ka)
                s.close()
                # Also refresh their entry in our own discovered_peers
                with discovery_lock:
                    discovered_peers[peer_ip] = time.time()
                log.debug(f"Keepalive → {peer_ip} ✓")
            except Exception as e:
                log.debug(f"Keepalive failed for {peer_ip}: {e}")
        time.sleep(KEEPALIVE_INTERVAL)


# ─────────────────────────────────────────────
# Subnet Scanner  (tertiary discovery for WiFi Direct)
# When UDP broadcast is blocked (common on WiFi Direct / hotspot),
# scan the local /24 subnet for any host with port 5555 open.
# Runs once at startup and then every 30 seconds.
# ─────────────────────────────────────────────

SCAN_INTERVAL  = 30    # seconds between subnet scans
SCAN_TIMEOUT   = 0.3   # seconds per host probe

def scan_subnet_for_peers():
    """
    Probe every .1–.254 address on our subnet for an open SOCKET_PORT.
    This is the most reliable method when UDP broadcast is blocked by
    WiFi Direct drivers (common on Windows and some Android hotspots).
    """
    my_ips = get_my_ips()
    if not my_ips:
        return
    found = 0
    for my_ip in my_ips:
        parts = my_ip.rsplit(".", 1)
        if len(parts) != 2:
            continue
        prefix = parts[0]
        log.info(f"🔍 Scanning subnet {prefix}.1-254 for peers…")
        for i in range(1, 255):
            target = f"{prefix}.{i}"
            if target in set(get_my_ips()):
                continue
            try:
                s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                s.settimeout(SCAN_TIMEOUT)
                result = s.connect_ex((target, SOCKET_PORT))
                s.close()
                if result == 0:
                    with discovery_lock:
                        is_new = target not in discovered_peers
                        discovered_peers[target] = time.time()
                    if is_new:
                        log.info(f"✅ Discovered peer via scan: {target}")
                    found += 1
            except Exception:
                pass
    log.info(f"🔍 Subnet scan complete — {found} peer(s) found")


def start_subnet_scanner():
    time.sleep(3)   # wait for network to stabilise after startup
    while True:
        try:
            scan_subnet_for_peers()
        except Exception as e:
            log.warning(f"Subnet scanner error: {e}")
        time.sleep(SCAN_INTERVAL)


# ─────────────────────────────────────────────
# Flask Application
# ─────────────────────────────────────────────

app = Flask(__name__)
CORS(app)


def serialize_event(eid: str) -> dict:
    entry = event_log[eid]
    p     = entry["packet"]
    original        = p.get("device_id", "")
    verified_checks = entry["cross_checks"] - {original}
    return {
        "event_id":            eid,
        "type":                p.get("type", "UNKNOWN"),
        "timestamp":           p.get("timestamp", 0),
        "origin_device":       original,
        "max_hop":             entry["max_hop"],
        "devices_reached":     len(entry["devices_reached"]),
        "devices_reached_ids": list(entry["devices_reached"]),
        "cross_checks":        len(verified_checks),
        "cross_check_ids":     list(verified_checks),
        "trust":               entry["trust"],
        "authorized_node":     entry["authorized_node"],
        "first_seen":          entry["first_seen"],
        "is_authorized_node":  p.get("is_authorized_node", False),
        "description":         p.get("description", ""),
        "location":            p.get("location", ""),
        "pending_verify":      entry.get("pending_verify", False),
        "dismissed":           entry.get("dismissed", False),
    }


@app.route("/api/events", methods=["GET"])
def get_events():
    with event_lock:
        events = [serialize_event(eid) for eid in event_log]
    events.sort(key=lambda e: e["first_seen"], reverse=True)
    return jsonify(events)


@app.route("/api/pending-verifications", methods=["GET"])
def get_pending_verifications():
    with event_lock:
        pending = [
            serialize_event(eid)
            for eid, entry in event_log.items()
            if entry.get("pending_verify") and not entry.get("dismissed")
        ]
    pending.sort(key=lambda e: e["first_seen"])
    return jsonify({"count": len(pending), "events": pending})


@app.route("/api/broadcast", methods=["POST"])
def broadcast():
    data = request.get_json(force=True)
    for field in ["event_id", "type", "device_id"]:
        if field not in data:
            return jsonify({"error": f"Missing field: {field}"}), 400
    packet = {
        "event_id":           data["event_id"],
        "type":               data["type"],
        "timestamp":          data.get("timestamp", int(time.time())),
        "device_id":          data["device_id"],
        "hop_count":          0,
        "is_authorized_node": data.get("is_authorized_node", False),
        "description":        data.get("description", "").strip()[:280],
        "location":           data.get("location", "").strip()[:100],
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
    # Also immediately scan this peer so it registers right away
    with discovery_lock:
        discovered_peers[ip] = time.time()
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
    node_set, edges = {}, []

    def clean_label(did):
        if did.startswith("PEER@"):   return did[5:]
        if did.startswith("DEVICE-"): return did[7:]
        return did[:10]

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
                            "id": did, "label": clean_label(did),
                            "is_self": did == MY_DEVICE_ID,
                            "ip": h.get("from_ip","") if did==fd else h.get("to_ip",""),
                        }
                edges.append({"from": fd, "to": td, "hop": h["hop"],
                              "ts": h["ts"], "event_id": eid})

    with event_lock:
        events_meta = {}
        for eid in hop_log:
            if eid in event_log:
                e = event_log[eid]
                original = e["packet"].get("device_id","")
                verified = e["cross_checks"] - {original}
                events_meta[eid] = {
                    "type": e["packet"].get("type","UNKNOWN"),
                    "trust": e["trust"],
                    "devices_reached": len(e["devices_reached"]),
                    "cross_checks": len(verified),
                }

    now = time.time()
    with discovery_lock:
        for ip, ts in discovered_peers.items():
            if now - ts < PEER_TIMEOUT:
                fid = f"PEER@{ip}"
                if fid not in node_set:
                    node_set[fid] = {"id": fid, "label": ip,
                                     "is_self": False, "ip": ip, "online": True}

    if MY_DEVICE_ID not in node_set:
        my_ip = get_my_ips()[0] if get_my_ips() else ""
        node_set[MY_DEVICE_ID] = {
            "id": MY_DEVICE_ID,
            "label": MY_DEVICE_ID[7:] if MY_DEVICE_ID.startswith("DEVICE-") else MY_DEVICE_ID,
            "is_self": True, "ip": my_ip,
        }

    return jsonify({"nodes": list(node_set.values()), "edges": edges,
                    "events": events_meta, "self_id": MY_DEVICE_ID})


@app.route("/api/events/<event_id>/verify", methods=["POST"])
def verify_event(event_id: str):
    with event_lock:
        if event_id not in event_log:
            return jsonify({"error": "Event not found"}), 404
        original = event_log[event_id]["packet"].get("device_id", "")
        if MY_DEVICE_ID == original:
            return jsonify({"error": "Cannot verify your own alert"}), 400

        event_log[event_id]["cross_checks"].add(MY_DEVICE_ID)
        event_log[event_id]["pending_verify"] = False
        event_log[event_id]["dismissed"]      = False
        event_log[event_id]["trust"]          = calculate_trust(event_id)
        new_trust       = event_log[event_id]["trust"]
        verified_checks = event_log[event_id]["cross_checks"] - {original}
        cross_count     = len(verified_checks)

    log.info(f"✅ Manual verify: {MY_DEVICE_ID[-8:]} confirmed {event_id[:8]}… "
             f"checks={cross_count} trust={new_trust}")

    # Re-broadcast full packet
    entry  = event_log[event_id]
    packet = dict(entry["packet"])
    packet["hop_count"] = entry["max_hop"] + 1
    packet["device_id"] = MY_DEVICE_ID
    relay_to_peers(packet, origin_event_id=event_id)

    # Push lightweight sync to all peers so their dashboards update immediately
    sync_payload = json.dumps({
        "verified_by":  MY_DEVICE_ID,
        "trust":        new_trust,
        "cross_checks": cross_count,
    }).encode()

    def push_sync():
        import urllib.request as _ur
        for peer_ip in get_all_known_peers():
            try:
                req = _ur.Request(
                    f"http://{peer_ip}:{FLASK_PORT}/api/events/{event_id}/sync",
                    data=sync_payload,
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                _ur.urlopen(req, timeout=3)
                log.debug(f"🔄 Sync pushed to {peer_ip}")
            except Exception as e:
                log.debug(f"Sync push failed for {peer_ip}: {e}")

    threading.Thread(target=push_sync, daemon=True).start()

    return jsonify({
        "status":       "ok",
        "verified_by":  MY_DEVICE_ID,
        "cross_checks": cross_count,
        "trust":        new_trust,
    })


@app.route("/api/events/<event_id>/sync", methods=["POST"])
def sync_event_verification(event_id: str):
    """
    Lightweight push from a peer after they verify — updates our in-memory
    cross_checks so the dashboard reflects it without waiting for next relay.
    """
    data      = request.get_json(force=True, silent=True) or {}
    verifier  = data.get("verified_by", "")
    new_trust = data.get("trust", "")

    with event_lock:
        if event_id not in event_log:
            return jsonify({"status": "unknown_event"}), 404
        if verifier:
            event_log[event_id]["cross_checks"].add(verifier)
        if new_trust in ("LOW", "MEDIUM", "HIGH"):
            event_log[event_id]["trust"] = new_trust
        event_log[event_id]["trust"] = calculate_trust(event_id)

    log.info(f"🔄 Sync received: {verifier[-8:] if verifier else '?'} verified {event_id[:8]}…")
    return jsonify({"status": "ok", "trust": event_log[event_id]["trust"]})


@app.route("/api/events/<event_id>/dismiss", methods=["POST"])
def dismiss_event(event_id: str):
    with event_lock:
        if event_id not in event_log:
            return jsonify({"error": "Event not found"}), 404
        event_log[event_id]["pending_verify"] = False
        event_log[event_id]["dismissed"]      = True

    log.info(f"🚫 Dismissed: {MY_DEVICE_ID[-8:]} cannot confirm {event_id[:8]}…")
    return jsonify({"status": "ok"})


@app.route("/api/events/<event_id>/authorize", methods=["POST"])
def authorize_event(event_id: str):
    with event_lock:
        if event_id not in event_log:
            return jsonify({"error": "Event not found"}), 404
        event_log[event_id]["authorized_node"] = True
        event_log[event_id]["pending_verify"]  = False
        event_log[event_id]["trust"]           = "HIGH"
    return jsonify({"status": "ok", "trust": "HIGH"})


@app.route("/api/events", methods=["DELETE"])
def clear_events():
    with event_lock:
        event_log.clear()
    with hop_lock:
        hop_log.clear()
    return jsonify({"status": "ok"})


@app.route("/api/scan", methods=["POST"])
def trigger_scan():
    """Manually trigger a subnet scan — useful when auto-discovery is slow."""
    threading.Thread(target=scan_subnet_for_peers, daemon=True).start()
    return jsonify({"status": "scanning", "subnets": [
        ip.rsplit(".", 1)[0] + ".0/24" for ip in get_my_ips()
    ]})


@app.route("/api/emergency-contacts", methods=["GET"])
def emergency_contacts():
    return jsonify([
        {"name": "UNC Campus Police",           "number": "919-962-8100", "type": "police"},
        {"name": "Chapel Hill Police Dispatch",  "number": "919-968-2760", "type": "police"},
        {"name": "UNC Health ER",                "number": "919-966-4131", "type": "medical"},
        {"name": "Chapel Hill Fire Dept",        "number": "919-968-2784", "type": "fire"},
        {"name": "Orange County 911",            "number": "911",          "type": "emergency"},
        {"name": "Duke Energy Outage Line",      "number": "800-769-3766", "type": "utility"},
        {"name": "NC Emergency Management",      "number": "919-825-2500", "type": "state"},
        {"name": "Poison Control",               "number": "800-222-1222", "type": "medical"},
    ])


# ─────────────────────────────────────────────
# Ollama Clustering
# ─────────────────────────────────────────────

import os
import re
import urllib.request

OLLAMA_HOST  = os.environ.get("OLLAMA_HOST", "127.0.0.1")
OLLAMA_PORT  = int(os.environ.get("OLLAMA_PORT", "11434"))
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.2:1b")
OLLAMA_URL   = f"http://{OLLAMA_HOST}:{OLLAMA_PORT}/api/generate"

_cluster_cache: dict = {"result": None, "computed_at": 0, "event_ids": []}
_cluster_lock = threading.Lock()
CLUSTER_CACHE_TTL = 10


def build_cluster_prompt(events: list) -> str:
    event_summaries = []
    for e in events:
        summary = {
            "id":          e["event_id"][:8],
            "full_id":     e["event_id"],
            "type":        e["type"],
            "description": e.get("description", "") or "(no description)",
            "location":    e.get("location",    "") or "(no location)",
            "trust":       e["trust"],
            "age_seconds": int(time.time() - (e["first_seen"] or time.time())),
        }
        event_summaries.append(summary)

    events_json = json.dumps(event_summaries, indent=2)

    prompt = f"""You are an emergency dispatch AI. Group the following alerts into clusters where each cluster represents the SAME real-world incident.

Two alerts belong in the same cluster if they share a similar location AND a similar emergency type AND could plausibly be reports of the same event.

Return ONLY valid JSON, no explanation, no markdown, no code fences. The JSON must be an array of cluster objects.

Each cluster object has exactly these fields:
- "cluster_id": integer starting from 1
- "label": short human-readable label for this incident (max 8 words)
- "severity": "CRITICAL", "HIGH", or "MEDIUM" based on type and trust level
- "type": the dominant emergency type (FIRE, MEDICAL, SECURITY, or MIXED)
- "summary": one sentence describing the incident (max 20 words)
- "event_ids": array of full_id strings that belong to this cluster
- "recommended_action": brief action for responders (max 10 words)

Rules:
- Every alert must appear in exactly one cluster
- If an alert has no similar partner, it gets its own single-alert cluster
- FIRE > SECURITY > MEDICAL for severity if types are mixed
- Higher trust alerts should anchor the label and summary

Alerts to cluster:
{events_json}

Return only the JSON array:"""

    return prompt


def call_ollama(prompt: str, timeout: int = 120) -> str | None:
    payload = json.dumps({
        "model":  OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": 0.1,
            "num_predict": 800,
        }
    }).encode("utf-8")

    req = urllib.request.Request(
        OLLAMA_URL,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("response", "")
    except Exception as e:
        log.warning(f"Ollama call failed: {e}")
        return None


def fallback_clusters(events: list) -> list:
    SEVERITY = {"FIRE": "CRITICAL", "SECURITY": "HIGH", "MEDICAL": "HIGH", "UNKNOWN": "MEDIUM"}
    groups   = {}
    for e in events:
        loc_key  = (e.get("location") or "")[:20].lower().strip()
        type_key = e.get("type", "UNKNOWN")
        key      = f"{type_key}|{loc_key}" if loc_key else type_key
        groups.setdefault(key, []).append(e)

    clusters = []
    for i, (key, group) in enumerate(groups.items(), 1):
        etype = group[0].get("type", "UNKNOWN")
        loc   = group[0].get("location", "") or "unknown location"
        clusters.append({
            "cluster_id":          i,
            "label":               f"{etype.title()} — {loc[:30]}",
            "severity":            SEVERITY.get(etype, "MEDIUM"),
            "type":                etype,
            "summary":             f"{len(group)} report{'s' if len(group) > 1 else ''} of {etype.lower()} emergency near {loc[:25]}",
            "event_ids":           [e["event_id"] for e in group],
            "recommended_action":  "Respond immediately and assess situation",
            "source":              "fallback",
        })
    return clusters


def parse_cluster_response(raw: str, events: list) -> list:
    if not raw:
        return fallback_clusters(events)

    text = raw.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$",          "", text)
    text = text.strip()

    match = re.search(r"\[.*\]", text, re.DOTALL)
    if not match:
        log.warning("Ollama response had no JSON array — using fallback")
        return fallback_clusters(events)

    try:
        clusters = json.loads(match.group())
    except json.JSONDecodeError as e:
        log.warning(f"Ollama JSON parse error: {e} — using fallback")
        return fallback_clusters(events)

    prefix_map = {e["event_id"][:8]: e["event_id"] for e in events}
    all_full   = {e["event_id"] for e in events}

    seen_event_ids = set()
    clean = []
    for c in clusters:
        if not isinstance(c, dict):
            continue
        raw_ids  = c.get("event_ids", [])
        full_ids = []
        for rid in raw_ids:
            if rid in all_full:
                full_ids.append(rid)
            elif rid in prefix_map:
                full_ids.append(prefix_map[rid])
        if not full_ids:
            continue
        seen_event_ids.update(full_ids)
        clean.append({
            "cluster_id":         c.get("cluster_id", len(clean) + 1),
            "label":              str(c.get("label", "Unknown Incident"))[:60],
            "severity":           c.get("severity", "MEDIUM"),
            "type":               c.get("type", "UNKNOWN"),
            "summary":            str(c.get("summary", ""))[:120],
            "event_ids":          full_ids,
            "recommended_action": str(c.get("recommended_action", ""))[:80],
            "source":             "ollama",
        })

    missed = [e for e in events if e["event_id"] not in seen_event_ids]
    if missed:
        clean.extend(fallback_clusters(missed))

    return clean if clean else fallback_clusters(events)


@app.route("/api/cluster", methods=["POST"])
def cluster_events():
    body  = request.get_json(force=True, silent=True) or {}
    force = body.get("force", False)

    with event_lock:
        events = [serialize_event(eid) for eid in event_log]

    if not events:
        return jsonify({"clusters": [], "event_count": 0, "source": "empty", "ollama_available": False})

    current_ids = sorted(e["event_id"] for e in events)

    with _cluster_lock:
        cache = _cluster_cache
        if (not force
                and cache["result"] is not None
                and time.time() - cache["computed_at"] < CLUSTER_CACHE_TTL
                and cache["event_ids"] == current_ids):
            return jsonify({**cache["result"], "cached": True})

    try:
        check = urllib.request.urlopen(
            f"http://{OLLAMA_HOST}:{OLLAMA_PORT}/api/tags", timeout=2
        )
        ollama_available = check.status == 200
    except Exception:
        ollama_available = False

    if ollama_available:
        prompt   = build_cluster_prompt(events)
        raw_resp = call_ollama(prompt, timeout=120)
        clusters = parse_cluster_response(raw_resp, events)
        source   = "ollama"
        log.info(f"Ollama clustering: {len(events)} events → {len(clusters)} clusters")
    else:
        clusters = fallback_clusters(events)
        source   = "fallback"
        log.info(f"Ollama unavailable — fallback clustering: {len(clusters)} clusters")

    result = {
        "clusters":         clusters,
        "event_count":      len(events),
        "cluster_count":    len(clusters),
        "source":           source,
        "ollama_available": ollama_available,
        "ollama_host":      OLLAMA_HOST,
        "computed_at":      time.time(),
        "cached":           False,
    }

    with _cluster_lock:
        _cluster_cache["result"]      = result
        _cluster_cache["computed_at"] = time.time()
        _cluster_cache["event_ids"]   = current_ids

    return jsonify(result)


@app.route("/api/cluster/status", methods=["GET"])
def cluster_status():
    try:
        resp = urllib.request.urlopen(
            f"http://{OLLAMA_HOST}:{OLLAMA_PORT}/api/tags", timeout=2
        )
        data   = json.loads(resp.read().decode())
        models = [m["name"] for m in data.get("models", [])]
        return jsonify({
            "available":   True,
            "host":        OLLAMA_HOST,
            "port":        OLLAMA_PORT,
            "model":       OLLAMA_MODEL,
            "model_ready": any(OLLAMA_MODEL in m for m in models),
            "all_models":  models,
        })
    except Exception as e:
        return jsonify({
            "available":   False,
            "host":        OLLAMA_HOST,
            "port":        OLLAMA_PORT,
            "model":       OLLAMA_MODEL,
            "model_ready": False,
            "error":       str(e),
        })


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
    threading.Thread(target=start_tcp_keepalive,       daemon=True).start()   # NEW
    threading.Thread(target=start_subnet_scanner,      daemon=True).start()   # NEW

    log.info(f"Flask API → http://0.0.0.0:{FLASK_PORT}")
    app.run(host="0.0.0.0", port=FLASK_PORT, debug=False, threaded=True)