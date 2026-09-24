import mongoose from 'mongoose';

const SettingsSchema = new mongoose.Schema({
  // --- Margin (buy/sell spread) ---
  // There is NO manually-set anchor anymore (removed 2026-09-25, per business
  // decision — see git history). Every currency's reference rate now comes
  // live from ExchangeRate-API: USD/EUR/GBP directly, TL via an implied
  // TRY->TZS cross-rate (see lib/rates.js). The margin below is applied on
  // top of that live reference to get the sell/buy price:
  //   - BUY side (customer sells currency to us) is a percentage for EVERY
  //     currency, including TL: buyRate = reference*(1-buyMarginPercent/100)
  //   - SELL side (customer buys currency from us) is a percentage for
  //     USD/EUR/GBP: sellRate = reference*(1+sellMarginPercent/100)
  //     ...but TL keeps a FIXED TSh offset instead: sellRate = reference+marginTlTsh
  //     (at TL's magnitude [~50-60 TSh] a percentage would need constant
  //     retuning on the sell side; 2026-09-25: TL's BUY side was switched
  //     to match the same percentage mechanism as USD/EUR/GBP, only its
  //     SELL side kept the flat-TSh offset.)
  //   Sell and buy margins are independent of each other on purpose (e.g.
  //   2026-09-25: buy dropped from 5% to 2.5% while sell stayed at 5%).
  sellMarginPercent: { type: Number, default: 5, min: 0, max: 99 }, // USD/EUR/GBP, customer buys from us
  buyMarginPercent:  { type: Number, default: 5, min: 0, max: 99 }, // ALL currencies incl. TL, customer sells to us
  marginTlTsh:       { type: Number, default: 5, min: 0 },          // TL SELL side only, flat TSh

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
