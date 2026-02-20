import { useState, useEffect } from "react";
import { useApp } from "@/contexts/AppContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { NumberField } from "@/components/NumberField";
import { PeriodSelector } from "@/components/PeriodSelector";
import { Target, Info, Calendar, Calculator, ArrowRight, Save, Building, Users } from "lucide-react";
import { formatCurrency } from "@/utils/calculations";
import { Button } from "@/components/ui/button";

export function StrategicConfig() {
  const { periodoAtivo, setPeriodoAtivo, currentVpdValor, updateVpdValor } = useApp();

  // Variáveis do cálculo baseadas no Estudo MDR
  // Inicializamos com os valores padrão do estudo para facilitar a vida do usuário
  const [despesasGerais, setDespesasGerais] = useState(374054.80);
  const [pessoalApoio, setPessoalApoio] = useState(46330.00);
  const [headcountGlobal, setHeadcountGlobal] = useState(170);

  // Motor de Cálculo em Tempo Real
  const totalDespesasBase = despesasGerais + pessoalApoio;
  const vpdCalculado = headcountGlobal > 0 ? totalDespesasBase / headcountGlobal : 0;

  const handleAplicarVpd = () => {
    updateVpdValor(periodoAtivo, vpdCalculado);
  };

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-heading text-2xl font-bold text-foreground">Construtor Estratégico de VPD</h2>
          <p className="text-sm text-muted-foreground mt-1">Simule e defina o Valor Padrão de Despesas com base na estrutura real[cite: 33].</p>
        </div>
        <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-1.5 border border-border">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <PeriodSelector value={periodoAtivo} onChange={setPeriodoAtivo} />
        </div>
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        {/* COLUNA ESQUERDA: As Variáveis (Inputs) */}
        <Card className="lg:col-span-3 border-primary/20 shadow-sm">
          <CardHeader className="bg-muted/30 border-b pb-4">
            <div className="flex items-center gap-2">
              <Calculator className="w-5 h-5 text-primary" />
              <CardTitle>Variáveis do Cálculo de Estrutura</CardTitle>
            </div>
            <CardDescription>
              Ajuste os valores totais do escritório para encontrar o rateio exato por colaborador.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="mt-1 bg-primary/10 p-2 rounded text-primary"><Building className="w-4 h-4"/></div>
                <div className="flex-1">
                  <NumberField 
                    label="1. Despesas Indiretas para Planejamento (R$)"
                    value={despesasGerais}
                    onChange={setDespesasGerais}
                    tooltip="Aluguel, condomínio, energia, internet, limpeza, softwares, etc. (Exclui impostos e pessoal direto)[cite: 27, 38]."
                  />
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="mt-1 bg-primary/10 p-2 rounded text-primary"><Users className="w-4 h-4"/></div>
                <div className="flex-1">
                  <NumberField 
                    label="2. Pessoal de Apoio / Backoffice (R$)"
                    value={pessoalApoio}
                    onChange={setPessoalApoio}
                    tooltip="Custo total com equipes não-faturáveis: ADM, DP, RH, TI, Marketing, Recepção, ASG[cite: 28, 38]."
                  />
                </div>
              </div>

              <div className="border-t border-dashed my-4 pt-4 flex justify-between items-center text-sm">
                <span className="font-medium text-muted-foreground">Total Despesas Base:</span>
                <span className="font-mono font-bold text-foreground">{formatCurrency(totalDespesasBase)}</span>
              </div>

              <div className="flex items-start gap-3">
                <div className="mt-1 bg-primary/10 p-2 rounded text-primary"><Target className="w-4 h-4"/></div>
                <div className="flex-1">
                  <NumberField 
                    label="3. Previsão de Colaboradores (Headcount)"
                    value={headcountGlobal}
                    onChange={setHeadcountGlobal}
                    tooltip="Quantidade total de funcionários no escritório para diluir o custo[cite: 31, 41]."
                  />
                </div>
              </div>
            </div>

          </CardContent>
        </Card>

        {/* COLUNA DIREITA: O Resultado e Ação */}
        <Card className="lg:col-span-2 bg-sidebar border-sidebar-border shadow-lg flex flex-col">
          <CardHeader>
            <CardTitle className="text-sidebar-foreground">Resultado do Rateio</CardTitle>
            <CardDescription className="text-sidebar-foreground/70">
              Valor padrão que será cobrado de cada setor.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-center items-center space-y-6">
            
            <div className="text-center space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/50">VPD Calculado</p>
              <p className="text-5xl font-mono font-black text-primary tracking-tighter">
                {formatCurrency(vpdCalculado)}
              </p>
              <p className="text-xs text-sidebar-foreground/60 font-mono">
                {formatCurrency(totalDespesasBase)} ÷ {headcountGlobal} pessoas
              </p>
            </div>

            <div className="w-full h-px bg-sidebar-border/50"></div>

            <div className="w-full space-y-3">
              <div className="flex justify-between items-center text-sm px-2">
                <span className="text-sidebar-foreground/70">VPD Ativo no Período:</span>
                <span className="font-mono font-bold text-sidebar-foreground">{formatCurrency(currentVpdValor)}</span>
              </div>
              
              <Button 
                onClick={handleAplicarVpd} 
                className="w-full gap-2 font-bold py-6 text-base"
                size="lg"
                disabled={currentVpdValor === vpdCalculado}
              >
                <Save className="w-5 h-5" />
                {currentVpdValor === vpdCalculado ? "VPD Já Aplicado" : "Aplicar VPD ao Período"}
              </Button>
            </div>

          </CardContent>
        </Card>
      </div>

      {/* Informativo / Metodologia */}
      <div className="bg-muted/50 p-4 rounded-xl border flex items-start gap-3 mt-6">
        <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm font-bold text-foreground">Metodologia MDR de Segmentação</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            O método de rateio escolhido por número de funcionários é o mais objetivo para medir a eficiência entre áreas[cite: 31, 32]. 
            Ele transforma despesas indiretas compartilhadas em um "custo por cabeça", permitindo apurar o <strong>Resultado Operacional Final (ROF)</strong> 
            e garantir que setores com margens altas sinalizem verdadeira saúde financeira[cite: 4, 18].
          </p>
        </div>
      </div>
    </div>
  );
}