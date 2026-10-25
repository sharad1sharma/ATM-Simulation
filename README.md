# Laxmi Chit Fund ATM - Web Frontend

An interactive, responsive web frontend for the **Laxmi Chit Fund ATM** application, designed to faithfully match the color theme, fonts, texture, and workflow of the original desktop application.

---

## 🎨 Theme & Visual Styling (Faithful 1:1 Design)

The visual design preserves the exact aesthetic from the reference screenshot and `ATM.py`:
- **Chassis / Background**: Dark Navy (`#0b1d2b`)
- **CRT Main Screen**: Deep Green-Teal (`#072022`) with ridge borders and subtle scanline texture
- **Left Control Panel**: Dark Slate-Navy (`#0f2733`)
- **Accent Color**: Neon Spring Green (`#00ff7f`) with soft ambient glow
- **Text & Status**: Crisp mint white (`#e6ffee`) and muted slate (`#8fb3a6`)
- **Terminal Receipts Box**: Deep forest black (`#021813`) with monospace green text

---

## 🔐 User Authentication: Registration, Login & Logout

### 1. How a New User Registers (Creates an Account)
- **On the Web**:
  1. On the Welcome screen or Login screen, click **"New User? Register"** (or click **"New Account"**).
  2. Enter a **Desired Username** (e.g. `rohit`, `rajesh`, min 3 characters).
  3. Enter a **4-Digit PIN / Password** and confirm it (click the 👁 icon to view or hide).
  4. Enter an **Initial Deposit Amount** (default is ₹1,000, must be positive multiple of 10).
  5. Click **"Create Account"**.
  6. The account is instantly registered into `users.txt`, `pins.txt`, and `balances.txt` and logs you in automatically!

- **In the Python Desktop App (`ATM.py`)**:
  1. On the Welcome or Login screen, click the **"New User? Register"** button.
  2. Fill in your username, 4-digit PIN/password, confirm PIN, and deposit.
  3. Click **"Create Account"** to save and immediately enter your account.

---

### 2. How to Login
1. Click **"Start / Login"** on the Welcome screen (or click the animated Gold Debit Card in Kiosk mode).
2. Enter your **Username** and **PIN / Password**.
3. Click **"Login"** (or press `Enter` on your keyboard or the hardware PIN pad).
4. If correct, you enter the Account Dashboard with balance shortcuts and transaction history.
5. If incorrect, you have **3 security attempts** before lockout.

---

### 3. How to Logout
You can log out anytime using any of the following methods:
- **Left Sidebar Menu**: Click the **"Logout"** button.
- **Account Dashboard**: Click the red **"Logout ⏻"** button at the top right of the dashboard.
- **Top Utility Navigation Bar**: Click the **"Logout"** button with the ⏻ icon.
- **Automatic Inactivity Protection**: If no clicks or keystrokes occur for **40 seconds**, the ATM automatically terminates the session and logs you out for security.
   - Monospace double-line header: `LAXMI CHIT ATM`
   - Complete 8-button menu:
     - Check Balance
     - Withdraw Money
     - Deposit Money
     - Change PIN
     - Mini Statement
     - Transfer Money
     - Logout
     - Exit
   - Bottom status indicator (`Status: Awaiting login` / `Status: Logged in as user1`)
   - Real-time live date and time clock (`YYYY-MM-DD HH:MM:SS`)

2. **Complete ATM Workflow**:
   - **Login**: 3-attempt limit with invalid attempt alerts
   - **PIN Verification Modal**: Realistic popup dialog before sensitive actions (`Check Balance`, `Withdraw`, `Transfer`, `Mini Statement`)
   - **Deposit Money**: Multiples of 10 validation, balance update, printed ASCII receipt, and voice confirmation
   - **Withdraw Money**: Multiples of 10 check, balance sufficiency validation, cash dispensing animation, and printed receipt
   - **Transfer Money**: Recipient lookup in database, self-transfer prevention, balance deduction, and transfer receipt
   - **Mini Statement**: Formatted terminal output showing the last 5 transactions with timestamps and balance
   - **Change PIN**: Validates current PIN, verifies new 4-digit numeric format, checks confirmation match, and updates
   - **Inactivity Timer**: 40-second auto-logout timer with visual warning under 10 seconds

3. **Hardware Kiosk Mode (Toggleable)**:
   - Click **"Kiosk View"** in the top bar to reveal the full ATM machine with:
     - Interactive **Debit Card Slot** (click the card to insert it)
     - Animated **Cash Dispenser** with Rupee notes sliding out upon withdrawal
     - **Receipt Slot** with clickable paper ejection to view/print receipts
     - Secure **Hardware Pinpad** with numeric keys (0-9), Clear, Cancel, and Enter

4. **Audio & Voice Narration (Web Speech + Web Audio)**:
   - Built-in voice narration matching `pyttsx3`
   - Real-time synthesized key clicks, cash dispensing audio, and receipt sounds
   - Mute / Unmute voice toggle in the top bar

5. **Responsive Design**:
   - Smooth on Desktop, Tablet, and Mobile devices (< 860px breakpoint with auto-adapting mobile menu)

6. **Two-Way Synchronization**:
   - Can run entirely offline in any browser via `index.html` (persisting in `localStorage`)
   - Or run with `python server.py` to sync live with `users.txt`, `pins.txt`, and `balances.txt`

---

## 💻 How to Run

### Option 1: Direct in Browser (Zero Setup)
Simply double-click or open [index.html](file:///d:/ATM%20Stimulation/index.html) in any web browser (Chrome, Edge, Firefox, Brave, Safari).

### Option 2: Run with Python Server (Live File Sync)
In PowerShell or Terminal:
```powershell
python server.py
```
Then visit: [http://localhost:8080](http://localhost:8080)

---

## 🔑 Default Test Accounts
- **user1** — PIN: `1234` (Balance: ₹860)
- **user2** — PIN: `2222` (Balance: ₹2610)
- **user3** — PIN: `3333` (Balance: ₹3000)

*(You can also use the **Test Accounts** dropdown in the top bar for instant 1-click testing!)*
