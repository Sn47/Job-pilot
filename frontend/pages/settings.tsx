import { useEffect } from 'react';
import { useRouter } from 'next/router';

/* Scanning moved onto the Jobs page; sources and writer status live on Profile. */
export default function Settings() {
  const r = useRouter();
  useEffect(() => { r.replace('/profile#sources'); }, [r]);
  return null;
}
