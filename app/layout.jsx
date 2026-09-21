import './globals.css';

export const metadata = {
  title: 'Brighten Exchange Ltd — Smart Currency Exchange Tanzania',
  description: 'Fast and competitive currency exchange between TZS, USD, GBP, EUR and TRY. Pay via NMB Bank or Airtel Money.',
  keywords: 'currency exchange Tanzania, TZS to USD, TZS to EUR, forex Tanzania, Brighten Exchange',
  openGraph: {
    title: 'Brighten Exchange Ltd',
    description: 'Smart currency exchange platform for Tanzania',
    type: 'website',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#0a1628' },
    { media: '(prefers-color-scheme: dark)',  color: '#0a1628' },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans">
        {children}
      </body>
    </html>
  );
}
