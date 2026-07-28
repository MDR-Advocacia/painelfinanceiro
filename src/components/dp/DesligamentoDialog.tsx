// DP — Desligamento com cálculo das VERBAS RESCISÓRIAS.
// Passo 1: motivo/data/opções → simula. Passo 2: confere as verbas → efetiva.
// Cada verba mostra como foi calculada. Depois de efetivado, gera o termo em PDF.
import { useState } from "react";
import {
  AlertTriangle, ArrowLeft, Calculator, FileText, Loader2, UserMinus,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Ajuda } from "@/components/dp/Ajuda";
import {
  type DpColaborador, type DpRescisaoCalc, fmtBRL, fmtData, rescisaoApi,
} from "@/services/dp";

const TIPOS: { valor: string; rotulo: string; ajuda: string; clt?: boolean }[] = [
  { valor: "sem_justa_causa", rotulo: "Dispensa sem justa causa",
    ajuda: "A empresa dispensa. Paga aviso prévio, 13º e férias proporcionais e multa de 40% do FGTS.", clt: true },
  { valor: "pedido_demissao", rotulo: "Pedido de demissão",
    ajuda: "O colaborador pede para sair. Não há multa do FGTS; se não cumprir o aviso, ele é descontado.", clt: true },
  { valor: "acordo", rotulo: "Acordo entre as partes (art. 484-A)",
    ajuda: "Acordo: metade do aviso prévio indenizado e multa do FGTS reduzida a 20%.", clt: true },
  { valor: "justa_causa", rotulo: "Dispensa por justa causa",
    ajuda: "Só saldo de salário e férias vencidas, se houver. Sem aviso, 13º proporcional ou multa.", clt: true },
  { valor: "termino_contrato", rotulo: "Término de contrato",
    ajuda: "Fim do prazo combinado (contrato por prazo determinado)." },
  { valor: "fim_estagio", rotulo: "Encerramento do estágio (TCE)",
    ajuda: "Fim do termo de compromisso de estágio: bolsa proporcional e recesso remunerado proporcional." },
];

