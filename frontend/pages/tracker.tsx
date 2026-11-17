import { useEffect } from 'react';
import { useRouter } from 'next/router';

/* The tracker is the Applied / Interview / Closed stages on the Jobs page. */
export default function Tracker() {
  const r = useRouter();
  useEffect(() => { r.replace('/'); }, [r]);
  return null;
}
