import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { NumberField } from "@/components/NumberField";
import { Button } from "@/components/ui/button";
import { TrendingUp, Users, Target } from "lucide-react";
import { formatCurrency } from "@/utils/calculations";

export function StrategicConfig() {
  const { vpdConfigs, updateVpd, periodoAtivo } = useApp();
  const currentVpd = vpdConfigs.find(c => c.periodo === periodoAtivo)?.valor || 2472.85;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="font-heading text-2xl font-bold text-foreground">Gestão Estratégica</h2>
        <p className="text-sm text-muted-foreground mt-1">Configuração de Indicadores e VPD (Valor Padrão de Despesas)</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="border-primary/20 shadow-lg">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />
              <CardTitle>Ajuste de VPD</CardTitle>
            </div>
            <CardDescription>
              Defina o valor médio de despesas indiretas por colaborador[cite: 33].
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <NumberField 
              label="Valor do VPD para este período"
              value={currentVpd}
              onChange={(v) => updateVpd(periodoAtivo, v)}
              tooltip="Este valor será multiplicado pelo número de colaboradores de cada setor para calcular o ROF."
            />
            <div className="bg-muted/50 p-4 rounded-lg border text-xs space-y-2">
              <p className="font-bold text-primary uppercase">Memória de Cálculo (Estudo MDR):</p>
              <p>O valor base atual é <strong>R$ 2.472,85</strong>, calculado sobre uma previsão de 170 colaboradores[cite: 36, 41].</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="w-4 h-4" /> Impacto no Escritório
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
               {/* Aqui entraria um mini gráfico de barras mostrando VPD vs Margem Real */}
               <p className="text-xs text-muted-foreground italic">
                 "VPD indica a eficiência operacional: margens altas sinalizam boa gestão e saúde financeira." [cite: 18, 32]
               </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}