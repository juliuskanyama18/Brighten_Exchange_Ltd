import mongoose from 'mongoose';

const SettingsSchema = new mongoose.Schema({
  // --- Margin (TL-anchored buy/sell spread) ---
  // There is NO manually-set anchor anymore (removed 2026-09-25, per business
  // decision — see git history). TL's live reference rate (an implied
  // TRY->TZS cross-rate, see lib/rates.js) is marked up/down by TL's own
  // margin FIRST, and that becomes the anchor every OTHER currency's price
  // is derived from (2026-09-25: switched from each currency independently
  // marking up its own live reference — see lib/calc.js for the full
  // explanation, including why this makes the sell margin for USD/EUR/GBP
  // move with TL's live rate instead of staying a fixed percentage):
  //   TL sell anchor = TL reference + marginTlTsh            (flat TSh)
  //   TL buy anchor  = TL reference * (1 - buyMarginPercent/100)
  //   USD/EUR/GBP sell/buy = (TL sell/buy anchor) * tlPerUnit(currency)
  buyMarginPercent: { type: Number, default: 5, min: 0, max: 99 }, // used to build the TL buy anchor; ALL currencies inherit it
  marginTlTsh:      { type: Number, default: 5, min: 0 },          // used to build the TL sell anchor; ALL currencies inherit it

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
