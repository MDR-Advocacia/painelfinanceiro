import { useApp } from "@/contexts/AppContext";
import { CustoPessoalDoSetor } from "@/components/CustoPessoalDoSetor";
import { BillingForm } from "@/components/BillingForm";
import { SectorSummary } from "@/components/SectorSummary";
import { PeriodSelector } from "@/components/PeriodSelector";
import { Badge } from "@/components/ui/badge";
import { Factory, Landmark, Calendar, Building, CopyPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MONTH_NAMES } from "@/types/sector";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { PageHeader, SectionTitle } from "@/components/Pagina";

// Função auxiliar para calcular o próximo mês no formato YYYY-MM
function getNextMonth(periodo: string): string {
  const [year, month] = periodo.split('-').map(Number);
  // No JavaScript os meses começam em 0. Então passar o 'month' atual já pega o mês seguinte
  const nextDate = new Date(year, month, 1);
  return `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
}

export function SectorView() {
  const { activeSetor, periodoAtivo, setPeriodoAtivo, activePeriodoData, sedes, updateSetorSedeId, updatePeriodoData } = useApp();

  if (!activeSetor || !activePeriodoData) return null;

  const isOp = activeSetor.tipo === 'operacional';
  const hasPeriodData = !!activeSetor.periodos[periodoAtivo];
  const availablePeriods = Object.keys(activeSetor.periodos).sort();

  const handleReplicateToNextMonth = () => {
    const nextMonth = getNextMonth(periodoAtivo);
    // Copia os dados atuais para o próximo mês
    updatePeriodoData(activeSetor.id, nextMonth, activePeriodoData);
    // Muda a visualização para o próximo mês
    setPeriodoAtivo(nextMonth);
    toast.success(`Dados clonados com sucesso para ${nextMonth}! Lembre-se de salvar.`);
  };

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        eyebrow={isOp ? "Setor operacional" : "Setor administrativo"}
        titulo={activeSetor.nome}
        icone={isOp ? <Factory className="h-4.5 w-4.5" /> : <Landmark className="h-4.5 w-4.5" />}
        descricao={hasPeriodData ? undefined : "Dados herdados do período anterior"}
        acoes={<>
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

          {/* Seletor de Período */}
          <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-1.5">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <PeriodSelector value={periodoAtivo} onChange={setPeriodoAtivo} />
          </div>

          {/* Botão de Clonagem Rápida */}
          <Button
            variant="outline"
            size="sm"
            className="h-10 gap-2 border-primary/20 hover:bg-primary/10 transition-colors"
            onClick={handleReplicateToNextMonth}
          >
            <CopyPlus className="w-4 h-4 text-primary" />
            <span className="hidden sm:inline">Clonar para Mês Seguinte</span>
          </Button>

        </>}
      />

      {/* Histórico de Períodos Rápidos */}
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
          {/* NAO e' mais entrada: o custo vem da folha do DP. O formulario de
              quantidade por cargo saiu porque virou letra morta — aceitava
              numero e o calculo ignorava. */}
          <SectionTitle eyebrow="Calculado" titulo="Custo de pessoal" />
          <CustoPessoalDoSetor data={activePeriodoData} />
        </div>
        <div>
          <SectionTitle eyebrow="Entrada" titulo="Faturamento e impostos" />
          <BillingForm />
        </div>
      </div>
    </div>
  );
}