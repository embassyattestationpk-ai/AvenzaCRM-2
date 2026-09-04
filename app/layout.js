import './globals.css';
import Shell from '../components/Shell';
import PwaRegister from '../components/PwaRegister';

export const metadata = {
  title: 'Avenza Consultancy CRM',
  description: 'Client, case, vendor & payment management',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icon-192.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Avenza CRM',
  },
};

export const viewport = {
  themeColor: '#3179ff',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <PwaRegister />
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
