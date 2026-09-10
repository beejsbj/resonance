import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Resonance — a musical idle world', description: 'Touch, listen, and grow a world of sound. A playable musical incremental prototype.' };
export default function RootLayout({children}: Readonly<{children:React.ReactNode}>) {return <html lang="en"><body style={{margin:0,background:'#10131d'}}>{children}</body></html>;}
