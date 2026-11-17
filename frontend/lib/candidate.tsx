import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, Candidate } from './api';

/** The one candidate, shared by the rail (setup progress) and every page. */
interface Ctx { candidate: Candidate | null; refresh: () => Promise<void>; set: (c: Candidate) => void }
const C = createContext<Ctx>({ candidate: null, refresh: async () => {}, set: () => {} });

export function CandidateProvider({ children }: { children: React.ReactNode }) {
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const refresh = useCallback(async () => { try { setCandidate(await api.candidate.get()); } catch { /* backend down: pages show their own error */ } }, []);
  useEffect(() => { refresh(); }, [refresh]);
  return <C.Provider value={{ candidate, refresh, set: setCandidate }}>{children}</C.Provider>;
}

export const useCandidate = () => useContext(C);
