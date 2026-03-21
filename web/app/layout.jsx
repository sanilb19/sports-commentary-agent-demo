import './globals.css';

export const metadata = {
  title: 'Live Tactical Commentary Demo',
  description: 'Autonomous soccer commentary demo with Gemini + TTS.'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
