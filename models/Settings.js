import mongoose from 'mongoose';

const SettingsSchema = new mongoose.Schema({
  // --- Commission (flat % on each currency's own live rate) ---
  // There is NO anchor currency anymore (removed 2026-09-30, per business
  // decision for a low-volume operation — see git history for the prior
  // TL-anchored flat-TSh model). A single commission percentage is applied
  // directly to every currency's own live reference rate:
  //   sellRate(X) = liveRate(X) * (1 + marginPercent/100)
  //   buyRate(X)  = liveRate(X) * (1 - marginPercent/100)
  marginPercent: { type: Number, default: 5, min: 0, max: 99 },

  // --- Delivery Fee ---
  // Optional, opt-in per transaction (client checks "needs delivery"). A
  // flat TL amount, converted into whatever currency the client is
  // RECEIVING and deducted from it — using the live reference rate (no
  // margin), since this is a pass-through cost estimate, not a trade.
  deliveryFeeTl: { type: Number, default: 300, min: 0 },

  // --- WhatsApp ---
  whatsappNumber: { type: String, default: '' }, // e.g. +905xxxxxxxxx (international format, no + needed for wa.me but we accept either)

  // --- Payment Details ---
  paymentDetails: {
    nmb: {
      accountName:   { type: String, default: 'JULIUS GODWIN KANYAMA' },
      accountNumber: { type: String, default: '22210027343' },
    },
    airtel: {
      phone:       { type: String, default: '+255782025468' },
      accountName: { type: String, default: 'JULIUS GODWIN KANYAMA' },
    },
    selcom: {
      // Selcom Pesa is a full bank rail (Selcom Microfinance Bank Tanzania), not a mobile wallet
      bankName:      { type: String, default: 'Selcom Microfinance Bank Tanzania Limited' },
      accountName:   { type: String, default: 'JULIUS GODWIN KANYAMA' },
      accountNumber: { type: String, default: '5525110455178' },
      swiftCode:     { type: String, default: 'ACTZTZTZ' },
    },
  },

  displayName: { type: String, default: 'Brighten Exchange Ltd' },
}, {
  timestamps: true,
});

// Singleton pattern — always use one settings document
SettingsSchema.statics.getSettings = async function () {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  }
  return settings;
};

export default mongoose.models.Settings || mongoose.model('Settings', SettingsSchema);
