import { useApp } from "@/contexts/AppContext";
import { Sidebar } from "@/components/Sidebar";
import { Dashboard } from "@/components/Dashboard";
import { SectorView } from "@/components/SectorView";
import { Projections } from "@/components/Projections";
import { RankingAnalysis } from "@/components/RankingAnalysis";
import { SedeView } from "@/components/SedeView";
import HonorariosBB from "./HonorariosBB"; 
import { SaveIndicator } from "@/components/SaveIndicator"; // Importação do novo indicador

const MainContent = () => {
  const { view, loading } = useApp();

  if (loading) {
    return (
      <main className="flex-1 min-h-screen bg-secondary flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <p className="text-muted-foreground animate-pulse">Carregando ecossistema MDR...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 min-h-screen bg-secondary p-6 md:p-8 overflow-y-auto">
      {view === 'dashboard' && <Dashboard />}
      {view === 'setor' && <SectorView />}
      {view === 'projecoes' && <Projections />}
      {view === 'ranking' && <RankingAnalysis />}
      {view === 'sede' && <SedeView />}
      {view === 'honorarios' && <HonorariosBB />}
    </main>
  );
};

const Index = () => (
  <div className="flex min-h-screen bg-background relative">
    <Sidebar />
    <MainContent />
    
    {/* O indicador flutuante de salvamento manual */}
    <SaveIndicator /> 
  </div>
);

export default Index;