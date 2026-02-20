import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { Setor, TipoSetor, PeriodoData, ViewMode, Sede, CustoItem } from '@/types/sector';
import { createDefaultSetor, createDefaultPeriodoData, getCurrentPeriodo, createDefaultSede } from '@/types/sector';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface AppState {
  setores: Setor[];
  sedes: Sede[];
  activeSetorId: string | null;
  activeSedeId: string | null;
  periodoAtivo: string;
  view: 'dashboard' | 'setor' | 'projecoes' | 'ranking' | 'sede' | 'honorarios'; 
  viewMode: ViewMode;
}

interface AppContextType extends AppState {
  addSetor: (nome: string, tipo: TipoSetor) => void;
  removeSetor: (id: string) => void;
  updatePeriodoData: (setorId: string, periodo: string, updates: Partial<PeriodoData>) => void;
  updateSetorSedeId: (setorId: string, sedeId: string | undefined) => void;
  setActiveSetor: (id: string | null) => void;
  setPeriodoAtivo: (periodo: string) => void;
  setView: (view: AppState['view']) => void;
  setViewMode: (mode: ViewMode) => void;
  activeSetor: Setor | null;
  activePeriodoData: PeriodoData | null;
  addSede: (nome: string) => void;
  removeSede: (id: string) => void;
  setActiveSede: (id: string | null) => void;
  updateSedeCustos: (sedeId: string, periodo: string, custos: CustoItem[]) => void;
  getSetoresForSede: (sedeId: string) => Setor[];
  getRateioPerSetor: (sedeId: string, periodo: string) => number;
  loading: boolean;
}

const APP_CTX_KEY = '__APP_CONTEXT__';
const AppContext = ((globalThis as any)[APP_CTX_KEY] ??= createContext<AppContextType | null>(null)) as React.Context<AppContextType | null>;

function getOrCreatePeriodoData(setor: Setor, periodo: string): PeriodoData {
  if (setor.periodos[periodo]) return setor.periodos[periodo];
  const sorted = Object.keys(setor.periodos).sort();
  const prev = sorted.filter(p => p < periodo);
  if (prev.length > 0) {
    return JSON.parse(JSON.stringify(setor.periodos[prev[prev.length - 1]]));
  }
  return createDefaultPeriodoData(setor.tipo);
}

function getOrCreateSedeCustos(sede: Sede, periodo: string): CustoItem[] {
  if (sede.periodos[periodo]) return sede.periodos[periodo];
  const sorted = Object.keys(sede.periodos).sort();
  const prev = sorted.filter(p => p < periodo);
  if (prev.length > 0) {
    return JSON.parse(JSON.stringify(sede.periodos[prev[prev.length - 1]]));
  }
  return [];
}