export default function DesligamentoDialog({ colaborador, onClose, onConcluido }: {
  colaborador: DpColaborador; onClose: () => void; onConcluido: () => void;
}) {
  const estagiario = colaborador.regime === "estagiario";
  const [tipo, setTipo] = useState(estagiario ? "fim_estagio" : "sem_justa_causa");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [motivo, setMotivo] = useState("");
  const [avisoTrabalhado, setAvisoTrabalhado] = useState(false);
  const [feriasVencidas, setFeriasVencidas] = useState(0);
  const [saldoFgts, setSaldoFgts] = useState("");
  const [calc, setCalc] = useState<DpRescisaoCalc | null>(null);
  const [rodando, setRodando] = useState(false);
  const [rescisaoId, setRescisaoId] = useState<string | null>(null);

  const opcoes = () => ({
    aviso_trabalhado: avisoTrabalhado,
    ferias_vencidas: feriasVencidas,
    ...(saldoFgts ? { saldo_fgts: Number(saldoFgts) } : {}),
  });

  const simular = async () => {
    setRodando(true);
    try {
      const r = await rescisaoApi.simular({
        colaborador_id: colaborador.id, data_desligamento: data, tipo, opcoes: opcoes(),
      });
      setCalc(r);
    } catch (e: any) { toast.error(e.message); }
    finally { setRodando(false); }
  };

  const efetivar = async () => {
    if (!confirm(`Confirmar o desligamento de ${colaborador.nome} em ${fmtData(data)}?\n\n` +
                 `Líquido a pagar: ${fmtBRL(calc?.liquido ?? 0)}`)) return;
    setRodando(true);
    try {
      const r = await rescisaoApi.efetivar({
        colaborador_id: colaborador.id, data_desligamento: data, tipo, motivo, opcoes: opcoes(),
      });
      setRescisaoId(r.id);
      toast.success(`${colaborador.nome} desligado(a). Termo disponível para download.`);
      onConcluido();
    } catch (e: any) { toast.error(e.message); }
    finally { setRodando(false); }
  };

  const tiposVisiveis = TIPOS.filter((t) => (estagiario ? !t.clt : true));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserMinus className="h-5 w-5 text-rose-600" />
            Desligamento — {colaborador.nome}
          </DialogTitle>
          <DialogDescription>
            Matrícula {colaborador.matricula} · {colaborador.regime_label} ·
            admitido(a) em {fmtData(colaborador.data_admissao)}
          </DialogDescription>
        </DialogHeader>

        {rescisaoId ? (
          <div className="space-y-4 py-4 text-center">
            <div className="mx-auto w-fit rounded-full bg-emerald-100 p-3">
              <UserMinus className="h-8 w-8 text-emerald-700" />
            </div>
            <div>
              <h3 className="font-heading text-lg font-semibold">Desligamento registrado</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {colaborador.nome} saiu em {fmtData(data)}. Líquido de {fmtBRL(calc?.liquido ?? 0)}.
              </p>
            </div>
            <div className="flex justify-center gap-2">
              <Button variant="outline" className="gap-1"
                      onClick={() => rescisaoApi.termo(rescisaoId).catch((e) => toast.error(e.message))}>
                <FileText className="h-4 w-4" /> Baixar termo de rescisão (PDF)
              </Button>
              <Button onClick={onClose}>Concluir</Button>
            </div>
          </div>
        ) : (
          <>
            {/* Passo 1 — dados do desligamento */}
            <div className="space-y-3 rounded-lg border p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="flex items-center gap-1 text-xs text-muted-foreground">
                    Motivo do desligamento
                    <Ajuda titulo="Motivo do desligamento"
                           texto="Define quais verbas são devidas. Cada opção segue a regra da CLT correspondente." />
                  </Label>
                  <Select value={tipo} onValueChange={(v) => { setTipo(v); setCalc(null); }}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {tiposVisiveis.map((t) => (
                        <SelectItem key={t.valor} value={t.valor}>{t.rotulo}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {TIPOS.find((t) => t.valor === tipo)?.ajuda}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Data do desligamento</Label>
                  <Input type="date" value={data} onChange={(e) => { setData(e.target.value); setCalc(null); }} />
                </div>
              </div>

              {!estagiario && (
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <Label className="flex items-center gap-1 text-xs text-muted-foreground">
                      Férias vencidas
                      <Ajuda titulo="Férias vencidas"
                             texto="Períodos de 12 meses já completados e ainda não gozados. Cada período paga salário + 1/3." />
                    </Label>
                    <Input type="number" min={0} max={2} value={feriasVencidas}
                           onChange={(e) => { setFeriasVencidas(Number(e.target.value)); setCalc(null); }} />
                  </div>
                  <div>
                    <Label className="flex items-center gap-1 text-xs text-muted-foreground">
                      Saldo do FGTS (R$)
                      <Ajuda titulo="Saldo do FGTS"
                             texto="Informe o saldo do extrato para calcular a multa com precisão. Em branco, o sistema estima 8% do salário por mês de casa." />
                    </Label>
                    <Input type="number" step="0.01" placeholder="estimar" value={saldoFgts}
                           onChange={(e) => { setSaldoFgts(e.target.value); setCalc(null); }} />
                  </div>
                  <div className="flex items-end pb-1">
                    <label className="flex cursor-pointer items-center gap-2 text-xs">
                      <Checkbox checked={avisoTrabalhado}
                                onCheckedChange={(v) => { setAvisoTrabalhado(!!v); setCalc(null); }} />
                      Aviso prévio trabalhado
                    </label>
                  </div>
                </div>
              )}

              <div>
                <Label className="text-xs text-muted-foreground">Observações (vão para o termo e o histórico)</Label>
                <Input value={motivo} onChange={(e) => setMotivo(e.target.value)}
                       placeholder="Ex.: reestruturação da equipe" />
              </div>

              <Button size="sm" variant="outline" className="gap-1" onClick={simular} disabled={rodando}>
                {rodando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
                {calc ? "Recalcular verbas" : "Calcular verbas"}
              </Button>
            </div>

            {/* Passo 2 — conferência */}
            {calc && (
              <div className="space-y-3">
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
                  Confira os valores antes de confirmar. Ao efetivar, o colaborador sai do quadro e
                  deixa de entrar nas próximas folhas — tudo fica registrado no histórico.
                </div>

                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead className="bg-muted/60 text-xs">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-medium">Verba</th>
                        <th className="px-2 py-1.5 text-left font-medium">Como foi calculada</th>
                        <th className="px-2 py-1.5 text-right font-medium">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {calc.verbas.map((v, i) => (
                        <tr key={i} className="border-t">
                          <td className="px-2 py-1.5">{v.descricao}</td>
                          <td className="px-2 py-1.5 text-[11px] text-muted-foreground">{v.memoria}</td>
                          <td className="px-2 py-1.5 text-right font-mono text-xs text-emerald-700">
                            {fmtBRL(v.valor)}
                          </td>
                        </tr>
                      ))}
                      {calc.descontos.map((d, i) => (
                        <tr key={`d${i}`} className="border-t">
                          <td className="px-2 py-1.5">{d.descricao}</td>
                          <td className="px-2 py-1.5 text-[11px] text-muted-foreground">{d.memoria}</td>
                          <td className="px-2 py-1.5 text-right font-mono text-xs text-rose-700">
                            − {fmtBRL(d.valor)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t bg-muted/40 text-xs">
                        <td className="px-2 py-1.5 font-medium" colSpan={2}>Total de proventos</td>
                        <td className="px-2 py-1.5 text-right font-mono">{fmtBRL(calc.proventos)}</td>
                      </tr>
                      <tr className="border-t bg-muted/40 text-xs">
                        <td className="px-2 py-1.5 font-medium" colSpan={2}>Total de descontos</td>
                        <td className="px-2 py-1.5 text-right font-mono">− {fmtBRL(calc.total_descontos)}</td>
                      </tr>
                      <tr className="border-t bg-[hsl(var(--dunatech-blue))]/10">
                        <td className="px-2 py-2 font-bold" colSpan={2}>Líquido a receber</td>
                        <td className="px-2 py-2 text-right font-mono text-base font-bold text-[hsl(var(--dunatech-blue))]">
                          {fmtBRL(calc.liquido)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={rodando}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Cancelar
              </Button>
              <Button variant="destructive" onClick={efetivar} disabled={rodando || !calc}>
                {rodando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <UserMinus className="mr-1 h-4 w-4" />}
                Confirmar desligamento
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
