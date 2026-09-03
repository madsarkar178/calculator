/* ==========================================================================
   PERSISTENCE LAYER (LOCALSTORAGE & CONFIG SYNC)
   ========================================================================== */
const STORAGE_KEY = 'CYBERCALC_MASTER_STORE_V3';

function loadSavedConfigFromStorage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.admin) Object.assign(MASTER_CONFIG.admin, parsed.admin);
      if (parsed.paywall) Object.assign(MASTER_CONFIG.paywall, parsed.paywall);
      if (parsed.ui) Object.assign(MASTER_CONFIG.ui, parsed.ui);
      if (parsed.engine) {
        MASTER_CONFIG.engine.fixedOverride = parsed.engine.fixedOverride || "";
        if (parsed.engine.strategies) Object.assign(MASTER_CONFIG.engine.strategies, parsed.engine.strategies);
      }
    }
  } catch (err) {
    console.warn('LocalStorage unavailable', err);
  }
}

function saveCurrentConfigToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(MASTER_CONFIG));
  } catch (err) {
    console.warn('LocalStorage save error', err);
  }
}

loadSavedConfigFromStorage();

/** @type {number | null} */
let popupTimeoutId = null;
let equalsClickCounter = 0;

/* ==========================================================================
   WEB AUDIO SYNTHESIZER
   ========================================================================== */
/** @type {AudioContext | null} */
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
    if (AudioContextClass) audioCtx = new AudioContextClass();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function playTactileClick() {
  if (!MASTER_CONFIG.ui.audioSfx) return;
  try {
    const ctx = getAudioContext();
    if (ctx) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(850, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(110, ctx.currentTime + 0.04);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.04);
    }
  } catch (_) {}
}

function playMaybeLaterSound() {
  const customAudio = MASTER_CONFIG.paywall.maybeLaterAudioPath;
  if (customAudio && customAudio.trim() !== '') {
    try {
      const audio = new Audio(customAudio.trim());
      audio.play().catch(() => {
        playFallbackSadSound();
      });
      return;
    } catch (_) {
      playFallbackSadSound();
      return;
    }
  }
  playFallbackSadSound();
}

function playFallbackSadSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.linearRampToValueAtTime(180, now + 0.25);
    osc.frequency.linearRampToValueAtTime(120, now + 0.5);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.55);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.55);
  } catch (_) {}
}

/* ==========================================================================
   CALCULATOR ENGINE
   ========================================================================== */
