import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberField } from "@/components/NumberField";
import { PeriodSelector } from "@/components/PeriodSelector";
import { Badge } from "@/components/ui/badge";
import { Building, Plus, Trash2, Calendar, Users } from "lucide-react";
import { formatCurrency, formatPercent } from "@/utils/calculations";
import { MONTH_NAMES } from "@/types/sector";
import type { CustoItem } from "@/types/sector";

export function SedeView() {
  const { sedes, activeSedeId, periodoAtivo, setPeriodoAtivo, updateSedeCustos, getSetoresForSede, getRateioPerSetor } = useApp();
  const [newDesc, setNewDesc] = useState("");

  const sede = sedes.find(s => s.id === activeSedeId);
  if (!sede) return null;

  // Get or inherit custos for current period
  const custos: CustoItem[] = (() => {
    if (sede.periodos[periodoAtivo]) return sede.periodos[periodoAtivo];
    const sorted = Object.keys(sede.periodos).sort();
    const prev = sorted.filter(p => p < periodoAtivo);
    if (prev.length > 0) return JSON.parse(JSON.stringify(sede.periodos[prev[prev.length - 1]]));
    return [];
  })();

  const totalCustos = custos.reduce((sum, c) => sum + c.valor, 0);
  const setoresVinculados = getSetoresForSede(sede.id);
  const rateio = getRateioPerSetor(sede.id, periodoAtivo);

  const handleAddItem = () => {
    if (!newDesc.trim()) return;
    const newItem: CustoItem = { id: crypto.randomUUID(), descricao: newDesc.trim(), valor: 0 };
    updateSedeCustos(sede.id, periodoAtivo, [...custos, newItem]);
    setNewDesc("");
  };

  const handleUpdateItem = (itemId: string, field: 'descricao' | 'valor', value: string | number) => {
    const updated = custos.map(c => c.id === itemId ? { ...c, [field]: value } : c);
    updateSedeCustos(sede.id, periodoAtivo, updated);
  };

  const handleRemoveItem = (itemId: string) => {
    updateSedeCustos(sede.id, periodoAtivo, custos.filter(c => c.id !== itemId));
  };

  const hasPeriodData = !!sede.periodos[periodoAtivo];
  const availablePeriods = Object.keys(sede.periodos).sort();

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Building className="w-5 h-5 text-primary" />
          <div>
            <h2 className="font-heading text-2xl font-bold text-foreground">{sede.nome}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Custos de Estrutura / Patrimônio</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-1.5">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <PeriodSelector value={periodoAtivo} onChange={setPeriodoAtivo} />
          </div>
          {!hasPeriodData && custos.length > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              Dados herdados do período anterior
            </Badge>
          )}
        </div>
      </div>

      {availablePeriods.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">Períodos com dados:</span>
          {availablePeriods.map(p => {
            const [y, m] = p.split('-').map(Number);
            return (
              <Button
                key={p}
                variant={p === periodoAtivo ? 'default' : 'outline'}
                size="sm"
                className="h-6 text-[10px] px-2"
                onClick={() => setPeriodoAtivo(p)}
              >
                {MONTH_NAMES[m - 1].slice(0, 3)}/{y}
              </Button>
            );
          })}
        </div>
      )}

      {/* Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground">Total Custos Estrutura</p>
            <p className="font-mono text-lg font-bold text-foreground mt-1">{formatCurrency(totalCustos)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-primary" />
              <p className="text-xs text-muted-foreground">Setores Vinculados</p>
            </div>
            <p className="font-mono text-lg font-bold text-foreground">{setoresVinculados.length}</p>
            {setoresVinculados.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {setoresVinculados.map(s => (
                  <Badge key={s.id} variant="outline" className="text-[10px]">{s.nome}</Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground">Rateio por Setor</p>
            <p className={`font-mono text-lg font-bold ${setoresVinculados.length > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
              {setoresVinculados.length > 0 ? formatCurrency(rateio) : '—'}
            </p>
            {setoresVinculados.length === 0 && (
              <p className="text-[10px] text-muted-foreground mt-1">Vincule setores para calcular o rateio</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Itens de custo */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-heading flex items-center gap-2">
            <Building className="w-4 h-4 text-primary" />
            Itens de Custo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {custos.map((item) => (
            <div key={item.id} className="flex items-center gap-2">
              <Input
                value={item.descricao}
                onChange={(e) => handleUpdateItem(item.id, 'descricao', e.target.value)}
                className="flex-1 h-9 text-sm"
                placeholder="Descrição do custo"
              />
              <div className="w-48">
                <NumberField
                  label=""
                  value={item.valor}
                  onChange={(v) => handleUpdateItem(item.id, 'valor', v)}
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-9 w-9 p-0 text-muted-foreground hover:text-destructive"
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
              placeholder="Ex: Aluguel, Condomínio, Energia..."
              className="flex-1 h-9 text-sm"
            />
            <Button variant="outline" size="sm" className="h-9 gap-1" onClick={handleAddItem}>
              <Plus className="w-4 h-4" /> Adicionar
            </Button>
          </div>

          {custos.length > 0 && (
            <div className="flex justify-between items-center pt-3 border-t">
              <span className="text-sm font-semibold text-foreground">Total</span>
              <span className="font-mono text-sm font-bold text-foreground">{formatCurrency(totalCustos)}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
