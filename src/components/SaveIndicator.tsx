import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import { Save, AlertCircle, Loader2 } from "lucide-react";

export function SaveIndicator() {
  const { hasUnsavedChanges, saveData, isSaving } = useApp();

  // Só aparece se houver algo para salvar
  if (!hasUnsavedChanges) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-4">
      <div className="bg-card border-2 border-primary/20 shadow-2xl rounded-xl p-4 flex items-center gap-4 max-w-sm">
        <div className="bg-amber-100 p-2 rounded-full">
          <AlertCircle className="w-5 h-5 text-amber-600" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-foreground">Alterações pendentes</p>
          <p className="text-[10px] text-muted-foreground">O que editou ainda não está no banco.</p>
        </div>
        <Button 
          size="sm" 
          onClick={saveData} 
          disabled={isSaving}
          className="gap-2 shadow-lg"
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {isSaving ? "A salvar..." : "Salvar Agora"}
        </Button>
      </div>
    </div>
  );
}