const calculator = {
  currentValue: '0',
  /** @type {number | null} */
  previousValue: null,
  /** @type {string | null} */
  operator: null,
  waitingForSecondOperand: false,
  historyExpression: '',

  updateDisplay() {
    const displayEl = document.getElementById('calcDisplay');
    const historyEl = document.getElementById('calcHistory');
    if (displayEl) displayEl.innerText = this.currentValue;
    if (historyEl) historyEl.innerText = this.historyExpression;
  },

  /**
   * @param {string} digit
   */
  appendDigit(digit) {
    playTactileClick();
    if (this.waitingForSecondOperand) {
      this.currentValue = digit;
      this.waitingForSecondOperand = false;
    } else {
      this.currentValue = this.currentValue === '0' ? digit : this.currentValue + digit;
    }
    this.updateDisplay();
  },

  appendDecimal() {
    playTactileClick();
    if (this.waitingForSecondOperand) {
      this.currentValue = '0.';
      this.waitingForSecondOperand = false;
      this.updateDisplay();
      return;
    }
    if (!this.currentValue.includes('.')) {
      this.currentValue += '.';
      this.updateDisplay();
    }
  },

  clearAll() {
    playTactileClick();
    this.currentValue = '0';
    this.previousValue = null;
    this.operator = null;
    this.waitingForSecondOperand = false;
    this.historyExpression = '';
    if (popupTimeoutId !== null) clearTimeout(popupTimeoutId);
    this.updateDisplay();
  },

  /**
   * @param {string} nextOperator
   */
  setOperator(nextOperator) {
    playTactileClick();
    const inputValue = parseFloat(this.currentValue);

    if (this.operator && this.waitingForSecondOperand) {
      this.operator = nextOperator;
      this.historyExpression = `${this.previousValue} ${this.getOperatorSymbol(nextOperator)}`;
      this.updateDisplay();
      return;
    }

    if (this.previousValue === null && !isNaN(inputValue)) {
      this.previousValue = inputValue;
    } else if (this.operator && this.previousValue !== null) {
      const result = this.computeRaw(this.previousValue, inputValue, this.operator);
      this.currentValue = `${parseFloat(result.toFixed(6))}`;
      this.previousValue = result;
    }

    this.waitingForSecondOperand = true;
    this.operator = nextOperator;
    this.historyExpression = `${this.previousValue} ${this.getOperatorSymbol(nextOperator)}`;
    this.updateDisplay();
  },

  /**
   * @param {string} op
   * @returns {string}
   */
  getOperatorSymbol(op) {
    if (op === '*') return '×';
    if (op === '/') return '÷';
    if (op === '-') return '−';
    return '+';
  },

  /**
   * @param {number} first
   * @param {number} second
   * @param {string} op
   * @returns {number}
   */
  computeRaw(first, second, op) {
    switch (op) {
      case '+': return first + second;
      case '-': return first - second;
      case '*': return first * second;
      case '/': return second === 0 ? 0 : first / second;
      default: return second;
    }
  },

  /**
   * Generate wrong answer based on enabled strategies
   * @param {number} correctResult
   * @returns {number | string}
   */
  generateWrongAnswer(correctResult) {
    if (MASTER_CONFIG.engine.fixedOverride && MASTER_CONFIG.engine.fixedOverride.trim() !== '') {
      return MASTER_CONFIG.engine.fixedOverride.trim();
    }

    if (isNaN(correctResult) || !isFinite(correctResult)) {
      return 42;
    }

    const activeStrats = [];
    if (MASTER_CONFIG.engine.strategies.add) activeStrats.push('add');
    if (MASTER_CONFIG.engine.strategies.subtract) activeStrats.push('subtract');
    if (MASTER_CONFIG.engine.strategies.multiply) activeStrats.push('multiply');
    if (MASTER_CONFIG.engine.strategies.reverse) activeStrats.push('reverse');
    if (MASTER_CONFIG.engine.strategies.scramble) activeStrats.push('scramble');

    const strategy = activeStrats.length > 0 
      ? activeStrats[Math.floor(Math.random() * activeStrats.length)] 
      : 'add';

    let wrong = correctResult;

    switch (strategy) {
      case 'add': {
        const randomAdd = Math.floor(Math.random() * 99) + 1;
        wrong = correctResult + randomAdd;
        break;
      }

      case 'subtract': {
        const randomSub = Math.floor(Math.random() * 99) + 1;
        if (correctResult > 0) {
          wrong = (correctResult > randomSub) ? (correctResult - randomSub) : (correctResult + randomSub + 8);
        } else {
          wrong = correctResult - randomSub;
        }
        break;
      }

      case 'multiply': {
        const factor = 1.1 + Math.random() * 2.4;
        const mult = (correctResult === 0) ? (Math.random() * 10 + 2) : (correctResult * factor);
        wrong = Number.isInteger(correctResult) ? Math.round(mult) : parseFloat(mult.toFixed(2));
        break;
      }

      case 'reverse': {
        const sign = correctResult < 0 ? -1 : 1;
        const strVal = Math.abs(Math.round(correctResult)).toString();
        if (strVal.length > 1) {
          const reversed = strVal.split('').reverse().join('');
          wrong = parseInt(reversed, 10) * sign;
          if (wrong === correctResult) wrong += 7;
        } else {
          wrong = correctResult + (Math.floor(Math.random() * 80) + 11);
        }
        break;
      }

      case 'scramble': {
        const sign = correctResult < 0 ? -1 : 1;
        const strVal = Math.abs(Math.round(correctResult)).toString();
        if (strVal.length > 1) {
          const arr = strVal.split('');
          for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const temp = arr[i];
            arr[i] = arr[j];
            arr[j] = temp;
          }
          let scrambled = parseInt(arr.join(''), 10) * sign;
          if (scrambled === correctResult) scrambled += 13;
          wrong = scrambled;
        } else {
          wrong = correctResult + (Math.floor(Math.random() * 50) + 15);
        }
        break;
      }
    }

    if (isNaN(wrong) || !isFinite(wrong)) {
      wrong = Math.floor(Math.random() * 900) + 100;
    }

    return Number.isInteger(wrong) ? wrong : parseFloat(wrong.toFixed(2));
  },

  calculateResult() {
    playTactileClick();
    if (this.operator === null || this.previousValue === null) {
      return;
    }

    const inputValue = parseFloat(this.currentValue);
    const correctResult = this.computeRaw(this.previousValue, inputValue, this.operator);
    const wrongResult = this.generateWrongAnswer(correctResult);

    this.historyExpression = `${this.previousValue} ${this.getOperatorSymbol(this.operator)} ${this.currentValue} =`;
    this.currentValue = `${wrongResult}`;
    this.previousValue = null;
    this.operator = null;
    this.waitingForSecondOperand = true;
    this.updateDisplay();

    equalsClickCounter++;
    const freq = MASTER_CONFIG.paywall.triggerFreq || 1;
    if (equalsClickCounter % freq === 0) {
      const delayMs = Math.max(0, (MASTER_CONFIG.paywall.delaySec || 1) * 1000);
      if (popupTimeoutId !== null) clearTimeout(popupTimeoutId);
      popupTimeoutId = window.setTimeout(() => {
        openPaywallModal();
      }, delayMs);
    }
  }
};

