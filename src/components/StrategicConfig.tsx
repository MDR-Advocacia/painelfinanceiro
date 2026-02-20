import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { NumberField } from "@/components/NumberField";
import { PeriodSelector } from "@/components/PeriodSelector";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Target, Calendar, Calculator, Save, Plus, Trash2, Building, Users, Receipt } from "lucide-react";
import { formatCurrency } from "@/utils/calculations";

// Tipagem local para os itens dinâmicos
interface CustoDinamico {
  id: string;
  nome: string;
  valor: number;
}

export function StrategicConfig() {
  const { periodoAtivo, setPeriodoAtivo, currentVpdValor, updateVpdValor } = useApp();

  // 1. DESPESAS BASE (Dinâmicas)
  const [despesasBase, setDespesasBase] = useState<CustoDinamico[]>([
    { id: '1', nome: 'Total para Planejamento Financeiro', valor: 374054.80 },
    { id: '2', nome: 'Provisão Mensal de Impostos', valor: 0.00 },
  ]);

  // 2. PESSOAL DE APOIO (Dinâmico)
  const [pessoalApoio, setPessoalApoio] = useState<CustoDinamico[]>([
    { id: '3', nome: 'Total Pessoal ADM, DP, RH, TI, Marketing, Recepção, ASG', valor: 46330.00 },
  ]);

  // 3. HEADCOUNT
  const [headcountGlobal, setHeadcountGlobal] = useState(170);

  // --- MOTOR DE CÁLCULO ---
  const totalDespesasBase = despesasBase.reduce((acc, curr) => acc + curr.valor, 0);
  const totalApoio = pessoalApoio.reduce((acc, curr) => acc + curr.valor, 0);
  const totalGeral = totalDespesasBase + totalApoio;

  const valorBasePorFuncionario = headcountGlobal > 0 ? totalDespesasBase / headcountGlobal : 0;
  const vpdCalculado = headcountGlobal > 0 ? totalGeral / headcountGlobal : 0;

  // --- FUNÇÕES DE MANIPULAÇÃO DAS LISTAS ---
  const addDespesa = (tipo: 'base' | 'apoio') => {
    const novoItem = { id: crypto.randomUUID(), nome: 'Nova Despesa', valor: 0 };
    if (tipo === 'base') setDespesasBase([...despesasBase, novoItem]);
    else setPessoalApoio([...pessoalApoio, novoItem]);
  };

  const removeDespesa = (tipo: 'base' | 'apoio', id: string) => {
    if (tipo === 'base') setDespesasBase(despesasBase.filter(d => d.id !== id));
    else setPessoalApoio(pessoalApoio.filter(d => d.id !== id));
  };

  const updateDespesa = (tipo: 'base' | 'apoio', id: string, campo: 'nome' | 'valor', novoValor: any) => {
    const atualizarLista = (lista: CustoDinamico[]) => lista.map(item => 
      item.id === id ? { ...item, [campo]: novoValor } : item
    );
    if (tipo === 'base') setDespesasBase(atualizarLista(despesasBase));
    else setPessoalApoio(atualizarLista(pessoalApoio));
  };

  const handleAplicarVpd = () => {
    updateVpdValor(periodoAtivo, vpdCalculado);
  };

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-heading text-2xl font-bold text-foreground">Construtor Estratégico de VPD</h2>
          <p className="text-sm text-muted-foreground mt-1">Configure detalhadamente as variáveis de despesa do escritório.</p>
        </div>
        <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-1.5 border border-border">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <PeriodSelector value={periodoAtivo} onChange={setPeriodoAtivo} />
        </div>
      </div>

      <div className="grid lg:grid-cols-12 gap-6">
        {/* COLUNA ESQUERDA: O Construtor (Inputs Dinâmicos) */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Seção 1: Despesas Base */}
          <Card className="border-primary/20 shadow-sm">
            <CardHeader className="bg-muted/30 border-b pb-4 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base"><Building className="w-4 h-4 text-primary"/> 1. Despesas Base</CardTitle>
                <CardDescription>Custos operacionais e provisões.</CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={() => addDespesa('base')} className="gap-2">
                <Plus className="w-3 h-3" /> Adicionar
              </Button>
            </CardHeader>
            <CardContent className="pt-4 space-y-3">
              {despesasBase.map((item) => (
                <div key={item.id} className="flex gap-2 items-start">
                  <div className="flex-1">
                    <Input 
                      value={item.nome} 
                      onChange={(e) => updateDespesa('base', item.id, 'nome', e.target.value)}
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="w-40">
                    <NumberField 
                      value={item.valor} 
                      onChange={(v) => updateDespesa('base', item.id, 'valor', v)}
                    />
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeDespesa('base', item.id)} className="h-9 w-9 text-destructive hover:bg-destructive/10 shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Seção 2: Pessoal de Apoio */}
          <Card className="border-primary/20 shadow-sm">
            <CardHeader className="bg-muted/30 border-b pb-4 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base"><Users className="w-4 h-4 text-primary"/> 2. Pessoal de Apoio (Backoffice)</CardTitle>
                <CardDescription>Custo com equipes não-faturáveis.</CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={() => addDespesa('apoio')} className="gap-2">
                <Plus className="w-3 h-3" /> Adicionar
              </Button>
            </CardHeader>
            <CardContent className="pt-4 space-y-3">
              {pessoalApoio.map((item) => (
                <div key={item.id} className="flex gap-2 items-start">
                  <div className="flex-1">
                    <Input 
                      value={item.nome} 
                      onChange={(e) => updateDespesa('apoio', item.id, 'nome', e.target.value)}
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="w-40">
                    <NumberField 
                      value={item.valor} 
                      onChange={(v) => updateDespesa('apoio', item.id, 'valor', v)}
                    />
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeDespesa('apoio', item.id)} className="h-9 w-9 text-destructive hover:bg-destructive/10 shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Seção 3: Headcount */}
          <Card className="border-primary/20 shadow-sm">
            <CardContent className="pt-6 flex items-center justify-between gap-4">
              <div className="flex-1">
                <h3 className="font-semibold text-sm flex items-center gap-2"><Target className="w-4 h-4 text-primary"/> Previsão de Colaboradores</h3>
                <p className="text-xs text-muted-foreground">Divisor para encontrar o valor por pessoa.</p>
              </div>
              <div className="w-40">
                <NumberField value={headcountGlobal} onChange={setHeadcountGlobal} />
              </div>
            </CardContent>
          </Card>

        </div>

        {/* COLUNA DIREITA: O Recibo / Resumo Analítico */}
        <div className="lg:col-span-5">
          <Card className="bg-sidebar border-sidebar-border shadow-xl sticky top-6">
            <CardHeader className="border-b border-sidebar-border/50 pb-4">
              <CardTitle className="text-sidebar-foreground flex items-center gap-2">
                <Receipt className="w-5 h-5 text-primary"/> Memória de Cálculo
              </CardTitle>
              <CardDescription className="text-sidebar-foreground/70">
                Resumo analítico para o período de {periodoAtivo}
              </CardDescription>
            </CardHeader>
            
            <CardContent className="pt-6 space-y-5">
              
              {/* Espelho exato da Tabela do Documento */}
              <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center text-sidebar-foreground/80">
                  <span>1. Despesas Base</span>
                  <span className="font-mono">{formatCurrency(totalDespesasBase)}</span>
                </div>
                
                <div className="flex justify-between items-center text-sidebar-foreground/80 border-b border-sidebar-border/50 pb-3">
                  <span>+ Pessoal Apoio</span>
                  <span className="font-mono">{formatCurrency(totalApoio)}</span>
                </div>

                <div className="flex justify-between items-center text-sidebar-foreground font-semibold pt-1">
                  <span>2. Total Despesas (Base + Apoio)</span>
                  <span className="font-mono text-primary">{formatCurrency(totalGeral)}</span>
                </div>
              </div>

              <div className="bg-background/5 p-4 rounded-lg border border-sidebar-border/50 space-y-4 mt-6">
                
                <div className="flex justify-between items-center text-sm">
                  <span className="text-sidebar-foreground/70">1. Valor Base por Funcionário</span>
                  <span className="font-mono text-sidebar-foreground">{formatCurrency(valorBasePorFuncionario)}</span>
                </div>

                <div className="flex justify-between items-center text-sm">
                  <span className="text-sidebar-foreground/70">Divisor (Headcount)</span>
                  <span className="font-mono text-sidebar-foreground">{headcountGlobal} colab.</span>
                </div>

                <div className="border-t border-sidebar-border pt-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/50 text-center mb-1">
                    2. Valor Padrão de Despesas - VPD
                  </p>
                  <p className="text-4xl font-mono font-black text-primary tracking-tighter text-center">
                    {formatCurrency(vpdCalculado)}
                  </p>
                </div>
              </div>

              <div className="pt-4 space-y-3">
                <div className="flex justify-between items-center text-xs px-2 mb-2">
                  <span className="text-sidebar-foreground/60">VPD Salvo Atual:</span>
                  <span className="font-mono font-bold text-sidebar-foreground">{formatCurrency(currentVpdValor)}</span>
                </div>
                
                <Button 
                  onClick={handleAplicarVpd} 
                  className="w-full gap-2 font-bold py-6 text-base shadow-lg hover:scale-[1.02] transition-transform"
                  disabled={currentVpdValor === vpdCalculado}
                >
                  <Save className="w-5 h-5" />
                  {currentVpdValor === vpdCalculado ? "VPD Atualizado" : "Salvar VPD no Período"}
                </Button>
              </div>

            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}