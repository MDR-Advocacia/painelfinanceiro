# Controle de Férias — benchmark e proposta de desenho

> Estudo pedido em 28/07/2026 para responder: vale a pena sinalizar férias no
> módulo? E, se vale, **como** controlar sem virar outra planilha paralela.

---

## 1. Por que isso importa (e por que é diferente de "marcar no calendário")

Férias não é só ausência: é **direito com prazo de validade e multa**. Três
consequências práticas para o escritório:

1. **Risco financeiro real.** Se o colaborador não sai em férias dentro do
   período concessivo, a empresa paga **em dobro** (CLT art. 137). Um CLT de
   R$ 3.000 que estoura o prazo custa ~R$ 8.000 em vez de ~R$ 4.000 — e ninguém
   percebe até o passivo aparecer.
2. **Passivo contábil que já provisionamos.** O motor da folha já provisiona
   férias + 1/3 todo mês. Hoje esse número **só cresce**: não temos o evento de
   "saiu de férias" para dar baixa. O saldo provisionado é, na prática, uma
   estimativa que nunca se realiza no sistema.
3. **Operação da equipe.** Supervisor precisa saber quem sai, quando, e se dois
   da mesma equipe pediram o mesmo mês. Hoje isso vive no WhatsApp.

**Resposta curta: sim, vale muito.** É o maior buraco que sobrou do módulo — e o
único que tem multa associada.

---

## 2. As regras que o sistema precisa conhecer

### 2.1 CLT (Consolidação das Leis do Trabalho)

| Conceito | Regra | Impacto no sistema |
|---|---|---|
| **Período aquisitivo** | 12 meses de trabalho geram 30 dias de férias | Um período por ano por colaborador, aberto na admissão |
| **Período concessivo** | Os 12 meses SEGUINTES para gozar | É daqui que sai o alarme; vencido = dobra |
| **Fracionamento** (reforma de 2017) | Até **3 períodos**; um deles ≥ 14 dias; os outros ≥ 5 dias | Um período aquisitivo tem N agendamentos |
| **Início** | Não pode começar 2 dias antes de feriado nem no dia de descanso semanal | Validação na hora de agendar |
| **Aviso prévio de férias** | 30 dias de antecedência, por escrito | Alerta "avisar até tal dia" |
| **Abono pecuniário** ("vender") | Até **1/3** (10 dias), opcional do colaborador | Vira verba na folha, não vira ausência |
| **Pagamento** | Até **2 dias antes** do início | Alerta financeiro, não só de RH |
| **Faltas reduzem** | +6 a 14 faltas → 24 dias; 15 a 23 → 18; 24 a 32 → 12; >32 → perde | Cruza com as faltas que já lançamos |
| **Terço constitucional** | +1/3 sobre a remuneração das férias | Já está na provisão |
| **Férias coletivas** | Até 2 períodos/ano, mínimo 10 dias cada | Lançamento em lote por setor |

### 2.2 Estagiário — Lei 11.788/2008, art. 13

Não é "férias", é **recesso**: 30 dias a cada 12 meses de estágio,
**remunerado** (porque a bolsa é paga), preferencialmente nas férias escolares.
Estágio menor que 12 meses → recesso proporcional. **Sem 1/3, sem abono, sem
dobra.** O motor já provisiona 1/12 de recesso para estagiário.

### 2.3 Associado e PJ

Contrato civil, sem férias legais. Na prática o escritório precisa saber quando
a pessoa vai se ausentar (para redistribuir prazo e audiência), mas **sem verba
e sem provisão**. Trate como *ausência programada*, não como férias.

> **Isso é decisivo para nós:** dos 170 ativos, só 34 são CLT e 68 estagiários.
> Os 59 associados + 9 PJ entram no controle apenas como agenda.

---

## 3. Como o mercado resolve

Olhamos o padrão de cinco famílias de produto:

| Produto | O que faz bem | O que dá pra copiar |
|---|---|---|
| **Senior / TOTVS RM** (ERPs de folha) | Motor completo: aquisitivo, concessivo, dobra, coletivas, cálculo de recibo | O **modelo de dados** (aquisitivo × gozo) e o cálculo |
| **Sólides / Convenia** (RH PME) | Semáforo de vencimento + solicitação pelo colaborador com aprovação do gestor | O **fluxo de aprovação** e o painel de alertas |
| **Gupy / Feedz** | Calendário visual da equipe, conflito de agenda | A **visão de calendário por equipe** |
| **Factorial / BambooHR** (fora) | Saldo em dias sempre visível na ficha, self-service | O **saldo em destaque** na ficha |
| **Planilha do DP (hoje)** | Nada — não existe | — |