/* ==========================================================================
   KEYPAD EVENT DELEGATION
   ========================================================================== */
const keypad = document.getElementById('keypad');
if (keypad) {
  keypad.addEventListener('click', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    const btn = target.closest('.calc-btn');
    if (!btn) return;

    const action = btn.getAttribute('data-action');
    if (!action) return;

    if (action === 'digit') {
      const val = btn.getAttribute('data-val') || '0';
      calculator.appendDigit(val);
    } else if (action === 'operator') {
      const op = btn.getAttribute('data-op') || '+';
      calculator.setOperator(op);
    } else if (action === 'decimal') {
      calculator.appendDecimal();
    } else if (action === 'clear') {
      calculator.clearAll();
    } else if (action === 'equals') {
      calculator.calculateResult();
    }
  });
}

/* ==========================================================================
   2-STEP PAYWALL POPUP CONTROLS
   ========================================================================== */
const paywallOverlay = document.getElementById('paywallOverlay');
const pwStep1 = document.getElementById('pwStep1');
const pwStep2 = document.getElementById('pwStep2');
const goToPaymentBtn = document.getElementById('goToPaymentBtn');
const backToPitchBtn = document.getElementById('backToPitchBtn');
const copyUpiBtn = document.getElementById('copyUpiBtn');
const openUpiIntentBtn = document.getElementById('openUpiIntentBtn');
const confirmPaymentBtn = document.getElementById('confirmPaymentBtn');

function applyUiThemeStyles() {
  document.documentElement.style.setProperty('--accent-glow', MASTER_CONFIG.ui.themeColor);
  document.documentElement.style.setProperty('--btn-radius', MASTER_CONFIG.ui.btnRadius);
  document.documentElement.style.setProperty('--display-font', MASTER_CONFIG.ui.fontFamily);
  
  const brandPillText = document.getElementById('brandPillText');
  if (brandPillText) brandPillText.innerText = MASTER_CONFIG.ui.brandText;
}

