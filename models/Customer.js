import mongoose from 'mongoose';

const CustomerSchema = new mongoose.Schema({
  name:  { type: String, required: true, trim: true },
  phone: { type: String, required: true, trim: true, unique: true },
  email: { type: String, trim: true, default: '' },
  note:  { type: String, default: '' },
}, {
  timestamps: true,
});

// Find an existing customer by phone, or create one. Updates the name
// on record if the customer gives a different one on a later transaction.
CustomerSchema.statics.findOrCreate = async function ({ name, phone }) {
  const customer = await this.findOneAndUpdate(
    { phone },
    { $set: { name }, $setOnInsert: { phone } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return customer;
};

export default mongoose.models.Customer || mongoose.model('Customer', CustomerSchema);
