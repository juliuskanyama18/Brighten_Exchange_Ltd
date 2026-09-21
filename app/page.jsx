import { headers } from 'next/headers';
import connectDB from '@/lib/mongodb';
import Settings from '@/models/Settings';
import Converter from '@/components/Converter';

// Fetch payment details server-side (safe — no margin data leaked)
async function getPaymentDetails() {
  try {
    await connectDB();
    const settings = await Settings.getSettings();
    const nmb = settings.paymentDetails?.nmb;
    const airtel = settings.paymentDetails?.airtel;
    // Mongoose subdocuments aren't plain objects — extract primitive fields
    // explicitly so this can safely cross the Server->Client Component boundary.
    return {
      nmb:    nmb    ? { accountName: nmb.accountName, accountNumber: nmb.accountNumber } : null,
      airtel: airtel ? { phone: airtel.phone, accountName: airtel.accountName } : null,
      whatsappNumber: settings.whatsappNumber || '',
    };
  } catch {
    // Fallback to defaults if DB unavailable
    return {
      nmb:    { accountName: 'JULIUS GODWIN KANYAMA', accountNumber: '22210027343' },
      airtel: { phone: '+255782025468', accountName: 'JULIUS GODWIN KANYAMA' },
      whatsappNumber: '',
    };
  }
}

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const paymentDetails = await getPaymentDetails();

  return (
    <main className="min-h-screen bg-gradient-to-br from-brand-950 via-brand-900 to-brand-950 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-gold-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-brand-600/20 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gold-600/5 rounded-full blur-3xl" />
        {/* Dot grid */}
        <div className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '32px 32px' }}
        />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-gold-500/20 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-gold-400 to-gold-600 rounded-xl flex items-center justify-center shadow-lg shadow-gold-500/30">
              <span className="text-brand-950 font-black text-base">B</span>
            </div>
            <div>
              <p className="text-white font-black text-sm leading-none tracking-tight">Brighten Exchange</p>
              <p className="text-gold-400 text-xs">Smart Currency Exchange</p>
            </div>
          </div>

          {/* Trust badges */}
          <div className="hidden sm:flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-xs text-gold-300">
              <div className="w-1.5 h-1.5 bg-gold-400 rounded-full animate-pulse-slow" />
              Rates Refreshed Regularly
            </div>
            <div className="text-xs text-gold-300">🇹🇿 Tanzania</div>
          </div>
        </div>
      </header>

      {/* Hero + Converter */}
      <section className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 pt-12 pb-20">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left: Hero copy */}
          <div className="text-center lg:text-left space-y-6">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-gold-500/10 border border-gold-500/30 rounded-full text-gold-300 text-sm">
              <div className="w-1.5 h-1.5 bg-gold-400 rounded-full animate-pulse-slow" />
              TSh-anchored exchange rates
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white leading-[1.1] tracking-tight">
              Exchange Currency
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-gold-300 to-gold-500">
                Fast & Smart
              </span>
            </h1>

            <p className="text-slate-300 text-lg max-w-md mx-auto lg:mx-0 leading-relaxed">
              Send and receive money across TZS, USD, GBP, EUR and TRY with competitive rates and instant payment confirmation.
            </p>

            {/* Features */}
            <div className="flex flex-wrap gap-3 justify-center lg:justify-start">
              {[
                { icon: '⚡', text: 'Instant Quotes' },
                { icon: '🔒', text: 'Secure Transfers' },
                { icon: '💱', text: '5 Currencies' },
                { icon: '📱', text: 'Mobile Pay' },
              ].map((f) => (
                <div key={f.text} className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-xl text-sm text-slate-300">
                  <span>{f.icon}</span>
                  <span>{f.text}</span>
                </div>
              ))}
            </div>

            {/* Currency pairs shown */}
            <div className="flex flex-wrap gap-2 justify-center lg:justify-start">
              {['TZS', 'TRY', 'USD', 'GBP', 'EUR'].map((c) => (
                <span key={c} className="px-3 py-1 bg-brand-800/60 border border-gold-600/40 rounded-lg text-xs font-mono font-bold text-gold-300">
                  {c}
                </span>
              ))}
            </div>
          </div>

          {/* Right: Converter card */}
          <div className="w-full max-w-md mx-auto lg:mx-0 lg:ml-auto">
            <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl shadow-black/40 p-6 sm:p-8 border border-white/10">
              <div className="mb-6">
                <h2 className="text-xl font-black text-slate-900 dark:text-white">Currency Converter</h2>
                <p className="text-slate-400 text-sm mt-1">Get an instant estimate</p>
              </div>
              <Converter paymentDetails={paymentDetails} />
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="relative z-10 border-t border-gold-500/20 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
          <h2 className="text-2xl font-black text-white text-center mb-10">How It Works</h2>
          <div className="grid sm:grid-cols-3 gap-6">
            {[
              { step: '01', title: 'Enter Amount',    desc: 'Select currencies and enter the amount you want to send.',     icon: '💱' },
              { step: '02', title: 'Confirm Quote',   desc: 'Review your quote and confirm the estimate before proceeding.', icon: '✅' },
              { step: '03', title: 'Send & Receive',  desc: 'Pay via NMB or Airtel Money. We process your exchange fast.',  icon: '🚀' },
            ].map((item) => (
              <div key={item.step} className="bg-white/5 border border-gold-500/10 rounded-2xl p-6 text-center hover:bg-white/10 hover:border-gold-500/30 transition-colors">
                <div className="text-3xl mb-3">{item.icon}</div>
                <div className="text-xs font-mono text-gold-400 mb-2">{item.step}</div>
                <h3 className="font-bold text-white mb-2">{item.title}</h3>
                <p className="text-slate-400 text-sm">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-gold-500/20 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center text-slate-500 text-sm">
          <p>© {new Date().getFullYear()} Brighten Exchange Ltd · Tanzania</p>
          <p className="mt-1 text-xs">All exchange operations are final upon confirmation.</p>
        </div>
      </footer>
    </main>
  );
}
