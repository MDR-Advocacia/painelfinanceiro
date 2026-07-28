# Módulo Controle de Pessoal (DP) — Estudo, Benchmark e Blueprint

**Status:** estudo aprovado pra discussão (2026-07-28). Fonte: `Controle de Pessoal DP - CC.xlsx`
(21 abas, ~200+ colaboradores) + benchmark de mercado. Nada implementado ainda.

---

## 1. O que a planilha faz hoje (dissecação completa)

### Inventário das 21 abas

| Aba | Papel | Observações |
|---|---|---|
| `TB_Cargos` (oculta) | Tabela salarial por cargo (área, salário base, dias/mês=30, carga 220h, valor dia/hora) | é o "plano de cargos" |
| `CONFIG` (oculta) | Catálogos: áreas (ADM/TI/JUR/DIR), CCs + códigos, cargos, supervisores, unidades (Capim Macio/Manhattan), tipos (Associado/CLT/Estagiário TCE/PJ), status, bancos | vira tabelas de domínio |
| `TABELA INSS` (oculta) | Faixas progressivas c/ parcela a deduzir | bate com a oficial 2026 (1.621 / 2.902,84 / 4.354,27 / teto 8.475,55) |
| `TB_Colaboradores` | Quadro de pessoal (25 cols): matrícula, CPF, unidade, área, CC, supervisor, equipe, cargo, status, tipo, datas, salário, VT/VA, contas bancárias/PIX | **Matrícula por regime: 10xx Estagiário · 20xx CLT · 30xx Associado · 40xx PJ** |
| `Desligados` | Offboarding com verbas: dias trabalhados, aviso indenizado, férias + proporcionais + 1/3, horas extras, multa FGTS, premiações | |
| `Jan..Dez` (12 abas) | **Folha mensal** (~2.100 linhas × 35 cols cada): faltas (dias/horas) → descontos → subtotais → provisões → custo total | motor de cálculo |
| `BD` (oculta) | Base flat consolidando as 12 abas mensais (append) | vira o histórico do banco |
| `BD - DASH` (oculta) | Série mensal por regime: headcount, admissões, desligamentos, turnover, custo, provisões, FGTS acumulado, multa acumulada, **INSS patronal (21%)** | |
| `CC` | Matriz Centro de Custo × Cargo (headcount) + custos por CC do mês | o rateio |
| `DASH` | KPIs: headcount ativo (170), admissões, desligamentos, turnover, custo total mensal (~R$ 243k), provisões acumuladas | |

### Regras de negócio extraídas das FÓRMULAS (mês Jul)

- **Desc. faltas** = `(salário/30)·faltas_dias + (salário/220)·faltas_horas`
- **VT com faltas** = `VT − (VT/dias_úteis)·faltas_de_MAIO` ⚠ (Jul referencia `Mai!` — defasagem de 2 meses; confirmar se é regra intencional do vale ou bug de cópia)
- **Desc. VT** = `6% do salário c/ faltas`, **só CLT** (limite legal ✓)
- **INSS** = progressivo c/ parcela a deduzir (array formula) — ⚠ **BUG ENCONTRADO**: salário 1.000 gera desconto 65,68 (= 1.000×9% − 24,32, faixa 2) quando o correto é **75,00** (faixa 1, 7,5%). O lookup pega a faixa errada.
- **Provisões (só CLT)**: 13º mensal = férias mensal = `(bruto − INSS)/12` ⚠ (mercado provisiona sobre o BRUTO: 13º = bruto/12; férias = (bruto+1/3)/12 — decidir se corrige na migração); 1/3 férias = férias/3; FGTS = 8%; multa FGTS provisionada = 40% do FGTS
- **Estagiário (TCE)**: sem INSS/FGTS/13º/férias; **recesso mensal = bruto/12**; VT sim, VA não
- **Associado**: sem encargos; tem "Saldo Livre" (parcela extra fixa)
- **PJ**: valor cheio, sem encargos
- **INSS patronal** (BD-DASH) = 21% sobre custo CLT
- **Fluxo mensal**: `TOTAL a pagar` (folha) separado de `Custo Total Mensal` (provisões) — o rateio por CC soma os dois

### Problemas do Excel que o sistema resolve

