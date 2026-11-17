import type { AppProps } from 'next/app';
import Head from 'next/head';
import '../styles/globals.css';
import { TopBar } from '../components/TopBar';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>Job Pilot</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=Source+Serif+4:wght@400;600&display=swap" rel="stylesheet" />
        <style>{`:root{--font-ui:'Instrument Sans';--font-serif:'Source Serif 4';}`}</style>
      </Head>
      <TopBar />
      <main className="mx-auto max-w-[1280px] px-4 pb-16">
        <Component {...pageProps} />
      </main>
    </>
  );
}
