// ADMINISTRAÇÃO DA ESTRUTURA — tudo TABELADO em um lugar só.
//
// Três tabelas: Centros (faturamento e infraestrutura), Linhas e Equipes.
// Criar, renomear, mudar área/grupo, excluir — com as mesmas guardas
// conservadoras da API (histórico nunca some por acidente).
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Landmark, Loader2, Network, Plus, Server, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { EquipesTabela } from "@/components/EquipesDialog";
import { Kpi, PageHeader, SectionTitle } from "@/components/Pagina";
import { usePermissions } from "@/hooks/usePermissions";
import { useApp } from "@/contexts/AppContext";
import { formatCurrency } from "@/utils/calculations";
import {
  type EfEstrutura, avisarEstruturaMudou, estruturaApi,
} from "@/services/estrutura";

const AREAS = [
  { v: "passivo", label: "Contencioso Passivo" },
  { v: "credito", label: "Recuperação de Crédito" },
  { v: "especializada", label: "Especializada" },
];

export default function AdminEstrutura() {
  const { setView } = useApp();
  const { podeEditar } = usePermissions();
  const editar = podeEditar("estrutura");
  const [dados, setDados] = useState<EfEstrutura | null>(null);
  const [sedes, setSedes] = useState<{ id: string; nome: string }[]>([]);
  useEffect(() => { estruturaApi.sedes().then(setSedes).catch(() => undefined); }, []);

  const carregar = useCallback(() => {
    estruturaApi.carregar().then(setDados).catch((e) => toast.error(e.message));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);
  const mudou = useCallback(() => { carregar(); avisarEstruturaMudou(); }, [carregar]);

  if (!dados) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const centros = [...dados.centros, ...dados.infraestrutura];
  const linhas = centros.flatMap((c) => c.linhas.map((l) => ({ ...l, centro: c.nome, centro_id: c.id })));

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        eyebrow="Estrutura de faturamento"
        titulo="Administração"
        icone={<Network className="h-4.5 w-4.5" />}
        descricao="Centros, linhas e equipes — tudo tabelado. Nada com histórico é excluído por acidente."
        acoes={
          <Button variant="outline" size="sm" className="gap-1"
                  onClick={() => setView("estrutura" as any)}>
            <ArrowLeft className="h-4 w-4" /> Estrutura
          </Button>
        }
      />

      <div className="grid grid-cols-3 gap-4">
        <Kpi icone={Landmark} rotulo="Centros" valor={String(centros.length)} />
        <Kpi icone={Network} rotulo="Linhas" valor={String(linhas.length)} />
        <Kpi icone={Server} rotulo="Infraestrutura" valor={String(dados.infraestrutura.length)} />
      </div>

      {/* ── CENTROS ── */}
      <Card className="glass-card border-0">
        <CardContent className="pt-6">
          <SectionTitle eyebrow="Tabela" titulo="Centros"
                        acoes={editar && <NovoCentroInline onCriou={mudou} />} />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Nome</TableHead>
                <TableHead className="text-xs">Tipo</TableHead>
                <TableHead className="text-right text-xs">Linhas</TableHead>
                <TableHead className="text-right text-xs">Receita</TableHead>
                <TableHead className="text-right text-xs">Custo alocado</TableHead>
                {editar && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {centros.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="text-sm">
                    {editar ? (
                      <Input defaultValue={c.nome} className="h-8 max-w-[280px] text-sm"
                             onBlur={(e) => {
                               const v = e.target.value.trim();
                               if (v && v !== c.nome) {
                                 estruturaApi.renomearCentro(c.id, v)
                                   .then(() => { toast.success("Centro renomeado."); mudou(); })
                                   .catch((err) => toast.error(err.message));
                               }
                             }} />
                    ) : c.nome}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[0.6rem]">
                      {c.tipo === "faturamento" ? "Faturamento" : "Infraestrutura"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono-numbers text-xs">{c.linhas.length}</TableCell>
                  <TableCell className="text-right font-mono-numbers text-xs">{formatCurrency(c.receita_total)}</TableCell>
                  <TableCell className="text-right font-mono-numbers text-xs">{formatCurrency(c.custo_total)}</TableCell>
                  {editar && (
                    <TableCell>
                      <button title="Excluir centro (só vazio)"
                              onClick={() => window.confirm(`Excluir ${c.nome}?`)
                                && estruturaApi.excluirCentro(c.id)
                                  .then(() => { toast.success("Centro excluído."); mudou(); })
                                  .catch((e) => toast.error(e.message))}
                              className="rounded p-1 text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── LINHAS ── */}
      <Card className="glass-card border-0">
        <CardContent className="pt-6">
          <SectionTitle eyebrow="Tabela" titulo="Linhas de faturamento e infraestrutura"
                        acoes={editar && <NovaLinhaAdmin centros={centros.map((c) => ({ id: c.id, nome: c.nome }))} onCriou={mudou} />} />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Centro</TableHead>
                <TableHead className="text-xs">Linha</TableHead>
                <TableHead className="text-xs">Área</TableHead>
                <TableHead className="text-xs">Sede</TableHead>
                <TableHead className="text-right text-xs">Receita</TableHead>
                <TableHead className="text-right text-xs">Equipes</TableHead>
                {editar && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="text-xs text-muted-foreground">{l.centro}</TableCell>
                  <TableCell className="text-sm">
                    {editar ? (
                      <Input defaultValue={l.nome} className="h-8 max-w-[260px] text-sm"
                             onBlur={(e) => {
                               const v = e.target.value.trim();
                               if (v && v !== l.nome) {
                                 estruturaApi.editarLinha(l.id, { nome: v })
                                   .then(() => { toast.success("Linha renomeada."); mudou(); })
                                   .catch((err) => toast.error(err.message));
                               }
                             }} />
                    ) : l.nome}
                  </TableCell>
                  <TableCell>
                    <Select defaultValue={l.area} disabled={!editar}
                            onValueChange={(v) => estruturaApi.editarLinha(l.id, { area: v })
                              .then(mudou).catch((err) => toast.error(err.message))}>
                      <SelectTrigger className="h-8 w-[190px] text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {AREAS.map((a) => <SelectItem key={a.v} value={a.v}>{a.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Select defaultValue={l.sede_id ?? ""} disabled={!editar}
                            onValueChange={(v) => estruturaApi.definirSedeLinha(l.id, v || null)
                              .then(() => { toast.success("Sede atualizada."); mudou(); })
                              .catch((err) => toast.error(err.message))}>
                      <SelectTrigger className="h-8 w-[150px] text-xs">
                        <SelectValue placeholder="— sem sede —" />
                      </SelectTrigger>
                      <SelectContent>
                        {sedes.map((sd) => <SelectItem key={sd.id} value={sd.id}>{sd.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right font-mono-numbers text-xs">{formatCurrency(l.receita_bruta)}</TableCell>
                  <TableCell className="text-right font-mono-numbers text-xs">{l.alocacoes.length}</TableCell>
                  {editar && (
                    <TableCell>
                      <button title="Excluir linha (só sem receita lançada)"
                              onClick={() => window.confirm(`Excluir a linha ${l.nome}?`)
                                && estruturaApi.excluirLinha(l.id)
                                  .then(() => { toast.success("Linha excluída."); mudou(); })
                                  .catch((e) => toast.error(e.message))}
                              className="rounded p-1 text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── EQUIPES ── */}
      <Card className="glass-card border-0">
        <CardContent className="pt-6">
          <SectionTitle eyebrow="Tabela" titulo="Equipes"
                        acoes={<span className="text-xs text-muted-foreground">o enquadramento das pessoas é feito na ficha (módulo Pessoal)</span>} />
          <EquipesTabela editar={editar} />
        </CardContent>
      </Card>
    </div>
  );
}

function NovoCentroInline({ onCriou }: { onCriou: () => void }) {
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<"faturamento" | "infraestrutura">("faturamento");
  return (
    <span className="flex items-center gap-1.5">
      <Input placeholder="Novo centro…" value={nome} onChange={(e) => setNome(e.target.value)}
             className="h-7 w-40 text-xs" />
      <Select value={tipo} onValueChange={(v) => setTipo(v as any)}>
        <SelectTrigger className="h-7 w-[140px] text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="faturamento">Faturamento</SelectItem>
          <SelectItem value="infraestrutura">Infraestrutura</SelectItem>
        </SelectContent>
      </Select>
      <Button size="sm" variant="outline" className="h-7 gap-1 text-xs"
              onClick={() => {
                if (!nome.trim()) { toast.error("Informe o nome."); return; }
                estruturaApi.criarCentro(nome.trim(), tipo)
                  .then(() => { toast.success("Centro criado."); setNome(""); onCriou(); })
                  .catch((e) => toast.error(e.message));
              }}>
        <Plus className="h-3 w-3" /> Criar
      </Button>
    </span>
  );
}

function NovaLinhaAdmin({ centros, onCriou }: {
  centros: { id: string; nome: string }[]; onCriou: () => void;
}) {
  const [centroId, setCentroId] = useState("");
  const [nome, setNome] = useState("");
  const [area, setArea] = useState("passivo");
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <Select value={centroId} onValueChange={setCentroId}>
        <SelectTrigger className="h-7 w-[160px] text-xs"><SelectValue placeholder="Centro…" /></SelectTrigger>
        <SelectContent>
          {centros.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
        </SelectContent>
      </Select>
      <Input placeholder="Nova linha…" value={nome} onChange={(e) => setNome(e.target.value)}
             className="h-7 w-40 text-xs" />
      <Select value={area} onValueChange={setArea}>
        <SelectTrigger className="h-7 w-[170px] text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {AREAS.map((a) => <SelectItem key={a.v} value={a.v}>{a.label}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button size="sm" variant="outline" className="h-7 gap-1 text-xs"
              onClick={() => {
                if (!centroId) { toast.error("Escolha o centro."); return; }
                if (!nome.trim()) { toast.error("Informe o nome da linha."); return; }
                estruturaApi.criarLinha(centroId, nome.trim(), area)
                  .then(() => { toast.success("Linha criada."); setNome(""); onCriou(); })
                  .catch((e) => toast.error(e.message));
              }}>
        <Plus className="h-3 w-3" /> Criar
      </Button>
    </span>
  );
}
