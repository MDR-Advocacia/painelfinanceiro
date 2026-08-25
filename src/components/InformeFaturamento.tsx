// INFORME DE FATURAMENTO — a receita do mês, lançada dentro do centro.
//
// Antes isso vivia em SETORES (BillingForm). Com a reestruturação a receita
// passou a ser da LINHA, então o informe vive aqui: o operador escolhe o mês,
// preenche o bruto e os descontos de cada linha do cliente de uma vez, anexa a
// comprovação (nota fiscal, medição) e salva. O que for gravado sobe pro
// centro, pra sede e — enquanto os painéis antigos não migrarem — espelha no
// setor de origem.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check, Download, FileUp, Loader2, Paperclip, Receipt, Trash2, X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { SectionTitle } from "@/components/Pagina";
import { formatCurrency } from "@/utils/calculations";
import { MONTH_NAMES } from "@/types/sector";
import { useApp } from "@/contexts/AppContext";
import {
  type EfDocumentoFaturamento, type EfInformeLinha, estruturaApi,
} from "@/services/estrutura";

const AREA_CLS: Record<string, string> = {
  passivo: "bg-[hsl(var(--dunatech-blue))]/10 text-[hsl(var(--dunatech-blue))] border-[hsl(var(--dunatech-blue))]/30",
  credito: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  especializada: "bg-violet-500/10 text-violet-600 border-violet-500/30",
};

function rotuloMes(per: string) {
  const [a, m] = per.split("-").map(Number);
  return `${MONTH_NAMES[m - 1].slice(0, 3)}/${String(a).slice(2)}`;
}

/** Campo de dinheiro que aceita digitação livre e só normaliza no blur. */
function CampoValor({ valor, onChange, destaque }: {
  valor: number; onChange: (v: number) => void; destaque?: boolean;
}) {
  const [texto, setTexto] = useState<string | null>(null);
  // O onBlur precisa do texto MAIS RECENTE. Ler do state pelo closure perde a
  // última tecla quando o blur acontece antes do re-render (clicar direto no
  // botão de salvar, por exemplo) — o ref não tem esse buraco.
  const atual = useRef<string | null>(null);
  const escrever = (v: string | null) => { atual.current = v; setTexto(v); };
  const exibido = texto ?? (valor ? valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "");
  return (
    <span className="flex items-center justify-end gap-1">
      <span className="text-[0.65rem] text-muted-foreground">R$</span>
      <input
        value={exibido}
        onChange={(e) => escrever(e.target.value)}
        onFocus={(e) => { escrever(valor ? String(valor) : ""); requestAnimationFrame(() => e.target.select()); }}
        onBlur={() => {
          const n = Number(String(atual.current ?? "").replace(/\./g, "").replace(",", ".")) || 0;
          escrever(null);
          if (n !== valor) onChange(n);
        }}
        inputMode="decimal"
        className={`h-8 w-28 rounded-md border bg-background px-2 text-right font-mono-numbers text-sm outline-none transition-colors focus:border-[hsl(var(--dunatech-blue))] ${
          destaque ? "border-[hsl(var(--dunatech-blue))]/60 bg-[hsl(var(--dunatech-blue))]/5" : ""}`}
      />
    </span>
  );
}

