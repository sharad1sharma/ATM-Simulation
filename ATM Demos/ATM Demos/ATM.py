import tkinter as tk
from tkinter import ttk
from datetime import datetime
import threading
import os
import sys
import json
import traceback

try:
    import pyttsx3
    TTS_AVAILABLE = True
except Exception:
    TTS_AVAILABLE = False

# -----------------------
# Helper: safe speak (threaded)
# -----------------------
def speak(text):
    if not TTS_AVAILABLE:
        return

    def _run(txt):
        try:
            engine = pyttsx3.init()
            rate = engine.getProperty('rate')
            engine.setProperty('rate', rate - 50)  # slower speech
            engine.say(txt)
            engine.runAndWait()
        except Exception:
            pass

    threading.Thread(target=_run, args=(text,), daemon=True).start()


# -----------------------
# File utilities (text files)
# -----------------------
def load_data(file, defaults):
    if not os.path.exists(file):
        with open(file, 'w') as f:
            f.write("\n".join(defaults))
    with open(file, 'r') as f:
        lines = f.read().splitlines()
    if not lines:
        return defaults.copy()
    return lines

def save_data(file, list_data):
    # atomic write: write .tmp then replace
    tmp = file + ".tmp"
    with open(tmp, 'w') as f:
        f.write("\n".join(str(x) for x in list_data))
    os.replace(tmp, file)

# -----------------------
# Load / sync user data
# -----------------------
users = load_data('users.txt', ['user1', 'user2', 'user3'])
users = [u.lower() for u in users]  # normalize to lowercase
pins = load_data('pins.txt', ['1234', '2222', '3333'])
balances_raw = load_data('balances.txt', ['1000', '2000', '3000'])
balances = []
for b in balances_raw:
    try:
        balances.append(int(b))
    except Exception:
        balances.append(0)

# pad lists to same length to avoid indexing errors
max_len = max(len(users), len(pins), len(balances))
while len(users) < max_len:
    users.append(f"user{len(users)+1}")
while len(pins) < max_len:
    pins.append("0000")
while len(balances) < max_len:
    balances.append(0)

# in-memory transaction history (last 5 entries per user)
transaction_history = {}

def record_transaction(user, ttype, amount, balance):
    hist = transaction_history.setdefault(user, [])
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    hist.append(f"{ts} | {ttype}: {amount} | Bal: {balance}")
    transaction_history[user] = hist[-5:]

def generate_receipt(user, ttype, amount, balance):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    lines = [
        "╔" + "═"*36 + "╗",
        "║      Laxmi Chit Fund ATM           ║",
        "╠" + "═"*36 + "╣",
        f"Date: {ts}",
        f"User: {user}",
        f"Transaction: {ttype}",
        f"Amount: {amount} Rupees",
        f"Balance: {balance} Rupees",
        "╠" + "═"*36 + "╣",
        "Thank you for using our ATM!",
        "╚" + "═"*36 + "╝",
    ]
    return "\n".join(lines)

# -----------------------
# PIN verification popup
# -----------------------
def ask_pin_and_continue(root, user_index, pins_list, callback):
    """
    Create a modal popup asking for PIN; call callback() if PIN matches.
    """
    def verify():
        entered = pin_entry.get().strip()
        if entered == pins_list[user_index]:
            popup.destroy()
            # small delay so popup closes visually before action runs
            root.after(120, callback)
        else:
            info_label.config(text="Incorrect PIN.", foreground="#ff6666")
            speak("Incorrect PIN.")
            popup.after(1000, popup.destroy)

    popup = tk.Toplevel(root)
    popup.title("PIN Required")
    popup.geometry("320x140")
    popup.resizable(False, False)
    popup.transient(root)
    popup.grab_set()

    ttk.Label(popup, text="Enter PIN to continue", font=("Helvetica", 11)).pack(pady=(12,6))
    pin_entry = ttk.Entry(popup, show="*")
    pin_entry.pack(pady=4)
    pin_entry.focus()
    info_label = ttk.Label(popup, text="", font=("Helvetica", 9))
    info_label.pack(pady=(4,0))
    btn_frame = ttk.Frame(popup)
    btn_frame.pack(pady=8)
    ttk.Button(btn_frame, text="Submit", command=verify).grid(row=0, column=0, padx=6)
    ttk.Button(btn_frame, text="Cancel", command=popup.destroy).grid(row=0, column=1, padx=6)

