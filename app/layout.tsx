import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Resonance — orchestra under the stars', description: 'Mine, build a living orchestra, and lend it the conductor’s power in this playable prototype.' };
export default function RootLayout({children}: Readonly<{children:React.ReactNode}>) {return <html lang="en"><body style={{margin:0,background:'#10131d'}}>{children}</body></html>;}
