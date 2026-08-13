// Afastamentos e suspensões — dias em que a pessoa não trabalha.
//
// NÃO é falta: quem custeia cada faixa de dias, se o FGTS é devido e se o
// vale-alimentação pode ser cortado mudam conforme o TIPO. As regras vieram do
// DP em 12/08/2026 e valem só para CLT; a tela explica cada uma para o operador
// não precisar decorar.
import { useCallback, useEffect, useState } from "react";
import { CalendarOff, Loader2, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Ajuda } from "@/components/dp/Ajuda";
import { type DpAfastamento, type DpColaborador, dpApi, fmtData } from "@/services/dp";

const TIPOS = [
  { v: "doenca", label: "Atestado / auxílio-doença",
    efeito: "Empresa paga os 15 primeiros dias, com FGTS. Do 16º em diante quem paga é o INSS e o FGTS não é devido." },
  { v: "acidente", label: "Acidente de trabalho",
    efeito: "Mesma divisão de pagamento, mas o FGTS continua devido SEMPRE e o vale-alimentação não pode ser cortado. Gera 12 meses de estabilidade após o retorno." },
  { v: "maternidade", label: "Licença-maternidade",
    efeito: "A empresa paga os 120 dias e compensa na guia do INSS — não vira custo do escritório. FGTS devido. Estabilidade de 5 meses." },
  { v: "paternidade", label: "Licença-paternidade",
    efeito: "Pago pela empresa, com FGTS." },
  { v: "suspensao", label: "Suspensão disciplinar",
    efeito: "A empresa não paga nenhum dia, nem os primeiros, e não há FGTS no período." },
  { v: "outro", label: "Outro afastamento",
    efeito: "Tratado como atestado: 15 dias pela empresa, depois pelo INSS." },
];

const VAZIO = { tipo: "doenca", data_inicio: "", data_prevista_retorno: "", data_retorno: "", observacao: "" };

