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
  'buyMarginPercent', 'marginTlTsh', 'deliveryFeeTl',
  'whatsappNumber', 'paymentDetails', 'displayName',
];

// A blank/invalid number field in the admin form becomes NaN client-side,
// and JSON.stringify silently turns NaN into null on the wire. Mongoose does
// NOT enforce `min` against an explicit null (only against out-of-range
// numbers), so without this check a cleared field would silently save as
// null and break every conversion that divides/multiplies by it — exactly
// what happened to anchorTshPerTl in production (2026-09-25, before it was
// removed entirely in favor of a fully live TL reference rate).
function validateNumericFields(body) {
  const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);

  if (body.buyMarginPercent !== undefined) {
    if (!isFiniteNumber(body.buyMarginPercent) || body.buyMarginPercent < 0 || body.buyMarginPercent >= 100) {
      return 'Buy margin (%) must be a number between 0 and 99';
    }
  }
  if (body.marginTlTsh !== undefined) {
    if (!isFiniteNumber(body.marginTlTsh) || body.marginTlTsh < 0) {
      return 'TL margin must be a number of at least 0';
    }
  }
  if (body.deliveryFeeTl !== undefined) {
    if (!isFiniteNumber(body.deliveryFeeTl) || body.deliveryFeeTl < 0) {
      return 'Delivery fee must be a number of at least 0';
    }
  }
  return null;
}

async function updateSettings(request) {
  try {
    const body = await request.json();

    const validationError = validateNumericFields(body);
    if (validationError) {
      return NextResponse.json({ success: false, error: validationError }, { status: 400 });
    }

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