**O que praticamente todos têm e o mercado trata como obrigatório:**

1. **Semáforo por colaborador** — verde (dentro do prazo), amarelo (vence em
   ≤ 90 dias), vermelho (vencido/em dobra).
2. **Saldo de dias** visível na ficha, não escondido em relatório.
3. **Calendário/timeline da equipe** para o supervisor ver sobreposição.
4. **Recibo de férias** em PDF.
5. **Integração com a folha** do mês (o valor das férias sai junto).

**O que é mais raro (e diferencia):** projeção de custo — "quanto vai sair de
caixa em férias nos próximos 6 meses". Como já temos motor de projeção, sai
quase de graça e é exatamente a pergunta que a diretoria faz.

---

## 4. Proposta de desenho para o nosso módulo

### 4.1 Modelo de dados (duas tabelas, migration `dp0xx`)

```
DpPeriodoAquisitivo
  colaborador FK · inicio · fim · dias_direito (30, reduzido por faltas)
  dias_gozados · dias_vendidos · status (aberto/concluído/vencido)
  limite_concessivo (= fim + 12 meses)  ← a data que dispara tudo

DpFerias  (um agendamento; o período aquisitivo pode ter até 3)
  periodo FK · inicio · fim · dias · abono_dias
  status (programada → aprovada → em_gozo → concluída | cancelada)
  aprovada_por · pagamento_previsto · observacao
```

Um job diário abre o período aquisitivo de quem completou 12 meses e marca os
vencidos — nenhum cadastro manual para começar a funcionar.

### 4.2 Como sinalizar (a pergunta central)

Em **três lugares**, do mais discreto ao mais gritante:

1. **Selo na linha do Quadro** — 🟡 "Férias vencem em 62 dias", 🔴 "Férias
   VENCIDAS — risco de pagamento em dobro", 🔵 "Em férias até 12/08".
   Mesma linguagem visual dos selos que já usamos (rescisão, ajuste pontual).
2. **Bloco na ficha** — saldo de dias, período aquisitivo atual, histórico e o
   botão "Programar férias".
3. **Cartão no painel** — "3 pessoas com férias vencendo em 90 dias · 1
   vencida", clicável, abrindo o Quadro filtrado. Alerta crítico entra na
   mesma lista de alertas que já existe.

Mais uma tela nova: **calendário de férias** (mês/trimestre, uma faixa por
pessoa, agrupado por centro de custo) — é onde o supervisor vê que dois do BB
Acordo pediram agosto.

### 4.3 Integração com o que já existe

- **Folha**: férias programadas para o mês entram como linha própria
  (férias + 1/3 e, se houver, abono), do mesmo jeito que a rescisão passou a
  entrar. O período de gozo **não** vira falta.
- **Provisão**: sair de férias **dá baixa** na provisão acumulada — o número do
  painel passa a ser real, não só crescente.
- **Previsão**: nova série "desembolso de férias projetado" nos próximos 6
  meses, reusando o motor de projeção.
- **Auditoria**: programar, aprovar, cancelar e alterar entram na trilha, com o
  aprovador registrado (mesma lógica de 4 olhos do fechamento).
- **Permissões**: supervisor vê e programa a equipe dele (escopo por subnúcleo
  já resolve isso); DP aprova; sócio vê tudo.

### 4.4 Fases sugeridas

| Fase | Entrega | Esforço |
|---|---|---|
| **V1 — visibilidade** | Períodos aquisitivos automáticos + semáforo no Quadro/ficha + cartão de alerta no painel | pequeno |
| **V2 — programação** | Agendar/aprovar férias, calendário da equipe, validações da CLT, recibo em PDF | médio |
| **V3 — dinheiro** | Férias na folha do mês, baixa da provisão, projeção de desembolso, abono pecuniário | médio |

V1 sozinha já elimina o risco da dobra, que é o problema caro.

---

## 5. Perguntas para o DP antes de codar

1. Hoje existe controle em algum lugar (planilha, papel, e-mail)? Precisamos do
   **saldo inicial** de cada pessoa — sem isso o sistema começa achando que
   ninguém tirou férias desde a admissão.
2. O escritório pratica **férias coletivas** (recesso de fim de ano)?
3. Estagiário tira os 30 dias de recesso ou fraciona por férias escolares?
4. Associado/PJ deve aparecer no calendário como ausência programada?
5. Quem aprova: supervisor da pessoa, coordenador ou DP?
