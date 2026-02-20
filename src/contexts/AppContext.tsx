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
  // Novos controles de salvamento manual
  hasUnsavedChanges: boolean;
  isSaving: boolean;
  saveData: () => Promise<void>;
}

const APP_CTX_KEY = '__APP_CONTEXT__';
const AppContext = ((globalThis as any)[APP_CTX_KEY] ??= createContext<AppContextType | null>(null)) as React.Context<AppContextType | null>;

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
  
  // Estados para controle de salvamento
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const initialLoadDone = useRef(false);

  // --- CARREGAMENTO INICIAL E REALTIME ---
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const loadData = async () => {
      try {
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
            periodos: r.periodos ?? {},
          })));
        }

        if (sedesRes.data) {
          setSedes(sedesRes.data.map((r: any) => ({
            id: r.id,
            nome: r.nome,
            periodos: r.periodos ?? {},
          })));
        }
        
        initialLoadDone.current = true;
      } catch (err) {
        console.error("Erro ao carregar dados iniciais:", err);
      } finally {
        setLoading(false);
      }
    };

    loadData();

    const channel = supabase
      .channel('db-realtime-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'setores' }, (payload) => {
        // Só atualiza via realtime se o usuário não estiver com alterações locais pendentes
        // para evitar que o dado do banco atropele o que ele está digitando
        setHasUnsavedChanges(prev => {
          if (!prev) {
            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
              const r = payload.new as any;
              setSetores(current => {
                const formatted = { id: r.id, nome: r.nome, tipo: r.tipo, sedeId: r.sede_id, periodos: r.periodos ?? {} };
                return current.find(s => s.id === r.id) ? current.map(s => s.id === r.id ? formatted : s) : [...current, formatted];
              });
            } else if (payload.eventType === 'DELETE') {
              setSetores(current => current.filter(s => s.id !== payload.old.id));
            }
          }
          return prev;
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // --- BLOQUEIO DE FECHAMENTO DE ABA ---
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = ''; // Exibe alerta padrão do navegador
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // --- FUNÇÃO DE SALVAMENTO MANUAL ---
  const saveData = async () => {
    if (!user || !initialLoadDone.current) return;
    setIsSaving(true);
    
    try {
      const sectorRows = setores.map(s => ({
        id: s.id,
        user_id: user.id,
        nome: s.nome,
        tipo: s.tipo,
        sede_id: s.sedeId ?? null,
        periodos: s.periodos as any,
      }));

      const sedeRows = sedes.map(s => ({
        id: s.id,
        user_id: user.id,
        nome: s.nome,
        periodos: s.periodos as any,
      }));

      const [resSetores, resSedes] = await Promise.all([
        sectorRows.length > 0 ? supabase.from('setores').upsert(sectorRows, { onConflict: 'id' }) : Promise.resolve({ error: null }),
        sedeRows.length > 0 ? supabase.from('sedes').upsert(sedeRows, { onConflict: 'id' }) : Promise.resolve({ error: null })
      ]);

      if (resSetores.error) throw resSetores.error;
      if (resSedes.error) throw resSedes.error;

      setHasUnsavedChanges(false);
      toast.success("Dados salvos com segurança no banco!");
    } catch (error: any) {
      console.error("Erro ao salvar:", error);
      toast.error("Falha ao salvar: " + (error.message || "Verifique sua conexão."));
    } finally {
      setIsSaving(false);
    }
  };

  // --- ACTIONS (MARCANDO COMO PENDENTE) ---
  const addSetor = useCallback((nome: string, tipo: TipoSetor) => {
    const novo = createDefaultSetor(nome, tipo, periodoAtivo);
    setSetores(prev => [...prev, novo]);
    setHasUnsavedChanges(true);
    setActiveSetorId(novo.id);
    setView('setor');
  }, [periodoAtivo]);

  const removeSetor = useCallback((id: string) => {
    setSetores(prev => prev.filter(s => s.id !== id));
    setHasUnsavedChanges(true);
    if (activeSetorId === id) setActiveSetorId(null);
    // Deletamos direto pois o delete é uma ação destrutiva imediata
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
      setHasUnsavedChanges(true);
      return updated;
    }));
  }, []);

  const updateSetorSedeId = useCallback((setorId: string, sedeId: string | undefined) => {
    setSetores(prev => prev.map(s => {
      if (s.id !== setorId) return s;
      setHasUnsavedChanges(true);
      return { ...s, sedeId };
    }));
  }, []);

  const addSede = useCallback((nome: string) => {
    const nova = createDefaultSede(nome, periodoAtivo);
    setSedes(prev => [...prev, nova]);
    setHasUnsavedChanges(true);
    setActiveSedeId(nova.id);
    setView('sede');
  }, [periodoAtivo]);

  const removeSede = useCallback((id: string) => {
    setSedes(prev => prev.filter(s => s.id !== id));
    setSetores(prev => prev.map(s => s.sedeId === id ? { ...s, sedeId: undefined } : s));
    setHasUnsavedChanges(true);
    if (activeSedeId === id) setActiveSedeId(null);
    supabase.from('sedes').delete().eq('id', id).then();
  }, [activeSedeId]);

  const updateSedeCustos = useCallback((sedeId: string, periodo: string, custos: CustoItem[]) => {
    setSedes(prev => prev.map(s => {
      if (s.id !== sedeId) return s;
      setHasUnsavedChanges(true);
      return { ...s, periodos: { ...s.periodos, [periodo]: custos } };
    }));
  }, []);

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
      // Novos controles expostos
      hasUnsavedChanges, isSaving, saveData
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