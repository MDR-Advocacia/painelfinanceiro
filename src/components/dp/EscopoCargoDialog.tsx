// Escopo por SUBNÚCLEO — limita o cargo a recortes específicos.
// Nada marcado = o cargo enxerga TUDO do módulo que ele tem permissão.
// Marcou algo = passa a ver só aquilo (unidade, área, centro de custo,
// e, no painel financeiro, setores/sedes).
import { useEffect, useState } from "react";
import { Loader2, Save, ShieldQuestion } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Ajuda } from "@/components/dp/Ajuda";
import { type DpOpcoesEscopo, escopoApi } from "@/services/dp";
import { API_URL, authHeaders } from "@/hooks/useAuth";

export interface CargoEscopo {
  id: string;
  nome: string;
  escopo_unidades?: string[];
  escopo_areas?: string[];
  escopo_ccs?: string[];
  escopo_setores?: string[];
  escopo_sedes?: string[];
}

export default function EscopoCargoDialog({ cargo, onClose, onSalvou }: {
  cargo: CargoEscopo; onClose: () => void; onSalvou: (c: CargoEscopo) => void;
}) {
  const [op, setOp] = useState<DpOpcoesEscopo | null>(null);
  const [unidades, setUnidades] = useState<string[]>(cargo.escopo_unidades ?? []);
  const [areas, setAreas] = useState<string[]>(cargo.escopo_areas ?? []);
  const [ccs, setCcs] = useState<string[]>(cargo.escopo_ccs ?? []);
  const [setores, setSetores] = useState<string[]>(cargo.escopo_setores ?? []);
  const [sedes, setSedes] = useState<string[]>(cargo.escopo_sedes ?? []);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { escopoApi.opcoes().then(setOp).catch(() => undefined); }, []);

  const alterna = (lista: string[], set: (v: string[]) => void, valor: string) =>
    set(lista.includes(valor) ? lista.filter((x) => x !== valor) : [...lista, valor]);

  const semRestricao = !unidades.length && !areas.length && !ccs.length && !setores.length && !sedes.length;

  const salvar = async () => {
    setSalvando(true);
    try {
      const res = await fetch(`${API_URL}/cargos/${cargo.id}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          escopo_unidades: unidades, escopo_areas: areas, escopo_ccs: ccs,
          escopo_setores: setores, escopo_sedes: sedes,
        }),
      });
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      const atualizado = await res.json();
      toast.success(semRestricao
        ? `“${cargo.nome}” volta a enxergar tudo dos módulos liberados.`
        : `Escopo de “${cargo.nome}” salvo.`);
      onSalvou(atualizado);
    } catch (e: any) { toast.error(e.message); }
    finally { setSalvando(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldQuestion className="h-5 w-5 text-[hsl(var(--dunatech-blue))]" />
            Alcance do cargo “{cargo.nome}”
          </DialogTitle>
          <DialogDescription>
            Além de <b>quais módulos</b> o cargo abre, aqui você define <b>até onde ele enxerga</b> dentro deles.
            Deixe tudo desmarcado para não restringir.
          </DialogDescription>
        </DialogHeader>

        <div className={`rounded-lg border px-3 py-2 text-xs ${
          semRestricao ? "border-sky-300 bg-sky-50 text-sky-800" : "border-amber-300 bg-amber-50 text-amber-800"}`}>
          {semRestricao
            ? "Sem restrição: enxerga todos os registros dos módulos liberados."
            : "Restrito: só enxerga os recortes marcados abaixo (nas listas, painéis, folha e relatórios)."}
        </div>

        {!op ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            <Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> Carregando opções…
          </p>
        ) : (
          <div className="space-y-4">
            <Grupo titulo="Unidades" ajuda="Locais físicos onde as pessoas estão alocadas (ex.: Capim Macio, Manhattan)."
                   itens={op.unidades.map((u) => ({ id: u, nome: u }))}
                   marcados={unidades} onToggle={(v) => alterna(unidades, setUnidades, v)} />
            <Grupo titulo="Áreas" ajuda="Grandes divisões do escritório (Jurídico, Administrativo, TI, Diretoria)."
                   itens={op.areas.map((a) => ({ id: a, nome: a }))}
                   marcados={areas} onToggle={(v) => alterna(areas, setAreas, v)} />
            <Grupo titulo="Centros de custo" ajuda="Setores e carteiras que recebem o rateio da folha (ex.: Réu - BB Acordo)."
                   itens={op.centros_custo} marcados={ccs} onToggle={(v) => alterna(ccs, setCcs, v)} />
            <Grupo titulo="Sedes (painel financeiro)" ajuda="Sedes cadastradas no painel financeiro, com seus custos de estrutura."
                   itens={op.sedes} marcados={sedes} onToggle={(v) => alterna(sedes, setSedes, v)} />
            <Grupo titulo="Setores (painel financeiro)" ajuda="Setores do painel financeiro (faturamento e pessoal por setor)."
                   itens={op.setores} marcados={setores} onToggle={(v) => alterna(setores, setSetores, v)} />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button className="glass-button gap-1 border-0" onClick={salvar} disabled={salvando}>
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar alcance
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Grupo({ titulo, ajuda, itens, marcados, onToggle }: {
  titulo: string; ajuda: string;
  itens: { id: string; nome: string }[];
  marcados: string[]; onToggle: (v: string) => void;
}) {
  if (!itens.length) return null;
  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        {titulo}
        <Ajuda titulo={titulo} texto={ajuda} />
        {marcados.length > 0 && (
          <span className="ml-auto rounded-full bg-[hsl(var(--dunatech-blue))]/10 px-2 py-0.5 text-[10px] font-medium text-[hsl(var(--dunatech-blue))]">
            {marcados.length} selecionado(s)
          </span>
        )}
      </div>
      <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
        {itens.map((it) => (
          <label key={it.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-muted/50">
            <Checkbox checked={marcados.includes(it.id)} onCheckedChange={() => onToggle(it.id)} />
            <span className="truncate">{it.nome}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
