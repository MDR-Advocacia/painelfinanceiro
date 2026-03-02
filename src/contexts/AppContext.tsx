import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { Setor, TipoSetor, PeriodoData, ViewMode, Sede, CustoItem, VpdConfig } from '@/types/sector';
import { createDefaultSetor, createDefaultPeriodoData, getCurrentPeriodo, createDefaultSede } from '@/types/sector';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from "sonner";
import { getVpdValor } from '@/utils/calculations';

interface AppState {
  setores: Setor[];
  sedes: Sede[];
  vpdConfigs: VpdConfig[];
  activeSetorId: string | null;
  activeSedeId: string | null;
  periodoAtivo: string;
  view: 'dashboard' | 'setor' | 'projecoes' | 'ranking' | 'sede' | 'honorarios' | 'config-estrategica'; 
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
  hasUnsavedChanges: boolean;
  isSaving: boolean;
  saveData: () => Promise<void>;
  updateVpdValor: (periodo: string, valor: number) => void;
  currentVpdValor: number;
}

const AppContext = createContext<AppContextType | null>(null);

function getOrCreatePeriodoDataLocal(setor: Setor, periodo: string): PeriodoData {
  if (setor.periodos && setor.periodos[periodo]) return setor.periodos[periodo];
  const sorted = Object.keys(setor.periodos || {}).sort();
  const prev = sorted.filter(p => p < periodo);
  if (prev.length > 0) return JSON.parse(JSON.stringify(setor.periodos[prev[prev.length - 1]]));
  return createDefaultPeriodoData(setor.tipo);
}

