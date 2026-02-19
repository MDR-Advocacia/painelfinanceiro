import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/hooks/useAuth";
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
  FileSpreadsheet // Ícone para os Honorários
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import logoMdr from "@/assets/logo-mdr.png";
import { getSetorResumo, getStatusColor, getStatusLabel } from "@/utils/calculations";
import { validateName } from "@/utils/security";
import { toast } from "sonner";
import type { TipoSetor } from "@/types/sector";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

export function Sidebar() {
  const { 
    setores, 
    sedes, 
    activeSetorId, 
    activeSedeId, 
    setActiveSetor, 
    setActiveSede, 
    addSetor, 
    addSede, 
    removeSetor, 
    removeSede, 
    setView, 
    view, 
    periodoAtivo 
  } = useApp();
  
  const { isAdmin, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  const [newName, setNewName] = useState("");
  const [newTipo, setNewTipo] = useState<TipoSetor>("operacional");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sedeDialogOpen, setSedeDialogOpen] = useState(false);
  const [newSedeName, setNewSedeName] = useState("");

  const handleAdd = () => {
    const error = validateName(newName);
    if (error) {
      toast.error(error);
      return;
    }
    addSetor(newName.trim(), newTipo);
    setNewName("");
    setNewTipo("operacional");
    setDialogOpen(false);
  };

  const handleAddSede = () => {
    const error = validateName(newSedeName);
    if (error) {
      toast.error(error);
      return;
    }
    addSede(newSedeName.trim());
    setNewSedeName("");
    setSedeDialogOpen(false);
  };

  return (
    <aside className="w-72 min-h-screen bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border">
      <div className="p-5 border-b border-sidebar-border flex items-center gap-3">
        <img src={logoMdr} alt="MDR" className="h-8" />
        <div>
          <h1 className="font-heading text-sm font-bold text-sidebar-primary-foreground leading-tight">Painel Financeiro</h1>
          <p className="text-[10px] text-sidebar-foreground/60">Jurídico — MDR</p>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        <button
          onClick={() => { setActiveSetor(null); setView('dashboard'); }}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
            view === 'dashboard' ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
          }`}
        >
          <LayoutDashboard className="w-4 h-4" /> Dashboard
        </button>

        <button
          onClick={() => { setActiveSetor(null); setView('projecoes'); }}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
            view === 'projecoes' ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
          }`}
        >
          <TrendingUp className="w-4 h-4" /> Projeções
        </button>

        <button
          onClick={() => { setActiveSetor(null); setView('ranking'); }}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
            view === 'ranking' ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
          }`}
        >
          <BarChart3 className="w-4 h-4" /> Rentabilidade
        </button>

        {/* NOVA FUNCIONALIDADE: HONORÁRIOS BB */}
        <button
          onClick={() => { setActiveSetor(null); setView('honorarios'); }}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
            view === 'honorarios' ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" /> Honorários BB
        </button>

        {/* Sedes */}
        <div className="pt-4 pb-2 px-4 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/40">Sedes</span>
        </div>

        {sedes.map((sede) => {
          const isActive = sede.id === activeSedeId && view === 'sede';
          return (
            <div
              key={sede.id}
              className={`group flex items-center gap-2 px-4 py-3 rounded-lg text-sm transition-colors cursor-pointer ${
                isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
              }`}
              onClick={() => setActiveSede(sede.id)}
            >
              <Building className="w-4 h-4 shrink-0" />
              <span className="flex-1 truncate font-medium">{sede.nome}</span>
              <button
                onClick={(e) => { e.stopPropagation(); removeSede(sede.id); }}
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/20 text-sidebar-foreground/40 hover:text-destructive transition-all"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          );
        })}

        <Dialog open={sedeDialogOpen} onOpenChange={setSedeDialogOpen}>
          <DialogTrigger asChild>
            <button className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-xs text-sidebar-foreground/40 hover:text-sidebar-foreground/70 transition-colors">
              <Plus className="w-3 h-3" /> Nova Sede
            </button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar Nova Sede</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <Input
                placeholder="Ex: Capim Macio, Manhattan"
                value={newSedeName}
                onChange={(e) => setNewSedeName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddSede()}
                autoFocus
              />
              <Button onClick={handleAddSede} className="w-full">Criar Sede</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Setores */}
        <div className="pt-4 pb-2 px-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/40">Setores</span>
        </div>

        {setores.map((setor) => {
          const resumo = getSetorResumo(setor, periodoAtivo);
          const isActive = setor.id === activeSetorId && view === 'setor';
          const TipoIcon = setor.tipo === 'operacional' ? Factory : Landmark;
          const hasData = resumo.faturamentoBruto > 0;
          const sedeName = sedes.find(s => s.id === setor.sedeId)?.nome;
          return (
            <div
              key={setor.id}
              className={`group flex items-center gap-2 px-4 py-3 rounded-lg text-sm transition-colors cursor-pointer ${
                isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
              }`}
              onClick={() => setActiveSetor(setor.id)}
            >
              <TipoIcon className="w-4 h-4 shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="block truncate font-medium">{setor.nome}</span>
                <span className="text-[10px] text-sidebar-foreground/50">
                  {setor.tipo === 'operacional' ? 'Oper.' : 'Admin.'}
                  {sedeName && <> · {sedeName}</>}
                  {hasData && (
                    <> · <span className={getStatusColor(resumo.status)}>{getStatusLabel(resumo.status)}</span></>
                  )}
                </span>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); removeSetor(setor.id); }}
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/20 text-sidebar-foreground/40 hover:text-destructive transition-all"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          );
        })}

        {setores.length === 0 && (
          <p className="text-xs text-sidebar-foreground/40 px-4 py-6 text-center">
            Nenhum setor criado ainda. Clique em "Novo Setor" para começar.
          </p>
        )}
      </nav>

      <div className="p-4 border-t border-sidebar-border">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="w-full bg-sidebar-primary hover:bg-sidebar-primary/90 text-sidebar-primary-foreground gap-2">
              <Plus className="w-4 h-4" /> Novo Setor
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar Novo Setor</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <Input
                placeholder="Ex: Direito Corporativo"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                autoFocus
              />
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Tipo do Setor</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setNewTipo('operacional')}
                    className={`flex items-center gap-2 p-3 rounded-lg border text-sm transition-colors ${
                      newTipo === 'operacional' ? 'border-primary bg-primary/5 text-primary font-medium' : 'border-border text-muted-foreground hover:border-primary/50'
                    }`}
                  >
                    <Factory className="w-4 h-4" /> Operacional
                  </button>
                  <button
                    onClick={() => setNewTipo('administrativo')}
                    className={`flex items-center gap-2 p-3 rounded-lg border text-sm transition-colors ${
                      newTipo === 'administrativo' ? 'border-primary bg-primary/5 text-primary font-medium' : 'border-border text-muted-foreground hover:border-primary/50'
                    }`}
                  >
                    <Landmark className="w-4 h-4" /> Administrativo
                  </button>
                </div>
              </div>
              <Button onClick={handleAdd} className="w-full">Criar Setor</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="p-3 border-t border-sidebar-border space-y-1">
        {isAdmin && (
          <button
            onClick={() => navigate('/usuarios')}
            className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-xs text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground transition-colors"
          >
            <Users className="w-4 h-4" /> Gestão de Usuários
          </button>
        )}
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-xs text-sidebar-foreground/70 hover:bg-destructive/20 hover:text-destructive transition-colors"
        >
          <LogOut className="w-4 h-4" /> Sair
        </button>
      </div>
    </aside>
  );
}