1. Bug silencioso no INSS (achado acima) — fórmula quebrada ninguém percebe.
2. Referência cruzada frágil entre abas (`Jul` → `Mai!L4`).
3. Sem histórico de alteração (quem mudou o salário? quando?).
4. Mono-usuário na prática (conflito de versão).
5. Tabela INSS fixa — vigências de anos anteriores se perdem a cada atualização.
6. Consolidação (BD) por fórmula viva: qualquer mexida retroativa MUDA o passado fechado.

---

## 2. Benchmark de mercado

**BR (Convenia, Factorial, Sesame HR):** plataformas de DP com admissão/desligamento digital
(wizard + checklist de documentos), ficha do colaborador centralizada, férias e folha integradas,
adaptação à CLT. Convenia é o espelho mais próximo do nosso caso (DP de PME, foco em processos).

**Internacionais (Rippling, Gusto):** o diferencial do Rippling é **relatório custom cruzando
qualquer dimensão** (custo por departamento/centro de custo/localidade em minutos) — é o que o
nosso rateio por CC precisa. Gusto peca por relatório rígido — anti-modelo.

**Padrões de UX que valem copiar:**
- **Ficha do colaborador** com abas (dados, contrato, remuneração, histórico de eventos).
- **Admissão/desligamento como WIZARD** com checklist e efeitos automáticos (desligar → sai da folha seguinte + calcula verbas rescisórias).
- **Fechamento mensal como CHECKLIST/ESTEIRA**: abrir competência → lançar ocorrências → prévia → revisão → **fechar (trava)**. Reabertura só com justificativa e log.
- **Audit trail imutável** em toda escrita (quem/quando/antes→depois) — padrão de mercado em folha.
- **Snapshot da competência fechada**: o mês fechado NUNCA muda por efeito colateral.

**Contábil (validação das regras):**
- Tabela INSS 2026 oficial confirmada (a da planilha está correta; o bug é só no lookup).
- Provisão de mercado: 13º = 1/12 do bruto; férias = (bruto + 1/3)/12; encargos patronais (INSS 20%+RAT, FGTS 8%) incidem TAMBÉM sobre as provisões. A planilha desvia disso (provisiona sobre bruto−INSS) — decidir com o DP/contador.

---

## 3. Blueprint do módulo "Pessoal" no Painel Financeiro

### Modelo de dados (tabelas `dp_*`, PostgreSQL/SQLite via Django)

| Tabela | Conteúdo |
|---|---|
| `dp_colaborador` | ficha completa (matrícula gerada por regime 10xx/20xx/30xx/40xx, CPF, unidade, área, CC, supervisor, equipe, cargo, regime, status, datas, remuneração, VT/VA, dados bancários) |
| `dp_cargo` | plano de cargos (salário base, dias, carga horária) — versionado por vigência |
| `dp_centro_custo` | catálogo de CCs com código (1=ADM … 9=Ativos) e vínculo com os setores do painel |
| `dp_evento` | **event log** de RH: admissão, desligamento, transferência de CC, reajuste, mudança de regime — cada um com data-efeito, autor e payload (é daqui que headcount/turnover saem) |
| `dp_competencia` | o mês: status `aberta → em_revisao → fechada`, quem abriu/fechou, quando |
| `dp_lancamento` | ocorrências do mês por colaborador: faltas (dias/horas), premiações, acertos contábeis, obs |
| `dp_folha_item` | linha calculada da folha (todas as 35 colunas da planilha) — **recalculável enquanto aberta, congelada no fechamento** |
| `dp_tabela_fiscal` | INSS (faixas+dedução), VT %, FGTS %, patronal % — **versionadas por vigência** (jan/2026, jan/2027…) |
| `dp_audit_log` | imutável: usuário, timestamp, ação, entidade, antes→depois (JSON). TODA escrita loga |
| `dp_rescisao` | verbas do desligamento (espelho da aba Desligados) |

### Motor de cálculo (server-side, determinístico)

Pipeline por colaborador×competência, espelhando a planilha COM as correções:
faltas → salário c/ faltas → INSS (progressivo correto, tabela da vigência) → VT 6% (CLT) →
descontos → total a pagar → provisões por regime (13º, férias+1/3, FGTS 8%, multa 40%,
recesso estagiário, patronal 21% configurável) → custo total → agregação por CC.
Cada número de saída guarda a **memória de cálculo** (JSON com as parcelas) — clicou no valor, vê a conta.

### Fluxos

