// Gerenciador de EQUIPES — a tabela pedida: criar, renomear, mudar de grupo,
// amarrar ao centro de custo do DP (de onde desce o custo real) e excluir.
// Equipe alocada em linha não some (o backend bloqueia) — primeiro desaloca.
import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { CcPicker } from "@/components/dp/Pickers";
import { type EfEquipe, avisarEstruturaMudou, estruturaApi } from "@/services/estrutura";

const GRUPOS = [
  { v: "passivo", label: "Contencioso Passivo" },
  { v: "credito", label: "Recuperação de Crédito" },
  { v: "especializada", label: "Especializada" },
  { v: "infra", label: "Infraestrutura" },
];

export default function EquipesDialog({ editar, onClose }: {
  editar: boolean; onClose: () => void;
}) {
  const [equipes, setEquipes] = useState<EfEquipe[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [novoNome, setNovoNome] = useState("");
  const [novoGrupo, setNovoGrupo] = useState("passivo");

  const carregar = () => {
    estruturaApi.equipes()
      .then(setEquipes)
      .catch((e) => toast.error(e.message))
      .finally(() => setCarregando(false));
  };
  useEffect(carregar, []);

  const mudou = () => { carregar(); avisarEstruturaMudou(); };

  const criar = () => {
    if (!novoNome.trim()) { toast.error("Informe o nome da equipe."); return; }
    estruturaApi.criarEquipe({ nome: novoNome.trim(), grupo: novoGrupo })
      .then(() => { toast.success("Equipe criada."); setNovoNome(""); mudou(); })
      .catch((e) => toast.error(e.message));
  };

  const excluir = (e: EfEquipe) => {
    const nome = e.nome ?? e.equipe ?? "";
    if (!window.confirm(`Excluir a equipe ${nome}? (Só é possível se ela não estiver alocada.)`)) return;
    estruturaApi.excluirEquipe(e.id)
      .then(() => { toast.success("Equipe excluída."); mudou(); })
      .catch((err) => toast.error(err.message));
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-[hsl(var(--dunatech-blue))]" /> Equipes
          </DialogTitle>
          <DialogDescription>
            O vocabulário único da casa (o mesmo do Flow). O centro de custo do DP é de onde
            desce o custo real da folha para as linhas de faturamento.
          </DialogDescription>
        </DialogHeader>

        {carregando ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            <Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> Carregando…
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Equipe</TableHead>
                <TableHead className="w-[190px] text-xs">Grupo</TableHead>
                <TableHead className="w-[230px] text-xs">Centro de custo (DP)</TableHead>
                <TableHead className="w-24 text-center text-xs">Alocações</TableHead>
                {editar && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {equipes.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-sm">
                    {editar ? (
                      <Input defaultValue={e.nome ?? e.equipe ?? ""} className="h-8 text-sm"
                             onBlur={(ev) => {
                               const v = ev.target.value.trim();
                               if (v && v !== (e.nome ?? e.equipe)) {
                                 estruturaApi.editarEquipe(e.id, { nome: v })
                                   .then(() => { toast.success("Equipe renomeada."); mudou(); })
                                   .catch((err) => toast.error(err.message));
                               }
                             }} />
                    ) : (e.nome ?? e.equipe)}
                  </TableCell>
                  <TableCell>
                    <Select defaultValue={e.grupo} disabled={!editar}
                            onValueChange={(v) => estruturaApi.editarEquipe(e.id, { grupo: v })
                              .then(mudou).catch((err) => toast.error(err.message))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {GRUPOS.map((g) => <SelectItem key={g.v} value={g.v}>{g.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    {editar ? (
                      <CcPicker valor={e.centro_custo_id ?? null} className="h-8 w-full text-xs"
                                placeholder="— sem vínculo —"
                                onChange={(v) => estruturaApi.editarEquipe(e.id, { centro_custo_id: v === "__todos__" ? null : v })
                                  .then(() => { toast.success("Vínculo atualizado."); mudou(); })
                                  .catch((err) => toast.error(err.message))} />
                    ) : (
                      <span className="text-xs text-muted-foreground">{e.centro_custo ?? "—"}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {e.alocada_em?.length ? (
                      <span title={e.alocada_em.join("\n")}
                            className="rounded-full bg-[hsl(var(--dunatech-blue))]/10 px-2 py-0.5 font-mono text-xs text-[hsl(var(--dunatech-blue))]">
                        {e.alocada_em.length}
                      </span>
                    ) : (
                      <span title="Sem alocação — o custo dela não aparece em lugar nenhum"
                            className="rounded-full bg-warning/15 px-2 py-0.5 font-mono text-xs text-warning">0</span>
                    )}
                  </TableCell>
                  {editar && (
                    <TableCell>
                      <button onClick={() => excluir(e)} title="Excluir equipe"
                              className="rounded p-1 text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {editar && (
          <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-muted/20 p-2">
            <div className="min-w-[220px] flex-1">
              <Label className="text-[11px] text-muted-foreground">Nova equipe</Label>
              <Input value={novoNome} onChange={(e) => setNovoNome(e.target.value)}
                     onKeyDown={(e) => e.key === "Enter" && criar()}
                     placeholder="Ex.: SICREDI Autor" className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">Grupo</Label>
              <Select value={novoGrupo} onValueChange={setNovoGrupo}>
                <SelectTrigger className="h-8 w-[190px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GRUPOS.map((g) => <SelectItem key={g.v} value={g.v}>{g.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={criar}>
              <Plus className="h-3.5 w-3.5" /> Criar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
