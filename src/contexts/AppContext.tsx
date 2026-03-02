import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { Setor, TipoSetor, PeriodoData, ViewMode, Sede, CustoItem, VpdConfig } from '@/types/sector';
import { createDefaultSetor, createDefaultPeriodoData, getCurrentPeriodo, createDefaultSede } from '@/types/sector';
import { useAuth } from '@/hooks/useAuth';
import { toast } from "sonner";
import { getVpdValor } from '@/utils/calculations';

// A URL DA NOSSA NOVA API DJANGO!
const API_URL = 'http://localhost:8000/api';

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

  // --- 1. CARREGAMENTO INICIAL DO BANCO (VIA DJANGO API) ---
  useEffect(() => {
    if (!user) { setLoading(false); return; }

    const loadData = async () => {
      try {
        const [setoresRes, sedesRes, vpdRes] = await Promise.all([
          fetch(`${API_URL}/setores/`).then(res => res.json()),
          fetch(`${API_URL}/sedes/`).then(res => res.json()),
          fetch(`${API_URL}/vpd_configs/`).then(res => res.json())
        ]);

        if (Array.isArray(setoresRes)) {
          setSetores(setoresRes.map((r: any) => ({
            id: r.id, nome: r.nome, tipo: r.tipo, sedeId: r.sedeId ?? undefined, periodos: r.periodos ?? {}
          })));
        }

        if (Array.isArray(sedesRes)) {
          setSedes(sedesRes.map((r: any) => ({
            id: r.id, nome: r.nome, periodos: r.periodos ?? {}
          })));
        }

        if (Array.isArray(vpdRes)) {
          setVpdConfigs(vpdRes.map((r: any) => ({
            id: r.id, periodo: r.periodo, valor: r.valor
          })));
        }
        
        initialLoadDone.current = true;
      } catch (err) {
        console.error("Erro ao carregar dados da API:", err);
        toast.error("Falha ao conectar com o servidor local.");
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [user]);

  // --- 2. SALVAMENTO MANUAL (VIA DJANGO API) ---
  const saveData = async () => {
    if (!user || !initialLoadDone.current) return;
    setIsSaving(true);
    
    // Lógica para Criar (POST) ou Atualizar (PUT) os dados na API
    const upsertToAPI = async (endpoint: string, items: any[]) => {
      for (const item of items) {
        const payload = { ...item, user_id: user.id };
        const check = await fetch(`${API_URL}/${endpoint}/${item.id}/`);
        
        if (check.ok) {
          await fetch(`${API_URL}/${endpoint}/${item.id}/`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
        } else {
          await fetch(`${API_URL}/${endpoint}/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
        }
      }
    };

    try {
      const sectorRows = setores.map(s => ({
        id: s.id, nome: s.nome, tipo: s.tipo, sedeId: s.sedeId ?? null, periodos: s.periodos
      }));
      const sedeRows = sedes.map(s => ({
        id: s.id, nome: s.nome, periodos: s.periodos
      }));
      const vpdRows = vpdConfigs.map(v => ({
        id: v.id, periodo: v.periodo, valor: v.valor
      }));

      await Promise.all([
        upsertToAPI('setores', sectorRows),
        upsertToAPI('sedes', sedeRows),
        upsertToAPI('vpd_configs', vpdRows)
      ]);

      setHasUnsavedChanges(false);
      toast.success("Dados salvos com segurança no servidor local!");
    } catch (error) {
      console.error(error);
      toast.error("Erro ao sincronizar dados com o servidor.");
    } finally {
      setIsSaving(false);
    }
  };

  // --- 3. BLOQUEIO DE FECHAMENTO ACIDENTAL ---
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

  // --- 4. FUNÇÕES DE ALTERAÇÃO (SETTERS) ---
  const addSetor = useCallback((nome: string, tipo: TipoSetor) => {
    setSetores(prev => [...prev, createDefaultSetor(nome, tipo, periodoAtivo)]);
    setHasUnsavedChanges(true);
    setView('setor');
  }, [periodoAtivo]);

  const removeSetor = useCallback((id: string) => {
    if (!confirm("Excluir setor permanentemente?")) return;
    setSetores(prev => prev.filter(s => s.id !== id));
    setHasUnsavedChanges(true);
    fetch(`${API_URL}/setores/${id}/`, { method: 'DELETE' }).catch(console.error);
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
            despesasEventuais: updates.despesasEventuais ?? current.despesasEventuais ?? [] // <-- AQUI GARANTIMOS OS GASTOS EVENTUAIS
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
    fetch(`${API_URL}/sedes/${id}/`, { method: 'DELETE' }).catch(console.error);
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

  // --- 5. CALCULADOS E GETTERS ---
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