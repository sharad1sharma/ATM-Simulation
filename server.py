"""
Laxmi Chit Fund ATM - Python Web Server Bridge
Serves the web frontend and synchronizes with users.txt, pins.txt, and balances.txt
Uses Python's built-in libraries (no pip install needed!)
"""

import http.server
import socketserver
import os
import json
import urllib.parse
from datetime import datetime

PORT = 8080
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Path to data files
DEMO_DIR = os.path.join(BASE_DIR, "ATM Demos", "ATM Demos")
if not os.path.exists(DEMO_DIR):
    DEMO_DIR = BASE_DIR

USERS_FILE = os.path.join(DEMO_DIR, "users.txt")
PINS_FILE = os.path.join(DEMO_DIR, "pins.txt")
BALANCES_FILE = os.path.join(DEMO_DIR, "balances.txt")

def read_file_lines(filepath, defaults):
    if not os.path.exists(filepath):
        with open(filepath, "w", encoding="utf-8") as f:
            f.write("\n".join(defaults))
        return defaults.copy()
    with open(filepath, "r", encoding="utf-8") as f:
        lines = [line.strip() for line in f.read().splitlines() if line.strip()]
    return lines if lines else defaults.copy()

def write_file_lines(filepath, lines):
    tmp_path = filepath + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        f.write("\n".join(str(x) for x in lines) + "\n")
    os.replace(tmp_path, filepath)

def get_atm_data():
    users = read_file_lines(USERS_FILE, ["user1", "user2", "user3"])
    pins = read_file_lines(PINS_FILE, ["1234", "2222", "3333"])
    raw_bal = read_file_lines(BALANCES_FILE, ["860", "2610", "3000"])
    balances = []
    for b in raw_bal:
        try:
            balances.append(int(b))
        except Exception:
            balances.append(0)

    # ensure synced length
    max_len = max(len(users), len(pins), len(balances))
    while len(users) < max_len:
        users.append(f"user{len(users)+1}")
    while len(pins) < max_len:
        pins.append("0000")
    while len(balances) < max_len:
        balances.append(0)

    return {
        "users": [u.lower() for u in users],
        "pins": pins,
        "balances": balances
    }

class ATMRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/data":
            data = get_atm_data()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(data).encode("utf-8"))
            return
        super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/register":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)
            try:
                payload = json.loads(body.decode("utf-8"))
                new_user = str(payload.get("username", "")).strip().lower()
                new_pin = str(payload.get("pin", "")).strip()
                initial_balance = int(payload.get("balance", 1000))

                current_data = get_atm_data()
                if new_user in current_data["users"]:
                    self.send_response(400)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.end_headers()
                    self.wfile.write(json.dumps({"status": "error", "message": "User already exists"}).encode("utf-8"))
                    return

                current_data["users"].append(new_user)
                current_data["pins"].append(new_pin)
                current_data["balances"].append(initial_balance)

                write_file_lines(USERS_FILE, current_data["users"])
                write_file_lines(PINS_FILE, current_data["pins"])
                write_file_lines(BALANCES_FILE, current_data["balances"])

                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"status": "ok", "user": new_user, "balance": initial_balance, "data": current_data}).encode("utf-8"))
                return
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"status": "error", "error": str(e)}).encode("utf-8"))
                return

        if parsed.path == "/api/sync":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)
            try:
                payload = json.loads(body.decode("utf-8"))
                if "users" in payload and "pins" in payload and "balances" in payload:
                    write_file_lines(USERS_FILE, payload["users"])
                    write_file_lines(PINS_FILE, payload["pins"])
                    write_file_lines(BALANCES_FILE, payload["balances"])
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.end_headers()
                    self.wfile.write(json.dumps({"status": "ok", "message": "Synced successfully"}).encode("utf-8"))
                    return
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"status": "error", "error": str(e)}).encode("utf-8"))
                return

        super().do_POST()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

def run_server():
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), ATMRequestHandler) as httpd:
        print(f"=====================================================")
        print(f"  Laxmi Chit Fund ATM Web Frontend Running!")
        print(f"  Local URL: http://localhost:{PORT}")
        print(f"  Files directory: {BASE_DIR}")
        print(f"=====================================================")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server...")

if __name__ == "__main__":
    run_server()
