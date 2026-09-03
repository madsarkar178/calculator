/**
 * Master Project Configuration
 * Change any values here to update them globally for all visitors!
 */
const MASTER_CONFIG = {
  admin: {
    user: "sarkar",
    pass: "1234"
  },
  paywall: {
    badge: "✦ ELITE ACCESS ✦",
    icon: "👑",
    title: "🔒 Wrong Answer? Upgrade to Premium!",
    body: "You're seeing a calculated result. For the CORRECT answer, upgrade to Calculator Premium.",
    features: [
      "✨ 100% Guaranteed Math Accuracy",
      "⚡ Instant Ultra-Fast Neural Processing",
      "🚫 Zero Ads & Unlimited Calculations"
    ],
    price: "₹999",
    origPrice: "₹1,999",
    licenseLabel: "Lifetime License",
    buttonText: "Unlock Calculator Premium ₹999",
    maybeLaterText: "Maybe Later",
    // File paths to your assets folder
    qrImagePath: "assets/qr.png",
    maybeLaterAudioPath: "assets/sound.mp3",
    upiId: "sarkar@upi",
    confirmBtnText: "✓ I Have Paid (Unlock Now)",
    successMsg: "🎉 Verification in progress! Once confirmed, Calculator Premium will activate automatically.",
    delaySec: 1,
    triggerFreq: 1
  },
  ui: {
    brandText: "PRO ENGINE V5.3",
    themeColor: "#6366f1",
    btnRadius: "20px",
    fontFamily: "'JetBrains Mono', monospace",
    audioSfx: true
  },
  engine: {
    fixedOverride: "",
    strategies: {
      add: true,
      subtract: true,
      multiply: true,
      reverse: true,
      scramble: true
    }
  }
};