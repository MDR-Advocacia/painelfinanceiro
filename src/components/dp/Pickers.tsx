import { estruturaApi } from "@/services/estrutura";
// Seletores de catálogo do DP — sempre COM BUSCA (regra da casa: nada de
// <Select> cru em catálogo grande).
//
// CcPicker espelha a ÁRVORE de centros de custo (núcleo → subnúcleo) em todo
// lugar que escolhe CC: ficha, admissão e filtros. Escolher o núcleo, nos
// filtros, traz os subnúcleos junto.
// LiderancaPicker lê o catálogo de supervisores/coordenadores e permite
// cadastrar um nome novo sem sair da tela.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { DpCcNo, DpLideranca, dpApi } from "@/services/dp";

/* ───────────────────────── centros de custo (árvore) ───────────────────────── */

// cache no módulo: a árvore muda pouco e o picker aparece em várias telas
let arvoreCache: DpCcNo[] | null = null;
const ouvintes = new Set<(a: DpCcNo[]) => void>();

export function invalidarArvoreCc() {
  arvoreCache = null;
}

export function useArvoreCc() {
  const [arvore, setArvore] = useState<DpCcNo[]>(arvoreCache ?? []);
  useEffect(() => {
    if (arvoreCache) { setArvore(arvoreCache); return; }
    ouvintes.add(setArvore);
    dpApi.ccArvore()
      .then((a) => { arvoreCache = a; ouvintes.forEach((f) => f(a)); })
      .catch(() => undefined);
    return () => { ouvintes.delete(setArvore); };
  }, []);
  return arvore;
}

export interface CcOpcao {
  id: string; nome: string; nomeCurto: string; nivel: number; raiz: string; temFilhos: boolean;
}

/** Achata a árvore preservando a ordem e o nível (pra indentar). */
export function achatarCcs(arvore: DpCcNo[]): CcOpcao[] {
  const saida: CcOpcao[] = [];
  const anda = (nos: DpCcNo[], nivel: number, raiz: string) => {
    nos.forEach((n) => {
      saida.push({
        id: n.id, nome: n.nome, nomeCurto: n.nome_curto || n.nome, nivel,
        raiz: raiz || n.nome_curto || n.nome, temFilhos: (n.filhos?.length ?? 0) > 0,
      });
      if (n.filhos?.length) anda(n.filhos, nivel + 1, raiz || n.nome_curto || n.nome);
    });
  };
  anda(arvore, 0, "");
  return saida;
}

