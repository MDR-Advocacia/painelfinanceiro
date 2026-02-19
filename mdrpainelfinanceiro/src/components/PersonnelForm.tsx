import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useApp } from "@/contexts/AppContext";
import { NumberField } from "@/components/NumberField";
import { calcCustoGrupo, formatCurrency } from "@/utils/calculations";
import type { Estagiarios, PersonnelGroup, TipoCargo } from "@/types/sector";
import { CARGO_LABELS } from "@/types/sector";
import { Users, GraduationCap, Briefcase, ShieldCheck, Crown, Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";

function getIcon(key: string): React.ElementType {
  if (key.startsWith('estagiario')) return GraduationCap;
  if (key.startsWith('assistente')) return Briefcase;
  if (key.startsWith('advogado')) return Users;
  if (key.startsWith('supervisor')) return ShieldCheck;
  if (key.startsWith('auxiliar')) return Briefcase;
  if (key === 'coordenador' || key === 'coordenadorOperacional') return Crown;
  return Users;
}

function isEstagiario(g: any): g is Estagiarios {
  return 'bolsa' in g;
}

function makeKey(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '_')
    .toLowerCase()
    + '_' + Date.now().toString(36);
}

export function PersonnelForm() {
  const { activeSetor, activePeriodoData, updatePeriodoData, periodoAtivo } = useApp();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newCargoName, setNewCargoName] = useState("");
  const [newCargoTipo, setNewCargoTipo] = useState<TipoCargo>("clt");
  const [collapsedCards, setCollapsedCards] = useState<Record<string, boolean>>({});

  if (!activeSetor || !activePeriodoData) return null;

  const pessoal = activePeriodoData.pessoal as Record<string, PersonnelGroup | Estagiarios>;

  const update = (cargoKey: string, field: string, value: number) => {
    updatePeriodoData(activeSetor.id, periodoAtivo, {
      pessoal: {
        ...activePeriodoData.pessoal,
        [cargoKey]: { ...(pessoal[cargoKey] as any), [field]: value },
      } as any,
    });
  };

  const addCargo = () => {
    if (!newCargoName.trim()) return;
    const key = makeKey(newCargoName);
    const newGroup: PersonnelGroup | Estagiarios = newCargoTipo === 'estagiario'
      ? { quantidade: 0, salarioBase: 0, auxilioAlimentacao: 0, auxilioTransporte: 0, wellhub: 0, plr: 0, multiplicadorEncargos: 1.0, bolsa: 0, taxaIntegracao: 70 }
      : { quantidade: 0, salarioBase: 0, auxilioAlimentacao: 0, auxilioTransporte: 0, wellhub: 0, plr: 0, multiplicadorEncargos: 1.6 };

    // Add label to CARGO_LABELS
    CARGO_LABELS[key] = newCargoName.trim();

    updatePeriodoData(activeSetor.id, periodoAtivo, {
      pessoal: {
        ...activePeriodoData.pessoal,
        [key]: newGroup,
      } as any,
    });
    setNewCargoName("");
    setNewCargoTipo("clt");
    setDialogOpen(false);
  };

  const removeCargo = (key: string) => {
    const newPessoal = { ...pessoal };
    delete newPessoal[key];
    updatePeriodoData(activeSetor.id, periodoAtivo, {
      pessoal: newPessoal as any,
    });
  };

  const toggleCollapsed = (key: string) => {
    setCollapsedCards(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="space-y-4">
      {Object.entries(pessoal).map(([key, grupo]) => {
        const Icon = getIcon(key);
        const label = CARGO_LABELS[key] || key;
        const custo = calcCustoGrupo(grupo);
        const est = isEstagiario(grupo);
        const isCollapsed = collapsedCards[key] ?? false;

        return (
          <Collapsible key={key} open={!isCollapsed} onOpenChange={() => toggleCollapsed(key)}>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-heading flex items-center gap-2">
                  <Icon className="w-4 h-4 text-primary" />
                  {label}
                  <span className="ml-auto font-mono text-xs text-muted-foreground">
                    Total: {formatCurrency(custo)}/mês
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeCargo(key); }}
                    className="p-1 rounded hover:bg-destructive/20 text-muted-foreground/40 hover:text-destructive transition-all"
                    title="Remover cargo"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <CollapsibleTrigger asChild>
                    <button className="p-1 rounded hover:bg-muted text-muted-foreground/60 transition-all">
                      {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                    </button>
                  </CollapsibleTrigger>
                </CardTitle>
              </CardHeader>
              <CollapsibleContent>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <NumberField
                      label="Quantidade"
                      value={grupo.quantidade}
                      onChange={v => update(key, 'quantidade', v)}
                      prefix=""
                      tooltip={`Número de ${label.toLowerCase()} no setor`}
                    />
                    {est ? (
                      <>
                        <NumberField label="Bolsa Mensal" value={grupo.bolsa} onChange={v => update(key, 'bolsa', v)} tooltip="Valor da bolsa estágio" />
                        <NumberField label="Taxa Integração" value={grupo.taxaIntegracao} onChange={v => update(key, 'taxaIntegracao', v)} tooltip="R$ 70,00 por estagiário (padrão)" />
                      </>
                    ) : (
                      <>
                        <NumberField label="Salário Base" value={grupo.salarioBase} onChange={v => update(key, 'salarioBase', v)} tooltip="Salário mensal" />
                        <NumberField label="Multiplicador Encargos" value={(grupo as PersonnelGroup).multiplicadorEncargos} onChange={v => update(key, 'multiplicadorEncargos', v)} prefix="" tooltip="Fator multiplicador dos encargos CLT sobre o salário base (ex: 1,6)" />
                      </>
                    )}
                    <NumberField label="Aux. Alimentação" value={grupo.auxilioAlimentacao} onChange={v => update(key, 'auxilioAlimentacao', v)} />
                    <NumberField label="Aux. Transporte" value={grupo.auxilioTransporte} onChange={v => update(key, 'auxilioTransporte', v)} />
                    <NumberField label="Wellhub" value={grupo.wellhub} onChange={v => update(key, 'wellhub', v)} />
                    <NumberField label="PLR (Anual)" value={grupo.plr ?? 0} onChange={v => update(key, 'plr', v)} tooltip="Participação nos Lucros e Resultados anual — rateada em 12 meses no cálculo" />
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        );
      })}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" className="w-full gap-2 border-dashed">
            <Plus className="w-4 h-4" /> Adicionar Cargo
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Cargo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <Input
              placeholder="Nome do cargo (ex: Analista Jurídico)"
              value={newCargoName}
              onChange={(e) => setNewCargoName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addCargo()}
              autoFocus
            />
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Tipo de Vínculo</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setNewCargoTipo('clt')}
                  className={`flex items-center gap-2 p-3 rounded-lg border text-sm transition-colors ${
                    newCargoTipo === 'clt' ? 'border-primary bg-primary/5 text-primary font-medium' : 'border-border text-muted-foreground hover:border-primary/50'
                  }`}
                >
                  <Briefcase className="w-4 h-4" /> CLT
                </button>
                <button
                  onClick={() => setNewCargoTipo('estagiario')}
                  className={`flex items-center gap-2 p-3 rounded-lg border text-sm transition-colors ${
                    newCargoTipo === 'estagiario' ? 'border-primary bg-primary/5 text-primary font-medium' : 'border-border text-muted-foreground hover:border-primary/50'
                  }`}
                >
                  <GraduationCap className="w-4 h-4" /> Estagiário
                </button>
              </div>
            </div>
            <Button onClick={addCargo} className="w-full">Adicionar Cargo</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
