// Arquivo Contábil — estoque permanente dos relatórios técnico-contábeis.
//
// Uma linha por EMISSÃO, não por exercício: gerar de novo cria uma versão nova
// e as antigas continuam aqui, baixáveis. Arquivo contábil que sobrescreve não
// serve de arquivo — o valor está justamente em conseguir comparar a emissão
// de antes com a de agora quando um número muda.
import { useCallback, useEffect, useState } from "react";
import { Archive, Download, FileText, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { PageHeader, SectionTitle, Vazio } from "@/components/Pagina";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { usePermissions } from "@/hooks/usePermissions";
import {
  arquivoContabilApi, type ExercicioDisponivel, type RelatorioExercicio,
} from "@/services/estrutura";
import { formatCurrency } from "@/utils/calculations";

const TAMANHOS = [25, 50, 100];

function tamanhoLegivel(bytes: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function ArquivoContabil() {
  const { podeEditar } = usePermissions();
  const podeEmitir = podeEditar("faturamento");

  const [exercicios, setExercicios] = useState<ExercicioDisponivel[]>([]);
  const [itens, setItens] = useState<RelatorioExercicio[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(0);
  const [porPagina, setPorPagina] = useState(25);
  const [carregando, setCarregando] = useState(true);
  const [gerando, setGerando] = useState<number | null>(null);
  const [baixando, setBaixando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<string>("");

  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [lista, anos] = await Promise.all([
        arquivoContabilApi.lista(porPagina, pagina * porPagina),
        arquivoContabilApi.exercicios(),
      ]);
      setItens(lista.items);
      setTotal(lista.total);
      setExercicios(anos.items);
      setAlvo((atual) => atual || String(anos.items[0]?.exercicio ?? ""));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao carregar o arquivo contábil");
    } finally {
      setCarregando(false);
    }
  }, [pagina, porPagina]);

  useEffect(() => { void carregar(); }, [carregar]);

  const emitir = async () => {
    const ano = Number(alvo);
    if (!ano) return;
    setGerando(ano);
    try {
      const r = await arquivoContabilApi.gerar(ano);
      toast.success(
        `Relatório do exercício ${ano} emitido (versão ${r.versao})`,
        { description: r.definitivo
            ? "Exercício definitivo: as 12 competências estão fechadas."
            : "Exercício ainda PARCIAL — o PDF registra isso na capa." });
      setPagina(0);
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao emitir o relatório");
    } finally {
      setGerando(null);
    }
  };

  const baixar = async (r: RelatorioExercicio) => {
    setBaixando(r.id);
    try {
      await arquivoContabilApi.baixar(r);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao baixar o relatório");
    } finally {
      setBaixando(null);
    }
  };

  const selecionado = exercicios.find((e) => String(e.exercicio) === alvo);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Estrutura de Faturamento"
        titulo="Arquivo Contábil"
        icone={<Archive className="h-5 w-5" />}
        descricao="Relatórios técnico-contábeis por exercício: movimentação inteira do ano, guardada em definitivo."
        acoes={
          podeEmitir && exercicios.length > 0 ? (
            <div className="flex items-center gap-2">
              <Select value={alvo} onValueChange={setAlvo}>
                <SelectTrigger className="h-9 w-[190px]">
                  <SelectValue placeholder="Exercício" />
                </SelectTrigger>
                <SelectContent>
                  {exercicios.map((e) => (
                    <SelectItem key={e.exercicio} value={String(e.exercicio)}>
                      {e.exercicio}
                      {e.definitivo ? " · definitivo" : ` · ${e.competencias_fechadas}/12 fechadas`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={emitir} disabled={!alvo || gerando !== null} className="h-9">
                {gerando !== null
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Emitindo…</>
                  : <><FileText className="mr-2 h-4 w-4" /> Emitir relatório</>}
              </Button>
            </div>
          ) : null
        }
      />

      {/* Aviso honesto: emitir um ano em curso é legítimo, mas o operador
          precisa saber que aquilo NÃO é o fechamento do exercício. */}
      {selecionado && !selecionado.definitivo && podeEmitir && (
        <Card className="glass-card border-0">
          <CardContent className="flex items-start gap-3 py-4">
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div className="text-sm">
              <p className="font-medium text-foreground">
                O exercício {selecionado.exercicio} ainda não está fechado.
              </p>
              <p className="mt-0.5 text-muted-foreground">
                {selecionado.competencias_fechadas} de {selecionado.competencias_no_ano} competências
                do ano estão fechadas. Você pode emitir assim mesmo — o PDF sai marcado como
                <strong> PARCIAL</strong> e os meses ainda abertos podem mudar de valor depois.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="glass-card border-0">
        <CardContent className="pt-6">
          <SectionTitle
            eyebrow="Estoque"
            titulo="Relatórios emitidos"
            acoes={
              <Select value={String(porPagina)}
                      onValueChange={(v) => { setPorPagina(Number(v)); setPagina(0); }}>
                <SelectTrigger className="h-8 w-[130px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TAMANHOS.map((t) => (
                    <SelectItem key={t} value={String(t)}>{t} por página</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
          />

          {carregando ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando…
            </div>
          ) : itens.length === 0 ? (
            <Vazio
              icone={Archive}
              titulo="Nenhum relatório arquivado ainda"
              texto={podeEmitir
                ? "Escolha um exercício acima e emita o primeiro relatório técnico-contábil."
                : "Quando alguém com permissão de faturamento emitir o primeiro relatório, ele aparece aqui."}
            />
          ) : (
            <>
              <div className="overflow-x-auto rounded-lg border border-border/60">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Exercício</TableHead>
                      <TableHead>Situação</TableHead>
                      <TableHead className="text-right">Receita líquida</TableHead>
                      <TableHead className="text-right">Tributos</TableHead>
                      <TableHead className="text-right">Custo de pessoal</TableHead>
                      <TableHead className="text-right">Margem</TableHead>
                      <TableHead>Emitido por</TableHead>
                      <TableHead>Quando</TableHead>
                      <TableHead className="text-right">Arquivo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itens.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">
                          {r.exercicio}
                          <span className="ml-1.5 text-xs text-muted-foreground">v{r.versao}</span>
                        </TableCell>
                        <TableCell>
                          {r.definitivo ? (
                            <Badge variant="outline" className="border-success/40 text-success">
                              <ShieldCheck className="mr-1 h-3 w-3" /> Definitivo
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-warning/40 text-warning">
                              Parcial · {r.competencias_fechadas}/{r.competencias_no_ano}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono-numbers">
                          {formatCurrency(r.resumo?.liquida ?? 0)}
                        </TableCell>
                        <TableCell className="text-right font-mono-numbers">
                          {formatCurrency(r.resumo?.impostos ?? 0)}
                        </TableCell>
                        <TableCell className="text-right font-mono-numbers">
                          {formatCurrency(r.resumo?.custo_pessoal ?? 0)}
                        </TableCell>
                        <TableCell className={`text-right font-mono-numbers font-semibold ${
                          (r.resumo?.margem ?? 0) < 0 ? "text-destructive" : "text-success"}`}>
                          {formatCurrency(r.resumo?.margem ?? 0)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{r.gerado_por || "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{r.quando_br}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span className="font-mono-numbers text-[0.68rem] text-muted-foreground"
                                  title={`SHA-256: ${r.sha256}`}>
                              {tamanhoLegivel(r.tamanho)}
                            </span>
                            <Button size="sm" variant="outline" className="h-7 text-xs"
                                    disabled={baixando === r.id}
                                    onClick={() => baixar(r)}>
                              {baixando === r.id
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <><Download className="mr-1 h-3.5 w-3.5" /> Baixar</>}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                <span>Página {pagina + 1} de {totalPaginas} · {total} relatório(s)</span>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" className="h-7 text-xs" disabled={pagina === 0}
                          onClick={() => setPagina((p) => p - 1)}>Anterior</Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs"
                          disabled={pagina + 1 >= totalPaginas}
                          onClick={() => setPagina((p) => p + 1)}>Próxima</Button>
                </div>
              </div>

              <p className="mt-4 text-xs text-muted-foreground">
                Cada emissão guarda a impressão digital SHA-256 do PDF — passe o mouse sobre o
                tamanho do arquivo para vê-la. É o que prova que o documento baixado hoje é
                byte a byte o mesmo que foi emitido na data registrada.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
