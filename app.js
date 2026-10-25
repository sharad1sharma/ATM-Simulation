/**
 * Laxmi Chit Fund ATM - Interactive Frontend Application
 * Faithfully reproducing ATM.py logic with modern responsive web capabilities
 */

(function () {
  'use strict';

  // ==========================================
  // Default Data (Synced with project files)
  // ==========================================
  const DEFAULT_USERS = ['user1', 'user2', 'user3'];
  const DEFAULT_PINS = ['1234', '2222', '3333'];
  const DEFAULT_BALANCES = [860, 2610, 3000];

  // Storage Keys
  const STORAGE_KEY_USERS = 'atm_users';
  const STORAGE_KEY_PINS = 'atm_pins';
  const STORAGE_KEY_BALANCES = 'atm_balances';
  const STORAGE_KEY_HISTORY = 'atm_history';

  // Application State
  const state = {
    users: [],
    pins: [],
    balances: [],
    history: {}, // { username: ["timestamp | Type: Amount | Bal: X"] }
    currentUser: null,
    userIndex: null,
    loginAttempts: 3,
    currentScreen: 'welcome', // welcome, login, home, balance, withdraw, deposit, transfer, pin, statement
    voiceEnabled: true,
    viewMode: 'window', // 'window' or 'kiosk'
    inactivitySeconds: 40,
    inactivityTimerId: null,
    clockTimerId: null,
    pinModalCallback: null,
    activeInputTarget: null,
    lastReceipt: ''
  };

  // ==========================================
  // DOM Elements
  // ==========================================
  const elements = {
    outerWrapper: document.getElementById('atm-outer-wrapper'),
    screenClock: document.getElementById('screen-clock'),
    screenTitle: document.getElementById('screen-title'),
    screenContent: document.getElementById('screen-content'),
    screenMessageBar: document.getElementById('screen-message-bar'),
    sidebarStatus: document.getElementById('sidebar-status'),
    actionButtonsList: document.getElementById('action-buttons-list'),
    toggleViewBtn: document.getElementById('toggle-view-btn'),
    viewModeLabel: document.getElementById('view-mode-label'),
    toggleSoundBtn: document.getElementById('toggle-sound-btn'),
    soundIcon: document.getElementById('sound-icon'),
    soundLabel: document.getElementById('sound-label'),
    inactivityTimerBadge: document.getElementById('inactivity-timer'),
    timerCount: document.getElementById('timer-count'),
    demoSelect: document.getElementById('demo-account-select'),
    winCloseBtn: document.getElementById('win-close-btn'),
    // Modals
    pinModalOverlay: document.getElementById('pin-modal-overlay'),
    pinModalClose: document.getElementById('modal-close-btn'),
    pinModalInput: document.getElementById('modal-pin-input'),
    pinModalFeedback: document.getElementById('modal-feedback'),
    pinModalSubmit: document.getElementById('modal-pin-submit'),
    pinModalCancel: document.getElementById('modal-pin-cancel'),
    toggleModalPin: document.getElementById('toggle-modal-pin'),
    receiptModalOverlay: document.getElementById('receipt-modal-overlay'),
    receiptModalClose: document.getElementById('receipt-modal-close'),
    fullReceiptText: document.getElementById('full-receipt-text'),
    printReceiptBtn: document.getElementById('print-receipt-btn'),
    closeReceiptBtn: document.getElementById('close-receipt-btn'),
    // Hardware Peripherals
    cardSlotWrap: document.getElementById('card-slot-wrap'),
    virtualAtmCard: document.getElementById('virtual-atm-card'),
    cardHolderName: document.getElementById('card-holder-name'),
    cashNotesStack: document.getElementById('cash-notes-stack'),
    cashSlotStatus: document.getElementById('cash-slot-status'),
    printedReceiptPaper: document.getElementById('printed-receipt-paper'),
    receiptSlotStatus: document.getElementById('receipt-slot-status'),
    atmKeypad: document.getElementById('atm-keypad'),
    mobileDrawerBtn: document.getElementById('mobile-drawer-btn'),
    sidebarPanel: document.getElementById('sidebar-panel'),
    // Guide Modal & Top Logout
    guideBtn: document.getElementById('guide-btn'),
    guideModalOverlay: document.getElementById('guide-modal-overlay'),
    guideModalClose: document.getElementById('guide-modal-close'),
    closeGuideBtn: document.getElementById('close-guide-btn'),
    topLogoutBtn: document.getElementById('top-logout-btn')
  };

  // ==========================================
  // Sound Synthesis & Voice (Web Audio & Speech)
  // ==========================================
  let audioCtx = null;

  function initAudio() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        audioCtx = new AudioContext();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function playTone(freq, duration, type = 'sine', gainVal = 0.1) {
    if (!state.voiceEnabled) return;
    try {
      initAudio();
      if (!audioCtx) return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(gainVal, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) {
      // Audio not supported or blocked
    }
  }

  function playBeep() {
    playTone(1200, 0.08, 'sine', 0.12);
  }

  function playSuccessSound() {
    playTone(784, 0.1, 'triangle', 0.15);
    setTimeout(() => playTone(1046, 0.2, 'triangle', 0.15), 100);
  }

  function playErrorSound() {
    playTone(320, 0.12, 'sawtooth', 0.15);
    setTimeout(() => playTone(240, 0.2, 'sawtooth', 0.15), 120);
  }

  function playCashDispenseSound() {
    if (!state.voiceEnabled) return;
    try {
      initAudio();
      if (!audioCtx) return;
      for (let i = 0; i < 5; i++) {
        setTimeout(() => {
          playTone(600 + Math.random() * 200, 0.06, 'triangle', 0.08);
        }, i * 90);
      }
    } catch (e) {}
  }

  /**
   * Browser Speech Synthesis (matching pyttsx3 voice narration)
   */
  function speak(text) {
    if (!state.voiceEnabled || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel(); // Cancel any ongoing utterance
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9; // Slower rate matching ATM.py rate - 50
      utterance.pitch = 1.0;
      utterance.lang = 'en-US';
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn('Speech synthesis error:', err);
    }
  }

  // ==========================================
  // Data Persistence & Storage
  // ==========================================
  function loadData() {
    try {
      const storedUsers = localStorage.getItem(STORAGE_KEY_USERS);
      const storedPins = localStorage.getItem(STORAGE_KEY_PINS);
      const storedBalances = localStorage.getItem(STORAGE_KEY_BALANCES);
      const storedHistory = localStorage.getItem(STORAGE_KEY_HISTORY);

      state.users = storedUsers ? JSON.parse(storedUsers) : [...DEFAULT_USERS];
      state.pins = storedPins ? JSON.parse(storedPins) : [...DEFAULT_PINS];
      state.balances = storedBalances ? JSON.parse(storedBalances) : [...DEFAULT_BALANCES];
      state.history = storedHistory ? JSON.parse(storedHistory) : {};

      // Normalize usernames
      state.users = state.users.map(u => String(u).toLowerCase());
      state.pins = state.pins.map(p => String(p));
      state.balances = state.balances.map(b => Number(b) || 0);

      // Pad arrays if needed
      const maxLen = Math.max(state.users.length, state.pins.length, state.balances.length);
      while (state.users.length < maxLen) state.users.push(`user${state.users.length + 1}`);
      while (state.pins.length < maxLen) state.pins.push('0000');
      while (state.balances.length < maxLen) state.balances.push(0);

      saveData();

      // Check if backend Python server is running and sync live
      if (window.location.protocol.startsWith('http')) {
        fetch('/api/data')
          .then(res => res.ok ? res.json() : null)
          .then(data => {
            if (data && data.users && data.pins && data.balances) {
              state.users = data.users;
              state.pins = data.pins;
              state.balances = data.balances;
              saveData(false);
            }
          })
          .catch(() => {});
      }
    } catch (err) {
      console.error('Failed to load storage, using defaults:', err);
      state.users = [...DEFAULT_USERS];
      state.pins = [...DEFAULT_PINS];
      state.balances = [...DEFAULT_BALANCES];
      state.history = {};
    }
  }

  function saveData(syncBackend = true) {
    try {
      localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(state.users));
      localStorage.setItem(STORAGE_KEY_PINS, JSON.stringify(state.pins));
      localStorage.setItem(STORAGE_KEY_BALANCES, JSON.stringify(state.balances));
      localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(state.history));

      // Asynchronously sync with Python text files if server is present
      if (syncBackend && window.location.protocol.startsWith('http')) {
        fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            users: state.users,
            pins: state.pins,
            balances: state.balances
          })
        }).catch(() => {});
      }
    } catch (err) {
      console.error('Failed to save data:', err);
    }
  }

  function recordTransaction(user, ttype, amount, balance) {
    if (!state.history[user]) {
      state.history[user] = [];
    }
    const ts = formatCurrentDateTime();
    const entry = `${ts} | ${ttype}: ${amount} | Bal: ${balance}`;
    state.history[user].push(entry);
    if (state.history[user].length > 5) {
      state.history[user] = state.history[user].slice(-5);
    }
    saveData();
  }

  function generateReceipt(user, ttype, amount, balance) {
    const ts = formatCurrentDateTime();
    const lines = [
      "╔════════════════════════════════════╗",
      "║      Laxmi Chit Fund ATM           ║",
      "╠════════════════════════════════════╣",
      `Date: ${ts}`,
      `User: ${user}`,
      `Transaction: ${ttype}`,
      `Amount: ${amount} Rupees`,
      `Balance: ${balance} Rupees`,
      "╠════════════════════════════════════╣",
      "Thank you for using our ATM!",
      "╚════════════════════════════════════╝"
    ];
    return lines.join('\n');
  }

  // ==========================================
  // Date & Time Utility
  // ==========================================
  function formatCurrentDateTime() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
  }

  function startClock() {
    function updateClock() {
      if (elements.screenClock) {
        elements.screenClock.textContent = formatCurrentDateTime();
      }
    }
    updateClock();
    state.clockTimerId = setInterval(updateClock, 1000);
  }

  // ==========================================
  // Inactivity Timer (Auto-logout after 40s)
  // ==========================================
  function resetInactivityTimer() {
    state.inactivitySeconds = 40;
    updateInactivityDisplay();
  }

  function updateInactivityDisplay() {
    if (!elements.timerCount) return;
    elements.timerCount.textContent = `${state.inactivitySeconds}s`;
    if (state.inactivitySeconds <= 10 && state.currentUser) {
      elements.inactivityTimerBadge.classList.add('warning');
    } else {
      elements.inactivityTimerBadge.classList.remove('warning');
    }
  }

  function startInactivityCountdown() {
    if (state.inactivityTimerId) clearInterval(state.inactivityTimerId);
    state.inactivityTimerId = setInterval(() => {
      if (state.currentUser) {
        state.inactivitySeconds--;
        updateInactivityDisplay();
        if (state.inactivitySeconds <= 0) {
          sessionExpired();
        }
      } else {
        state.inactivitySeconds = 40;
        updateInactivityDisplay();
      }
    }, 1000);
  }

  function sessionExpired() {
    if (state.currentUser) {
      speak("Session expired due to inactivity");
      setMessage("Session expired due to inactivity", "error");
      logout();
    }
  }

  // ==========================================
  // Screen Rendering Helpers
  // ==========================================
  function clearScreen() {
    elements.screenContent.innerHTML = '';
    setMessage('');
  }

  function setMessage(text, type = 'normal') {
    elements.screenMessageBar.textContent = text;
    elements.screenMessageBar.className = 'screen-message-bar';
    if (type === 'error') {
      elements.screenMessageBar.classList.add('error');
    } else if (type === 'success') {
      elements.screenMessageBar.classList.add('success');
    }
  }

  function setScreenTitle(title) {
    elements.screenTitle.textContent = title;
  }

  function updateSidebarStatus() {
    if (state.currentUser) {
      elements.sidebarStatus.textContent = `Status: Logged in as ${state.currentUser}`;
      elements.cardHolderName.textContent = state.currentUser.toUpperCase();
    } else {
      elements.sidebarStatus.textContent = 'Status: Awaiting login';
      elements.cardHolderName.textContent = 'INSERT CARD';
    }
  }

  // ==========================================
  // Screens Implementation
  // ==========================================

  /**
   * 1. Welcome Screen (Matches reference screenshot + New User Support)
   */
  function showWelcomeScreen() {
    state.currentScreen = 'welcome';
    clearScreen();
    setScreenTitle('Welcome to Laxmi Chit Fund ATM');
    updateSidebarStatus();
    if (elements.topLogoutBtn) elements.topLogoutBtn.style.display = 'none';

    // Reset card animation state
    elements.virtualAtmCard.classList.remove('inserted');

    const view = document.createElement('div');
    view.className = 'welcome-view';
    view.innerHTML = `
      <div class="welcome-prompt">Insert Card or Click Start</div>
      <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
        <button class="start-btn" id="main-start-btn">Start / Login</button>
        <button class="secondary-btn" id="main-register-btn" style="font-weight: 600; padding: 10px 22px;">New User? Register</button>
      </div>
      <div class="welcome-card-hint">
        Existing users: login with Username & PIN • New users: click Register to create an account
      </div>
      <button type="button" class="nav-btn" id="welcome-guide-btn" style="margin-top: 4px; font-size: 0.8rem;">
        💡 How to Register, Login & Logout
      </button>
    `;

    elements.screenContent.appendChild(view);

    document.getElementById('main-start-btn').addEventListener('click', () => {
      playBeep();
      showLoginScreen();
    });

    document.getElementById('main-register-btn').addEventListener('click', () => {
      playBeep();
      showRegisterScreen();
    });

    document.getElementById('welcome-guide-btn').addEventListener('click', () => {
      playBeep();
      elements.guideModalOverlay.classList.add('active');
    });
  }

  /**
   * 2. Login Screen
   */
  function showLoginScreen(prefillUser = '', prefillPin = '') {
    state.currentScreen = 'login';
    clearScreen();
    setScreenTitle('Card Login');
    if (elements.topLogoutBtn) elements.topLogoutBtn.style.display = 'none';

    const view = document.createElement('div');
    view.className = 'login-view';
    view.innerHTML = `
      <form class="form-grid" id="login-form" onsubmit="return false;">
        <div class="form-row">
          <label class="form-label" for="login-username">Username:</label>
          <input type="text" class="atm-input" id="login-username" value="${prefillUser}" placeholder="e.g. user1" autocomplete="off" autofocus />
        </div>
        <div class="form-row">
          <label class="form-label" for="login-pin">PIN / Password:</label>
          <div class="input-with-action">
            <input type="password" class="atm-input" id="login-pin" value="${prefillPin}" maxlength="16" placeholder="4-digit PIN" autocomplete="off" />
            <button type="button" class="input-action-btn" id="toggle-login-pin" title="Show/Hide Password">👁</button>
          </div>
        </div>
        <div style="display: flex; gap: 8px; margin-top: 6px;">
          <button type="submit" class="submit-btn" id="login-submit-btn" style="flex: 1;">Login</button>
          <button type="button" class="secondary-btn" id="login-reg-switch-btn" style="flex: 1;">New Account</button>
        </div>
      </form>
      <div class="login-feedback" id="login-feedback"></div>
    `;

    elements.screenContent.appendChild(view);

    const userInput = document.getElementById('login-username');
    const pinInput = document.getElementById('login-pin');
    const feedback = document.getElementById('login-feedback');
    const form = document.getElementById('login-form');
    const toggleBtn = document.getElementById('toggle-login-pin');

    state.activeInputTarget = pinInput;

    toggleBtn.addEventListener('click', () => {
      if (pinInput.type === 'password') {
        pinInput.type = 'text';
        toggleBtn.textContent = '🔒';
      } else {
        pinInput.type = 'password';
        toggleBtn.textContent = '👁';
      }
    });

    document.getElementById('login-reg-switch-btn').addEventListener('click', () => {
      playBeep();
      showRegisterScreen();
    });

    form.addEventListener('submit', () => {
      attemptLogin(userInput.value.trim().toLowerCase(), pinInput.value.trim(), feedback);
    });

    if (prefillUser && prefillPin) {
      setTimeout(() => attemptLogin(prefillUser, prefillPin, feedback), 300);
    }
  }

  function attemptLogin(username, pin, feedbackElem) {
    playBeep();
    if (!username) {
      if (feedbackElem) {
        feedbackElem.textContent = 'Please enter username';
        feedbackElem.style.color = 'var(--danger)';
      }
      playErrorSound();
      return;
    }

    const uIndex = state.users.indexOf(username);

    if (uIndex !== -1 && pin === state.pins[uIndex]) {
      // Success
      state.loginAttempts = 3;
      state.currentUser = username;
      state.userIndex = uIndex;
      updateSidebarStatus();
      setMessage(`Logged in as ${state.currentUser}`, 'success');
      recordTransaction(state.currentUser, 'Login', '-', state.balances[state.userIndex]);
      playSuccessSound();
      speak('Login successful!');

      // Animate card inserted in kiosk view
      elements.virtualAtmCard.classList.add('inserted');

      showAccountHome();
    } else {
      // Failed attempt
      state.loginAttempts--;
      playErrorSound();
      if (state.loginAttempts > 0) {
        const msg = `Invalid PIN / Password. ${state.loginAttempts} attempts left.`;
        if (feedbackElem) {
          feedbackElem.textContent = msg;
          feedbackElem.style.color = 'var(--danger)';
        }
        speak(msg);
        const pinInput = document.getElementById('login-pin');
        if (pinInput) pinInput.value = '';
      } else {
        const msg = 'Too many incorrect attempts. Exiting...';
        if (feedbackElem) {
          feedbackElem.textContent = msg;
          feedbackElem.style.color = '#ff3333';
        }
        speak(msg);
        setTimeout(() => logout(), 1400);
      }
    }
  }

  /**
   * 2b. New User Registration Screen
   */
  function showRegisterScreen() {
    state.currentScreen = 'register';
    clearScreen();
    setScreenTitle('New User Registration');
    if (elements.topLogoutBtn) elements.topLogoutBtn.style.display = 'none';

    const view = document.createElement('div');
    view.className = 'register-view';
    view.innerHTML = `
      <form class="form-grid register-form" id="register-form" onsubmit="return false;">
        <div class="form-row">
          <label class="form-label" for="reg-username">Desired Username:</label>
          <input type="text" class="atm-input" id="reg-username" placeholder="e.g. john_doe" autocomplete="off" autofocus />
        </div>
        <div class="form-row">
          <label class="form-label" for="reg-pin">Set 4-Digit PIN / Password:</label>
          <div class="input-with-action">
            <input type="password" class="atm-input" id="reg-pin" maxlength="16" placeholder="4-digit PIN" autocomplete="off" />
            <button type="button" class="input-action-btn" id="toggle-reg-pin" title="Show/Hide">👁</button>
          </div>
        </div>
        <div class="form-row">
          <label class="form-label" for="reg-confirm-pin">Confirm PIN / Password:</label>
          <div class="input-with-action">
            <input type="password" class="atm-input" id="reg-confirm-pin" maxlength="16" placeholder="Repeat PIN" autocomplete="off" />
            <button type="button" class="input-action-btn" id="toggle-reg-confirm" title="Show/Hide">👁</button>
          </div>
        </div>
        <div class="form-row">
          <label class="form-label" for="reg-deposit">Initial Deposit Amount (₹):</label>
          <input type="number" step="10" min="0" class="atm-input" id="reg-deposit" value="1000" />
        </div>
        <div style="display: flex; gap: 8px; margin-top: 6px;">
          <button type="submit" class="submit-btn" id="reg-submit-btn" style="flex: 1;">Create Account</button>
          <button type="button" class="secondary-btn" id="reg-back-login-btn" style="flex: 1;">Back to Login</button>
        </div>
      </form>
      <div class="login-feedback" id="reg-feedback"></div>
    `;

    elements.screenContent.appendChild(view);

    const userInput = document.getElementById('reg-username');
    const pinInput = document.getElementById('reg-pin');
    const confirmInput = document.getElementById('reg-confirm-pin');
    const depositInput = document.getElementById('reg-deposit');
    const feedback = document.getElementById('reg-feedback');
    const form = document.getElementById('register-form');

    state.activeInputTarget = pinInput;

    // Toggle visibility for registration pins
    document.getElementById('toggle-reg-pin').addEventListener('click', (e) => {
      const isPwd = pinInput.type === 'password';
      pinInput.type = isPwd ? 'text' : 'password';
      e.target.textContent = isPwd ? '🔒' : '👁';
    });
    document.getElementById('toggle-reg-confirm').addEventListener('click', (e) => {
      const isPwd = confirmInput.type === 'password';
      confirmInput.type = isPwd ? 'text' : 'password';
      e.target.textContent = isPwd ? '🔒' : '👁';
    });

    document.getElementById('reg-back-login-btn').addEventListener('click', () => {
      playBeep();
      showLoginScreen();
    });

    form.addEventListener('submit', () => {
      attemptRegister(
        userInput.value.trim().toLowerCase(),
        pinInput.value.trim(),
        confirmInput.value.trim(),
        depositInput.value.trim(),
        feedback
      );
    });
  }

  function attemptRegister(newUsername, newPin, confirmPin, depositVal, feedbackElem) {
    playBeep();

    // 1. Username validation
    if (!newUsername || newUsername.length < 3 || !/^[a-zA-Z0-9_]+$/.test(newUsername)) {
      feedbackElem.textContent = 'Username must be at least 3 alphanumeric characters.';
      feedbackElem.style.color = 'var(--danger)';
      playErrorSound();
      speak('Username must be at least 3 characters.');
      return;
    }

    if (state.users.includes(newUsername)) {
      feedbackElem.textContent = `Username "${newUsername}" is already taken.`;
      feedbackElem.style.color = 'var(--danger)';
      playErrorSound();
      speak('Username already exists. Please pick another.');
      return;
    }

    // 2. PIN validation
    if (!newPin || newPin.length < 4) {
      feedbackElem.textContent = 'PIN / Password must be at least 4 characters/digits.';
      feedbackElem.style.color = 'var(--danger)';
      playErrorSound();
      speak('PIN must be at least 4 characters.');
      return;
    }

    if (newPin !== confirmPin) {
      feedbackElem.textContent = 'PINs do not match. Please re-enter.';
      feedbackElem.style.color = 'var(--danger)';
      playErrorSound();
      speak('PINs do not match.');
      return;
    }

    // 3. Initial deposit validation
    const initBal = parseInt(depositVal, 10);
    if (isNaN(initBal) || initBal < 0 || initBal % 10 !== 0) {
      feedbackElem.textContent = 'Initial deposit must be a multiple of 10.';
      feedbackElem.style.color = 'var(--danger)';
      playErrorSound();
      speak('Deposit must be in multiples of 10.');
      return;
    }

    // Save locally
    state.users.push(newUsername);
    state.pins.push(newPin);
    state.balances.push(initBal);
    saveData(true);

    recordTransaction(newUsername, 'Account Created', initBal, initBal);

    // Update demo dropdown in top bar
    if (elements.demoSelect) {
      const opt = document.createElement('option');
      opt.value = `${newUsername}:${newPin}`;
      opt.textContent = `${newUsername} (PIN: ${newPin}, Bal: ₹${initBal})`;
      elements.demoSelect.appendChild(opt);
    }

    feedbackElem.textContent = `Account created! Logging you in as ${newUsername}...`;
    feedbackElem.style.color = 'var(--accent)';
    playSuccessSound();
    speak('Account created successfully! Welcome to Laxmi Chit Fund ATM.');

    // Auto log-in new user
    setTimeout(() => {
      state.loginAttempts = 3;
      state.currentUser = newUsername;
      state.userIndex = state.users.indexOf(newUsername);
      updateSidebarStatus();
      elements.virtualAtmCard.classList.add('inserted');
      showAccountHome();
    }, 1200);
  }

  /**
   * 3. Account Home Screen
   */
  function showAccountHome() {
    state.currentScreen = 'home';
    clearScreen();
    setScreenTitle(`Account: ${state.currentUser}`);
    updateSidebarStatus();
    if (elements.topLogoutBtn) elements.topLogoutBtn.style.display = 'inline-flex';

    const view = document.createElement('div');
    view.className = 'account-home-view';

    const recent = state.history[state.currentUser] || [];
    const recentItemsHtml = recent.length === 0
      ? '<li style="color: var(--muted); padding: 4px;">No recent transactions</li>'
      : recent.slice().reverse().map(item => {
          const parts = item.split('|');
          const date = parts[0] || '';
          const detail = parts[1] || '';
          const bal = parts[2] || '';
          return `
            <li class="transaction-item">
              <div>
                <span class="t-type">${detail.trim()}</span>
                <span class="t-date" style="display:block;">${date.trim()}</span>
              </div>
              <span style="color: var(--accent);">${bal.trim()}</span>
            </li>
          `;
        }).join('');

    view.innerHTML = `
      <div class="account-top-shortcuts">
        <button class="secondary-btn" id="home-check-bal-btn">Check Balance</button>
        <button class="secondary-btn" id="home-mini-stmt-btn">Mini Statement</button>
        <button class="dashboard-logout-btn" id="home-logout-btn" title="End Session">Logout ⏻</button>
      </div>
      <div class="greeting-banner">
        <div class="greeting-text">Hello, ${state.currentUser}</div>
        <div class="account-tier">PREMIUM SAVINGS ACCOUNT</div>
      </div>
      <div class="recent-activity-card">
        <div class="activity-header">Recent Transactions:</div>
        <ul class="transaction-list">
          ${recentItemsHtml}
        </ul>
      </div>
    `;

    elements.screenContent.appendChild(view);

    document.getElementById('home-check-bal-btn').addEventListener('click', () => {
      playBeep();
      balanceWithPin();
    });
    document.getElementById('home-mini-stmt-btn').addEventListener('click', () => {
      playBeep();
      miniStatementWithPin();
    });
    document.getElementById('home-logout-btn').addEventListener('click', () => {
      playBeep();
      logout();
    });

    setMessage('Choose an action from the left');
  }

  /**
   * 4. Balance Screen (with PIN popup first)
   */
  function balanceWithPin() {
    if (!state.currentUser) {
      setMessage('Please login first', 'error');
      playErrorSound();
      return;
    }
    askPinAndContinue(() => {
      showBalance();
    });
  }

  function showBalance() {
    state.currentScreen = 'balance';
    clearScreen();
    setScreenTitle('Balance Inquiry');

    const bal = state.balances[state.userIndex];
    recordTransaction(state.currentUser, 'Balance Check', '-', bal);

    const view = document.createElement('div');
    view.className = 'balance-view';
    view.innerHTML = `
      <div class="balance-card">
        <div class="balance-label">Your current available balance is:</div>
        <div class="balance-amount">₹ ${bal.toLocaleString()} Rupees</div>
      </div>
      <div class="action-btn-row">
        <button class="secondary-btn" id="bal-back-btn">Back to Menu</button>
        <button class="submit-btn" id="bal-receipt-btn">Print Receipt</button>
      </div>
    `;

    elements.screenContent.appendChild(view);
    setMessage('Balance displayed');
    playSuccessSound();
    speak(`Your balance is ${bal} Rupees`);

    document.getElementById('bal-back-btn').addEventListener('click', () => {
      playBeep();
      showAccountHome();
    });

    document.getElementById('bal-receipt-btn').addEventListener('click', () => {
      playBeep();
      const receipt = generateReceipt(state.currentUser, 'Balance Check', '-', bal);
      ejectReceipt(receipt);
    });
  }

  /**
   * 5. Deposit Screen (No extra PIN step, matches ATM.py)
   */
  function openDepositScreen() {
    if (!state.currentUser) {
      setMessage('Please login first', 'error');
      playErrorSound();
      return;
    }

    state.currentScreen = 'deposit';
    clearScreen();
    setScreenTitle('Deposit');
    speak('Enter the amount to deposit');

    const view = document.createElement('div');
    view.className = 'action-screen-view';
    view.innerHTML = `
      <div style="font-size: 0.95rem; color: var(--text-fg); margin-top: 6px;">
        Enter the amount to deposit (multiples of 10):
      </div>
      <div style="max-width: 340px;">
        <input type="number" step="10" min="10" class="atm-input" id="deposit-amount-input" placeholder="e.g. 500" autofocus />
        <div class="quick-amount-row">
          <button type="button" class="amount-chip" data-amt="500">+ ₹500</button>
          <button type="button" class="amount-chip" data-amt="1000">+ ₹1,000</button>
          <button type="button" class="amount-chip" data-amt="2000">+ ₹2,000</button>
          <button type="button" class="amount-chip" data-amt="5000">+ ₹5,000</button>
        </div>
      </div>
      <div class="action-btn-row">
        <button class="submit-btn" id="deposit-submit-btn">Submit</button>
        <button class="secondary-btn" id="deposit-back-btn">Back</button>
      </div>
      <div class="terminal-output" id="deposit-output-panel" style="display:none;"></div>
    `;

    elements.screenContent.appendChild(view);

    const input = document.getElementById('deposit-amount-input');
    state.activeInputTarget = input;

    // Quick chips
    view.querySelectorAll('.amount-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        playBeep();
        const cur = Number(input.value) || 0;
        input.value = cur + Number(btn.dataset.amt);
      });
    });

    document.getElementById('deposit-submit-btn').addEventListener('click', () => {
      doDeposit(input.value.trim());
    });

    document.getElementById('deposit-back-btn').addEventListener('click', () => {
      playBeep();
      showAccountHome();
    });
  }

  function doDeposit(val) {
    playBeep();
    const amt = parseInt(val, 10);
    if (isNaN(amt) || amt <= 0 || amt % 10 !== 0) {
      setMessage('Invalid amount. Enter positive multiple of 10.', 'error');
      playErrorSound();
      speak('Deposit amount must be in multiples of 10.');
      return;
    }

    state.balances[state.userIndex] += amt;
    saveData();
    recordTransaction(state.currentUser, 'Deposited', amt, state.balances[state.userIndex]);
    const receipt = generateReceipt(state.currentUser, 'Deposit', amt, state.balances[state.userIndex]);

    const panel = document.getElementById('deposit-output-panel');
    if (panel) {
      panel.style.display = 'block';
      panel.textContent = receipt;
    }

    setMessage(`Deposit successful! Your new balance is ${state.balances[state.userIndex]} Rupees`, 'success');
    playSuccessSound();
    speak('Deposit Successful!');
    ejectReceipt(receipt);
  }

  /**
   * 6. Withdraw Screen (PIN required, matches ATM.py)
   */
  function openWithdrawScreen() {
    if (!state.currentUser) {
      setMessage('Please login first', 'error');
      playErrorSound();
      return;
    }

    state.currentScreen = 'withdraw';
    clearScreen();
    setScreenTitle('Withdraw');
    speak('Enter the amount to withdraw');

    const view = document.createElement('div');
    view.className = 'action-screen-view';
    view.innerHTML = `
      <div style="font-size: 0.95rem; color: var(--text-fg); margin-top: 6px;">
        Enter the amount to withdraw (multiples of 10):
      </div>
      <div style="max-width: 340px;">
        <input type="number" step="10" min="10" class="atm-input" id="withdraw-amount-input" placeholder="e.g. 500" autofocus />
        <div class="quick-amount-row">
          <button type="button" class="amount-chip" data-amt="500">₹500</button>
          <button type="button" class="amount-chip" data-amt="1000">₹1,000</button>
          <button type="button" class="amount-chip" data-amt="2000">₹2,000</button>
          <button type="button" class="amount-chip" data-amt="5000">₹5,000</button>
        </div>
      </div>
      <div class="action-btn-row">
        <button class="submit-btn" id="withdraw-submit-btn">Withdraw</button>
        <button class="secondary-btn" id="withdraw-back-btn">Back</button>
      </div>
      <div class="terminal-output" id="withdraw-output-panel" style="display:none;"></div>
    `;

    elements.screenContent.appendChild(view);

    const input = document.getElementById('withdraw-amount-input');
    state.activeInputTarget = input;

    view.querySelectorAll('.amount-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        playBeep();
        input.value = btn.dataset.amt;
      });
    });

    document.getElementById('withdraw-submit-btn').addEventListener('click', () => {
      withdrawPinStep(input.value.trim());
    });

    document.getElementById('withdraw-back-btn').addEventListener('click', () => {
      playBeep();
      showAccountHome();
    });
  }

  function withdrawPinStep(amtVal) {
    playBeep();
    const amt = parseInt(amtVal, 10);
    if (isNaN(amt) || amt <= 0 || amt % 10 !== 0) {
      setMessage('Invalid amount. Enter positive multiple of 10.', 'error');
      playErrorSound();
      speak('Withdrawal amount must be in multiples of 10.');
      return;
    }
    if (amt > state.balances[state.userIndex]) {
      setMessage('Insufficient balance', 'error');
      playErrorSound();
      speak('Insufficient balance');
      return;
    }

    askPinAndContinue(() => {
      doWithdraw(amt);
    });
  }

  function doWithdraw(amt) {
    state.balances[state.userIndex] -= amt;
    saveData();
    recordTransaction(state.currentUser, 'Withdrawn', amt, state.balances[state.userIndex]);
    const receipt = generateReceipt(state.currentUser, 'Withdraw', amt, state.balances[state.userIndex]);

    const panel = document.getElementById('withdraw-output-panel');
    if (panel) {
      panel.style.display = 'block';
      panel.textContent = receipt;
    }

    setMessage('Withdrawal successful - collect cash', 'success');
    playSuccessSound();
    speak('Withdrawal Successful!');

    // Trigger physical hardware cash dispenser animation
    dispenseCash(amt);
    ejectReceipt(receipt);
  }

  /**
   * 7. Transfer Money Screen (PIN required, matches ATM.py)
   */
  function openTransferScreen() {
    if (!state.currentUser) {
      setMessage('Please login first', 'error');
      playErrorSound();
      return;
    }

    state.currentScreen = 'transfer';
    clearScreen();
    setScreenTitle('Transfer Money');

    const view = document.createElement('div');
    view.className = 'action-screen-view';
    view.innerHTML = `
      <form class="form-grid" id="transfer-form" style="max-width: 360px;" onsubmit="return false;">
        <div class="form-row">
          <label class="form-label" for="transfer-recipient">Recipient Username:</label>
          <input type="text" class="atm-input" id="transfer-recipient" placeholder="e.g. user2" autocomplete="off" autofocus />
        </div>
        <div class="form-row">
          <label class="form-label" for="transfer-amount">Amount to Transfer:</label>
          <input type="number" step="10" min="10" class="atm-input" id="transfer-amount" placeholder="Multiples of 10" />
        </div>
        <div class="action-btn-row">
          <button type="submit" class="submit-btn" id="transfer-submit-btn">Proceed</button>
          <button type="button" class="secondary-btn" id="transfer-back-btn">Back</button>
        </div>
      </form>
      <div class="terminal-output" id="transfer-output-panel" style="display:none;"></div>
    `;

    elements.screenContent.appendChild(view);

    const recipientInput = document.getElementById('transfer-recipient');
    const amountInput = document.getElementById('transfer-amount');
    const form = document.getElementById('transfer-form');

    state.activeInputTarget = recipientInput;

    form.addEventListener('submit', () => {
      transferPinStep(recipientInput.value.trim().toLowerCase(), amountInput.value.trim());
    });

    document.getElementById('transfer-back-btn').addEventListener('click', () => {
      playBeep();
      showAccountHome();
    });
  }

  function transferPinStep(recipient, amtVal) {
    playBeep();
    if (!state.users.includes(recipient)) {
      setMessage('Recipient not found', 'error');
      playErrorSound();
      speak('Recipient not found');
      return;
    }

    if (recipient === state.currentUser) {
      setMessage('Cannot transfer to your own account', 'error');
      playErrorSound();
      speak('Cannot transfer to your own account. Please choose another account.');
      return;
    }

    const amt = parseInt(amtVal, 10);
    if (isNaN(amt) || amt <= 0 || amt % 10 !== 0) {
      setMessage('Invalid amount. Must be multiple of 10.', 'error');
      playErrorSound();
      speak('Invalid transfer amount. Amount must be in multiples of 10.');
      return;
    }

    if (amt > state.balances[state.userIndex]) {
      setMessage('Insufficient balance', 'error');
      playErrorSound();
      speak('Insufficient balance');
      return;
    }

    askPinAndContinue(() => {
      doTransfer(recipient, amt);
    });
  }

  function doTransfer(recipient, amt) {
    const recipientIndex = state.users.indexOf(recipient);
    state.balances[state.userIndex] -= amt;
    state.balances[recipientIndex] += amt;
    saveData();

    recordTransaction(state.currentUser, `Sent to ${recipient}`, amt, state.balances[state.userIndex]);
    recordTransaction(recipient, `Received from ${state.currentUser}`, amt, state.balances[recipientIndex]);

    const receipt = [
      "╔════════════════════════════════════╗",
      "║        TRANSFER RECEIPT            ║",
      "╠════════════════════════════════════╣",
      `From: ${state.currentUser}`,
      `To: ${recipient}`,
      `Amount: ${amt} Rupees`,
      `New Balance: ${state.balances[state.userIndex]} Rupees`,
      `Date: ${formatCurrentDateTime()}`,
      "╚════════════════════════════════════╝"
    ].join('\n');

    const panel = document.getElementById('transfer-output-panel');
    if (panel) {
      panel.style.display = 'block';
      panel.textContent = receipt;
    }

    setMessage('Transfer successful', 'success');
    playSuccessSound();
    speak('Transfer successful.');
    ejectReceipt(receipt);
  }

  /**
   * 8. Mini Statement Screen (PIN required, matches ATM.py)
   */
  function miniStatementWithPin() {
    if (!state.currentUser) {
      setMessage('Please login first', 'error');
      playErrorSound();
      return;
    }
    askPinAndContinue(() => {
      showMiniStatement();
    });
  }

  function showMiniStatement() {
    state.currentScreen = 'statement';
    clearScreen();
    setScreenTitle('Mini Statement');

    const history = state.history[state.currentUser] || [];
    if (history.length === 0) {
      const view = document.createElement('div');
      view.style.padding = '40px 10px';
      view.style.textAlign = 'center';
      view.style.color = 'var(--muted)';
      view.textContent = 'No recent transactions';
      elements.screenContent.appendChild(view);
      speak('You have no recent transactions');
      return;
    }

    const receipt = [
      "╔═══════════════════════════════════════════════════════╗",
      "║               LAXMI CHIT FUND MINI STATEMENT          ║",
      "╠═══════════════════════════════════════════════════════╣",
      ...history.slice().reverse(),
      "╠═══════════════════════════════════════════════════════╣",
      `Current Balance: ${state.balances[state.userIndex]} Rupees`,
      "╚═══════════════════════════════════════════════════════╝"
    ].join('\n');

    const view = document.createElement('div');
    view.className = 'action-screen-view';
    view.innerHTML = `
      <div class="terminal-output" style="max-height: 240px;">${receipt}</div>
      <div class="action-btn-row">
        <button class="secondary-btn" id="stmt-back-btn">Back</button>
        <button class="submit-btn" id="stmt-print-btn">Print Statement</button>
      </div>
    `;

    elements.screenContent.appendChild(view);
    setMessage('Showing mini statement');
    playSuccessSound();
    speak('Displaying your recent transactions');

    document.getElementById('stmt-back-btn').addEventListener('click', () => {
      playBeep();
      showAccountHome();
    });

    document.getElementById('stmt-print-btn').addEventListener('click', () => {
      playBeep();
      ejectReceipt(receipt);
    });
  }

  /**
   * 9. Change PIN Screen
   */
  function openChangePinScreen() {
    if (!state.currentUser) {
      setMessage('Please login first', 'error');
      playErrorSound();
      return;
    }

    state.currentScreen = 'change-pin';
    clearScreen();
    setScreenTitle('Change PIN');

    const view = document.createElement('div');
    view.className = 'action-screen-view';
    view.innerHTML = `
      <form class="form-grid" id="change-pin-form" style="max-width: 360px;" onsubmit="return false;">
        <div class="form-row">
          <label class="form-label" for="curr-pin">Enter current PIN:</label>
          <input type="password" class="atm-input" id="curr-pin" maxlength="4" autofocus />
        </div>
        <div class="form-row">
          <label class="form-label" for="new-pin">Enter new 4-digit PIN:</label>
          <input type="password" class="atm-input" id="new-pin" maxlength="4" />
        </div>
        <div class="form-row">
          <label class="form-label" for="confirm-pin">Confirm new PIN:</label>
          <input type="password" class="atm-input" id="confirm-pin" maxlength="4" />
        </div>
        <div class="action-btn-row">
          <button type="submit" class="submit-btn" id="change-pin-submit">Submit</button>
          <button type="button" class="secondary-btn" id="change-pin-back">Back</button>
        </div>
      </form>
      <div class="login-feedback" id="pin-feedback"></div>
    `;

    elements.screenContent.appendChild(view);

    const currPinInput = document.getElementById('curr-pin');
    const newPinInput = document.getElementById('new-pin');
    const confirmPinInput = document.getElementById('confirm-pin');
    const feedback = document.getElementById('pin-feedback');

    state.activeInputTarget = currPinInput;

    document.getElementById('change-pin-form').addEventListener('submit', () => {
      doChangePin(currPinInput.value.trim(), newPinInput.value.trim(), confirmPinInput.value.trim(), feedback);
    });

    document.getElementById('change-pin-back').addEventListener('click', () => {
      playBeep();
      showAccountHome();
    });
  }

  function doChangePin(currPin, newPin, confirmPin, feedback) {
    playBeep();
    if (currPin !== state.pins[state.userIndex]) {
      feedback.textContent = 'Incorrect current PIN';
      feedback.style.color = 'var(--danger)';
      playErrorSound();
      speak('Incorrect current pin');
      return;
    }

    if (!/^\d{4}$/.test(newPin)) {
      feedback.textContent = 'PIN must be of 4 digits.';
      feedback.style.color = 'var(--danger)';
      playErrorSound();
      speak('PIN must be of 4 digits.');
      return;
    }

    if (newPin !== confirmPin) {
      feedback.textContent = 'New PIN and Confirm PIN do not match';
      feedback.style.color = 'var(--danger)';
      playErrorSound();
      speak("PIN doesn't match. Please try again.");
      return;
    }

    state.pins[state.userIndex] = newPin;
    saveData();
    feedback.textContent = 'PIN changed successfully';
    feedback.style.color = 'var(--accent)';
    recordTransaction(state.currentUser, 'PIN Change', '-', state.balances[state.userIndex]);
    playSuccessSound();
    speak('Your PIN has been changed successfully.');

    setTimeout(() => {
      showAccountHome();
    }, 1400);
  }

  /**
   * Logout and Exit actions
   */
  function logout() {
    playBeep();
    if (state.currentUser) {
      speak('Thank you for using the ATM.. Goodbye, Have a nice day!');
    }
    state.currentUser = null;
    state.userIndex = null;
    if (elements.topLogoutBtn) elements.topLogoutBtn.style.display = 'none';
    updateSidebarStatus();
    showWelcomeScreen();
  }

  function quitApp() {
    playBeep();
    if (confirm('Do you wish to exit the Laxmi Chit Fund ATM application?')) {
      logout();
      window.close();
    }
  }

  // ==========================================
  // PIN Modal Popup (ask_pin_and_continue)
  // ==========================================
  function askPinAndContinue(callback) {
    state.pinModalCallback = callback;
    elements.pinModalInput.value = '';
    elements.pinModalFeedback.textContent = '';
    elements.pinModalOverlay.classList.add('active');
    state.activeInputTarget = elements.pinModalInput;
    elements.pinModalInput.focus();
  }

  function closePinModal() {
    elements.pinModalOverlay.classList.remove('active');
    state.pinModalCallback = null;
  }

  function verifyModalPin() {
    playBeep();
    const entered = elements.pinModalInput.value.trim();
    if (entered === state.pins[state.userIndex]) {
      closePinModal();
      playSuccessSound();
      if (typeof state.pinModalCallback === 'function') {
        const cb = state.pinModalCallback;
        state.pinModalCallback = null;
        setTimeout(cb, 120);
      }
    } else {
      elements.pinModalFeedback.textContent = 'Incorrect PIN.';
      elements.pinModalFeedback.style.color = 'var(--danger)';
      playErrorSound();
      speak('Incorrect PIN.');
      setTimeout(() => {
        closePinModal();
      }, 1200);
    }
  }

  // ==========================================
  // Hardware Kiosk Peripherals Animations
  // ==========================================
  function dispenseCash(amount) {
    if (!elements.cashNotesStack) return;
    elements.cashNotesStack.classList.remove('dispensing');
    void elements.cashNotesStack.offsetWidth; // Reflow
    elements.cashNotesStack.classList.add('dispensing');
    elements.cashSlotStatus.textContent = `Dispensed ₹${amount}`;
    playCashDispenseSound();

    setTimeout(() => {
      elements.cashSlotStatus.textContent = 'Please Collect Cash';
    }, 1200);
  }

  function ejectReceipt(receiptText) {
    state.lastReceipt = receiptText;
    if (elements.printedReceiptPaper) {
      elements.printedReceiptPaper.classList.remove('printed');
      void elements.printedReceiptPaper.offsetWidth;
      elements.printedReceiptPaper.classList.add('printed');
      elements.receiptSlotStatus.textContent = 'Receipt Ready (Click)';
      playTone(900, 0.15, 'sawtooth', 0.05);
    }
  }

  function showReceiptModal(text) {
    elements.fullReceiptText.textContent = text || state.lastReceipt || 'No receipt available';
    elements.receiptModalOverlay.classList.add('active');
  }

  // ==========================================
  // Hardware Keypad Interaction
  // ==========================================
  function handleKeypadPress(key) {
    playBeep();
    const target = state.activeInputTarget || document.activeElement;

    if (key === 'Cancel') {
      if (elements.pinModalOverlay.classList.contains('active')) {
        closePinModal();
      } else if (state.currentScreen !== 'welcome') {
        showAccountHome();
      }
      return;
    }

    if (key === 'Clear') {
      if (target && 'value' in target) {
        target.value = '';
      }
      return;
    }

    if (key === 'Enter') {
      if (elements.pinModalOverlay.classList.contains('active')) {
        verifyModalPin();
      } else if (state.currentScreen === 'login') {
        const u = document.getElementById('login-username');
        const p = document.getElementById('login-pin');
        if (u && p) attemptLogin(u.value.trim().toLowerCase(), p.value.trim(), document.getElementById('login-feedback'));
      }
      return;
    }

    if (/^[0-9]$/.test(key)) {
      if (target && 'value' in target) {
        if (!target.maxLength || target.value.length < target.maxLength) {
          target.value += key;
        }
      }
    }
  }

  // ==========================================
  // Event Listeners Binding
  // ==========================================
  function bindEvents() {
    // Left Action Sidebar Buttons
    elements.actionButtonsList.addEventListener('click', (e) => {
      const btn = e.target.closest('.atm-action-btn');
      if (!btn) return;
      playBeep();
      const action = btn.dataset.action;

      // Highlight active button briefly
      elements.actionButtonsList.querySelectorAll('.atm-action-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      setTimeout(() => btn.classList.remove('active'), 200);

      switch (action) {
        case 'balance':
          balanceWithPin();
          break;
        case 'withdraw':
          openWithdrawScreen();
          break;
        case 'deposit':
          openDepositScreen();
          break;
        case 'change-pin':
          openChangePinScreen();
          break;
        case 'mini-statement':
          miniStatementWithPin();
          break;
        case 'transfer':
          openTransferScreen();
          break;
        case 'logout':
          logout();
          break;
        case 'exit':
          quitApp();
          break;
      }
    });

    // Toggle View Mode (Window View vs Kiosk View)
    elements.toggleViewBtn.addEventListener('click', () => {
      playBeep();
      if (state.viewMode === 'window') {
        state.viewMode = 'kiosk';
        elements.outerWrapper.classList.add('kiosk-mode');
        elements.viewModeLabel.textContent = 'Window View';
      } else {
        state.viewMode = 'window';
        elements.outerWrapper.classList.remove('kiosk-mode');
        elements.viewModeLabel.textContent = 'Kiosk View';
      }
    });

    // Toggle Voice / Sound
    elements.toggleSoundBtn.addEventListener('click', () => {
      state.voiceEnabled = !state.voiceEnabled;
      if (state.voiceEnabled) {
        elements.soundIcon.textContent = '🔊';
        elements.soundLabel.textContent = 'Voice: ON';
        speak('Voice enabled');
      } else {
        elements.soundIcon.textContent = '🔇';
        elements.soundLabel.textContent = 'Voice: OFF';
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      }
    });

    // Test Demo Accounts Quick Switcher
    elements.demoSelect.addEventListener('change', (e) => {
      const val = e.target.value;
      if (!val) return;
      playBeep();
      const [u, p] = val.split(':');
      showLoginScreen(u, p);
    });

    // Window controls
    elements.winCloseBtn.addEventListener('click', quitApp);

    // PIN Modal Events
    elements.pinModalClose.addEventListener('click', closePinModal);
    elements.pinModalCancel.addEventListener('click', closePinModal);
    elements.pinModalSubmit.addEventListener('click', verifyModalPin);
    elements.pinModalInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') verifyModalPin();
      if (e.key === 'Escape') closePinModal();
    });

    elements.toggleModalPin.addEventListener('click', () => {
      if (elements.pinModalInput.type === 'password') {
        elements.pinModalInput.type = 'text';
        elements.toggleModalPin.textContent = '🔒';
      } else {
        elements.pinModalInput.type = 'password';
        elements.toggleModalPin.textContent = '👁';
      }
    });

    // Receipt Modal Events
    if (elements.printedReceiptPaper) {
      elements.printedReceiptPaper.addEventListener('click', () => {
        playBeep();
        showReceiptModal(state.lastReceipt);
      });
    }

    elements.receiptModalClose.addEventListener('click', () => {
      elements.receiptModalOverlay.classList.remove('active');
    });
    elements.closeReceiptBtn.addEventListener('click', () => {
      elements.receiptModalOverlay.classList.remove('active');
    });
    elements.printReceiptBtn.addEventListener('click', () => {
      playBeep();
      window.print();
    });

    // Guide Modal Events
    if (elements.guideBtn) {
      elements.guideBtn.addEventListener('click', () => {
        playBeep();
        elements.guideModalOverlay.classList.add('active');
      });
    }
    if (elements.guideModalClose) {
      elements.guideModalClose.addEventListener('click', () => {
        elements.guideModalOverlay.classList.remove('active');
      });
    }
    if (elements.closeGuideBtn) {
      elements.closeGuideBtn.addEventListener('click', () => {
        playBeep();
        elements.guideModalOverlay.classList.remove('active');
      });
    }

    // Top Logout Button
    if (elements.topLogoutBtn) {
      elements.topLogoutBtn.addEventListener('click', () => {
        playBeep();
        logout();
      });
    }

    // Virtual ATM Card insertion click
    elements.virtualAtmCard.addEventListener('click', () => {
      playBeep();
      elements.virtualAtmCard.classList.add('inserted');
      playTone(450, 0.12, 'sawtooth', 0.1);
      setTimeout(() => {
        if (!state.currentUser) {
          showLoginScreen('user1', '1234');
        } else {
          setMessage(`Card belongs to ${state.currentUser}`);
        }
      }, 350);
    });

    // Cash collect click
    if (elements.cashNotesStack) {
      elements.cashNotesStack.addEventListener('click', () => {
        playBeep();
        elements.cashNotesStack.classList.remove('dispensing');
        elements.cashSlotStatus.textContent = 'Dispenser Ready';
        setMessage('Cash collected. Have a great day!', 'success');
      });
    }

    // Hardware Pinpad Buttons
    if (elements.atmKeypad) {
      elements.atmKeypad.addEventListener('click', (e) => {
        const btn = e.target.closest('.keypad-btn');
        if (!btn || btn.disabled) return;
        handleKeypadPress(btn.dataset.key);
      });
    }

    // Mobile Hamburger Drawer Button
    elements.mobileDrawerBtn.addEventListener('click', () => {
      playBeep();
      elements.sidebarPanel.classList.toggle('open');
    });

    // Reset inactivity timer on any interaction
    window.addEventListener('keydown', () => resetInactivityTimer());
    window.addEventListener('pointerdown', () => resetInactivityTimer());
  }

  // ==========================================
  // Initialization
  // ==========================================
  function init() {
    loadData();
    bindEvents();
    startClock();
    startInactivityCountdown();
    showWelcomeScreen();
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