export function CcPicker({
  valor, onChange, ro, className, placeholder = "Centro de custo",
  rotuloTodos, comSubnucleos,
}: {
  valor: string | null;
  onChange: (id: string) => void;
  ro?: boolean;
  className?: string;
  placeholder?: string;
  /** quando definido, adiciona a opção "todos" no topo (uso em filtros) */
  rotuloTodos?: string;
  /** avisa que escolher o núcleo traz os subnúcleos junto (uso em filtros) */
  comSubnucleos?: boolean;
}) {
  const arvore = useArvoreCc();
  const [aberto, setAberto] = useState(false);
  const opcoes = useMemo(() => achatarCcs(arvore), [arvore]);
  const atual = opcoes.find((o) => o.id === valor);

  const rotulo = rotuloTodos && (!valor || valor === "__todos__")
    ? rotuloTodos
    : atual
      ? (atual.nivel > 0 ? `${atual.raiz} › ${atual.nomeCurto}` : atual.nomeCurto)
      : placeholder;

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild disabled={ro}>
        <Button variant="outline" role="combobox" disabled={ro}
                className={cn("h-9 justify-between px-3 text-left text-sm font-normal", className)}>
          <span className={cn("truncate", !atual && !rotuloTodos && "text-muted-foreground")}>{rotulo}</span>
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command
          filter={(value, search) =>
            value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0}
        >
          <CommandInput placeholder="Buscar centro de custo…" className="h-9" />
          <CommandList className="max-h-72">
            <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">
              Nenhum centro de custo encontrado.
            </CommandEmpty>
            <CommandGroup>
              {rotuloTodos && (
                <CommandItem value={rotuloTodos} onSelect={() => { onChange("__todos__"); setAberto(false); }}>
                  <Check className={cn("mr-2 h-3.5 w-3.5",
                                       (!valor || valor === "__todos__") ? "opacity-100" : "opacity-0")} />
                  {rotuloTodos}
                </CommandItem>
              )}
              {opcoes.map((o) => (
                <CommandItem
                  key={o.id}
                  value={`${o.raiz} ${o.nome} ${o.nomeCurto}`}
                  onSelect={() => { onChange(o.id); setAberto(false); }}
                >
                  <Check className={cn("mr-2 h-3.5 w-3.5", valor === o.id ? "opacity-100" : "opacity-0")} />
                  <span style={{ paddingLeft: o.nivel * 14 }} className="flex min-w-0 items-center gap-1.5">
                    {o.nivel > 0 && <span className="text-muted-foreground/50">└</span>}
                    <span className={cn("truncate", o.nivel === 0 && "font-medium")}>{o.nomeCurto}</span>
                    {o.temFilhos && comSubnucleos && (
                      <span className="shrink-0 text-[10px] text-muted-foreground">(com subnúcleos)</span>
                    )}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/* ───────────────────────── supervisor / coordenador ───────────────────────── */

export function LiderancaPicker({
  papel, valor, valorNome, onChange, ro, className, permiteCriar = true, rotuloVazio,
}: {
  papel: "supervisor" | "coordenador";
  valor: string | null;
  valorNome?: string | null;
  onChange: (id: string | null, nome: string) => void;
  ro?: boolean;
  className?: string;
  permiteCriar?: boolean;
  /** texto de "nenhum escolhido" — em filtro é "Todos os supervisores" */
  rotuloVazio?: string;
}) {
  const vazio = rotuloVazio ?? (papel === "supervisor" ? "Sem supervisor" : "Sem coordenador");
  const [aberto, setAberto] = useState(false);
  const [lista, setLista] = useState<DpLideranca[]>([]);
  const [busca, setBusca] = useState("");
  const [criando, setCriando] = useState(false);

  const carregar = useCallback(() => {
    dpApi.liderancas(papel, true).then(setLista).catch(() => undefined);
  }, [papel]);
  useEffect(() => { if (aberto) carregar(); }, [aberto, carregar]);

  const atual = lista.find((l) => l.id === valor);
  const nome = atual?.nome ?? valorNome ?? "";
  const jaExiste = lista.some((l) => l.nome.toLowerCase() === busca.trim().toLowerCase());

  const criar = async () => {
    const novo = busca.trim();
    if (!novo) return;
    setCriando(true);
    try {
      const l = await dpApi.criarLideranca({
        nome: novo, e_supervisor: papel === "supervisor", e_coordenador: papel === "coordenador",
      });
      toast.success(`${novo} cadastrado(a) como ${papel}.`);
      setLista((s) => [...s, l].sort((a, b) => a.nome.localeCompare(b.nome)));
      onChange(l.id, l.nome);
      setAberto(false);
      setBusca("");
    } catch (e: any) { toast.error(e.message); }
    finally { setCriando(false); }
  };

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild disabled={ro}>
        <Button variant="outline" role="combobox" disabled={ro}
                className={cn("h-9 w-full justify-between px-3 text-left text-sm font-normal", className)}>
          <span className={cn("truncate", !nome && "text-muted-foreground")}>{nome || vazio}</span>
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command filter={(v, s) => (v.toLowerCase().includes(s.toLowerCase()) ? 1 : 0)}>
          <CommandInput placeholder={`Buscar ${papel}…`} className="h-9"
                        value={busca} onValueChange={setBusca} />
          <CommandList className="max-h-64">
            <CommandEmpty className="p-2">
              {permiteCriar && busca.trim() ? (
                <button onClick={criar} disabled={criando}
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted">
                  {criando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Cadastrar <b>{busca.trim()}</b> como {papel}
                </button>
              ) : (
                <p className="py-3 text-center text-xs text-muted-foreground">Nada encontrado.</p>
              )}
            </CommandEmpty>
            <CommandGroup>
              <CommandItem value="__vazio__ sem nenhum"
                           onSelect={() => { onChange(null, ""); setAberto(false); }}>
                <X className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">{vazio}</span>
              </CommandItem>
              {lista.map((l) => (
                <CommandItem key={l.id} value={l.nome}
                             onSelect={() => { onChange(l.id, l.nome); setAberto(false); }}>
                  <Check className={cn("mr-2 h-3.5 w-3.5", valor === l.id ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{l.nome}</span>
                  {l.centro_custo_nome && (
                    <span className="ml-auto shrink-0 pl-2 text-[10px] text-muted-foreground">
                      {l.centro_custo_nome}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
            {permiteCriar && busca.trim() && !jaExiste && lista.length > 0 && (
              <div className="border-t p-1">
                <button onClick={criar} disabled={criando}
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted">
                  {criando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Cadastrar <b>{busca.trim()}</b>
                </button>
              </div>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/* ───────────────────────── busca de colaborador ───────────────────────── */

export function ColaboradorPicker({
  opcoes, valor, onChange, placeholder = "Todos os colaboradores", className,
}: {
  opcoes: { id: string; nome: string }[];
  valor: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const atual = opcoes.find((o) => o.id === valor);
  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox"
                className={cn("h-9 justify-between px-3 text-left text-sm font-normal", className)}>
          <span className={cn("truncate", !atual && "text-muted-foreground")}>
            {atual?.nome ?? placeholder}
          </span>
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command filter={(v, s) => (v.toLowerCase().includes(s.toLowerCase()) ? 1 : 0)}>
          <CommandInput placeholder="Buscar colaborador…" className="h-9" />
          <CommandList className="max-h-64">
            <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">
              Ninguém encontrado.
            </CommandEmpty>
            <CommandGroup>
              <CommandItem value="__todos__ todos" onSelect={() => { onChange(null); setAberto(false); }}>
                <Check className={cn("mr-2 h-3.5 w-3.5", !valor ? "opacity-100" : "opacity-0")} />
                {placeholder}
              </CommandItem>
              {opcoes.map((o) => (
                <CommandItem key={o.id} value={o.nome}
                             onSelect={() => { onChange(o.id); setAberto(false); }}>
                  <Check className={cn("mr-2 h-3.5 w-3.5", valor === o.id ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{o.nome}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}


/** Equipe da Estrutura de Faturamento — searchable, como todo catálogo da casa. */
export function EquipePicker({ valor, onChange, ro, className }: {
  valor: string | null | undefined;
  onChange: (id: string | null) => void;
  ro?: boolean;
  className?: string;
}) {
  const [equipes, setEquipes] = useState<{ id: string; nome: string; grupo: string }[]>([]);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    estruturaApi.equipes()
      .then((es) => setEquipes(es.map((e: any) => ({
        id: e.id, nome: e.nome ?? e.equipe ?? "—", grupo: e.grupo ?? "",
      }))))
      .catch(() => setEquipes([]));
  }, []);

  const atual = equipes.find((e) => e.id === valor);
  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild disabled={ro}>
        <Button variant="outline" role="combobox" disabled={ro}
                className={cn("h-9 w-full justify-between px-3 text-left text-sm font-normal", className)}>
          <span className={cn("truncate", !atual && "text-muted-foreground")}>
            {atual ? atual.nome : "Sem equipe"}
          </span>
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar equipe…" className="h-9" />
          <CommandList>
            <CommandEmpty>Nenhuma equipe encontrada.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="sem-equipe"
                           onSelect={() => { onChange(null); setAberto(false); }}>
                <span className="text-muted-foreground">Sem equipe</span>
              </CommandItem>
              {equipes.map((e) => (
                <CommandItem key={e.id} value={`${e.nome} ${e.grupo}`}
                             onSelect={() => { onChange(e.id); setAberto(false); }}>
                  <span className="flex-1 truncate">{e.nome}</span>
                  {e.grupo && (
                    <span className="ml-2 shrink-0 text-[0.65rem] text-muted-foreground">{e.grupo}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