function renderPaywallUI() {
  const iconEl = document.getElementById('pwModalIcon');
  const badgeEl = document.getElementById('pwModalBadge');
  const titleEl = document.getElementById('pwModalTitle');
  const bodyEl = document.getElementById('pwModalBody');
  const priceEl = document.getElementById('pwModalPrice');
  const origPriceEl = document.getElementById('pwOrigPriceDisplay');
  const licenseLabelEl = document.getElementById('pwLicenseLabel');
  const buyTextEl = document.getElementById('pwModalBuyText');
  const featuresEl = document.getElementById('pwModalFeatures');
  const qrImgEl = /** @type {HTMLImageElement} */ (document.getElementById('pwQrImg'));
  const upiTextEl = document.getElementById('pwUpiText');
  const payAmountEl = document.getElementById('pwPayAmount');
  const confirmPayBtnText = document.getElementById('confirmPayBtnText');

  if (iconEl) iconEl.innerText = MASTER_CONFIG.paywall.icon;
  if (badgeEl) badgeEl.innerText = MASTER_CONFIG.paywall.badge;
  if (titleEl) titleEl.innerText = MASTER_CONFIG.paywall.title;
  if (bodyEl) bodyEl.innerText = MASTER_CONFIG.paywall.body;
  if (priceEl) priceEl.innerText = MASTER_CONFIG.paywall.price;
  if (origPriceEl) origPriceEl.innerText = MASTER_CONFIG.paywall.origPrice;
  if (licenseLabelEl) licenseLabelEl.innerText = MASTER_CONFIG.paywall.licenseLabel;
  if (buyTextEl) buyTextEl.innerText = MASTER_CONFIG.paywall.buttonText;
  if (upiTextEl) upiTextEl.innerText = MASTER_CONFIG.paywall.upiId || "sarkar@upi";
  if (payAmountEl) payAmountEl.innerText = MASTER_CONFIG.paywall.price;
  if (confirmPayBtnText) confirmPayBtnText.innerText = MASTER_CONFIG.paywall.confirmBtnText;

  document.querySelectorAll('.maybe-later-label').forEach((el) => {
    (/** @type {HTMLElement} */ (el)).innerText = MASTER_CONFIG.paywall.maybeLaterText || "Maybe Later";
  });

  if (qrImgEl) {
    qrImgEl.src = MASTER_CONFIG.paywall.qrImagePath || "assets/qr.png";
  }

  if (featuresEl) {
    featuresEl.innerHTML = '';
    MASTER_CONFIG.paywall.features.forEach((feat) => {
      const li = document.createElement('li');
      li.innerText = feat;
      featuresEl.appendChild(li);
    });
  }
}

function openPaywallModal() {
  renderPaywallUI();
  showStep1();
  if (paywallOverlay) paywallOverlay.classList.add('active');
}

function closePaywallModal() {
  if (paywallOverlay) paywallOverlay.classList.remove('active');
}

function showStep1() {
  if (pwStep1) pwStep1.classList.remove('hidden');
  if (pwStep2) pwStep2.classList.add('hidden');
}

function showStep2() {
  if (pwStep1) pwStep1.classList.add('hidden');
  if (pwStep2) pwStep2.classList.remove('hidden');
}

if (goToPaymentBtn) goToPaymentBtn.addEventListener('click', showStep2);
if (backToPitchBtn) backToPitchBtn.addEventListener('click', showStep1);

document.querySelectorAll('.maybe-later-action').forEach((btn) => {
  btn.addEventListener('click', () => {
    playMaybeLaterSound();
    closePaywallModal();
  });
});

