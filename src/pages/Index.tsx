import { useEffect } from "react";
import { useApp } from "@/contexts/AppContext";
import { Sidebar } from "@/components/Sidebar";
import { Dashboard } from "@/components/Dashboard";
import { SectorView } from "@/components/SectorView";
import { Projections } from "@/components/Projections";
import { RankingAnalysis } from "@/components/RankingAnalysis";
import { SedeView } from "@/components/SedeView";
import HonorariosBB from "./HonorariosBB";
import { StrategicConfig } from "@/components/StrategicConfig";
import Pessoal from "./Pessoal";
import { SaveIndicator } from "@/components/SaveIndicator";
import { usePermissions } from "@/hooks/usePermissions";
import { ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

// RBAC: view do app → módulo da tabela de permissões
const VIEW_MODULO: Record<string, string> = {
  dashboard: "dashboard",
  projecoes: "projecoes",
  ranking: "ranking",
  honorarios: "honorarios",
  "config-estrategica": "config-estrategica",
  sede: "sedes",
  setor: "setores",
  pessoal: "pessoal",
};
const ORDEM_FALLBACK = ["dashboard", "projecoes", "ranking", "honorarios", "config-estrategica", "pessoal"];

const SemAcesso = ({ semNenhum }: { semNenhum?: boolean }) => (
  <div className="flex flex-1 items-center justify-center p-8">
    <Card className="glass-card max-w-md border-0">
      <CardContent className="py-12 text-center">
        <ShieldAlert className="mx-auto mb-4 h-12 w-12 text-muted-foreground/30" />
        <h3 className="font-heading text-lg font-semibold text-muted-foreground">
          {semNenhum ? "Sem módulos liberados" : "Sem acesso a este módulo"}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground/60">
          {semNenhum
            ? "Seu cargo ainda não tem nenhum módulo liberado. Fale com o administrador do painel."
            : "O seu cargo não tem permissão de visualização aqui. Fale com o administrador."}
        </p>
      </CardContent>
    </Card>
  </div>
);

const MainContent = () => {
  const { view, setView, loading } = useApp();
  const { pode, loading: permsLoading } = usePermissions();

  // Se a view atual não é permitida (ex.: default "dashboard" bloqueado pro
  // cargo), cai pro primeiro módulo liberado.
  useEffect(() => {
    if (permsLoading) return;
    const mod = VIEW_MODULO[view];
    if (mod && !pode(mod)) {
      const primeiro = ORDEM_FALLBACK.find((m) => pode(m));
      if (primeiro) setView(primeiro as any);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permsLoading, view]);

  if (loading || permsLoading) {
    return (
      <main className="flex min-h-screen flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <p className="animate-pulse text-muted-foreground">Carregando ecossistema MDR...</p>
        </div>
      </main>
    );
  }

  const mod = VIEW_MODULO[view];
  const bloqueado = mod && !pode(mod);
  const nenhum = !ORDEM_FALLBACK.some((m) => pode(m)) && !pode("sedes") && !pode("setores");

  return (
    <main className="min-h-screen flex-1 overflow-y-auto p-6 md:p-8">
      {nenhum ? (
        <SemAcesso semNenhum />
      ) : bloqueado ? (
        <SemAcesso />
      ) : (
        <>
          {view === "dashboard" && <Dashboard />}
          {view === "setor" && <SectorView />}
          {view === "projecoes" && <Projections />}
          {view === "ranking" && <RankingAnalysis />}
          {view === "sede" && <SedeView />}
          {view === "honorarios" && <HonorariosBB />}
          {view === "config-estrategica" && <StrategicConfig />}
          {view === "pessoal" && <Pessoal />}
        </>
      )}
    </main>
  );
};

const Index = () => (
  <div className="relative flex min-h-screen bg-background">
    <Sidebar />
    <MainContent />
    <SaveIndicator />
  </div>
);

export default Index;
