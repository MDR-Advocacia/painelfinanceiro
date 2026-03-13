import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useApp } from "@/contexts/AppContext";
import { NumberField } from "@/components/NumberField";
import { calcImpostos, calcISSSociedade, formatCurrency, formatPercent } from "@/utils/calculations";
import { Receipt, AlertTriangle, Award } from "lucide-react";
import type { ModoISS } from "@/types/sector";

export function BillingForm() {
  const { activeSetor, activePeriodoData, updatePeriodoData, periodoAtivo } = useApp();
  if (!activeSetor || !activePeriodoData) return null;

  const updateFaturamento = (field: string, value: number | string) => {
    updatePeriodoData(activeSetor.id, periodoAtivo, {
      faturamento: { ...activePeriodoData.faturamento, [field]: value },
    });
  };

  const fat = activePeriodoData.faturamento;
  const modoISS: ModoISS = fat.modoISS ?? 'percentual';
  const impostos = calcImpostos(fat);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-heading flex items-center gap-2">
            <Receipt className="w-4 h-4 text-primary" />
            Faturamento e Alíquotas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <NumberField label="Faturamento Bruto Mensal" value={fat.bruto} onChange={v => updateFaturamento('bruto', v)} tooltip="Faturamento bruto mensal do setor" />
            <NumberField label="Descontos / Glosas" value={fat.descontos ?? 0} onChange={v => updateFaturamento('descontos', v)} tooltip="Descontos, glosas e abatimentos sobre o faturamento bruto" />
            <NumberField label="Alíquota Lucro Presumido" value={fat.aliquotaLucroPresumido * 100} onChange={v => updateFaturamento('aliquotaLucroPresumido', v / 100)} prefix="%" step={0.1} tooltip="Padrão: 32%" />
          </div>

          <div className="mt-4">
            <p className="text-xs font-medium text-muted-foreground mb-2">Modo de Cálculo do ISS</p>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <button
                onClick={() => updateFaturamento('modoISS', 'sociedade')}
                className={`p-3 rounded-lg border text-xs text-left transition-colors ${
                  modoISS === 'sociedade' ? 'border-primary bg-primary/5 text-primary font-medium' : 'border-border text-muted-foreground hover:border-primary/50'
                }`}
              >
                <span className="block font-medium">Sociedade de Advogados</span>
                <span className="block mt-0.5 opacity-70">Bimestral por profissional</span>
              </button>
              <button
                onClick={() => updateFaturamento('modoISS', 'percentual')}
                className={`p-3 rounded-lg border text-xs text-left transition-colors ${
                  modoISS === 'percentual' ? 'border-primary bg-primary/5 text-primary font-medium' : 'border-border text-muted-foreground hover:border-primary/50'
                }`}
              >
                <span className="block font-medium">Percentual</span>
                <span className="block mt-0.5 opacity-70">Alíquota sobre faturamento</span>
              </button>
            </div>

            {modoISS === 'sociedade' ? (
              <div className="space-y-2">
                <NumberField
                  label="Nº de Profissionais Habilitados"
                  value={fat.profissionaisISS ?? 0}
                  onChange={v => updateFaturamento('profissionaisISS', v)}
                  prefix=""
                  tooltip="Sócios + profissionais habilitados (empregados ou não) que prestam serviços em nome da sociedade"
                />
                {(fat.profissionaisISS ?? 0) > 0 && (
                  <div className="text-[11px] text-muted-foreground bg-muted/50 rounded-lg p-3 space-y-1">
                    <p className="font-medium text-foreground/80">Detalhamento ISS Sociedade:</p>
                    <ISSBreakdown numProfissionais={fat.profissionaisISS ?? 0} />
                  </div>
                )}
              </div>
            ) : (
              <NumberField label="Alíquota ISS" value={fat.aliquotaISS * 100} onChange={v => updateFaturamento('aliquotaISS', v / 100)} prefix="%" step={0.1} tooltip="Varia por município. Padrão: 2%" />
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-heading flex items-center gap-2">
            <Award className="w-4 h-4 text-primary" />
            Variáveis do Centro de Custo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <NumberField
              label="Premiação Mensal"
              value={fat.premiacaoTotal ?? 0}
              onChange={v => updateFaturamento('premiacaoTotal', v)}
              tooltip="Soma total das premiações individuais pagas mensalmente neste centro de custo"
            />
            <NumberField
              label="Diversos"
              value={fat.diversosTotal ?? 0}
              onChange={v => updateFaturamento('diversosTotal', v)}
              tooltip="Outros custos variáveis do centro de custo"
            />
          </div>
        </CardContent>
      </Card>

      {fat.bruto > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-heading">Impostos Calculados (Lucro Presumido)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <Row label="Lucro Presumido" value={impostos.lucroPresumido} sub={`${(fat.aliquotaLucroPresumido * 100).toFixed(0)}% do faturamento`} />
              <Row label="IRPJ (15%)" value={impostos.irpj} />
              {impostos.irpjAdicional > 0 && (
                <div className="flex items-center gap-2">
                  <Row label="IRPJ Adicional (10%)" value={impostos.irpjAdicional} />
                  <AlertTriangle className="w-3 h-3 text-warning shrink-0" />
                </div>
              )}
              <Row label="CSLL (9%)" value={impostos.csll} />
              <Row label="PIS (0,65%)" value={impostos.pis} />
              <Row label="COFINS (3%)" value={impostos.cofins} />
              <Row
                label={modoISS === 'sociedade' ? `ISS (Sociedade — ${fat.profissionaisISS ?? 0} prof.)` : `ISS (${(fat.aliquotaISS * 100).toFixed(1)}%)`}
                value={impostos.iss}
              />
              <div className="border-t pt-2 mt-2">
                <Row label="TOTAL DE IMPOSTOS" value={impostos.total} bold />
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>Carga Tributária</span>
                  <span className="font-mono">{formatPercent((impostos.total / fat.bruto) * 100)}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ISSBreakdown({ numProfissionais }: { numProfissionais: number }) {
  const faixas = [
    { de: 1, ate: 3, valor: 452 },
    { de: 4, ate: 6, valor: 537 },
    { de: 7, ate: 9, valor: 622 },
    { de: 10, ate: 12, valor: 707 },
  ];

  const rows: { label: string; qtd: number; valor: number }[] = [];
  let restante = numProfissionais;

  for (const f of faixas) {
    if (restante <= 0) break;
    const qtdFaixa = Math.min(restante, f.ate - f.de + 1);
    rows.push({ label: `${f.de}º ao ${f.ate}º`, qtd: qtdFaixa, valor: f.valor });
    restante -= qtdFaixa;
  }
  if (restante > 0) {
    rows.push({ label: `13º em diante`, qtd: restante, valor: 792 });
  }

  const totalBimestral = rows.reduce((s, r) => s + r.qtd * r.valor, 0);

  return (
    <>
      {rows.map((r, i) => (
        <div key={i} className="flex justify-between">
          <span>{r.label}: {r.qtd} × R$ {r.valor.toLocaleString('pt-BR')}</span>
          <span className="font-mono">{formatCurrency(r.qtd * r.valor)}/bim</span>
        </div>
      ))}
      <div className="border-t border-border/50 pt-1 mt-1 flex justify-between font-medium text-foreground/80">
        <span>Total bimestral</span>
        <span className="font-mono">{formatCurrency(totalBimestral)}</span>
      </div>
      <div className="flex justify-between font-medium text-foreground/80">
        <span>Custo mensal ISS</span>
        <span className="font-mono">{formatCurrency(totalBimestral / 2)}</span>
      </div>
    </>
  );
}

function Row({ label, value, sub, bold }: { label: string; value: number; sub?: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between items-baseline ${bold ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
      <div>
        <span className="text-xs">{label}</span>
        {sub && <span className="text-[10px] text-muted-foreground/60 ml-1">({sub})</span>}
      </div>
      <span className="font-mono text-xs">{formatCurrency(value)}</span>
    </div>
  );
}
