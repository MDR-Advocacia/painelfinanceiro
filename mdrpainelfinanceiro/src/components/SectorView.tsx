import { useApp } from "@/contexts/AppContext";
import { PersonnelForm } from "@/components/PersonnelForm";
import { BillingForm } from "@/components/BillingForm";
import { SectorSummary } from "@/components/SectorSummary";
import { PeriodSelector } from "@/components/PeriodSelector";
import { Badge } from "@/components/ui/badge";
import { Factory, Landmark, Calendar, Building } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MONTH_NAMES } from "@/types/sector";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export function SectorView() {
  const { activeSetor, periodoAtivo, setPeriodoAtivo, activePeriodoData, sedes, updateSetorSedeId } = useApp();
  if (!activeSetor) return null;

  const isOp = activeSetor.tipo === 'operacional';
  const hasPeriodData = !!activeSetor.periodos[periodoAtivo];
  const availablePeriods = Object.keys(activeSetor.periodos).sort();

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          {isOp ? <Factory className="w-5 h-5 text-primary" /> : <Landmark className="w-5 h-5 text-primary" />}
          <div>
            <h2 className="font-heading text-2xl font-bold text-foreground">{activeSetor.nome}</h2>
            <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-2">
              <Badge variant="outline" className="text-[10px]">
                {isOp ? 'Operacional' : 'Administrativo'}
              </Badge>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Sede selector */}
          <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-1.5">
            <Building className="w-4 h-4 text-muted-foreground" />
            <Select
              value={activeSetor.sedeId ?? '__none__'}
              onValueChange={(v) => updateSetorSedeId(activeSetor.id, v === '__none__' ? undefined : v)}
            >
              <SelectTrigger className="h-7 text-xs border-0 bg-transparent shadow-none min-w-[120px]">
                <SelectValue placeholder="Sem sede" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sem sede</SelectItem>
                {sedes.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-1.5">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <PeriodSelector value={periodoAtivo} onChange={setPeriodoAtivo} />
          </div>
          {!hasPeriodData && (
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

      <SectorSummary />

      <div className="grid lg:grid-cols-2 gap-6">
        <div>
          <h3 className="font-heading text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Custos de Pessoal
          </h3>
          <PersonnelForm />
        </div>
        <div>
          <h3 className="font-heading text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Faturamento & Impostos
          </h3>
          <BillingForm />
        </div>
      </div>
    </div>
  );
}
