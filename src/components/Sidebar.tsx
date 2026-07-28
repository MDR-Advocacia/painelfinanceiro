// Sidebar do Painel Financeiro — identidade DunaTech.
//
// Três decisões sustentam o desenho:
//  1. MARCA PRÓPRIA no topo (selo com gradiente + lockup), não um logo
//     genérico solto — o produto tem nome e assinatura.
//  2. HIERARQUIA: destinos agrupados por seção com rótulo discreto; o item
//     ativo é marcado por um fio de luz ciano na borda, não por um bloco
//     chapado. É o padrão dos SaaS de referência (Linear, Vercel, Stripe).
//  3. RODAPÉ com identidade de quem está logado (avatar, nome, cargo) — a
//     pessoa sempre sabe com que permissão está enxergando o painel.
import { useEffect, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/hooks/useAuth";
import { invalidatePermissionsCache, usePermissions } from "@/hooks/usePermissions";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  LayoutDashboard,
  Landmark,
  Network,
  Server,
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
import { PainelLogo } from "@/components/BrandMark";
import {
  type EfEquipe, type EfEstrutura, EF_EVENTOS, abrirDetalheCentro,
  abrirDetalheEquipe, estruturaApi,
} from "@/services/estrutura";
import { getSetorResumo, getStatusColor, getStatusLabel } from "@/utils/calculations";
import { validateName } from "@/utils/security";
import { toast } from "sonner";
import type { TipoSetor } from "@/types/sector";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

function SectionHeader({
  title, collapsed, onToggle, contagem,
}: { title: string; collapsed: boolean; onToggle: () => void; contagem?: number }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      className="group flex w-full items-center gap-1.5 px-2.5 pb-1.5 pt-1 text-sidebar-foreground/45 transition-colors hover:text-sidebar-foreground/80"
    >
      <span className="eyebrow text-sidebar-foreground/45 transition-colors group-hover:text-sidebar-foreground/80">
        {title}
      </span>
      {contagem !== undefined && contagem > 0 && (
        <span className="rounded-full bg-white/[0.07] px-1.5 text-[0.6rem] font-semibold tabular-nums text-sidebar-foreground/50">
          {contagem}
        </span>
      )}
      <ChevronDown className={`ml-auto h-3 w-3 shrink-0 transition-transform ${collapsed ? "-rotate-90" : ""}`} />
    </button>
  );
}

