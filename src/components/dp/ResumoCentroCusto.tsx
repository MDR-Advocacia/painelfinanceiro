// DP — Resumo do Centro de Custo por setor (espelho da aba CC da planilha).
// É a base da integração com o faturamento: mostra o custo de pessoal por
// carteira/setor, com o consolidado por núcleo (ADM, Autor, Réu…).
import { useState } from "react";
import { Download, FileText, Layers, Table2 } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis,
} from "recharts";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Ajuda, TituloAjuda } from "@/components/dp/Ajuda";
import { type DpRateio, exportApi, fmtBRL } from "@/services/dp";

const CORES = ["#1E7BFF", "#0A1940", "#7FB5FF", "#27AE60", "#F39C12", "#8B5CF6"];

export default function ResumoCentroCusto({ rateio, compId }: {
  rateio: DpRateio | null; compId: string;
}) {
  const [visao, setVisao] = useState<"detalhe" | "nucleo">("detalhe");
  if (!rateio) return null;
  const t = rateio.totais;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-lg bg-muted p-0.5">
          <button onClick={() => setVisao("detalhe")}
                  className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    visao === "detalhe" ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
            <Table2 className="h-3.5 w-3.5" /> Por centro de custo
          </button>
          <button onClick={() => setVisao("nucleo")}
                  className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    visao === "nucleo" ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
            <Layers className="h-3.5 w-3.5" /> Consolidado por núcleo
          </button>
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" className="gap-1"
                  onClick={() => exportApi.rateio(compId, "excel").catch((e) => toast.error(e.message))}>
            <Download className="h-3.5 w-3.5" /> Excel
          </Button>
          <Button size="sm" variant="outline" className="gap-1"
                  onClick={() => exportApi.rateio(compId, "pdf").catch((e) => toast.error(e.message))}>
            <FileText className="h-3.5 w-3.5" /> PDF
          </Button>
        </div>
      </div>

      {visao === "nucleo" ? (
        <>
          <ResponsiveContainer width="100%" height={Math.max(180, rateio.nucleos.length * 42)}>
            <BarChart data={rateio.nucleos} layout="vertical" margin={{ left: 8, right: 28 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)} mil`} />
              <YAxis type="category" dataKey="nucleo" tick={{ fontSize: 11 }} width={110} />
              <RTooltip formatter={(v: number) => fmtBRL(v)} />
              <Bar dataKey="custo" name="Custo total" radius={[0, 4, 4, 0]}>
                {rateio.nucleos.map((_, i) => <Cell key={i} fill={CORES[i % CORES.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="bg-muted/60 text-xs">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">Núcleo</th>
                  <th className="px-2 py-1.5 text-right font-medium">Centros</th>
                  <th className="px-2 py-1.5 text-right font-medium">Pessoas</th>
                  <th className="px-2 py-1.5 text-right font-medium">Folha</th>
                  <th className="px-2 py-1.5 text-right font-medium">Provisões</th>
                  <th className="px-2 py-1.5 text-right font-medium">Patronal</th>
                  <th className="px-2 py-1.5 text-right font-medium">Custo total</th>
                  <th className="px-2 py-1.5 text-right font-medium">% do custo</th>
                </tr>
              </thead>
              <tbody>
                {rateio.nucleos.map((n) => (
                  <tr key={n.nucleo} className="border-t">
                    <td className="px-2 py-1.5 font-medium">{n.nucleo}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-xs">{n.centros}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-xs">{n.headcount}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-xs">{fmtBRL(n.folha)}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-xs">{fmtBRL(n.provisoes)}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-xs">{fmtBRL(n.patronal)}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-xs font-semibold">{fmtBRL(n.custo)}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-xs text-muted-foreground">{n.percentual}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="bg-muted/60 text-xs">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">Centro de custo</th>
                <th className="px-2 py-1.5 text-right font-medium">Pessoas</th>
                <th className="px-2 py-1.5 text-right font-medium">Salários</th>
                <th className="px-2 py-1.5 text-right font-medium">Vale-transporte</th>
                <th className="px-2 py-1.5 text-right font-medium">Vale-alimentação</th>
                <th className="px-2 py-1.5 text-right font-medium">Saldo livre</th>
                <th className="px-2 py-1.5 text-right font-medium">Premiações</th>
                <th className="px-2 py-1.5 text-right font-medium">
                  <TituloAjuda titulo="Patronal" ajuda="INSS que a empresa paga sobre a folha daquele centro de custo." />
                </th>
                <th className="px-2 py-1.5 text-right font-medium">Provisões</th>
                <th className="px-2 py-1.5 text-right font-medium">Custo mensal</th>
                <th className="px-2 py-1.5 text-right font-medium">
                  <TituloAjuda titulo="% do custo" ajuda="Participação deste centro no custo total de pessoal do mês." />
                </th>
              </tr>
            </thead>
            <tbody>
              {rateio.linhas.map((l) => (
                <tr key={l.centro_custo_nome} className="border-t hover:bg-muted/40">
                  <td className="px-2 py-1.5">
                    <span className="block max-w-[210px] truncate">{l.centro_custo_nome}</span>
                    {l.nucleo !== l.centro_custo_nome && (
                      <span className="text-[10px] text-muted-foreground">núcleo {l.nucleo}</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs">{l.headcount}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs">{fmtBRL(l.salarios)}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs">{fmtBRL(l.vt)}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs">{fmtBRL(l.va)}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs">{fmtBRL(l.saldo_livre)}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs">{fmtBRL(l.premios)}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs">{fmtBRL(l.patronal)}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs">{fmtBRL(l.provisoes)}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs font-semibold">{fmtBRL(l.custo)}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs text-muted-foreground">{l.percentual}%</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t bg-[hsl(var(--dunatech-blue))]/10 font-semibold">
                <td className="px-2 py-2">TOTAL</td>
                <td className="px-2 py-2 text-right font-mono text-xs">{t.headcount}</td>
                <td className="px-2 py-2 text-right font-mono text-xs">{fmtBRL(t.salarios)}</td>
                <td className="px-2 py-2 text-right font-mono text-xs">{fmtBRL(t.vt)}</td>
                <td className="px-2 py-2 text-right font-mono text-xs">{fmtBRL(t.va)}</td>
                <td className="px-2 py-2 text-right font-mono text-xs">{fmtBRL(t.saldo_livre)}</td>
                <td className="px-2 py-2 text-right font-mono text-xs">{fmtBRL(t.premios)}</td>
                <td className="px-2 py-2 text-right font-mono text-xs">{fmtBRL(t.patronal)}</td>
                <td className="px-2 py-2 text-right font-mono text-xs">{fmtBRL(t.provisoes)}</td>
                <td className="px-2 py-2 text-right font-mono text-xs text-[hsl(var(--dunatech-blue))]">{fmtBRL(t.custo)}</td>
                <td className="px-2 py-2 text-right font-mono text-xs">100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* provisões detalhadas por centro */}
      <details className="rounded-md border">
        <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground">
          Ver provisões detalhadas por centro de custo (13º, férias, 1/3, FGTS, multa, recesso)
        </summary>
        <div className="overflow-x-auto border-t">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted/40 text-xs">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">Centro de custo</th>
                <th className="px-2 py-1.5 text-right font-medium">13º</th>
                <th className="px-2 py-1.5 text-right font-medium">Férias</th>
                <th className="px-2 py-1.5 text-right font-medium">1/3 férias</th>
                <th className="px-2 py-1.5 text-right font-medium">FGTS</th>
                <th className="px-2 py-1.5 text-right font-medium">Multa FGTS</th>
                <th className="px-2 py-1.5 text-right font-medium">Recesso</th>
              </tr>
            </thead>
            <tbody>
              {rateio.linhas.map((l) => (
                <tr key={l.centro_custo_nome} className="border-t">
                  <td className="max-w-[220px] truncate px-2 py-1.5">{l.centro_custo_nome}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs">{fmtBRL(l.decimo)}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs">{fmtBRL(l.ferias)}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs">{fmtBRL(l.terco)}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs">{fmtBRL(l.fgts)}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs">{fmtBRL(l.multa_fgts)}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs">{fmtBRL(l.recesso)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Ajuda titulo="Integração com faturamento"
               texto="Este resumo é a base para cruzar o custo de pessoal com o faturamento de cada carteira: o consolidado por núcleo bate com os setores do painel financeiro." />
        O consolidado por núcleo é o corte que será cruzado com o faturamento de cada carteira.
      </p>
    </div>
  );
}
