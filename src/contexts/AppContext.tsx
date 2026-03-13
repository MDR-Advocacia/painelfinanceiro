import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { Setor, TipoSetor, PeriodoData, ViewMode, Sede, CustoItem, VpdConfig } from '@/types/sector';
import { createDefaultSetor, createDefaultPeriodoData, getCurrentPeriodo, createDefaultSede } from '@/types/sector';
import { useAuth } from '@/hooks/useAuth';
import { toast } from "sonner";
import { getVpdValor } from '@/utils/calculations';

// A URL DA NOSSA NOVA API DJANGO!
const API_URL = import.meta.env.VITE_API_URL;

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
  // Atualizado para receber os novos campos
  updateVpdValor: (periodo: string, valor: number, headcount: number, despesasBase: any[], pessoalApoio: any[]) => void;
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
  const autosaveTimer = useRef<number | null>(null);
  const lastChangeRef = useRef(0);
  const lastAutosaveAttemptRef = useRef(0);
  const persistedSetorIdsRef = useRef<Set<string>>(new Set());
  const persistedSedeIdsRef = useRef<Set<string>>(new Set());
  const persistedVpdIdsRef = useRef<Set<string>>(new Set());

  const markUnsaved = useCallback(() => {
    lastChangeRef.current = Date.now();
    setHasUnsavedChanges(true);
  }, []);

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
          const setoresData = setoresRes.map((r: any) => ({
            id: r.id, nome: r.nome, tipo: r.tipo, sedeId: r.sedeId ?? undefined, periodos: r.periodos ?? {}
          }));
          setSetores(setoresData);
          persistedSetorIdsRef.current = new Set(setoresData.map(s => s.id));
        }

        if (Array.isArray(sedesRes)) {
          const sedesData = sedesRes.map((r: any) => ({
            id: r.id, nome: r.nome, periodos: r.periodos ?? {}
          }));
          setSedes(sedesData);
          persistedSedeIdsRef.current = new Set(sedesData.map(s => s.id));
        }

        if (Array.isArray(vpdRes)) {
          // Atualizado para puxar do banco a memória de cálculo
          const vpdData = vpdRes.map((r: any) => ({
            id: r.id, 
            periodo: r.periodo, 
            valor: r.valor,
            headcount: r.headcount,
            despesasBase: r.despesasBase,
            pessoalApoio: r.pessoalApoio
          }));
          setVpdConfigs(vpdData);
          persistedVpdIdsRef.current = new Set(vpdData.map(v => v.id));
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
  const saveData = useCallback(async () => {
    if (!user || !initialLoadDone.current) return;
    setIsSaving(true);
    
    const requestOrThrow = async (url: string, options?: RequestInit) => {
      const res = await fetch(url, options);
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`${res.status} ${res.statusText}${body ? `: ${body}` : ''}`);
      }
      return res;
    };

    const upsertToAPI = async (endpoint: string, items: any[], persistedRef: React.MutableRefObject<Set<string>>) => {
      for (const item of items) {
        const payload = { ...item, user_id: user.id };
        const isPersisted = persistedRef.current.has(item.id);

        if (isPersisted) {
          await requestOrThrow(`${API_URL}/${endpoint}/${item.id}/`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          continue;
        }

        try {
          await requestOrThrow(`${API_URL}/${endpoint}/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          persistedRef.current.add(item.id);
        } catch (err) {
          await requestOrThrow(`${API_URL}/${endpoint}/${item.id}/`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          persistedRef.current.add(item.id);
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
      // Atualizado para enviar os novos campos ao backend
      const vpdRows = vpdConfigs.map(v => ({
        id: v.id, 
        periodo: v.periodo, 
        valor: v.valor,
        headcount: v.headcount,
        despesasBase: v.despesasBase,
        pessoalApoio: v.pessoalApoio
      }));

      if (!API_URL) throw new Error('API_URL não configurada');

      await Promise.all([
        upsertToAPI('setores', sectorRows, persistedSetorIdsRef),
        upsertToAPI('sedes', sedeRows, persistedSedeIdsRef),
        upsertToAPI('vpd_configs', vpdRows, persistedVpdIdsRef)
      ]);

      setHasUnsavedChanges(false);
      toast.success("Dados salvos com segurança no servidor local!");
    } catch (error) {
      console.error(error);
      toast.error("Erro ao sincronizar dados com o servidor.");
    } finally {
      setIsSaving(false);
    }
  }, [user, setores, sedes, vpdConfigs]);

  // --- 2.1 AUTOSAVE COM DEBOUNCE ---
  useEffect(() => {
    if (!hasUnsavedChanges || isSaving || !user || !initialLoadDone.current) return;

    const AUTOSAVE_DELAY_MS = 1500;
    const AUTOSAVE_RETRY_MS = 30000;
    const now = Date.now();
    const lastChange = lastChangeRef.current;
    const lastAttempt = lastAutosaveAttemptRef.current;
    const hasNewChange = lastChange > lastAttempt;

    if (!hasNewChange && now - lastAttempt < AUTOSAVE_RETRY_MS) return;

    const elapsed = now - lastChange;
    const delay = Math.max(AUTOSAVE_DELAY_MS - elapsed, 0);

    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    autosaveTimer.current = window.setTimeout(() => {
      lastAutosaveAttemptRef.current = Date.now();
      saveData();
    }, delay);

    return () => {
      if (autosaveTimer.current) {
        window.clearTimeout(autosaveTimer.current);
        autosaveTimer.current = null;
      }
    };
  }, [hasUnsavedChanges, isSaving, user, saveData]);

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
    markUnsaved();
    setView('setor');
  }, [periodoAtivo, markUnsaved]);

  const removeSetor = useCallback((id: string) => {
    if (!confirm("Excluir setor permanentemente?")) return;
    setSetores(prev => prev.filter(s => s.id !== id));
    markUnsaved();
    persistedSetorIdsRef.current.delete(id);
    fetch(`${API_URL}/setores/${id}/`, { method: 'DELETE' }).catch(console.error);
  }, [markUnsaved]);

  const updatePeriodoData = useCallback((setorId: string, periodo: string, updates: Partial<PeriodoData>) => {
    markUnsaved();
    setSetores(prev => prev.map(s => {
      if (s.id !== setorId) return s;
      const current = getOrCreatePeriodoDataLocal(s, periodo);
      return {
        ...s,
        periodos: {
          ...s.periodos,
          [periodo]: {
            pessoal: updates.pessoal ?? current.pessoal,
            faturamento: updates.faturamento ?? current.faturamento,
            despesasEventuais: updates.despesasEventuais ?? current.despesasEventuais ?? []
          }
        }
      };
    }));
  }, [markUnsaved]);

  const updateSetorSedeId = useCallback((setorId: string, sedeId: string | undefined) => {
    setSetores(prev => prev.map(s => s.id === setorId ? { ...s, sedeId } : s));
    markUnsaved();
  }, [markUnsaved]);

  const addSede = useCallback((nome: string) => {
    setSedes(prev => [...prev, createDefaultSede(nome, periodoAtivo)]);
    markUnsaved();
    setView('sede');
  }, [periodoAtivo, markUnsaved]);

  const removeSede = useCallback((id: string) => {
    if (!confirm("Excluir sede permanentemente?")) return;
    setSedes(prev => prev.filter(s => s.id !== id));
    setSetores(prev => prev.map(s => s.sedeId === id ? { ...s, sedeId: undefined } : s));
    markUnsaved();
    persistedSedeIdsRef.current.delete(id);
    fetch(`${API_URL}/sedes/${id}/`, { method: 'DELETE' }).catch(console.error);
  }, [markUnsaved]);

  const updateSedeCustos = useCallback((sedeId: string, periodo: string, custos: CustoItem[]) => {
    setSedes(prev => prev.map(s => s.id === sedeId ? { ...s, periodos: { ...s.periodos, [periodo]: custos } } : s));
    markUnsaved();
  }, [markUnsaved]);

  // Atualizado para persistir todos os dados da memória de cálculo do VPD
  const updateVpdValor = useCallback((periodo: string, valor: number, headcount: number, despesasBase: any[], pessoalApoio: any[]) => {
    setVpdConfigs(prev => {
      const exists = prev.find(v => v.periodo === periodo);
      if (exists) return prev.map(v => v.periodo === periodo ? { ...v, valor, headcount, despesasBase, pessoalApoio } : v);
      return [...prev, { id: crypto.randomUUID(), periodo, valor, headcount, despesasBase, pessoalApoio }];
    });
    markUnsaved();
  }, [markUnsaved]);

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