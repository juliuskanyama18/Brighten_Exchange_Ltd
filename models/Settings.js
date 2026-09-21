import mongoose from 'mongoose';

const SendingFeeSchema = new mongoose.Schema({
  type:  { type: String, enum: ['flat', 'percentage'], default: 'flat' },
  value: { type: Number, default: 10000, min: 0 }, // TZS if flat, % if percentage
}, { _id: false });

const SettingsSchema = new mongoose.Schema({
  // --- Brighten Anchor Rate ---
  // This is a BUSINESS rate, not a market rate. It is set by hand by the admin
  // and must never be overwritten by the ExchangeRate-API fetch.
  // min: 1 — a zero/missing anchor divides every conversion by ~0.
  anchorTshPerTl: { type: Number, default: 60, min: 1 }, // 1 TL = ? TSh

  // --- Brighten Commission ---
  // Conceptually "commissionTl worth of TSh", so it scales automatically if
  // the anchor changes. Only applied on the "customer wants TSh" direction.
  commissionTl: { type: Number, default: 100, min: 0 },

  // --- Platform Sending Fee ---
  // Separate from the commission. Only applied on the "customer wants TSh"
  // direction. Structured so tiered fees can be added later without
  // reshaping this field.
  sendingFee: { type: SendingFeeSchema, default: () => ({}) },

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