export default function AfastamentosColaborador({ colaborador, editar }: {
  colaborador: DpColaborador; editar: boolean;
}) {
  const [itens, setItens] = useState<DpAfastamento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [abrindo, setAbrindo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({ ...VAZIO });

  const carregar = useCallback(() => {
    setCarregando(true);
    dpApi.afastamentos(colaborador.id)
      .then(setItens).catch(() => undefined).finally(() => setCarregando(false));
  }, [colaborador.id]);
  useEffect(carregar, [carregar]);

  const naoClt = colaborador.regime !== "clt";
  const emCurso = itens.find((a) => a.em_curso);
  const comEstabilidade = itens.filter((a) => a.em_estabilidade);

  const salvar = async () => {
    if (!form.data_inicio) return toast.error("Informe a data de início.");
    setSalvando(true);
    try {
      await dpApi.criarAfastamento(colaborador.id, {
        ...form,
        data_prevista_retorno: form.data_prevista_retorno || null,
        data_retorno: form.data_retorno || null,
      });
      toast.success("Afastamento registrado", {
        description: "A folha do mês passa a considerar quem custeia cada dia.",
      });
      setForm({ ...VAZIO }); setAbrindo(false); carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao registrar");
    } finally { setSalvando(false); }
  };

  const registrarRetorno = async (a: DpAfastamento, quando: string) => {
    try {
      await dpApi.editarAfastamento(colaborador.id, a.id, { data_retorno: quando });
      toast.success("Retorno registrado");
      carregar();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Falha"); }
  };

  const remover = async (a: DpAfastamento) => {
    try {
      await dpApi.removerAfastamento(colaborador.id, a.id);
      toast.success("Afastamento removido");
      carregar();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Falha"); }
  };

  const efeito = TIPOS.find((t) => t.v === form.tipo)?.efeito;

  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <CalendarOff className="h-3.5 w-3.5" />
          Afastamentos e suspensões
          <Ajuda texto={
            "Afastamento não é falta. Conforme o tipo, muda quem paga cada faixa de dias, " +
            "se o FGTS é devido e se o vale-alimentação pode ser cortado. Os 15 primeiros " +
            "dias contam a partir do início do afastamento, não do mês — quem afasta dia 20 " +
            "leva parte dessa contagem para o mês seguinte."
          } />
        </div>
        {editar && !abrindo && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAbrindo(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Registrar
          </Button>
        )}
      </div>

      {naoClt && (
        <p className="mb-2 rounded border border-sky-200 bg-sky-50 px-2 py-1.5 text-[0.7rem] text-sky-900">
          Vínculo <b>{colaborador.regime_label || colaborador.regime}</b>: não valem os
          institutos da CLT — a empresa não custeia os 15 primeiros dias, não há faixa do
          INSS, FGTS nem estabilidade. O efeito na folha é direto: <b>não há repasse nos
          dias parados</b>, e afastamento do mês inteiro zera o repasse do mês.
        </p>
      )}

      {emCurso && (
        <div className="mb-2 rounded border border-sky-300 bg-sky-50 px-2 py-1.5 text-[0.72rem] text-sky-900">
          <b>Afastado agora</b> — {emCurso.tipo_label} desde {fmtData(emCurso.data_inicio)}
          {emCurso.data_prevista_retorno && <> · retorno previsto {fmtData(emCurso.data_prevista_retorno)}</>}
        </div>
      )}

      {comEstabilidade.length > 0 && (
        <div className="mb-2 flex items-start gap-2 rounded border border-amber-300 bg-amber-50 px-2 py-1.5">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" />
          <p className="text-[0.72rem] text-amber-900">
            <b>Em estabilidade até {fmtData(comEstabilidade[0].estabilidade_ate)}.</b> Confirme
            com o jurídico antes de qualquer desligamento.
          </p>
        </div>
      )}

      {carregando ? (
        <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…
        </div>
      ) : itens.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum afastamento registrado.</p>
      ) : (
        <ul className="space-y-1.5">
          {itens.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2 rounded border bg-card px-2 py-1.5 text-xs">
              <span className="font-medium">{a.tipo_label}</span>
              <span className="text-muted-foreground">
                {fmtData(a.data_inicio)}
                {a.data_retorno ? ` → ${fmtData(a.data_retorno)}` : " → em curso"}
              </span>
              {a.regra.compensa_na_guia && (
                <Badge variant="outline" className="h-5 border-success/40 text-[0.62rem] text-success">
                  reembolsado na guia
                </Badge>
              )}
              {!a.regra.corta_va && (
                <Badge variant="outline" className="h-5 text-[0.62rem]">VA preservado</Badge>
              )}
              {a.regra.fgts === "sempre" && (
                <Badge variant="outline" className="h-5 text-[0.62rem]">FGTS integral</Badge>
              )}
              {a.regra.fgts === "nunca" && (
                <Badge variant="outline" className="h-5 text-[0.62rem]">sem FGTS</Badge>
              )}
              {a.em_estabilidade && (
                <Badge variant="outline" className="h-5 border-amber-400 text-[0.62rem] text-amber-700">
                  estabilidade até {a.estabilidade_br}
                </Badge>
              )}
              {editar && (
                <span className="ml-auto flex items-center gap-1">
                  {!a.data_retorno && (
                    <Input type="date" className="h-6 w-[130px] text-[0.68rem]"
                           onChange={(e) => e.target.value && registrarRetorno(a, e.target.value)}
                           title="Registrar retorno" />
                  )}
                  <Button size="sm" variant="ghost" className="h-6 px-1.5 text-muted-foreground"
                          onClick={() => remover(a)} title="Remover">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {editar && abrindo && (
        <div className="mt-3 space-y-2.5 rounded-lg border bg-card p-3">
          <div>
            <Label className="text-[0.7rem]">Tipo</Label>
            <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIPOS.map((t) => <SelectItem key={t.v} value={t.v}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {efeito && (
              <p className="mt-1 rounded bg-muted/70 px-2 py-1 text-[0.68rem] text-muted-foreground">
                {efeito}
              </p>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <div>
              <Label className="text-[0.7rem]">Início</Label>
              <Input type="date" className="h-8 text-xs" value={form.data_inicio}
                     onChange={(e) => setForm({ ...form, data_inicio: e.target.value })} />
            </div>
            <div>
              <Label className="text-[0.7rem]">Previsão de volta</Label>
              <Input type="date" className="h-8 text-xs" value={form.data_prevista_retorno}
                     onChange={(e) => setForm({ ...form, data_prevista_retorno: e.target.value })} />
            </div>
            <div>
              <Label className="text-[0.7rem]">Voltou a trabalhar em</Label>
              <Input type="date" className="h-8 text-xs" value={form.data_retorno}
                     onChange={(e) => setForm({ ...form, data_retorno: e.target.value })} />
              <p className="mt-0.5 text-[0.65rem] text-muted-foreground">
                primeiro dia DE VOLTA (não conta como afastado) · vazio = ainda afastado
              </p>
            </div>
          </div>
          <div>
            <Label className="text-[0.7rem]">Observação</Label>
            <Input className="h-8 text-xs" value={form.observacao}
                   onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button size="sm" variant="ghost" className="h-7 text-xs"
                    onClick={() => { setAbrindo(false); setForm({ ...VAZIO }); }}>Cancelar</Button>
            <Button size="sm" className="h-7 text-xs" disabled={salvando} onClick={salvar}>
              {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Registrar"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