export default function InformeFaturamento({ centroId, centroNome, podeEditar }: {
  centroId: string; centroNome: string; podeEditar: boolean;
}) {
  const { periodoAtivo, refreshSetores } = useApp();
  const [periodo, setPeriodo] = useState(periodoAtivo);
  const [linhas, setLinhas] = useState<EfInformeLinha[] | null>(null);
  const [mesesLancados, setMeses] = useState<string[]>([]);
  const [rascunho, setRascunho] = useState<Record<string, { bruto?: number; descontos?: number }>>({});
  const [salvando, setSalvando] = useState(false);
  const [anexando, setAnexando] = useState<EfInformeLinha | null>(null);
  const [contagemDocs, setContagemDocs] = useState<Record<string, number>>({});

  const carregar = useCallback(() => {
    setLinhas(null);
    setRascunho({});
    estruturaApi.informeFaturamento(centroId, periodo)
      .then((r) => { setLinhas(r.linhas); setMeses(r.meses_lancados); })
      .catch((e) => toast.error(e.message));
    estruturaApi.documentosDoCentro(centroId, periodo)
      .then(setContagemDocs)
      .catch(() => setContagemDocs({}));
  }, [centroId, periodo]);

  useEffect(() => { carregar(); }, [carregar]);

  const valor = (l: EfInformeLinha, campo: "bruto" | "descontos") =>
    rascunho[l.linha_id]?.[campo] ?? l[campo];

  const mexido = (l: EfInformeLinha) => {
    const r = rascunho[l.linha_id];
    return !!r && ((r.bruto !== undefined && r.bruto !== l.bruto)
      || (r.descontos !== undefined && r.descontos !== l.descontos));
  };

  const editar = (l: EfInformeLinha, campo: "bruto" | "descontos", v: number) =>
    setRascunho((r) => ({ ...r, [l.linha_id]: { ...r[l.linha_id], [campo]: v } }));

  const pendentes = useMemo(() => (linhas ?? []).filter(mexido), [linhas, rascunho]);

  const totais = useMemo(() => {
    const ls = linhas ?? [];
    const bruto = ls.reduce((a, l) => a + valor(l, "bruto"), 0);
    const desc = ls.reduce((a, l) => a + valor(l, "descontos"), 0);
    return { bruto, desc, liquido: bruto - desc };
  }, [linhas, rascunho]);

  const salvar = () => {
    setSalvando(true);
    estruturaApi.lancarInforme(centroId, periodo, pendentes.map((l) => ({
      linha_id: l.linha_id, bruto: valor(l, "bruto"), descontos: valor(l, "descontos"),
    })))
      .then(async (r) => {
        // O dashboard ainda consome o Setor legado, atualizado pelo backend
        // junto com a linha. Sem recarregar esse espelho, a tela continuava
        // exibindo o snapshot do login (R$ 0,00) até um refresh completo.
        let dashboardAtualizado = true;
        try {
          await refreshSetores();
        } catch {
          dashboardAtualizado = false;
        }
        toast.success(
          `${r.alteradas} linha${r.alteradas === 1 ? "" : "s"} lançada${r.alteradas === 1 ? "" : "s"} em ${rotuloMes(periodo)}.`,
          r.espelhado_em.length ? { description: `Espelhado no histórico: ${r.espelhado_em.join(", ")}.` } : undefined,
        );
        if (!dashboardAtualizado) {
          toast.warning("O lançamento foi salvo, mas o dashboard precisa ser recarregado.");
        }
        carregar();
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setSalvando(false));
  };

  return (
    <Card className="glass-card border-0">
      <CardContent className="pt-6">
        <SectionTitle
          eyebrow="Lançamento"
          titulo="Informe de faturamento"
          acoes={
            <span className="flex items-center gap-2">
              <input type="month" value={periodo}
                     onChange={(e) => e.target.value && setPeriodo(e.target.value)}
                     className="h-8 rounded-md border bg-background px-2 text-sm" />
              {podeEditar && (
                <Button size="sm" onClick={salvar} disabled={!pendentes.length || salvando}
                        className="glass-button gap-1 border-0">
                  {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  {pendentes.length ? `Lançar ${pendentes.length}` : "Lançar"}
                </Button>
              )}
            </span>
          }
        />

        {mesesLancados.length > 0 && (
          <p className="-mt-2 mb-3 text-[0.68rem] text-muted-foreground">
            meses já lançados neste centro: {mesesLancados.map(rotuloMes).join(" · ")}
          </p>
        )}

        {!linhas ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : linhas.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Este centro ainda não tem linhas de faturamento.
          </p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Linha</TableHead>
                  <TableHead className="text-right text-xs">Faturamento bruto</TableHead>
                  <TableHead className="text-right text-xs">Descontos / glosas</TableHead>
                  <TableHead className="text-right text-xs">Líquido</TableHead>
                  <TableHead className="text-center text-xs">Anexos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((l) => {
                  const b = valor(l, "bruto"), d = valor(l, "descontos");
                  const docs = contagemDocs[l.linha_id] ?? 0;
                  return (
                    <TableRow key={l.linha_id} className={mexido(l) ? "bg-[hsl(var(--dunatech-blue))]/5" : ""}>
                      <TableCell>
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-medium">{l.linha}</span>
                          <Badge variant="outline" className={`text-[0.55rem] ${AREA_CLS[l.area] ?? ""}`}>
                            {l.area === "credito" ? "crédito" : l.area}
                          </Badge>
                          {l.sede && (
                            <span className="rounded-full bg-muted/70 px-1.5 text-[0.55rem] text-muted-foreground">
                              {l.sede}
                            </span>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {podeEditar
                          ? <CampoValor valor={b} destaque={mexido(l)} onChange={(v) => editar(l, "bruto", v)} />
                          : <span className="font-mono-numbers text-sm">{formatCurrency(b)}</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        {podeEditar
                          ? <CampoValor valor={d} onChange={(v) => editar(l, "descontos", v)} />
                          : <span className="font-mono-numbers text-sm">{formatCurrency(d)}</span>}
                      </TableCell>
                      <TableCell className="text-right font-mono-numbers text-sm font-semibold">
                        {formatCurrency(b - d)}
                      </TableCell>
                      <TableCell className="text-center">
                        <button onClick={() => setAnexando(l)}
                                title={`Anexos de ${l.linha} em ${rotuloMes(periodo)}`}
                                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.65rem] transition-colors hover:border-[hsl(var(--dunatech-blue))] hover:text-[hsl(var(--dunatech-blue))] ${
                                  docs ? "border-[hsl(var(--dunatech-blue))]/40 text-[hsl(var(--dunatech-blue))]" : "text-muted-foreground"}`}>
                          <Paperclip className="h-3 w-3" />
                          {docs || "anexar"}
                        </button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="border-t-2 font-semibold">
                  <TableCell className="text-sm">Total de {rotuloMes(periodo)}</TableCell>
                  <TableCell className="text-right font-mono-numbers text-sm">{formatCurrency(totais.bruto)}</TableCell>
                  <TableCell className="text-right font-mono-numbers text-sm">{formatCurrency(totais.desc)}</TableCell>
                  <TableCell className="text-right font-mono-numbers text-sm">{formatCurrency(totais.liquido)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>

            {pendentes.length > 0 && (
              <p className="mt-2 text-[0.68rem] text-[hsl(var(--dunatech-blue))]">
                {pendentes.length} linha{pendentes.length === 1 ? "" : "s"} alterada
                {pendentes.length === 1 ? "" : "s"} e ainda não lançada
                {pendentes.length === 1 ? "" : "s"} — clique em “Lançar”.
              </p>
            )}
          </>
        )}
      </CardContent>

      {anexando && (
        <AnexosDialog linha={anexando} periodo={periodo} podeEditar={podeEditar}
                      centroNome={centroNome}
                      onFechar={() => { setAnexando(null); carregar(); }} />
      )}
    </Card>
  );
}

// ── Anexos de UM lançamento (linha + mês) ──
function AnexosDialog({ linha, periodo, podeEditar, centroNome, onFechar }: {
  linha: EfInformeLinha; periodo: string; podeEditar: boolean;
  centroNome: string; onFechar: () => void;
}) {
  const [docs, setDocs] = useState<EfDocumentoFaturamento[] | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const [tipo, setTipo] = useState("nota");
  const [descricao, setDescricao] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const carregar = useCallback(() => {
    estruturaApi.documentosDaLinha(linha.linha_id, periodo)
      .then(setDocs)
      .catch((e) => toast.error(e.message));
  }, [linha.linha_id, periodo]);
  useEffect(() => { carregar(); }, [carregar]);

  const enviar = (arq: File) => {
    setEnviando(true);
    estruturaApi.anexarNoFaturamento(linha.linha_id, periodo, arq, tipo, descricao)
      .then(() => { toast.success(`${arq.name} anexado.`); setDescricao(""); carregar(); })
      .catch((e) => toast.error(e.message))
      .finally(() => setEnviando(false));
  };

  const TIPOS = [
    ["nota", "Nota fiscal"], ["medicao", "Relatório de medição"],
    ["contrato", "Contrato / aditivo"], ["comprovante", "Comprovante"], ["outro", "Outro"],
  ];

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">Anexos · {linha.linha}</DialogTitle>
          <DialogDescription>
            Comprovação do faturamento de <b>{rotuloMes(periodo)}</b> em {centroNome} —
            nota fiscal, medição, contrato ou comprovante.
          </DialogDescription>
        </DialogHeader>

        {podeEditar && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <select value={tipo} onChange={(e) => setTipo(e.target.value)}
                      className="h-9 rounded-md border bg-background px-2 text-sm">
                {TIPOS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
              </select>
              <input value={descricao} onChange={(e) => setDescricao(e.target.value)}
                     placeholder="Descrição (ex.: NF 12345)"
                     className="h-9 rounded-md border bg-background px-2 text-sm" />
            </div>

            <div
              onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
              onDragLeave={() => setArrastando(false)}
              onDrop={(e) => {
                e.preventDefault(); setArrastando(false);
                const f = e.dataTransfer.files?.[0];
                if (f) enviar(f);
              }}
              onClick={() => inputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
                arrastando
                  ? "border-[hsl(var(--dunatech-blue))] bg-[hsl(var(--dunatech-blue))]/5"
                  : "border-muted-foreground/30 hover:border-[hsl(var(--dunatech-blue))]/60"}`}
            >
              {enviando ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (
                <>
                  <FileUp className="h-5 w-5 text-muted-foreground" />
                  <span className="text-xs font-medium">Arraste o arquivo ou clique para escolher</span>
                  <span className="text-[0.65rem] text-muted-foreground">
                    PDF, XML, imagem ou planilha · até 25 MB
                  </span>
                </>
              )}
              <input ref={inputRef} type="file" className="hidden"
                     accept=".pdf,.xml,.png,.jpg,.jpeg,.xlsx,.xls,.csv"
                     onChange={(e) => { const f = e.target.files?.[0]; if (f) enviar(f); e.target.value = ""; }} />
            </div>
          </div>
        )}

        <div className="max-h-64 space-y-1.5 overflow-y-auto">
          {!docs ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : docs.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              Nenhum documento anexado neste mês.
            </p>
          ) : docs.map((d) => (
            <div key={d.id} className="flex items-center gap-2 rounded-lg border bg-card/60 px-2.5 py-2">
              <Receipt className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">{d.nome}</span>
                <span className="block truncate text-[0.62rem] text-muted-foreground">
                  {d.tipo_label}
                  {d.descricao && ` · ${d.descricao}`}
                  {` · ${Math.max(1, Math.round(d.tamanho / 1024))} KB · ${d.enviado_por}`}
                </span>
              </span>
              <button onClick={() => estruturaApi.baixarDocumento(d).catch((e) => toast.error(e.message))}
                      title="Baixar" className="rounded p-1 text-muted-foreground hover:text-foreground">
                <Download className="h-3.5 w-3.5" />
              </button>
              {podeEditar && (
                <button title="Remover"
                        onClick={() => window.confirm(`Remover ${d.nome}?`)
                          && estruturaApi.removerDocumento(d.id)
                            .then(() => { toast.success("Documento removido."); carregar(); })
                            .catch((e) => toast.error(e.message))}
                        className="rounded p-1 text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>

        <Button variant="outline" onClick={onFechar} className="gap-1">
          <X className="h-3.5 w-3.5" /> Fechar
        </Button>
      </DialogContent>
    </Dialog>
  );
}
