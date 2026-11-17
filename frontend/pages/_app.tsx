import type { AppProps } from 'next/app';
import Head from 'next/head';
import '../styles/globals.css';
import { Shell } from '../components/Shell';
import { CandidateProvider } from '../lib/candidate';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <CandidateProvider>
      <Head>
        <title>Job Pilot</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap" rel="stylesheet" />
      </Head>
      <Shell><Component {...pageProps} /></Shell>
    </CandidateProvider>
  );
}
