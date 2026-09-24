import mongoose from 'mongoose';

const SettingsSchema = new mongoose.Schema({
  // --- Brighten Anchor Rate (TL reference) ---
  // This is a BUSINESS rate, not a market rate. It is set by hand by the admin
  // (e.g. from XE) and must never be overwritten by the ExchangeRate-API fetch.
  // It's the CENTER point for TL: sellRate = anchor*(1+margin/100), buyRate =
  // anchor*(1-margin/100). USD/EUR/GBP use the live API rate as their center
  // point instead. min: 1 — a zero/missing anchor divides every conversion by ~0.
  anchorTshPerTl: { type: Number, default: 60, min: 1 }, // 1 TL = ? TSh

  // --- Margin (buy/sell spread) ---
  // Single percentage applied to EVERY currency (TL, USD, EUR, GBP), in BOTH
  // directions: sellRate = reference*(1+margin/100), buyRate = reference*(1-margin/100).
  // This is the business's entire profit margin — no separate commission or
  // sending fee on top (replaced 2026-09-25; see git history for the old model).
  marginPercent: { type: Number, default: 5, min: 0, max: 99 },

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
