import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberField } from "@/components/NumberField";
import { Plus, Trash2, Receipt } from "lucide-react";
import { formatCurrency } from "@/utils/calculations";
import type { CustoItem } from "@/types/sector";

export function ExpensesForm() {
  const { activeSetor, periodoAtivo, activePeriodoData, updatePeriodoData } = useApp();
  const [newDesc, setNewDesc] = useState("");

  if (!activeSetor || !activePeriodoData) return null;

  const despesas = activePeriodoData.despesasEventuais || [];
  const totalDespesas = despesas.reduce((sum, item) => sum + item.valor, 0);

  const handleAddItem = () => {
    if (!newDesc.trim()) return;
    const newItem: CustoItem = { id: crypto.randomUUID(), descricao: newDesc.trim(), valor: 0 };
    updatePeriodoData(activeSetor.id, periodoAtivo, { despesasEventuais: [...despesas, newItem] });
    setNewDesc("");
  };

  const handleUpdateItem = (itemId: string, field: 'descricao' | 'valor', value: string | number) => {
    const updated = despesas.map(c => c.id === itemId ? { ...c, [field]: value } : c);
    updatePeriodoData(activeSetor.id, periodoAtivo, { despesasEventuais: updated });
  };

  const handleRemoveItem = (itemId: string) => {
    const updated = despesas.filter(c => c.id !== itemId);
    updatePeriodoData(activeSetor.id, periodoAtivo, { despesasEventuais: updated });
  };

  return (
    <Card className="border-primary/20 mt-6 shadow-sm">
      <CardHeader className="bg-muted/30 border-b pb-4">
        <CardTitle className="text-sm font-heading flex items-center gap-2">
          <Receipt className="w-4 h-4 text-primary" />
          Gastos Eventuais e Extraordinários
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4 space-y-3">
        {despesas.map((item) => (
          <div key={item.id} className="flex items-center gap-2">
            <Input
              value={item.descricao}
              onChange={(e) => handleUpdateItem(item.id, 'descricao', e.target.value)}
              className="flex-1 h-9 text-sm"
              placeholder="Ex: Auditoria, Premiação Extra, Curso..."
            />
            <div className="w-40">
              <NumberField
                value={item.valor}
                onChange={(v) => handleUpdateItem(item.id, 'valor', v)}
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 p-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive shrink-0"
              onClick={() => handleRemoveItem(item.id)}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ))}

        <div className="flex items-center gap-2 pt-2">
          <Input
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddItem()}
            placeholder="Novo gasto eventual..."
            className="flex-1 h-9 text-sm"
          />
          <Button variant="outline" size="sm" className="h-9 gap-2" onClick={handleAddItem}>
            <Plus className="w-4 h-4" /> Adicionar
          </Button>
        </div>

        {despesas.length > 0 && (
          <div className="flex justify-between items-center pt-3 border-t border-dashed mt-2">
            <span className="text-sm font-semibold text-muted-foreground">Total de Gastos Eventuais</span>
            <span className="font-mono text-sm font-bold text-foreground">{formatCurrency(totalDespesas)}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}