function getOrCreateSedeCustosLocal(sede: Sede, periodo: string): CustoItem[] {
  if (sede.periodos && sede.periodos[periodo]) return sede.periodos[periodo];
  const sorted = Object.keys(sede.periodos || {}).sort();
  const prev = sorted.filter(p => p < periodo);
  if (prev.length > 0) return JSON.parse(JSON.stringify(sede.periodos[prev[prev.length - 1]]));
  return [];
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [setores, setSetores] = useState<Setor[]>([]);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [vpdConfigs, setVpdConfigs] = useState<VpdConfig[]>([]);
  const [activeSetorId, setActiveSetorId] = useState<string | null>(null);
  const [activeSedeId, setActiveSedeId] = useState<string | null>(null);
  const [periodoAtivo, setPeriodoAtivo] = useState(getCurrentPeriodo());
  const [view, setView] = useState<AppState['view']>('dashboard');
  const [viewMode, setViewMode] = useState<ViewMode>('mensal');
  const [loading, setLoading] = useState(true);
  
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const initialLoadDone = useRef(false);

  useEffect(() => {
    if (!user) { setLoading(false); return; }

    const loadData = async () => {
      try {
        const [setoresRes, sedesRes, vpdRes] = await Promise.all([
          supabase.from('setores').select('*'),
          supabase.from('sedes').select('*'),
          supabase.from('vpd_configs').select('*')
        ]);

        if (setoresRes.data) setSetores(setoresRes.data.map((r: any) => ({
          id: r.id, nome: r.nome, tipo: r.tipo, sedeId: r.sede_id ?? undefined, periodos: r.periodos ?? {}
        })));

        if (sedesRes.data) setSedes(sedesRes.data.map((r: any) => ({
          id: r.id, nome: r.nome, periodos: r.periodos ?? {}
        })));

        if (vpdRes.data) setVpdConfigs(vpdRes.data.map((r: any) => ({
          id: r.id, periodo: r.periodo, valor: r.valor
        })));
        
        initialLoadDone.current = true;
      } catch (err) {
        console.error("Erro ao carregar dados:", err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [user]);

  const saveData = async () => {
    if (!user || !initialLoadDone.current) return;
    setIsSaving(true);
    try {
      const sectorRows = setores.map(s => ({
        id: s.id, user_id: user.id, nome: s.nome, tipo: s.tipo,
        sede_id: s.sedeId ?? null, periodos: s.periodos
      }));
      const sedeRows = sedes.map(s => ({
        id: s.id, user_id: user.id, nome: s.nome, periodos: s.periodos
      }));
      const vpdRows = vpdConfigs.map(v => ({
        id: v.id, user_id: user.id, periodo: v.periodo, valor: v.valor
      }));

      await Promise.all([
        sectorRows.length > 0 && supabase.from('setores').upsert(sectorRows),
        sedeRows.length > 0 && supabase.from('sedes').upsert(sedeRows),
        vpdRows.length > 0 && supabase.from('vpd_configs').upsert(vpdRows)
      ]);

      setHasUnsavedChanges(false);
      toast.success("Dados salvos com segurança!");
    } catch (error) {
      toast.error("Erro ao sincronizar dados.");
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const addSetor = useCallback((nome: string, tipo: TipoSetor) => {
    setSetores(prev => [...prev, createDefaultSetor(nome, tipo, periodoAtivo)]);
    setHasUnsavedChanges(true);
    setView('setor');
  }, [periodoAtivo]);

  const removeSetor = useCallback((id: string) => {
    if (!confirm("Excluir setor permanentemente?")) return;
    setSetores(prev => prev.filter(s => s.id !== id));
    setHasUnsavedChanges(true);
    supabase.from('setores').delete().eq('id', id).then();
  }, []);

  const updatePeriodoData = useCallback((setorId: string, periodo: string, updates: Partial<PeriodoData>) => {
    setSetores(prev => prev.map(s => {
      if (s.id !== setorId) return s;
      const current = getOrCreatePeriodoDataLocal(s, periodo);
      setHasUnsavedChanges(true);
      return {
        ...s,
        periodos: {
          ...s.periodos,
          [periodo]: {
            pessoal: updates.pessoal ?? current.pessoal,
            faturamento: updates.faturamento ?? current.faturamento,
            despesasEventuais: updates.despesasEventuais ?? current.despesasEventuais ?? [] // NOVA LINHA
          }
        }
      };
    }));
  }, []);

  const updateSetorSedeId = useCallback((setorId: string, sedeId: string | undefined) => {
    setSetores(prev => prev.map(s => s.id === setorId ? { ...s, sedeId } : s));
    setHasUnsavedChanges(true);
  }, []);

  const addSede = useCallback((nome: string) => {
    setSedes(prev => [...prev, createDefaultSede(nome, periodoAtivo)]);
    setHasUnsavedChanges(true);
    setView('sede');
  }, [periodoAtivo]);

  const removeSede = useCallback((id: string) => {
    if (!confirm("Excluir sede permanentemente?")) return;
    setSedes(prev => prev.filter(s => s.id !== id));
    setSetores(prev => prev.map(s => s.sedeId === id ? { ...s, sedeId: undefined } : s));
    setHasUnsavedChanges(true);
    supabase.from('sedes').delete().eq('id', id).then();
  }, []);

  const updateSedeCustos = useCallback((sedeId: string, periodo: string, custos: CustoItem[]) => {
    setSedes(prev => prev.map(s => s.id === sedeId ? { ...s, periodos: { ...s.periodos, [periodo]: custos } } : s));
    setHasUnsavedChanges(true);
  }, []);

  const updateVpdValor = useCallback((periodo: string, valor: number) => {
    setVpdConfigs(prev => {
      const exists = prev.find(v => v.periodo === periodo);
      if (exists) return prev.map(v => v.periodo === periodo ? { ...v, valor } : v);
      return [...prev, { id: crypto.randomUUID(), periodo, valor }];
    });
    setHasUnsavedChanges(true);
  }, []);

  const activeSetor = setores.find(s => s.id === activeSetorId) || null;
  const currentVpdValor = getVpdValor(vpdConfigs, periodoAtivo); 

  return (
    <AppContext.Provider value={{
      setores, sedes, vpdConfigs, activeSetorId, activeSedeId, periodoAtivo, view, viewMode,
      addSetor, removeSetor, updatePeriodoData, updateSetorSedeId,
      setActiveSetor: (id) => { setActiveSetorId(id); setActiveSedeId(null); setView(id ? 'setor' : 'dashboard'); },
      setPeriodoAtivo, setView, setViewMode,
      activeSetor, activePeriodoData: activeSetor ? getOrCreatePeriodoDataLocal(activeSetor, periodoAtivo) : null,
      addSede, removeSede, setActiveSede: (id) => { setActiveSedeId(id); setActiveSetorId(null); setView(id ? 'sede' : 'dashboard'); },
      updateSedeCustos,
      getSetoresForSede: (id) => setores.filter(s => s.sedeId === id),
      getRateioPerSetor: (id, p) => {
        const sede = sedes.find(s => s.id === id);
        if (!sede) return 0;
        const total = getOrCreateSedeCustosLocal(sede, p).reduce((sum, c) => sum + c.valor, 0);
        const count = setores.filter(s => s.sedeId === id).length;
        return count === 0 ? 0 : total / count;
      },
      loading, hasUnsavedChanges, isSaving, saveData, updateVpdValor, currentVpdValor
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp deve ser usado dentro de AppProvider');
  return ctx;
}