# -----------------------
# ATM App (Tkinter)
# -----------------------
class ATMGUI:
    def __init__(self, root):
        self.root = root
        self.root.title("Laxmi Chit Fund ATM")
        self.root.geometry("860x520")
        # allow resizing but keep good minimum
        self.root.minsize(760, 480)

        # style variables
        self.bg_color = "#0b1d2b"   # dark navy
        self.screen_bg = "#072022"  # deep green-ish
        self.panel_bg = "#0f2733"
        self.accent = "#00ff7f"     # ATM-green accent
        self.text_fg = "#e6ffee"
        self.muted = "#8fb3a6"

        self.root.configure(bg=self.bg_color)

        # logged in user state
        self.current_user = None
        self.login_attempts = 3
        self.user_index = None

        # build UI
        self.build_layout()
        self.show_welcome_screen()
        self.setup_inactivity_timer()

    def build_layout(self):
        # left: keypad / actions area (buttons)
        self.left_frame = tk.Frame(self.root, bg=self.panel_bg, width=260)
        self.left_frame.pack(side="left", fill="y")
        # right: main screen area
        self.right_frame = tk.Frame(self.root, bg=self.screen_bg)
        self.right_frame.pack(side="right", fill="both", expand=True)

        # top of left_frame: logo/title
        logo = tk.Label(self.left_frame, text="LAXMI\nCHIT ATM", bg=self.panel_bg,
                        fg=self.accent, font=("Courier New", 18, "bold"), justify="center")
        logo.pack(pady=18)

        # Buttons grid on left
        btns = [
            ("Check Balance", self.balance_with_pin),
            ("Withdraw Money", self.open_withdraw_screen),
            ("Deposit Money", self.open_deposit_screen),
            ("Change PIN", self.open_change_pin_screen),
            ("Mini Statement", self.mini_with_pin),
            ("Transfer Money", self.open_transfer_screen),
            ("Logout", self.logout),
            ("Exit", self.quit_app),
        ]
        # place buttons
        for (i, (label, cmd)) in enumerate(btns):
            b = tk.Button(self.left_frame, text=label, command=cmd,
                          bg=self.bg_color, fg=self.accent, activebackground="#0b2f22",
                          font=("Helvetica", 12), relief="flat", bd=0)
            b.pack(fill="x", padx=14, pady=6)

        # bottom left: status
        self.left_status = tk.Label(self.left_frame, text="Status: Not logged in",
                                    bg=self.panel_bg, fg=self.muted, font=("Helvetica", 9))
        self.left_status.pack(side="bottom", pady=10)

        # Right frame: create internal "screen" where content appears
        self.screen = tk.Frame(self.right_frame, bg=self.screen_bg, bd=2, relief="ridge")
        self.screen.pack(fill="both", expand=True, padx=18, pady=18)

        # top bar on screen (title + datetime)
        top = tk.Frame(self.screen, bg=self.screen_bg)
        top.pack(fill="x", pady=(10, 6))
        self.title_lbl = tk.Label(top, text="Welcome", bg=self.screen_bg,
                                  fg=self.accent, font=("Helvetica", 18, "bold"))
        self.title_lbl.pack(side="left", padx=12)
        self.time_lbl = tk.Label(top, text="", bg=self.screen_bg, fg=self.muted, font=("Helvetica", 10))
        self.time_lbl.pack(side="right", padx=12)
        self.update_time()

        # main content area (we'll swap content inside this)
        self.content_area = tk.Frame(self.screen, bg=self.screen_bg)
        self.content_area.pack(fill="both", expand=True, padx=12, pady=8)

        # bottom bar for messages
        self.message_bar = tk.Label(self.screen, text="", bg=self.screen_bg, fg=self.text_fg, font=("Helvetica", 10))
        self.message_bar.pack(fill="x", pady=(0,8))

    def update_time(self):
        self.time_lbl.config(text=datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
        # schedule update every second
        self.root.after(1000, self.update_time)

    # -----------------------
    # helpers to render content
    # -----------------------
    def clear_content(self):
        for w in self.content_area.winfo_children():
            w.destroy()
        self.message_bar.config(text="")

    def set_message(self, text, fg=None):
        if fg is None:
            fg = self.text_fg
        self.message_bar.config(text=text, fg=fg)

    # -----------------------
    # welcome & login screens
    # -----------------------
    def show_welcome_screen(self):
        self.clear_content()
        self.title_lbl.config(text="Welcome to Laxmi Chit Fund ATM")
        # big welcome text and action buttons
        lbl = tk.Label(self.content_area, text="Insert Card or Click Start",
                       bg=self.screen_bg, fg=self.text_fg, font=("Helvetica", 16))
        lbl.pack(pady=(30, 10))
        
        btn_frame = tk.Frame(self.content_area, bg=self.screen_bg)
        btn_frame.pack(pady=6)
        
        start_btn = tk.Button(btn_frame, text="Start / Login", command=self.show_login_screen,
                              bg=self.accent, fg=self.bg_color, font=("Helvetica", 12, "bold"), bd=0, padx=14, pady=6)
        start_btn.grid(row=0, column=0, padx=8)

        reg_btn = tk.Button(btn_frame, text="New User? Register", command=self.show_register_screen,
                            bg=self.bg_color, fg=self.accent, font=("Helvetica", 11), bd=1, relief="ridge", padx=12, pady=5)
        reg_btn.grid(row=0, column=1, padx=8)

        info_lbl = tk.Label(self.content_area, text="Existing users: login with Username & PIN\nNew users: click 'Register' to create an account",
                            bg=self.screen_bg, fg=self.muted, font=("Helvetica", 9), justify="center")
        info_lbl.pack(pady=(16, 0))

        self.left_status.config(text="Status: Awaiting login")

    def show_login_screen(self):
        self.clear_content()
        self.title_lbl.config(text="Card Login")
        frm = tk.Frame(self.content_area, bg=self.screen_bg)
        frm.pack(pady=14)

        tk.Label(frm, text="Username:", bg=self.screen_bg, fg=self.text_fg).grid(row=0, column=0, sticky="w", pady=6)
        self.ui_username = tk.Entry(frm, font=("Helvetica", 11))
        self.ui_username.grid(row=0, column=1, pady=6, padx=8)
        tk.Label(frm, text="PIN / Password:", bg=self.screen_bg, fg=self.text_fg).grid(row=1, column=0, sticky="w", pady=6)
        self.ui_pin = tk.Entry(frm, show="*", font=("Helvetica", 11))
        self.ui_pin.grid(row=1, column=1, pady=6, padx=8)

        btn_row = tk.Frame(frm, bg=self.screen_bg)
        btn_row.grid(row=2, column=0, columnspan=2, pady=(12, 4))

        btn = tk.Button(btn_row, text="Login", command=self.attempt_login, bg=self.accent, fg=self.bg_color,
                        font=("Helvetica", 11, "bold"), bd=0, padx=12, pady=4)
        btn.grid(row=0, column=0, padx=6)

        reg_btn = tk.Button(btn_row, text="Register New User", command=self.show_register_screen,
                            bg=self.bg_color, fg=self.accent, font=("Helvetica", 10), bd=1, relief="ridge", padx=8, pady=4)
        reg_btn.grid(row=0, column=1, padx=6)

        self.login_feedback = tk.Label(self.content_area, text="", bg=self.screen_bg, fg=self.muted)
        self.login_feedback.pack(pady=(8, 0))

    def show_register_screen(self):
        self.clear_content()
        self.title_lbl.config(text="New User Registration")

        frm = tk.Frame(self.content_area, bg=self.screen_bg)
        frm.pack(pady=10)

        tk.Label(frm, text="Desired Username:", bg=self.screen_bg, fg=self.text_fg).grid(row=0, column=0, sticky="w", pady=4)
        self.reg_username = tk.Entry(frm, font=("Helvetica", 11))
        self.reg_username.grid(row=0, column=1, pady=4, padx=8)

        tk.Label(frm, text="Set 4-Digit PIN / Password:", bg=self.screen_bg, fg=self.text_fg).grid(row=1, column=0, sticky="w", pady=4)
        self.reg_pin = tk.Entry(frm, show="*", font=("Helvetica", 11))
        self.reg_pin.grid(row=1, column=1, pady=4, padx=8)

        tk.Label(frm, text="Confirm PIN / Password:", bg=self.screen_bg, fg=self.text_fg).grid(row=2, column=0, sticky="w", pady=4)
        self.reg_confirm_pin = tk.Entry(frm, show="*", font=("Helvetica", 11))
        self.reg_confirm_pin.grid(row=2, column=1, pady=4, padx=8)

        tk.Label(frm, text="Initial Deposit (₹):", bg=self.screen_bg, fg=self.text_fg).grid(row=3, column=0, sticky="w", pady=4)
        self.reg_deposit = tk.Entry(frm, font=("Helvetica", 11))
        self.reg_deposit.insert(0, "1000")
        self.reg_deposit.grid(row=3, column=1, pady=4, padx=8)

        btn_row = tk.Frame(frm, bg=self.screen_bg)
        btn_row.grid(row=4, column=0, columnspan=2, pady=(12, 4))

        sub_btn = tk.Button(btn_row, text="Create Account", command=self.attempt_register, bg=self.accent, fg=self.bg_color,
                            font=("Helvetica", 11, "bold"), bd=0, padx=12, pady=4)
        sub_btn.grid(row=0, column=0, padx=6)

        back_btn = tk.Button(btn_row, text="Back to Login", command=self.show_login_screen, bg=self.bg_color, fg=self.accent,
                             font=("Helvetica", 10), bd=1, relief="ridge", padx=10, pady=4)
        back_btn.grid(row=0, column=1, padx=6)

        self.reg_feedback = tk.Label(self.content_area, text="", bg=self.screen_bg, fg=self.muted)
        self.reg_feedback.pack(pady=(6, 0))

    def attempt_register(self):
        new_user = (self.reg_username.get() or "").strip().lower()
        new_pin = (self.reg_pin.get() or "").strip()
        confirm_pin = (self.reg_confirm_pin.get() or "").strip()
        dep_val = (self.reg_deposit.get() or "").strip()

        # Validation
        if not new_user or not new_user.isalnum() or len(new_user) < 3:
            self.reg_feedback.config(text="Username must be alphanumeric, min 3 characters.", fg="#ff7b7b")
            speak("Username must be alphanumeric and at least 3 characters.")
            return

        if new_user in users:
            self.reg_feedback.config(text=f"User '{new_user}' already exists. Choose another.", fg="#ff7b7b")
            speak("Username already exists. Please choose a different username.")
            return

        if not (new_pin.isdigit() and len(new_pin) == 4):
            self.reg_feedback.config(text="PIN must be exactly 4 digits.", fg="#ff7b7b")
            speak("PIN must be 4 digits.")
            return

        if new_pin != confirm_pin:
            self.reg_feedback.config(text="PINs do not match. Please re-enter.", fg="#ff7b7b")
            speak("PINs do not match.")
            return

        try:
            init_bal = int(dep_val)
            if init_bal < 0 or init_bal % 10 != 0:
                raise ValueError
        except Exception:
            self.reg_feedback.config(text="Initial deposit must be positive multiple of 10.", fg="#ff7b7b")
            speak("Initial deposit must be multiple of 10.")
            return

        # Add user to memory lists
        users.append(new_user)
        pins.append(new_pin)
        balances.append(init_bal)

        # Save to persistent text files
        save_data('users.txt', users)
        save_data('pins.txt', pins)
        save_data('balances.txt', balances)

        record_transaction(new_user, "Account Created", init_bal, init_bal)

        self.reg_feedback.config(text="Account created successfully! Logging you in...", fg=self.accent)
        speak("Account created successfully! Welcome to Laxmi Chit Fund ATM.")

        # Log in the new user immediately
        self.login_attempts = 3
        self.current_user = new_user
        self.user_index = users.index(new_user)
        self.left_status.config(text=f"Status: Logged in as {self.current_user}")
        self.set_message(f"Welcome, {self.current_user}! Account created with ₹{init_bal}")

        self.root.after(1400, self.show_account_home)

    def attempt_login(self):
        username = (self.ui_username.get() or "").strip().lower()
        pin = (self.ui_pin.get() or "").strip()

        if username in users and pin == pins[users.index(username)]:
            # reset attempts on success
            self.login_attempts = 3
            self.current_user = username
            self.user_index = users.index(username)
            self.left_status.config(text=f"Status: Logged in as {self.current_user}")
            self.set_message(f"Logged in as {self.current_user}")
            self.title_lbl.config(text=f"Welcome, {self.current_user}")
            record_transaction(self.current_user, "Login", "-", balances[self.user_index])
            speak(f"Login successful!")
            self.show_account_home()
        else:
            self.login_attempts -= 1
            if self.login_attempts > 0:
                msg = f"Invalid PIN. {self.login_attempts} attempts left."
                self.login_feedback.config(text=msg, fg="#ff7b7b")
                speak(msg)
                self.ui_pin.delete(0, "end")
            else:
                msg = "Too many incorrect attempts. Exiting..."
                self.login_feedback.config(text=msg, fg="#ff3333")
                speak(msg)
                self.logout()

    def logout(self):
        if self.current_user:
            speak(f"Thank you for using the ATM.. Goodbye, Have a nice day!")
        self.current_user = None
        self.user_index = None
        self.left_status.config(text="Status: Not logged in")
        self.show_welcome_screen()

    def quit_app(self):
        self.root.quit()

    # -----------------------
    # account home (after login)
    # -----------------------
    def show_account_home(self):
        self.clear_content()
        self.title_lbl.config(text=f"Account: {self.current_user}")
        top_frame = tk.Frame(self.content_area, bg=self.screen_bg)
        top_frame.pack(fill="x", pady=(8,6))
        bal_btn = tk.Button(top_frame, text="Check Balance", command=self.balance_with_pin,
                            bg=self.bg_color, fg=self.accent, bd=0)
        bal_btn.pack(side="left", padx=12)
        stmt_btn = tk.Button(top_frame, text="Mini Statement", command=self.mini_with_pin,
                             bg=self.bg_color, fg=self.accent, bd=0)
        stmt_btn.pack(side="left", padx=4)
        logout_btn = tk.Button(top_frame, text="Logout ⏻", command=self.logout,
                               bg="#331414", fg="#ff7b7b", activebackground="#4d1a1a", bd=0, padx=10)
        logout_btn.pack(side="right", padx=12)
        # main area: welcome and last transactions
        middle = tk.Frame(self.content_area, bg=self.screen_bg)
        middle.pack(fill="both", expand=True, pady=8)
        welcome = tk.Label(middle, text=f"Hello, {self.current_user}", bg=self.screen_bg, fg=self.text_fg,
                           font=("Helvetica", 16))
        welcome.pack(pady=(6,10))

        # show last transactions (if any)
        hist = transaction_history.get(self.current_user, [])
        hist_frame = tk.Frame(middle, bg=self.screen_bg)
        hist_frame.pack(pady=6)
        tk.Label(hist_frame, text="Recent:", bg=self.screen_bg, fg=self.muted).pack(anchor="w")
        if not hist:
            tk.Label(hist_frame, text="No recent transactions", bg=self.screen_bg, fg=self.muted).pack(anchor="w")
        else:
            for line in reversed(hist):
                tk.Label(hist_frame, text=line, bg=self.screen_bg, fg=self.text_fg, font=("Courier", 9)).pack(anchor="w")

        self.set_message("Choose an action from the left")

    # -----------------------
    # Deposit flow (no extra PIN required - matches your original logic)
    # -----------------------
    def open_deposit_screen(self):
        if not self.current_user:
            self.set_message("Please login first", fg="#ff7b7b")
            return
        self.clear_content()
        self.title_lbl.config(text="Deposit")
        frm = tk.Frame(self.content_area, bg=self.screen_bg)
        frm.pack(pady=20)
        tk.Label(frm, text="Enter the amount to deposit (multiples of 10):", bg=self.screen_bg, fg=self.text_fg).pack(anchor="w")
        speak("Enter the amount to deposit")
        self.dep_entry = tk.Entry(frm, font=("Helvetica", 12))
        self.dep_entry.pack(pady=8)
        btn_frame = tk.Frame(frm, bg=self.screen_bg)
        btn_frame.pack(pady=6)
        tk.Button(btn_frame, text="Submit", command=self.do_deposit, bg=self.accent, fg=self.bg_color, bd=0).grid(row=0, column=0, padx=6)
        tk.Button(btn_frame, text="Back", command=self.show_account_home, bg=self.bg_color, fg=self.accent, bd=0).grid(row=0, column=1, padx=6)

        self.output_panel = tk.Text(self.content_area, height=10, bg="#021813", fg=self.accent, font=("Courier", 10))
        self.output_panel.pack(fill="both", expand=True, padx=12, pady=(12,6))
        self.output_panel.config(state="disabled")

    def do_deposit(self):
        val = (self.dep_entry.get() or "").strip()
        try:
            amt = int(val)
            if amt <= 0 or amt % 10 != 0:
                raise ValueError
        except Exception:
            self.set_message("Invalid amount. Enter positive multiple of 10.", fg="#ff7b7b")
            speak("Deposit amount must be in multiples of 10.")
            return
        balances[self.user_index] += amt
        save_data('balances.txt', balances)
        record_transaction(self.current_user, "Deposited", amt, balances[self.user_index])
        receipt = generate_receipt(self.current_user, "Deposit", amt, balances[self.user_index])
        # show inside output panel
        self.output_panel.config(state="normal")
        self.output_panel.delete("1.0", "end")
        self.output_panel.insert("end", receipt)
        self.output_panel.config(state="disabled")
        self.set_message(f"Deposit successful! Your new balance is {balances[self.user_index]} Rupees")
        speak("Deposit Successful!")

    # -----------------------
    # Withdraw flow (PIN required)
    # -----------------------
    def open_withdraw_screen(self):
        if not self.current_user:
            self.set_message("Please login first", fg="#ff7b7b")
            return
        self.clear_content()
        self.title_lbl.config(text="Withdraw")
        frm = tk.Frame(self.content_area, bg=self.screen_bg)
        frm.pack(pady=20)
        tk.Label(frm, text="Enter the amount to withdraw (multiples of 10):", bg=self.screen_bg, fg=self.text_fg).pack(anchor="w")
        speak("Enter the amount to withdraw")
        self.wd_entry = tk.Entry(frm, font=("Helvetica", 12))
        self.wd_entry.pack(pady=8)
        btn_frame = tk.Frame(frm, bg=self.screen_bg)
        btn_frame.pack(pady=6)
        tk.Button(btn_frame, text="Withdraw", command=self.withdraw_pin_step, bg=self.accent, fg=self.bg_color, bd=0).grid(row=0, column=0, padx=6)
        tk.Button(btn_frame, text="Back", command=self.show_account_home, bg=self.bg_color, fg=self.accent, bd=0).grid(row=0, column=1, padx=6)

        self.output_panel = tk.Text(self.content_area, height=10, bg="#021813", fg=self.accent, font=("Courier", 10))
        self.output_panel.pack(fill="both", expand=True, padx=12, pady=(12,6))
        self.output_panel.config(state="disabled")

    def withdraw_pin_step(self):
        # ask PIN and, if correct, call do_withdraw
        ask_pin_and_continue(self.root, self.user_index, pins, self.do_withdraw)

    def do_withdraw(self):
        val = (self.wd_entry.get() or "").strip()
        try:
            amt = int(val)
            if amt <= 0 or amt % 10 != 0:
                raise ValueError("Invalid amount")
        except Exception:
            self.set_message("Invalid amount. Enter positive multiple of 10.", fg="#ff7b7b")
            speak("Withdrawal amount must be in multiples of 10.")
            return
        if amt > balances[self.user_index]:
            self.set_message("Insufficient balance", fg="#ff7b7b")
            speak("Insufficient balance")
            return
        balances[self.user_index] -= amt
        save_data('balances.txt', balances)
        record_transaction(self.current_user, "Withdrawn", amt, balances[self.user_index])
        receipt = generate_receipt(self.current_user, "Withdraw", amt, balances[self.user_index])
        self.output_panel.config(state="normal")
        self.output_panel.delete("1.0", "end")
        self.output_panel.insert("end", receipt)
        self.output_panel.config(state="disabled")
        self.set_message("Withdrawal successful - collect cash")
        speak("Withdrawal Successful!")

    # -----------------------
    # Transfer Money (PIN required)
    # -----------------------
    def open_transfer_screen(self):
        if not self.current_user:
            self.set_message("Please login first", fg="#ff7b7b")
            return
        self.clear_content()
        self.title_lbl.config(text="Transfer Money")

        frm = tk.Frame(self.content_area, bg=self.screen_bg)
        frm.pack(pady=20)

        tk.Label(frm, text="Recipient Username:", bg=self.screen_bg, fg=self.text_fg).grid(row=0, column=0, sticky="w", pady=6)
        self.recipient_entry = tk.Entry(frm, font=("Helvetica", 12))
        self.recipient_entry.grid(row=0, column=1, pady=6, padx=8)

        tk.Label(frm, text="Amount to Transfer:", bg=self.screen_bg, fg=self.text_fg).grid(row=1, column=0, sticky="w", pady=6)
        self.transfer_amt_entry = tk.Entry(frm, font=("Helvetica", 12))
        self.transfer_amt_entry.grid(row=1, column=1, pady=6, padx=8)

        btn_frame = tk.Frame(frm, bg=self.screen_bg)
        btn_frame.grid(row=2, column=0, columnspan=2, pady=12)
        tk.Button(btn_frame, text="Proceed", command=self.transfer_pin_step, bg=self.accent, fg=self.bg_color, bd=0).grid(row=0, column=0, padx=6)
        tk.Button(btn_frame, text="Back", command=self.show_account_home, bg=self.bg_color, fg=self.accent, bd=0).grid(row=0, column=1, padx=6)

        self.output_panel = tk.Text(self.content_area, height=10, bg="#021813", fg=self.accent, font=("Courier", 10))
        self.output_panel.pack(fill="both", expand=True, padx=12, pady=(12,6))
        self.output_panel.config(state="disabled")

    def transfer_pin_step(self):
        ask_pin_and_continue(self.root, self.user_index, pins, self.do_transfer)

    def do_transfer(self):
        recipient = (self.recipient_entry.get() or "").strip().lower()
        val = (self.transfer_amt_entry.get() or "").strip()

        if recipient not in users:
            self.set_message("Recipient not found", fg="#ff7b7b")
            speak("Recipient not found")
            return
        if recipient == self.current_user:
            self.set_message("Cannot transfer to your own account", fg="#ff7b7b")
            speak("Cannot transfer to your own account. Please choose another account.")
            return

        try:
            amt = int(val)
            if amt <= 0 or amt % 10 != 0:
                raise ValueError
        except Exception:
            self.set_message("Invalid amount. Must be multiple of 10.", fg="#ff7b7b")
            speak("Invalid transfer amount. Amount must be in multiples of 10.")
            return

        if amt > balances[self.user_index]:
            self.set_message("Insufficient balance", fg="#ff7b7b")
            speak("Insufficient balance")
            return

        # perform transfer
        recipient_index = users.index(recipient)
        balances[self.user_index] -= amt
        balances[recipient_index] += amt
        save_data('balances.txt', balances)

        record_transaction(self.current_user, f"Sent to {recipient}", amt, balances[self.user_index])
        record_transaction(recipient, f"Received from {self.current_user}", amt, balances[recipient_index])

        # create receipt
        receipt = (
            f"--- TRANSFER RECEIPT ---\n"
            f"From: {self.current_user}\n"
            f"To: {recipient}\n"
            f"Amount: {amt} Rupees\n"
            f"New Balance: {balances[self.user_index]} Rupees\n"
            f"Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
            f"-------------------------"
        )

        self.output_panel.config(state="normal")
        self.output_panel.delete("1.0", "end")
        self.output_panel.insert("end", receipt)
        self.output_panel.config(state="disabled")

        self.set_message("Transfer successful")
        print(f"Transfer successful. You sent {amt} rupees to {recipient}. Your balance is {balances[self.user_index]} rupees")
        speak(f"Transfer successful.")

    # -----------------------
    # Balance (PIN required)
    # -----------------------
    def balance_with_pin(self):
        if not self.current_user:
            self.set_message("Please login first", fg="#ff7b7b")
            return
        ask_pin_and_continue(self.root, self.user_index, pins, self.show_balance)

    def show_balance(self):
        bal = balances[self.user_index]
        self.clear_content()
        self.title_lbl.config(text="Balance Inquiry")
        lbl = tk.Label(self.content_area, text=f"Your balance is:\n\n{bal} Rupees",
                       bg=self.screen_bg, fg=self.accent, font=("Helvetica", 20))
        lbl.pack(pady=40)
        record_transaction(self.current_user, "Balance Check", "-", bal)
        self.set_message("Balance displayed")
        print(f"Your balance is {bal} Rupees")

    # -----------------------
    # Mini statement (PIN required)
    # -----------------------
    def mini_with_pin(self):
        if not self.current_user:
            self.set_message("Please login first", fg="#ff7b7b")
            return
        ask_pin_and_continue(self.root, self.user_index, pins, self.show_mini_statement)

    def show_mini_statement(self):
        history = transaction_history.get(self.current_user, [])
        self.clear_content()
        self.title_lbl.config(text="Mini Statement")
        if not history:
            no = tk.Label(self.content_area, text="No recent transactions", bg=self.screen_bg, fg=self.muted)
            no.pack(pady=40)
            speak("You have no recent transactions")
            return
        txt = tk.Text(self.content_area, height=14, bg="#021813", fg=self.accent, font=("Courier", 10))
        txt.pack(fill="both", expand=True, padx=12, pady=12)
        for line in reversed(history):
            txt.insert("end", line + "\n")
        txt.config(state="disabled")
        self.set_message("Showing mini statement")
        speak("Displaying your recent transactions")

    # -----------------------
    # Change PIN (secure version)
    # -----------------------
    def open_change_pin_screen(self):
        if not self.current_user:
            self.set_message("Please login first", fg="#ff7b7b")
            return
        self.clear_content()
        self.title_lbl.config(text="Change PIN")

        frm = tk.Frame(self.content_area, bg=self.screen_bg)
        frm.pack(pady=20)

        tk.Label(frm, text="Enter current PIN:", bg=self.screen_bg, fg=self.text_fg).grid(row=0, column=0, sticky="w",
                                                                                          pady=6)
        self.curr_pin_entry = tk.Entry(frm, show="*", font=("Helvetica", 12))
        self.curr_pin_entry.grid(row=0, column=1, pady=6, padx=8)

        tk.Label(frm, text="Enter new 4-digit PIN:", bg=self.screen_bg, fg=self.text_fg).grid(row=1, column=0,
                                                                                              sticky="w", pady=6)
        self.new_pin_entry = tk.Entry(frm, show="*", font=("Helvetica", 12))
        self.new_pin_entry.grid(row=1, column=1, pady=6, padx=8)

        tk.Label(frm, text="Confirm new PIN:", bg=self.screen_bg, fg=self.text_fg).grid(row=2, column=0, sticky="w",
                                                                                        pady=6)
        self.confirm_pin_entry = tk.Entry(frm, show="*", font=("Helvetica", 12))
        self.confirm_pin_entry.grid(row=2, column=1, pady=6, padx=8)

        btn_frame = tk.Frame(frm, bg=self.screen_bg)
        btn_frame.grid(row=3, column=0, columnspan=2, pady=12)
        tk.Button(btn_frame, text="Submit", command=self.do_change_pin, bg=self.accent, fg=self.bg_color, bd=0).grid(
            row=0, column=0, padx=6)
        tk.Button(btn_frame, text="Back", command=self.show_account_home, bg=self.bg_color, fg=self.accent, bd=0).grid(
            row=0, column=1, padx=6)

        self.pin_feedback = tk.Label(self.content_area, text="", bg=self.screen_bg, fg=self.muted)
        self.pin_feedback.pack(pady=8)

    def do_change_pin(self):
        curr_pin = (self.curr_pin_entry.get() or "").strip()
        new_pin = (self.new_pin_entry.get() or "").strip()
        confirm_pin = (self.confirm_pin_entry.get() or "").strip()

        # Check current PIN
        if curr_pin != pins[self.user_index]:
            self.pin_feedback.config(text="Incorrect current PIN", fg="#ff7b7b")
            speak("Incorrect current pin")
            return

        # Validate new PIN
        if not (new_pin.isdigit() and len(new_pin) == 4):
            self.pin_feedback.config(text="PIN must be of 4 digits.", fg="#ff7b7b")
            speak("PIN must be of 4 digits.")
            return

        # Confirm new PIN match
        if new_pin != confirm_pin:
            self.pin_feedback.config(text="New PIN and Confirm PIN do not match", fg="#ff7b7b")
            speak("PIN doesn't match. Please try again.")
            return

        # Update PIN
        pins[self.user_index] = new_pin
        save_data('pins.txt', pins)
        self.pin_feedback.config(text="PIN changed successfully", fg=self.accent)
        record_transaction(self.current_user, "PIN Change", "-", balances[self.user_index])
        speak("Your PIN has been changed successfully.")
        self.root.after(1200, self.show_account_home)

    # -----------------------
    # Inactivity timer (auto logout after 40 sec)
    # -----------------------
    def setup_inactivity_timer(self):
        self.inactivity_ms = 40000  # 40 seconds
        self.inactivity_job = None
        # Bind keypress and mouse click events globally to reset timer
        self.root.bind_all("<Any-KeyPress>", lambda e: self.reset_timer())
        self.root.bind_all("<Any-Button>", lambda e: self.reset_timer())
        self.reset_timer()

    def reset_timer(self):
        if hasattr(self, "inactivity_job") and self.inactivity_job:
            self.root.after_cancel(self.inactivity_job)
        self.inactivity_job = self.root.after(self.inactivity_ms, self.session_expired)

    def session_expired(self):
        if self.current_user:
            speak("Session expired due to inactivity")
            self.logout()

# -----------------------
# Run app
# -----------------------
def main():
    root = tk.Tk()
    app = ATMGUI(root)
    root.mainloop()

if __name__ == "__main__":
    try:
        # If pyttsx3 import was successful, speak will work; otherwise app is silent but functional
        if not TTS_AVAILABLE:
            print("pyttsx3 not installed: voice features disabled. To enable: pip install pyttsx3")
        main()
    except Exception as e:
        print("Unhandled exception:", e)
        traceback.print_exc()
        sys.exit(1)
