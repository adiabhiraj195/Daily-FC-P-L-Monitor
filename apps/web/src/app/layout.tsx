import './globals.css';
import { Providers } from '../components/providers';

export const metadata = {
  title: 'Prozo FC Margin Monitor',
  description: 'Enterprise Fulfilment Centre Contribution Margin Monitoring & AI Investigation'
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased text-slate-800">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