1. **Admissão (wizard)**: dados → regime define máscara de matrícula → CC/supervisor → remuneração → entra na próxima competência aberta. Gera `dp_evento`.
2. **Desligamento (wizard)**: data + verbas rescisórias → marca inativo → sai das competências seguintes → aba Desligados vira relatório.
3. **Fechamento mensal (esteira com checklist)**:
   `Abrir competência` (importa quadro ativo) → `Lançar ocorrências` (faltas/premiações, em lote ou por pessoa) → `Prévia da folha` (grid com filtros por CC/regime + comparativo vs mês anterior destacando variações) → `Enviar pra revisão` → **segundo usuário aprova** (padrão 4-olhos) → `Fechar` (snapshot + trava). Reabrir exige justificativa (fica no log).
4. **Relatórios (todos com a logo MDR, PDF e Excel)**: Folha analítica da competência; **Rateio por Centro de Custo** (o fechamento mensal do financeiro); Provisões acumuladas; Headcount/Turnover; Ficha do colaborador. Gerador server-side (openpyxl p/ Excel + WeasyPrint/reportlab p/ PDF com cabeçalho timbrado).

### Telas

- **Quadro de Pessoal**: lista com busca/filtros (regime, CC, unidade, status) + ficha em drawer/página com histórico de eventos.
- **Centros de Custo**: matriz CC × cargo (headcount) + custo por CC, com drill-down.
- **Competência**: a esteira de fechamento (checklist no topo, grid da folha embaixo).
- **Dashboard DP**: KPIs (headcount ativo, admissões, desligamentos, turnover, custo total, provisões acumuladas) + série mensal — espelho da DASH atual.
- **Configurações DP**: plano de cargos, catálogo de CCs, tabelas fiscais por vigência.

### RBAC e auditoria (aproveita o que já construímos)

- Novo módulo `pessoal` na tabela `MODULOS` — cargo **Departamento Pessoal** já existe.
- **Evolução do RBAC: permissão em 2 níveis por módulo — `ver` | `editar`** (o pedido do
  multi-usuário: "outros autorizados só visualização"). A tabela Cargos×Módulos ganha um
  seletor tri-state (Nada / Ver / Editar) em vez de checkbox.
- Enforcement no backend (mesma `modulo_permission`, agora sensível a método+nível).
- `dp_audit_log` + snapshot de fechamento respondem o requisito "LOGs de tudo".

### Migração (sem big-bang)

1. **Importador da planilha real**: lê `TB_Colaboradores`, `Desligados`, `CONFIG`, `TB_Cargos`, abas mensais → povoa o banco com o histórico 2026 inteiro.
2. **Rodada paralela (1–2 meses)**: DP fecha no Excel E no sistema; tela de **diff automático** planilha×sistema aponta divergências (já sabemos que INSS vai divergir — divergência BOA).
3. Corte: planilha vira somente-leitura de arquivo.

### Roadmap por fases

| Fase | Entrega | Valor |
|---|---|---|
| **F1** | Cadastro: colaboradores + cargos + CCs + eventos + importador da planilha + RBAC ver/editar | mata o risco de cadastro e dá multi-usuário já |
| **F2** | Competência + lançamentos + motor de cálculo + prévia da folha | mata as 12 abas mensais |
| **F3** | Fechamento com aprovação 4-olhos + snapshot + audit log completo | segurança/fechamento |
| **F4** | Dashboard DP + rateio por CC + relatórios PDF/Excel timbrados | mata DASH/CC/BD |
| **F5** | Rodada paralela + diff + corte do Excel; integração com o dashboard financeiro (custo pessoal real por setor alimentando o painel) | ciclo completo |

---

## 4. Perguntas pro DP antes da F1

1. **INSS divergente** (65,68 vs 75,00 no exemplo): confirmar que a fórmula da planilha está errada e que o sistema deve usar a progressiva oficial.
2. **VT com faltas de 2 meses atrás** (`Jul` olha `Mai`): regra intencional (compra antecipada de VT) ou bug? Qual a defasagem correta?
3. **Provisão sobre bruto−INSS** (planilha) vs sobre bruto + encargos patronais (padrão contábil): qual adotar? (impacta o custo por CC)
4. Salários reais: a planilha compartilhada veio com valores uniformes (R$ 1.000) — o importador vai ler os reais da planilha de produção.
5. "Acerto Contábil" e "Saldo Livre": significado exato e quem pode lançar.
6. Férias: hoje não há controle de GOZO de férias (só provisão). Entra no escopo (F2+) ou fica pra depois?
