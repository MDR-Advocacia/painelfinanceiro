// Centros de custo em ÁRVORE: núcleo (ADM, Autor, Réu…) → subnúcleos.
// Mostra quantos colaboradores são do próprio nó e quantos somando a subárvore.
// Permite criar subnúcleo dentro de um núcleo (quando o cargo pode editar).
import { useState } from "react";
import { ChevronDown, ChevronRight, FolderTree, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Ajuda } from "@/components/dp/Ajuda";
import { type DpCcNo, previsaoApi } from "@/services/dp";

export default function ArvoreCentrosCusto({ arvore, editar, onMudou }: {
  arvore: DpCcNo[]; editar: boolean; onMudou: () => void;
}) {
  const [aberto, setAberto] = useState<Record<string, boolean>>({});
  const [criandoEm, setCriandoEm] = useState<DpCcNo | null>(null);
  const [nomeNovo, setNomeNovo] = useState("");

  const alterna = (id: string) => setAberto((a) => ({ ...a, [id]: !a[id] }));

  const criarFilho = async (pai: DpCcNo) => {
    const nome = nomeNovo.trim();
    if (!nome) { toast.error("Informe o nome do subnúcleo."); return; }
    try {
      // nome final no padrão da casa: "Núcleo - Subnúcleo"
      await previsaoApi.criarCc({
        nome: `${pai.nome} - ${nome}`, codigo: pai.codigo, pai_id: pai.id,
      } as never);
      toast.success(`Subnúcleo "${nome}" criado em ${pai.nome}.`);
      setCriandoEm(null); setNomeNovo("");
      onMudou();
    } catch (e: any) { toast.error(e.message); }
  };

  const linha = (no: DpCcNo, nivel: number) => {
    const temFilhos = no.filhos.length > 0;
    const expandido = aberto[no.id] ?? nivel === 0;
    return (
      <div key={no.id}>
        <div className="group flex items-center gap-1.5 rounded-md px-1.5 py-1.5 text-sm hover:bg-muted/50"
             style={{ paddingLeft: `${nivel * 18 + 6}px` }}>
          {temFilhos ? (
            <button onClick={() => alterna(no.id)} className="text-muted-foreground hover:text-foreground">
              {expandido ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          ) : <span className="w-3.5" />}
          <span className={`flex-1 truncate ${nivel === 0 ? "font-medium" : ""}`}>
            {no.nome_curto}
            {nivel === 0 && <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">cód. {no.codigo}</span>}
          </span>
          <span className="shrink-0 font-mono text-xs text-muted-foreground">
            {no.colaboradores_ativos}
            {temFilhos && no.total_com_filhos !== no.colaboradores_ativos && (
              <span className="ml-1 rounded bg-[hsl(var(--dunatech-blue))]/10 px-1 text-[hsl(var(--dunatech-blue))]">
                {no.total_com_filhos}
              </span>
            )}
          </span>
          {editar && nivel === 0 && (
            <button onClick={() => { setCriandoEm(no); setNomeNovo(""); }}
                    title={`Criar subnúcleo em ${no.nome}`}
                    className="opacity-0 transition-opacity hover:text-[hsl(var(--dunatech-blue))] group-hover:opacity-100">
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {criandoEm?.id === no.id && (
          <div className="flex items-center gap-1.5 py-1" style={{ paddingLeft: `${nivel * 18 + 28}px` }}>
            <span className="text-xs text-muted-foreground">{no.nome} —</span>
            <Input autoFocus value={nomeNovo} onChange={(e) => setNomeNovo(e.target.value)}
                   onKeyDown={(e) => e.key === "Enter" && criarFilho(no)}
                   placeholder="nome do subnúcleo" className="h-7 w-48 text-xs" />
            <Button size="sm" className="h-7 text-xs" onClick={() => criarFilho(no)}>Criar</Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setCriandoEm(null)}>Cancelar</Button>
          </div>
        )}
        {temFilhos && expandido && no.filhos.map((f) => linha(f, nivel + 1))}
      </div>
    );
  };

  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <FolderTree className="h-3.5 w-3.5" />
        Estrutura de centros de custo
        <Ajuda titulo="Centros de custo em árvore"
               texto="Os núcleos (ADM, Autor, Réu…) agrupam os subnúcleos. O primeiro número é quantos colaboradores estão diretamente naquele centro; o número azul é o total somando os subnúcleos." />
      </div>
      <div className="rounded-md border">
        {arvore.length === 0
          ? <p className="py-6 text-center text-xs text-muted-foreground">Nenhum centro de custo cadastrado.</p>
          : arvore.map((r) => linha(r, 0))}
      </div>
    </div>
  );
}
