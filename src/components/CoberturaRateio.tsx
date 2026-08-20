// Auditoria de COBERTURA do rateio — o caminho da pessoa até a linha.
//
// Existe porque as três falhas possíveis são silenciosas e caras: pessoa sem
// equipe, equipe sem alocação e linha sem setor fazem o custo dela SUMIR do
// rateio, e a margem do cliente aparece melhor do que é sem nenhum aviso.
// Antes disso só dava pra descobrir consultando o banco.
import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown, ChevronRight, CircleAlert, CircleCheck, Loader2, RefreshCw, Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { API_URL, authHeaders } from "@/hooks/useAuth";

interface Destino { alvo: string; infra: boolean; fatia: number }
interface EquipeCob {
  id: string; nome: string; pessoas: number; alocada: boolean; destinos: Destino[];
}
interface Cobertura {
  ativos: number; distribuidos: number; fora_do_rateio: number;
  sem_equipe: { id: string; matricula: number; nome: string; regime: string }[];
  equipes_sem_alocacao: EquipeCob[];
  linhas_sem_setor: { id: string; nome: string; centro: string }[];
  infra_sem_setor: { id: string; nome: string }[];
  equipes: EquipeCob[];
  ok: boolean;
}

export default function CoberturaRateio() {
  const [d, setD] = useState<Cobertura | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [aberto, setAberto] = useState(false);

  const carregar = useCallback(() => {
    setCarregando(true);
    fetch(`${API_URL}/estrutura/cobertura/`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setD)
      .catch(() => setD(null))
      .finally(() => setCarregando(false));
  }, []);
  useEffect(carregar, [carregar]);

  if (carregando && !d) {
    return (
      <Card className="glass-card border-0">
        <CardContent className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Conferindo a cobertura do rateio…
        </CardContent>
      </Card>
    );
  }
  if (!d) return null;

  const comGente = d.equipes.filter((e) => e.pessoas > 0);
  const ociosas = d.equipes.filter((e) => e.pessoas === 0);

  return (
    <Card className={`border-0 ${d.ok ? "glass-card" : "bg-warning/10 ring-1 ring-warning/40"}`}>
      <CardContent className="space-y-3 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setAberto((v) => !v)}
                  className="flex items-center gap-1.5 text-sm font-semibold">
            {aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            {d.ok
              ? <CircleCheck className="h-4 w-4 text-success" />
              : <CircleAlert className="h-4 w-4 text-warning" />}
            Cobertura do rateio
          </button>

          <span className="text-xs text-muted-foreground">
            <b className="text-foreground">{d.distribuidos}</b> de {d.ativos} pessoas chegam
            a uma linha de faturamento
          </span>

          {d.fora_do_rateio > 0 && (
            <Badge variant="outline" className="border-warning/50 text-[0.7rem] text-warning">
              {d.fora_do_rateio} fora do rateio
            </Badge>
          )}

          <Button size="sm" variant="ghost" className="ml-auto h-7 px-2 text-xs"
                  onClick={carregar} disabled={carregando}>
            <RefreshCw className={`h-3.5 w-3.5 ${carregando ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* problemas aparecem SEMPRE, mesmo com o painel fechado: são eles que
            fazem o custo sumir, e esconder num acordeão anula o aviso */}
        {!d.ok && (
          <div className="space-y-1.5 text-xs">
            {d.sem_equipe.length > 0 && (
              <p className="rounded bg-warning/15 px-2 py-1.5">
                <b>{d.sem_equipe.length} pessoa(s) sem equipe</b> — não entram em linha
                nenhuma:{" "}
                {d.sem_equipe.slice(0, 5).map((c) => `${c.matricula} ${c.nome}`).join(" · ")}
                {d.sem_equipe.length > 5 && ` e mais ${d.sem_equipe.length - 5}`}
              </p>
            )}
            {d.equipes_sem_alocacao.length > 0 && (
              <p className="rounded bg-warning/15 px-2 py-1.5">
                <b>{d.equipes_sem_alocacao.length} equipe(s) com gente e sem alocação</b>:{" "}
                {d.equipes_sem_alocacao.map((e) => `${e.nome} (${e.pessoas}p)`).join(" · ")}
                {" "}— alocar numa linha ou centro para o custo passar a contar.
              </p>
            )}
            {d.linhas_sem_setor.length > 0 && (
              <p className="rounded bg-warning/15 px-2 py-1.5">
                <b>{d.linhas_sem_setor.length} linha(s) sem setor no painel</b>:{" "}
                {d.linhas_sem_setor.map((l) => `${l.centro} · ${l.nome}`).join(" · ")}
                {" "}— o custo delas não chega ao Dashboard.
              </p>
            )}
            {d.infra_sem_setor.length > 0 && (
              <p className="rounded bg-warning/15 px-2 py-1.5">
                <b>{d.infra_sem_setor.length} centro(s) de apoio sem setor</b>:{" "}
                {d.infra_sem_setor.map((c) => c.nome).join(" · ")}
                {" "}— o custo deles não é rateado nas linhas.
              </p>
            )}
          </div>
        )}

        {aberto && (
          <div className="space-y-3 border-t pt-3">
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <Users className="h-3.5 w-3.5" /> Para onde vai cada equipe
              </div>
              <div className="space-y-1">
                {comGente.map((e) => (
                  <div key={e.id}
                       className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded border bg-card px-2 py-1.5 text-xs">
                    <span className="font-medium">{e.nome}</span>
                    <Badge variant="outline" className="h-5 text-[0.65rem]">
                      {e.pessoas} pessoa{e.pessoas > 1 ? "s" : ""}
                    </Badge>
                    <span className="text-muted-foreground">→</span>
                    {e.destinos.length === 0 ? (
                      <span className="text-warning">sem destino — fica fora do rateio</span>
                    ) : (
                      e.destinos.map((x, i) => (
                        <span key={i}
                              className={`rounded px-1.5 py-0.5 text-[0.68rem] ${
                                x.infra
                                  ? "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200"
                                  : "bg-muted"}`}>
                          {x.alvo} {x.fatia !== 100 && <b>{x.fatia}%</b>}
                          {x.infra && " · apoio"}
                        </span>
                      ))
                    )}
                  </div>
                ))}
              </div>
            </div>

            {ociosas.length > 0 && (
              <p className="text-[0.7rem] text-muted-foreground">
                <b>Sem gente hoje:</b> {ociosas.map((e) => e.nome).join(" · ")} — alocadas
                na estrutura mas sem ninguém no quadro, então não movem custo.
              </p>
            )}

            <p className="rounded bg-muted/50 px-2 py-1.5 text-[0.7rem] text-muted-foreground">
              As equipes marcadas como <b className="text-sky-700 dark:text-sky-300">apoio</b>{" "}
              (Administrativo e TI) não faturam: o custo delas é rateado entre as linhas
              <b> por cabeça</b>, então cada cliente carrega a fatia proporcional ao
              tamanho da própria equipe. Sem isso a margem de cada um apareceria melhor
              do que é.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
