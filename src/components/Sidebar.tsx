// Sidebar do Painel Financeiro — linguagem visual da família DunaTech (Flow):
// sidebar clara, seções colapsáveis com headers uppercase, item ativo em pill
// azul, wordmark em gradiente navy→azul e rodapé DunaTech.
import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/hooks/useAuth";
import { invalidatePermissionsCache, usePermissions } from "@/hooks/usePermissions";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  LayoutDashboard,
  Trash2,
  TrendingUp,
  BarChart3,
  Factory,
  Landmark,
  Building,
  LogOut,
  Users,
  FileSpreadsheet,
  Target,
  Contact,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/ThemeToggle";
import logoMdr from "@/assets/logo-mdr.png";
import { getSetorResumo, getStatusColor, getStatusLabel } from "@/utils/calculations";
import { validateName } from "@/utils/security";
import { toast } from "sonner";
import type { TipoSetor } from "@/types/sector";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

const ITEM_BASE =
  "w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/75 transition-all hover:bg-sidebar-accent/50 hover:text-white";
const ITEM_ACTIVE = "bg-sidebar-accent !text-white";

function SectionHeader({
  title, collapsed, onToggle,
}: { title: string; collapsed: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50 transition-colors hover:text-sidebar-foreground"
    >
      <span>{title}</span>
      <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${collapsed ? "-rotate-90" : ""}`} />
    </button>
  );
}

export function Sidebar() {
  const {
    setores, sedes, activeSetorId, activeSedeId, setActiveSetor, setActiveSede,
    addSetor, addSede, removeSetor, removeSede, setView, view, periodoAtivo,
    currentVpdValor,
  } = useApp();

  const { isAdmin, signOut } = useAuth();
  const { pode } = usePermissions();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    invalidatePermissionsCache();
    await signOut();
    navigate("/login", { replace: true });
  };

  const [newName, setNewName] = useState("");
  const [newTipo, setNewTipo] = useState<TipoSetor>("operacional");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sedeDialogOpen, setSedeDialogOpen] = useState(false);
  const [newSedeName, setNewSedeName] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setCollapsed((c) => ({ ...c, [k]: !c[k] }));

  const handleAdd = () => {
    const error = validateName(newName);
    if (error) { toast.error(error); return; }
    addSetor(newName.trim(), newTipo);
    setNewName(""); setNewTipo("operacional"); setDialogOpen(false);
  };

  const handleAddSede = () => {
    const error = validateName(newSedeName);
    if (error) { toast.error(error); return; }
    addSede(newSedeName.trim());
    setNewSedeName(""); setSedeDialogOpen(false);
  };

  // RBAC: cada painel é um módulo — só entra no menu se o cargo liberar.
  const paineis = ([
    { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { key: "projecoes", label: "Projeções", icon: TrendingUp },
    { key: "ranking", label: "Rentabilidade", icon: BarChart3 },
    { key: "honorarios", label: "Honorários BB", icon: FileSpreadsheet },
    { key: "config-estrategica", label: "Gestão Estratégica", icon: Target },
    { key: "pessoal", label: "Pessoal (DP)", icon: Contact },
  ] as const).filter((p) => pode(p.key));
  const podeSedes = pode("sedes");
  const podeSetores = pode("setores");

  return (
    // navy levemente translúcido: o fundo azulado da página atravessa e dá
    // profundidade, sem perder contraste do texto (fallback opaco onde não
    // há suporte a backdrop-filter)
    <aside className="sidebar-glass flex min-h-screen w-72 flex-col border-r border-sidebar-border">
      {/* Header — marca (logo adaptativa: preta no claro, branca no noturno) */}
      <div className="flex h-[72px] items-center gap-3 border-b border-sidebar-border px-4">
        <img src={logoMdr} alt="MDR" className="logo-mdr-onnavy h-11" />
        <div className="leading-tight">
          <h1 className="painel-wordmark-onnavy font-heading text-base font-bold">Painel Financeiro</h1>
          <p className="text-[10px] tracking-wider text-sidebar-foreground/50">MDR ADVOCACIA</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-3 text-sm font-medium lg:px-3">
        {/* PAINÉIS (some se o cargo não liberar nenhum) */}
        {paineis.length > 0 && (
          <SectionHeader title="Painéis" collapsed={!!collapsed["paineis"]} onToggle={() => toggle("paineis")} />
        )}
        {!collapsed["paineis"] && paineis.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => { setActiveSetor(null); setView(key as any); }}
            className={`${ITEM_BASE} ${view === key ? ITEM_ACTIVE : ""}`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}

        {/* SEDES (módulo RBAC) */}
        {podeSedes && (
          <div className="pt-3">
            <SectionHeader title="Sedes" collapsed={!!collapsed["sedes"]} onToggle={() => toggle("sedes")} />
          </div>
        )}
        {podeSedes && !collapsed["sedes"] && (
          <>
            {sedes.map((sede) => {
              const isActive = sede.id === activeSedeId && view === "sede";
              return (
                <div
                  key={sede.id}
                  className={`group flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all ${
                    isActive ? ITEM_ACTIVE : "text-sidebar-foreground/75 hover:bg-sidebar-accent/50 hover:text-white"
                  }`}
                  onClick={() => setActiveSede(sede.id)}
                >
                  <Building className="h-4 w-4 shrink-0" />
                  <span className="flex-1 truncate font-medium">{sede.nome}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeSede(sede.id); }}
                    className="rounded p-1 text-sidebar-foreground/40 opacity-0 transition-all hover:bg-destructive/30 hover:text-red-300 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
            <Dialog open={sedeDialogOpen} onOpenChange={setSedeDialogOpen}>
              <DialogTrigger asChild>
                <button className="flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-xs text-sidebar-foreground/50 transition-colors hover:text-white">
                  <Plus className="h-3 w-3" /> Nova Sede
                </button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Criar Nova Sede</DialogTitle></DialogHeader>
                <div className="mt-2 space-y-4">
                  <Input
                    placeholder="Ex: Capim Macio, Manhattan"
                    value={newSedeName}
                    onChange={(e) => setNewSedeName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddSede()}
                    autoFocus
                  />
                  <Button onClick={handleAddSede} className="w-full">Criar Sede</Button>
                </div>
              </DialogContent>
            </Dialog>
          </>
        )}

        {/* SETORES (módulo RBAC) */}
        {podeSetores && (
          <div className="pt-3">
            <SectionHeader title="Setores" collapsed={!!collapsed["setores"]} onToggle={() => toggle("setores")} />
          </div>
        )}
        {podeSetores && !collapsed["setores"] && (
          <>
            {setores.map((setor) => {
              const resumo = getSetorResumo(setor, periodoAtivo, currentVpdValor);
              const isActive = setor.id === activeSetorId && view === "setor";
              const TipoIcon = setor.tipo === "operacional" ? Factory : Landmark;
              const hasData = resumo.faturamentoBruto > 0;
              const sedeName = sedes.find((s) => s.id === setor.sedeId)?.nome;
              return (
                <div
                  key={setor.id}
                  className={`group flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all ${
                    isActive ? ITEM_ACTIVE : "text-sidebar-foreground/75 hover:bg-sidebar-accent/50 hover:text-white"
                  }`}
                  onClick={() => setActiveSetor(setor.id)}
                >
                  <TipoIcon className="h-4 w-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{setor.nome}</span>
                    <span className="text-[10px] text-sidebar-foreground/50">
                      {setor.tipo === "operacional" ? "Oper." : "Admin."}
                      {sedeName && <> · {sedeName}</>}
                      {hasData && (
                        <> · <span className={getStatusColor(resumo.status)}>{getStatusLabel(resumo.status)}</span></>
                      )}
                    </span>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeSetor(setor.id); }}
                    className="rounded p-1 text-sidebar-foreground/40 opacity-0 transition-all hover:bg-destructive/30 hover:text-red-300 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
            {setores.length === 0 && (
              <p className="px-3 py-4 text-center text-xs text-sidebar-foreground/50">
                Nenhum setor ainda. Crie o primeiro abaixo.
              </p>
            )}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <button className="flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-xs text-sidebar-foreground/50 transition-colors hover:text-white">
                  <Plus className="h-3 w-3" /> Novo Setor
                </button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Criar Novo Setor</DialogTitle></DialogHeader>
                <div className="mt-2 space-y-4">
                  <Input
                    placeholder="Ex: Direito Corporativo"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                    autoFocus
                  />
                  <div>
                    <p className="mb-2 text-xs font-medium text-muted-foreground">Tipo do Setor</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setNewTipo("operacional")}
                        className={`flex items-center gap-2 rounded-lg border p-3 text-sm transition-colors ${
                          newTipo === "operacional"
                            ? "border-primary bg-primary/5 font-medium text-primary"
                            : "border-border text-muted-foreground hover:border-primary/50"
                        }`}
                      >
                        <Factory className="h-4 w-4" /> Operacional
                      </button>
                      <button
                        onClick={() => setNewTipo("administrativo")}
                        className={`flex items-center gap-2 rounded-lg border p-3 text-sm transition-colors ${
                          newTipo === "administrativo"
                            ? "border-primary bg-primary/5 font-medium text-primary"
                            : "border-border text-muted-foreground hover:border-primary/50"
                        }`}
                      >
                        <Landmark className="h-4 w-4" /> Administrativo
                      </button>
                    </div>
                  </div>
                  <Button onClick={handleAdd} className="w-full glass-button border-0">Criar Setor</Button>
                </div>
              </DialogContent>
            </Dialog>
          </>
        )}

        {/* ADMINISTRAÇÃO */}
        {isAdmin && (
          <>
            <div className="pt-3">
              <SectionHeader title="Administração" collapsed={!!collapsed["adm"]} onToggle={() => toggle("adm")} />
            </div>
            {!collapsed["adm"] && (
              <button onClick={() => navigate("/usuarios")} className={ITEM_BASE}>
                <Users className="h-4 w-4" /> Usuários & Permissões
              </button>
            )}
          </>
        )}
      </nav>

      {/* Rodapé — tema + sair + assinatura DunaTech (padrão da família Flow) */}
      <div className="border-t border-sidebar-border px-3 py-3">
        <ThemeToggle />
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs text-sidebar-foreground/70 transition-colors hover:bg-destructive/25 hover:text-red-300"
        >
          <LogOut className="h-4 w-4" /> Sair
        </button>
        <div className="pt-2 text-center text-[0.65rem] tracking-wider text-sidebar-foreground/40">
          © 2026 Duna.Tech
        </div>
      </div>
    </aside>
  );
}
