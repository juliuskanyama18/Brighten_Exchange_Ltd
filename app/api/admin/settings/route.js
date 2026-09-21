import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Settings from '@/models/Settings';

// GET /api/admin/settings
export async function GET() {
  try {
    await connectDB();
    const settings = await Settings.getSettings();
    return NextResponse.json({ success: true, settings });
  } catch (error) {
    console.error('[/api/admin/settings GET]', error.message);
    return NextResponse.json({ success: false, error: 'Failed to load settings' }, { status: 500 });
  }
}

const ALLOWED_FIELDS = [
  'anchorTshPerTl', 'commissionTl', 'sendingFee',
  'whatsappNumber', 'paymentDetails', 'displayName',
];

async function updateSettings(request) {
  try {
    const body = await request.json();
    await connectDB();

    const settings = await Settings.getSettings();

    for (const key of ALLOWED_FIELDS) {
      if (body[key] !== undefined) {
        settings[key] = body[key];
      }
    }

    await settings.save();
    return NextResponse.json({ success: true, settings });
  } catch (error) {
    console.error('[/api/admin/settings PUT/PATCH]', error.message);
    if (error.name === 'ValidationError') {
      const message = Object.values(error.errors).map((e) => e.message).join('; ');
      return NextResponse.json({ success: false, error: message }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: 'Failed to save settings' }, { status: 500 });
  }
}

// PUT /api/admin/settings — canonical update endpoint
export async function PUT(request) {
  return updateSettings(request);
}

// PATCH kept as an alias for backward compatibility with existing clients
export async function PATCH(request) {
  return updateSettings(request);
}
