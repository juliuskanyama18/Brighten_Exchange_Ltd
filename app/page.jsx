import Image from 'next/image';
import connectDB from '@/lib/mongodb';
import Settings from '@/models/Settings';
import Converter from '@/components/Converter';
import logo from '@/public/logo.png';

// Fetch payment details server-side (safe — no margin data leaked)
async function getPaymentDetails() {
  try {
    await connectDB();
    const settings = await Settings.getSettings();
    const nmb = settings.paymentDetails?.nmb;
    const airtel = settings.paymentDetails?.airtel;
    const selcom = settings.paymentDetails?.selcom;
    // Mongoose subdocuments aren't plain objects — extract primitive fields
    // explicitly so this can safely cross the Server->Client Component boundary.
    return {
      nmb:    nmb    ? { accountName: nmb.accountName, accountNumber: nmb.accountNumber } : null,
      airtel: airtel ? { phone: airtel.phone, accountName: airtel.accountName } : null,
      selcom: selcom ? {
        bankName: selcom.bankName, accountName: selcom.accountName,
        accountNumber: selcom.accountNumber, swiftCode: selcom.swiftCode,
      } : null,
      whatsappNumber: settings.whatsappNumber || '',
    };
  } catch {
    // Fallback to defaults if DB unavailable
    return {
      nmb:    { accountName: 'JULIUS GODWIN KANYAMA', accountNumber: '22210027343' },
      airtel: { phone: '+255782025468', accountName: 'JULIUS GODWIN KANYAMA' },
      selcom: {
        bankName: 'Selcom Microfinance Bank Tanzania Limited',
        accountName: 'JULIUS GODWIN KANYAMA',
        accountNumber: '5525110455178',
        swiftCode: 'ACTZTZTZ',
      },
      whatsappNumber: '',
    };
  }
}

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const paymentDetails = await getPaymentDetails();

  return (
    <main className="min-h-screen bg-brand-950 flex flex-col">
      {/* Header — logo only, the image already carries the full brand + tagline */}
      <header className="border-b border-gold-500/20 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="max-w-md mx-auto px-4 py-3 flex justify-center">
          <Image src={logo} alt="Brighten Plus" priority className="h-16 w-auto" />
        </div>
      </header>

      {/* The tool — this IS the page */}
      <section className="flex-1 px-4 py-6 sm:py-8">
        <div className="w-full max-w-md mx-auto">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl p-5 sm:p-6 border border-white/10">
            <h1 className="text-lg font-black text-slate-900 dark:text-white mb-4">Currency Exchange</h1>
            <Converter paymentDetails={paymentDetails} />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-slate-500 text-xs">
        <p>© {new Date().getFullYear()} Brighten Plus · North Cyprus</p>
      </footer>
    </main>
  );
}
