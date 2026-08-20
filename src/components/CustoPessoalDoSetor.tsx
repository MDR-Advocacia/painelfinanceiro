// Custo de pessoal do setor — SOMENTE LEITURA.
//
// Substituiu o formulário de quantidade por cargo, que virou letra morta: desde
// que a folha do DP passou a espelhar o custo real no setor, o que fosse
// digitado ali era ignorado pelo cálculo. Formulário que aceita número e não
// faz nada é pior que formulário nenhum — o operador ajusta, confere, e o
// painel segue mostrando outra coisa sem explicar por quê.
import { Info, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/utils/calculations";
import type { PeriodoData } from "@/types/sector";

export function CustoPessoalDoSetor({ data }: { data: PeriodoData }) {
  const direto = (data as any).custoPessoalReal as number | undefined;
  const backoffice = ((data as any).custoApoioRateado as number | undefined) ?? 0;
  const total = (data as any).custoPessoalComApoio as number | undefined;
  const hcDireto = ((data as any).headcountReal as number | undefined) ?? 0;
  const hcTotal = (data as any).headcountComApoio as number | undefined;

  // sem espelho ainda: a competência não foi calculada, e o painel volta pra
  // estimativa antiga. Dizer isso é melhor que mostrar zero.
  if (total === undefined) {
    return (
      <Card className="glass-card border-0">
        <CardContent className="space-y-2 py-4 text-sm">
          <div className="flex items-center gap-2 font-medium">
            <Info className="h-4 w-4 text-muted-foreground" />
            Sem custo espelhado nesta competência
          </div>
          <p className="text-xs text-muted-foreground">
            O custo de pessoal vem da folha do DP. Recalcule a competência em{" "}
            <b>Pessoal (DP) › Folha</b> para ele aparecer aqui.
          </p>
        </CardContent>
      </Card>
    );
  }

  const ehApoio = total === 0 && (direto ?? 0) > 0;

  return (
    <Card className="glass-card border-0">
      <CardContent className="space-y-3 py-4">
        {ehApoio ? (
          <>
            <div className="flex items-center gap-2 text-sm font-medium">
              <Users className="h-4 w-4 text-sky-600" />
              Setor de apoio
              <Badge variant="outline" className="text-[0.65rem]">rateado nas linhas</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Os <b>{formatCurrency(direto ?? 0)}</b> de folha deste setor não ficam aqui:
              são distribuídos entre as linhas de faturamento por cabeça, então o total
              dele é zero e cada cliente carrega a fatia proporcional à própria equipe.
            </p>
          </>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Linha rotulo="Pessoal direto" valor={direto ?? 0}
                     nota={`${hcDireto.toFixed(1).replace(".0", "")} pessoa(s) nesta linha`} />
              <Linha rotulo="Backoffice rateado" valor={backoffice} destaque
                     nota="Administrativo e TI, por cabeça" />
              <Linha rotulo="Custo total" valor={total} forte
                     nota={hcTotal !== undefined
                       ? `${hcTotal.toFixed(1).replace(".0", "")} pessoa(s) equivalentes`
                       : undefined} />
            </div>
            <p className="rounded bg-muted/50 px-2 py-1.5 text-[0.72rem] text-muted-foreground">
              Vem da <b>folha fechada do DP</b>, não é digitado aqui. O backoffice é o
              rateio proporcional das equipes de apoio, que servem todas as linhas e não
              faturam: o custo delas é dividido pelo total de pessoas das linhas, e cada
              uma leva a fatia do próprio tamanho. Para mudar a distribuição, mexa na
              matriz em <b>Estrutura de Faturamento</b>.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Linha({ rotulo, valor, nota, destaque, forte }: {
  rotulo: string; valor: number; nota?: string; destaque?: boolean; forte?: boolean;
}) {
  return (
    <div>
      <div className="text-[0.7rem] text-muted-foreground">{rotulo}</div>
      <div className={`font-mono text-sm ${
        forte ? "font-semibold" : destaque ? "text-sky-700 dark:text-sky-300" : ""}`}>
        {formatCurrency(valor)}
      </div>
      {nota && <div className="text-[0.65rem] text-muted-foreground">{nota}</div>}
    </div>
  );
}