export function Sidebar() {
  const {
    setores, sedes, activeSetorId, activeSedeId, setActiveSetor, setActiveSede,
    addSetor, addSede, removeSetor, removeSede, setView, view, periodoAtivo,
    currentVpdValor,
  } = useApp();

  const { isAdmin, signOut, user } = useAuth();
  const { pode, perms } = usePermissions();
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

  // ── Estrutura de Faturamento no menu: centros, infra e equipes ──
  const podeEstrutura = pode("estrutura");
  const [estrutura, setEstrutura] = useState<EfEstrutura | null>(null);
  const [equipesMenu, setEquipesMenu] = useState<EfEquipe[]>([]);
  useEffect(() => {
    if (!podeEstrutura) return;
    const carregar = () => {
      estruturaApi.carregar().then(setEstrutura).catch(() => undefined);
      estruturaApi.equipes().then(setEquipesMenu).catch(() => undefined);
    };
    carregar();
    // a tela avisa quando algo muda (criar centro, alocar equipe…)
    window.addEventListener(EF_EVENTOS.mudou, carregar);
    return () => window.removeEventListener(EF_EVENTOS.mudou, carregar);
  }, [podeEstrutura]);

  const irParaCentro = (centroId: string) => {
    setActiveSetor(null);
    abrirDetalheCentro(centroId, setView);
  };
  const irParaEquipe = (equipeId: string) => {
    setActiveSetor(null);
    abrirDetalheEquipe(equipeId, setView);
  };

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
    { key: "estrutura", label: "Estrutura de Faturamento", icon: Network },
  ] as const).filter((p) => pode(p.key));
  const podeSedes = pode("sedes");
  const podeSetores = pode("setores");

  return (
    <aside className="sidebar-glass relative flex h-screen w-72 shrink-0 flex-col border-r border-sidebar-border">
      {/* fio de luz na borda direita: separa sem peso de borda */}
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-white/12 to-transparent" />

      {/* ── Marca do produto ── */}
      <div className="flex h-[84px] items-center border-b border-sidebar-border px-4">
        <button onClick={() => setView("dashboard")} className="text-left" aria-label="Ir para o dashboard">
          <PainelLogo size={46} tom="onNavy" />
        </button>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-3">
        {/* PAINÉIS */}
        {paineis.length > 0 && (
          <div className="space-y-0.5">
            <SectionHeader title="Painéis" collapsed={!!collapsed["paineis"]} onToggle={() => toggle("paineis")} />
            {!collapsed["paineis"] && paineis.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => { setActiveSetor(null); setView(key as any); }}
                data-active={view === key}
                className="nav-link"
              >
                <span className="nav-ico"><Icon className="h-full w-full" strokeWidth={1.8} /></span>
                <span className="flex-1 truncate text-left">{label}</span>
              </button>
            ))}
          </div>
        )}

        {/* SEDES */}
        {podeSedes && (
          <div className="space-y-0.5">
            <SectionHeader title="Sedes" contagem={sedes.length}
                           collapsed={!!collapsed["sedes"]} onToggle={() => toggle("sedes")} />
            {!collapsed["sedes"] && (
              <>
                {sedes.map((sede) => (
                  <div
                    key={sede.id}
                    role="button"
                    tabIndex={0}
                    data-active={sede.id === activeSedeId && view === "sede"}
                    className="nav-link group cursor-pointer"
                    onClick={() => setActiveSede(sede.id)}
                    onKeyDown={(e) => e.key === "Enter" && setActiveSede(sede.id)}
                  >
                    <span className="nav-ico"><Building className="h-full w-full" strokeWidth={1.8} /></span>
                    <span className="flex-1 truncate">{sede.nome}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeSede(sede.id); }}
                      aria-label={`Excluir ${sede.nome}`}
                      className="shrink-0 rounded p-1 text-sidebar-foreground/35 opacity-0 transition-all hover:bg-destructive/25 hover:text-red-300 group-hover:opacity-100"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <Dialog open={sedeDialogOpen} onOpenChange={setSedeDialogOpen}>
                  <DialogTrigger asChild>
                    <button className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-sidebar-foreground/45 transition-colors hover:bg-white/[0.04] hover:text-white">
                      <Plus className="h-3.5 w-3.5" /> Nova sede
                    </button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Criar nova sede</DialogTitle></DialogHeader>
                    <div className="mt-2 space-y-4">
                      <Input
                        placeholder="Ex: Capim Macio, Manhattan"
                        value={newSedeName}
                        onChange={(e) => setNewSedeName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleAddSede()}
                        autoFocus
                      />
                      <Button onClick={handleAddSede} className="glass-button w-full border-0">Criar sede</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </>
            )}
          </div>
        )}

        {/* CENTROS DE FATURAMENTO (nova sistemática) */}
        {podeEstrutura && estrutura && (
          <div className="space-y-0.5">
            <SectionHeader title="Centros de Faturamento" contagem={estrutura.centros.length}
                           collapsed={!!collapsed["ef-centros"]} onToggle={() => toggle("ef-centros")} />
            {!collapsed["ef-centros"] && estrutura.centros.map((c) => (
              <button key={c.id} onClick={() => irParaCentro(c.id)}
                      data-active={false} className="nav-link items-start py-1.5">
                <span className="nav-ico mt-0.5"><Landmark className="h-full w-full" strokeWidth={1.8} /></span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate">{c.nome}</span>
                  <span className="block truncate text-[0.65rem] text-sidebar-foreground/45">
                    {c.linhas.length} linha{c.linhas.length === 1 ? "" : "s"}
                    {c.receita_total > 0 && <> · R$ {(c.receita_total / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil</>}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}

        {/* CENTROS DE INFRAESTRUTURA */}
        {podeEstrutura && estrutura && (
          <div className="space-y-0.5">
            <SectionHeader title="Infraestrutura" contagem={estrutura.infraestrutura.length}
                           collapsed={!!collapsed["ef-infra"]} onToggle={() => toggle("ef-infra")} />
            {!collapsed["ef-infra"] && estrutura.infraestrutura.map((c) => (
              <button key={c.id} onClick={() => irParaCentro(c.id)}
                      data-active={false} className="nav-link">
                <span className="nav-ico"><Server className="h-full w-full" strokeWidth={1.8} /></span>
                <span className="flex-1 truncate text-left">{c.nome}</span>
              </button>
            ))}
          </div>
        )}

        {/* EQUIPES — cada uma tem página própria */}
        {podeEstrutura && equipesMenu.length > 0 && (
          <div className="space-y-0.5">
            <SectionHeader title="Equipes" contagem={equipesMenu.length}
                           collapsed={!!collapsed["ef-equipes"]} onToggle={() => toggle("ef-equipes")} />
            {!collapsed["ef-equipes"] && (
              <>
                {equipesMenu.map((e) => (
                  <button key={e.id} onClick={() => irParaEquipe(e.id)}
                          data-active={false} className="nav-link py-1.5">
                    <span className="nav-ico"><Users className="h-full w-full" strokeWidth={1.8} /></span>
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block truncate">{e.nome ?? e.equipe}</span>
                    </span>
                    {(e.colaboradores ?? 0) > 0 && (
                      <span className="shrink-0 rounded-full bg-white/[0.07] px-1.5 text-[0.6rem] font-semibold tabular-nums text-sidebar-foreground/50">
                        {e.colaboradores}
                      </span>
                    )}
                  </button>
                ))}
                <button onClick={() => { setActiveSetor(null); setView("estrutura-admin" as any); }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-sidebar-foreground/45 transition-colors hover:bg-white/[0.04] hover:text-white">
                  <Plus className="h-3.5 w-3.5" /> Administração da estrutura
                </button>
              </>
            )}
          </div>
        )}

        {/* ADMINISTRAÇÃO */}
        {isAdmin && (
          <div className="space-y-0.5">
            <SectionHeader title="Administração" collapsed={!!collapsed["adm"]} onToggle={() => toggle("adm")} />
            {!collapsed["adm"] && (
              <button onClick={() => navigate("/usuarios")} className="nav-link">
                <span className="nav-ico"><Users className="h-full w-full" strokeWidth={1.8} /></span>
                <span className="flex-1 truncate text-left">Usuários &amp; permissões</span>
              </button>
            )}
          </div>
        )}
      </nav>

      {/* ── Rodapé: quem está logado + tema + assinatura ── */}
      <div className="space-y-2 border-t border-sidebar-border p-3">
        <UsuarioCard
          email={user?.email}
          cargo={perms?.cargo?.nome}
          isAdmin={isAdmin}
          onSair={handleSignOut}
        />
        <ThemeToggle />
        <div className="pt-1 text-center text-[0.62rem] tracking-[0.14em] text-sidebar-foreground/30">
          © 2026 DUNA.TECH
        </div>
      </div>
    </aside>
  );
}

/** Cartão de identidade no rodapé: avatar, nome, cargo e saída. */
function UsuarioCard({ email, cargo, isAdmin, onSair }: {
  email?: string; cargo?: string; isAdmin: boolean; onSair: () => void;
}) {
  // Sem cadastro de nome no painel, o apelido sai do e-mail (jonilson.vilela → Jonilson Vilela)
  const apelido = (email?.split("@")[0] ?? "usuário")
    .split(/[._-]/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join(" ");
  const iniciais = apelido.split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase();

  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-2">
      <div className="flex items-center gap-2.5">
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[0.7rem] font-bold text-white"
          style={{
            background: "linear-gradient(135deg, #0A1940 0%, #1E7BFF 60%, #35C6FF 100%)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25)",
          }}
        >
          {iniciais || "?"}
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[0.8rem] font-medium text-white/90" title={email}>
            {apelido}
          </span>
          <span className="block truncate text-[0.65rem] text-sidebar-foreground/45">
            {isAdmin ? "Administrador" : cargo || "Sem cargo definido"}
          </span>
        </div>
        <button
          onClick={onSair}
          title="Sair"
          aria-label="Sair"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-sidebar-foreground/45 transition-colors hover:bg-destructive/25 hover:text-red-300"
        >
          <LogOut className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