function useDebouncedSync<T>(syncFn: (items: T[]) => Promise<void>, delay = 100) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef<T[]>([]);

  return useCallback((items: T[]) => {
    latestRef.current = items;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      syncFn(latestRef.current);
    }, delay);
  }, [syncFn, delay]);
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [setores, setSetores] = useState<Setor[]>([]);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [activeSetorId, setActiveSetorId] = useState<string | null>(null);
  const [activeSedeId, setActiveSedeId] = useState<string | null>(null);
  const [periodoAtivo, setPeriodoAtivo] = useState(getCurrentPeriodo());
  const [view, setView] = useState<AppState['view']>('dashboard');
  const [viewMode, setViewMode] = useState<ViewMode>('mensal');
  const [loading, setLoading] = useState(true);
  const initialLoadDone = useRef(false);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
  }

    const loadData = async () => {
      // Carregamento inicial de todos os dados
      const [setoresRes, sedesRes] = await Promise.all([
        supabase.from('setores').select('*'),
        supabase.from('sedes').select('*'),
      ]);

      if (setoresRes.data) {
        setSetores(setoresRes.data.map((r: any) => ({
          id: r.id,
          nome: r.nome,
          tipo: r.tipo as TipoSetor,
          sedeId: r.sede_id ?? undefined,
          periodos: (r.periodos as Record<string, PeriodoData>) ?? {},
        })));
      }

      if (sedesRes.data) {
        setSedes(sedesRes.data.map((r: any) => ({
          id: r.id,
          nome: r.nome,
          periodos: (r.periodos as Record<string, CustoItem[]>) ?? {},
        })));
      }

      initialLoadDone.current = true;
      setLoading(false);
    };

    loadData();

  // --- CONFIGURAÇÃO DO REALTIME ---
  // Inscreve-se para mudanças em qualquer linha das tabelas 'setores' e 'sedes'
  const channel = supabase
    .channel('db-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'setores' },
      (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const newData = payload.new as any;
          setSetores((prev) => {
            const exists = prev.find((s) => s.id === newData.id);
            if (exists) {
              return prev.map((s) => (s.id === newData.id ? {
                ...s,
                nome: newData.nome,
                tipo: newData.tipo,
                sedeId: newData.sede_id,
                periodos: newData.periodos
              } : s));
            }
            return [...prev, {
              id: newData.id,
              nome: newData.nome,
              tipo: newData.tipo,
              sedeId: newData.sede_id,
              periodos: newData.periodos
            }];
          });
        } else if (payload.eventType === 'DELETE') {
          setSetores((prev) => prev.filter((s) => s.id !== payload.old.id));
        }
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'sedes' },
      (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const newData = payload.new as any;
          setSedes((prev) => {
            const exists = prev.find((s) => s.id === newData.id);
            if (exists) {
              return prev.map((s) => (s.id === newData.id ? {
                ...s,
                nome: newData.nome,
                periodos: newData.periodos
              } : s));
            }
            return [...prev, {
              id: newData.id,
              nome: newData.nome,
              periodos: newData.periodos
            }];
          });
        } else if (payload.eventType === 'DELETE') {
          setSedes((prev) => prev.filter((s) => s.id !== payload.old.id));
        }
      }
    )
    .subscribe();

  // Limpeza: remove a inscrição ao desmontar o componente ou trocar o usuário
  return () => {
    supabase.removeChannel(channel);
  };
}, [user]);

  const syncSetores = useCallback(async (items: Setor[]) => {
    if (!user || !initialLoadDone.current) return;
    const rows = items.map(s => ({
      id: s.id,
      user_id: user.id,
      nome: s.nome,
      tipo: s.tipo,
      sede_id: s.sedeId ?? null,
      periodos: s.periodos as any,
    }));

    if (rows.length > 0) {
      await supabase.from('setores').upsert(rows, { onConflict: 'id' });
    }
    // CORREÇÃO: Removido o bloco que deletava dados de outros usuários
  }, [user]);

  const syncSedes = useCallback(async (items: Sede[]) => {
    if (!user || !initialLoadDone.current) return;
    const rows = items.map(s => ({
      id: s.id,
      user_id: user.id,
      nome: s.nome,
      periodos: s.periodos as any,
    }));

    if (rows.length > 0) {
      await supabase.from('sedes').upsert(rows, { onConflict: 'id' });
    }
  }, [user]);

  const debouncedSyncSetores = useDebouncedSync(syncSetores);
  const debouncedSyncSedes = useDebouncedSync(syncSedes);

  useEffect(() => {
    if (initialLoadDone.current) debouncedSyncSetores(setores);
  }, [setores, debouncedSyncSetores]);

  useEffect(() => {
    if (initialLoadDone.current) debouncedSyncSedes(sedes);
  }, [sedes, debouncedSyncSedes]);

  const addSetor = useCallback((nome: string, tipo: TipoSetor) => {
    const novo = createDefaultSetor(nome, tipo, periodoAtivo);
    setSetores(prev => [...prev, novo]);
    setActiveSetorId(novo.id);
    setView('setor');
  }, [periodoAtivo]);

  const removeSetor = useCallback((id: string) => {
    setSetores(prev => prev.filter(s => s.id !== id));
    setActiveSetorId(prev => prev === id ? null : prev);
    if (user) supabase.from('setores').delete().eq('id', id).then(() => {});
  }, [user]);

  const updatePeriodoData = useCallback((setorId: string, periodo: string, updates: Partial<PeriodoData>) => {
    setSetores(prev => prev.map(s => {
      if (s.id !== setorId) return s;
      const currentData = s.periodos[periodo] ?? getOrCreatePeriodoData(s, periodo);
      const newData = {
        pessoal: updates.pessoal ?? currentData.pessoal,
        faturamento: updates.faturamento ?? currentData.faturamento,
      };
      return { ...s, periodos: { ...s.periodos, [periodo]: newData } };
    }));
  }, []);

  const updateSetorSedeId = useCallback((setorId: string, sedeId: string | undefined) => {
    setSetores(prev => prev.map(s => s.id === setorId ? { ...s, sedeId } : s));
  }, []);

  const setActiveSetor = useCallback((id: string | null) => {
    setActiveSetorId(id);
    setActiveSedeId(null);
    setView(id ? 'setor' : 'dashboard');
  }, []);

  const addSede = useCallback((nome: string) => {
    const nova = createDefaultSede(nome, periodoAtivo);
    setSedes(prev => [...prev, nova]);
    setActiveSedeId(nova.id);
    setActiveSetorId(null);
    setView('sede');
  }, [periodoAtivo]);

  const removeSede = useCallback((id: string) => {
    setSedes(prev => prev.filter(s => s.id !== id));
    setSetores(prev => prev.map(s => s.sedeId === id ? { ...s, sedeId: undefined } : s));
    setActiveSedeId(prev => prev === id ? null : prev);
    if (user) supabase.from('sedes').delete().eq('id', id).then(() => {});
  }, [user]);

  const setActiveSede = useCallback((id: string | null) => {
    setActiveSedeId(id);
    setActiveSetorId(null);
    setView(id ? 'sede' : 'dashboard');
  }, []);

  const updateSedeCustos = useCallback((sedeId: string, periodo: string, custos: CustoItem[]) => {
    setSedes(prev => prev.map(s => {
      if (s.id !== sedeId) return s;
      return { ...s, periodos: { ...s.periodos, [periodo]: custos } };
    }));
  }, []);

  const getSetoresForSede = useCallback((sedeId: string) => {
    return setores.filter(s => s.sedeId === sedeId);
  }, [setores]);

  const getRateioPerSetor = useCallback((sedeId: string, periodo: string) => {
    const sede = sedes.find(s => s.id === sedeId);
    if (!sede) return 0;
    const custos = getOrCreateSedeCustos(sede, periodo);
    const total = custos.reduce((sum, c) => sum + c.valor, 0);
    const numSetores = setores.filter(s => s.sedeId === sedeId).length;
    if (numSetores === 0) return 0;
    return total / numSetores;
  }, [sedes, setores]);

  const activeSetor = setores.find(s => s.id === activeSetorId) || null;
  const activePeriodoData = activeSetor ? getOrCreatePeriodoData(activeSetor, periodoAtivo) : null;

  return (
    <AppContext.Provider value={{
      setores, sedes, activeSetorId, activeSedeId, periodoAtivo, view, viewMode,
      addSetor, removeSetor, updatePeriodoData, updateSetorSedeId,
      setActiveSetor, setPeriodoAtivo, setView, setViewMode,
      activeSetor, activePeriodoData,
      addSede, removeSede, setActiveSede, updateSedeCustos,
      getSetoresForSede, getRateioPerSetor, loading,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}