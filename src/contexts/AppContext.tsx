import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { Setor, TipoSetor, PeriodoData, ViewMode, Sede, CustoItem } from '@/types/sector';
import { createDefaultSetor, createDefaultPeriodoData, getCurrentPeriodo, createDefaultSede } from '@/types/sector';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from "sonner";

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

// Auxiliares de inicialização com proteção contra nulos
function getOrCreatePeriodoData(setor: Setor, periodo: string): PeriodoData {
  if (setor.periodos && setor.periodos[periodo]) return setor.periodos[periodo];
  const sorted = Object.keys(setor.periodos || {}).sort();
  const prev = sorted.filter(p => p < periodo);
  if (prev.length > 0) {
    return JSON.parse(JSON.stringify(setor.periodos[prev[prev.length - 1]]));
  }
  return createDefaultPeriodoData(setor.tipo);
}

function getOrCreateSedeCustos(sede: Sede, periodo: string): CustoItem[] {
  if (sede.periodos && sede.periodos[periodo]) return sede.periodos[periodo];
  const sorted = Object.keys(sede.periodos || {}).sort();
  const prev = sorted.filter(p => p < periodo);
  if (prev.length > 0) {
    return JSON.parse(JSON.stringify(sede.periodos[prev[prev.length - 1]]));
  }
  return [];
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
  const syncTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // --- SINCRONIZAÇÃO GRANULAR (Evita Loop Infinito) ---
  const syncItem = useCallback(async (table: 'setores' | 'sedes', item: any) => {
    if (!user || !initialLoadDone.current) return;

    // Debounce por ID para não sobrecarregar em digitação rápida
    if (syncTimers.current[item.id]) clearTimeout(syncTimers.current[item.id]);

    syncTimers.current[item.id] = setTimeout(async () => {
      const row = table === 'setores' ? {
        id: item.id,
        user_id: user.id,
        nome: item.nome,
        tipo: item.tipo,
        sede_id: item.sedeId ?? null,
        periodos: item.periodos as any,
      } : {
        id: item.id,
        user_id: user.id,
        nome: item.nome,
        periodos: item.periodos as any,
      };

      const { error } = await supabase.from(table).upsert(row, { onConflict: 'id' });
      if (error) console.error(`Erro ao sincronizar ${table}:`, error);
    }, 500);
  }, [user]);

  // --- CARREGAMENTO E REALTIME ---
  useEffect(() => {
    if (!user) { setLoading(false); return; }

    const loadData = async () => {
      try {
        const [setoresRes, sedesRes] = await Promise.all([
          supabase.from('setores').select('*'),
          supabase.from('sedes').select('*'),
        ]);

        if (setoresRes.data) {
          setSetores(setoresRes.data.map((r: any) => ({
            id: r.id, nome: r.nome, tipo: r.tipo as TipoSetor,
            sedeId: r.sede_id ?? undefined, periodos: r.periodos ?? {},
          })));
        }

        if (sedesRes.data) {
          setSedes(sedesRes.data.map((r: any) => ({
            id: r.id, nome: r.nome, periodos: r.periodos ?? {},
          })));
        }
        initialLoadDone.current = true;
      } catch (err) {
        console.error("Falha no carregamento inicial:", err);
        toast.error("Erro ao carregar dados do servidor.");
      } finally {
        setLoading(false);
      }
    };

    loadData();

    const channel = supabase
      .channel('db-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'setores' }, (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const r = payload.new as any;
          setSetores(prev => {
            const formatted = { id: r.id, nome: r.nome, tipo: r.tipo, sedeId: r.sede_id, periodos: r.periodos ?? {} };
            return prev.find(s => s.id === r.id) ? prev.map(s => s.id === r.id ? formatted : s) : [...prev, formatted];
          });
        } else if (payload.eventType === 'DELETE') {
          setSetores(prev => prev.filter(s => s.id !== payload.old.id));
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sedes' }, (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const r = payload.new as any;
          setSedes(prev => {
            const formatted = { id: r.id, nome: r.nome, periodos: r.periodos ?? {} };
            return prev.find(s => s.id === r.id) ? prev.map(s => s.id === r.id ? formatted : s) : [...prev, formatted];
          });
        } else if (payload.eventType === 'DELETE') {
          setSedes(prev => prev.filter(s => s.id !== payload.old.id));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // --- ACTIONS ---
  const addSetor = useCallback((nome: string, tipo: TipoSetor) => {
    const novo = createDefaultSetor(nome, tipo, periodoAtivo);
    setSetores(prev => [...prev, novo]);
    setActiveSetorId(novo.id);
    setView('setor');
    syncItem('setores', novo);
  }, [periodoAtivo, syncItem]);

  const removeSetor = useCallback((id: string) => {
    setSetores(prev => prev.filter(s => s.id !== id));
    if (activeSetorId === id) setActiveSetorId(null);
    supabase.from('setores').delete().eq('id', id).then();
  }, [activeSetorId]);

  const updatePeriodoData = useCallback((setorId: string, periodo: string, updates: Partial<PeriodoData>) => {
    setSetores(prev => prev.map(s => {
      if (s.id !== setorId) return s;
      const currentData = s.periodos[periodo] ?? getOrCreatePeriodoData(s, periodo);
      const updated = {
        ...s,
        periodos: {
          ...s.periodos,
          [periodo]: {
            pessoal: updates.pessoal ?? currentData.pessoal,
            faturamento: updates.faturamento ?? currentData.faturamento,
          }
        }
      };
      syncItem('setores', updated);
      return updated;
    }));
  }, [syncItem]);

  const updateSetorSedeId = useCallback((setorId: string, sedeId: string | undefined) => {
    setSetores(prev => prev.map(s => {
      if (s.id !== setorId) return s;
      const updated = { ...s, sedeId };
      syncItem('setores', updated);
      return updated;
    }));
  }, [syncItem]);

  const addSede = useCallback((nome: string) => {
    const nova = createDefaultSede(nome, periodoAtivo);
    setSedes(prev => [...prev, nova]);
    setActiveSedeId(nova.id);
    setView('sede');
    syncItem('sedes', nova);
  }, [periodoAtivo, syncItem]);

  const removeSede = useCallback((id: string) => {
    setSedes(prev => prev.filter(s => s.id !== id));
    setSetores(prev => prev.map(s => s.sedeId === id ? { ...s, sedeId: undefined } : s));
    if (activeSedeId === id) setActiveSedeId(null);
    supabase.from('sedes').delete().eq('id', id).then();
  }, [activeSedeId]);

  const updateSedeCustos = useCallback((sedeId: string, periodo: string, custos: CustoItem[]) => {
    setSedes(prev => prev.map(s => {
      if (s.id !== sedeId) return s;
      const updated = { ...s, periodos: { ...s.periodos, [periodo]: custos } };
      syncItem('sedes', updated);
      return updated;
    }));
  }, [syncItem]);

  const setActiveSetor = useCallback((id: string | null) => {
    setActiveSetorId(id); setActiveSedeId(null); setView(id ? 'setor' : 'dashboard');
  }, []);

  const setActiveSede = useCallback((id: string | null) => {
    setActiveSedeId(id); setActiveSetorId(null); setView(id ? 'sede' : 'dashboard');
  }, []);

  const getSetoresForSede = (sedeId: string) => setores.filter(s => s.sedeId === sedeId);

  const getRateioPerSetor = (sedeId: string, periodo: string) => {
    const sede = sedes.find(s => s.id === sedeId);
    if (!sede) return 0;
    const custos = getOrCreateSedeCustos(sede, periodo);
    const total = custos.reduce((sum, c) => sum + c.valor, 0);
    const numSetores = setores.filter(s => s.sedeId === sedeId).length;
    return numSetores === 0 ? 0 : total / numSetores;
  };

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