if (copyUpiBtn) {
  copyUpiBtn.addEventListener('click', () => {
    const upiText = MASTER_CONFIG.paywall.upiId || "sarkar@upi";
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(upiText);
    }
    copyUpiBtn.innerText = "✓ Copied!";
    setTimeout(() => {
      copyUpiBtn.innerText = "Copy UPI";
    }, 2000);
  });
}

if (openUpiIntentBtn) {
  openUpiIntentBtn.addEventListener('click', () => {
    const upi = MASTER_CONFIG.paywall.upiId || "sarkar@upi";
    const priceNum = MASTER_CONFIG.paywall.price.replace(/[^0-9.]/g, '') || "999";
    const intentUrl = `upi://pay?pa=${encodeURIComponent(upi)}&pn=CalculatorPremium&am=${encodeURIComponent(priceNum)}&cu=INR`;
    window.location.href = intentUrl;
  });
}

if (confirmPaymentBtn) {
  confirmPaymentBtn.addEventListener('click', () => {
    alert(MASTER_CONFIG.paywall.successMsg);
    closePaywallModal();
  });
}

/* ==========================================================================
   ADMIN STUDIO CONTROLS & TAB NAVIGATION
   ========================================================================== */
const adminOverlay = document.getElementById('adminOverlay');
const openAdminBtn = document.getElementById('openAdminModalBtn');
const closeAdminBtn = document.getElementById('closeAdminBtn');
const adminLoginForm = document.getElementById('adminLoginForm');
const adminLoginSection = document.getElementById('adminLoginSection');
const adminDashboardSection = document.getElementById('adminDashboardSection');
const adminLoginError = document.getElementById('adminLoginError');
const saveAdminConfigBtn = document.getElementById('saveAdminConfigBtn');
const exportConfigBtn = document.getElementById('exportConfigBtn');
const previewPopupBtn = document.getElementById('previewPopupBtn');
const adminLogoutBtn = document.getElementById('adminLogoutBtn');
const testAudioBtn = document.getElementById('testAudioBtn');

const tabButtons = document.querySelectorAll('.admin-tabs-nav .tab-btn');
tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    tabButtons.forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    
    btn.classList.add('active');
    const targetTabId = btn.getAttribute('data-tab');
    if (targetTabId) {
      const targetPane = document.getElementById(targetTabId);
      if (targetPane) targetPane.classList.add('active');
    }
  });
});

const qrUploadTrigger = document.getElementById('qrUploadTrigger');
const qrFileInput = /** @type {HTMLInputElement} */ (document.getElementById('qrFileInput'));
const qrPreviewThumb = /** @type {HTMLImageElement} */ (document.getElementById('qrPreviewThumb'));
const qrUploadStatus = document.getElementById('qrUploadStatus');

if (qrUploadTrigger && qrFileInput) {
  qrUploadTrigger.addEventListener('click', () => qrFileInput.click());
  
  qrFileInput.addEventListener('change', () => {
    if (qrFileInput.files && qrFileInput.files[0]) {
      const file = qrFileInput.files[0];
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = /** @type {string} */ (e.target?.result);
        if (dataUrl) {
          MASTER_CONFIG.paywall.qrImagePath = dataUrl;
          if (qrPreviewThumb) {
            qrPreviewThumb.src = dataUrl;
            qrPreviewThumb.style.display = 'block';
          }
          if (qrUploadStatus) qrUploadStatus.innerText = `✅ QR Uploaded (${file.name})`;
        }
      };
      reader.readAsDataURL(file);
    }
  });
}

const audioUploadTrigger = document.getElementById('audioUploadTrigger');
const audioFileInput = /** @type {HTMLInputElement} */ (document.getElementById('audioFileInput'));
const audioUploadStatus = document.getElementById('audioUploadStatus');

if (audioUploadTrigger && audioFileInput) {
  audioUploadTrigger.addEventListener('click', () => audioFileInput.click());

  audioFileInput.addEventListener('change', () => {
    if (audioFileInput.files && audioFileInput.files[0]) {
      const file = audioFileInput.file