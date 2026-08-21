# Auditoria de CORRESPONDENCIA entre os modulos, como comando permanente:
#
#   python manage.py auditar_correspondencia
#
# Nasceu da revisao geral de 20/08/2026, que achou 943 itens de folha com os
# totais zerados (carga historica anterior a migration 0029) e a cota de
# salario-familia da ALEXIA faltando na folha aberta (dependente cadastrado
# depois do ultimo recalculo — o recalculo e' quem le o cadastro).
#
# A regra unica que o comando impoe: numero que aparece em duas telas tem que
# ser IGUAL nas duas. Sai com exit code 1 quando ha' divergencia, entao da' pra
# pendurar em cron ou rodar antes de fechar competencia.
import sys

from django.core.management.base import BaseCommand
from django.db.models import Sum

from financeiro.models import (
    Alocacao, CentroFaturamento, CentroSede, DpColaborador, DpCompetencia,
    DpDependente, DpEvento, DpLancamento, DpTransferenciaContrato,
    LinhaFaturamento, Setor,
)


class Command(BaseCommand):
    help = "Cruza os modulos e acusa divergencia de valores entre eles."

    def handle(self, *args, **opts):
        problemas = []

        def p(secao, msg):
            problemas.append(f"[{secao}] {msg}")
            print(f"  !! {msg}")

        def ok(msg):
            print(f"  ok {msg}")

        # ══════ 1. FOLHA: identidades internas ══════
        print("\n=== 1. FOLHA (DP) - identidades internas ===")
        for comp in DpCompetencia.objects.order_by("ano", "mes"):
            tag = f"{comp.mes:02d}/{comp.ano}"
            r_liq = r_custo = r_conta = 0
            for it in comp.itens.all():
                dif = (it.total_proventos or 0) - (it.total_descontos or 0) - it.total_pagar
                # proventos e pagar zerados juntos = pessoa sem valores no mes
                if abs(dif) > 0.01 and not (it.total_proventos == 0 and it.total_pagar == 0):
                    r_liq += 1
                custo_esp = (it.total_pagar
                             + (it.adiantamento_ferias or 0)
                             + (it.desconto_consignado or 0)
                             + (it.outros_descontos or 0)
                             - (it.salario_familia or 0)
                             - (it.decimo_terceiro_pago or 0)
                             + (it.custo_provisoes or 0)
                             + (it.inss_patronal or 0))
                if abs(custo_esp - it.custo_total) > 0.02 and not it.afastamento_tipo:
                    r_custo += 1
                if it.liquido_em_conta:
                    conta = (it.total_pagar - (it.vt_com_faltas or 0)
                             - (it.va_com_faltas or 0))
                    if abs(conta - it.liquido_em_conta) > 0.01:
                        r_conta += 1
            if r_liq:
                p("folha", f"{tag}: {r_liq} itens proventos-descontos != liquido")
            if r_custo:
                p("folha", f"{tag}: {r_custo} itens com composicao de custo aberta")
            if r_conta:
                p("folha", f"{tag}: {r_conta} itens liquido_em_conta inconsistente")
            if not (r_liq or r_custo or r_conta):
                ok(f"{tag}: {comp.itens.count()} itens fecham")

        # ══════ 2. FOLHA x DASHBOARD (espelho) ══════
        print("\n=== 2. FOLHA x DASHBOARD - espelho ===")
        for comp in DpCompetencia.objects.order_by("ano", "mes"):
            per = f"{comp.ano}-{comp.mes:02d}"
            folha = comp.itens.aggregate(s=Sum("custo_total"))["s"] or 0
            esp_c = esp_h = 0.0
            for s in Setor.objects.all():
                d = (s.periodos or {}).get(per)
                if isinstance(d, dict):
                    esp_c += d.get("custoPessoalComApoio") or 0
                    esp_h += d.get("headcountComApoio") or 0
            if abs(esp_c - folha) > 0.10:
                p("espelho", f"{per}: dashboard {esp_c:,.2f} != folha {folha:,.2f} "
                             f"(dif {esp_c - folha:+,.2f})")
            else:
                ok(f"{per}: custo {esp_c:,.2f} = folha | hc {esp_h:.1f}")

        # ══════ 3. QUADRO x FOLHA ABERTA ══════
        print("\n=== 3. QUADRO x FOLHA ABERTA ===")
        ativos = DpColaborador.objects.filter(status="ativo")
        aberta = (DpCompetencia.objects.filter(status="aberta")
                  .order_by("-ano", "-mes").first())
        if aberta:
            ids_folha = set(aberta.itens.values_list("colaborador_id", flat=True))
            fora = [c for c in ativos
                    if c.id not in ids_folha and c.data_admissao
                    and (c.data_admissao.year, c.data_admissao.month)
                    <= (aberta.ano, aberta.mes)]
            if fora:
                p("quadro", f"{len(fora)} ativos elegiveis fora da folha aberta: "
                            f"{[c.nome[:24] for c in fora[:4]]}")
            else:
                ok(f"folha aberta {aberta.mes:02d}/{aberta.ano} cobre os ativos elegiveis")
            inat = DpColaborador.objects.filter(
                id__in=ids_folha, status="inativo", data_demissao__isnull=False)
            estranhos = [c for c in inat
                         if (c.data_demissao.year, c.data_demissao.month)
                         < (aberta.ano, aberta.mes)]
            if estranhos:
                p("quadro", f"{len(estranhos)} desligados de mes anterior na folha aberta: "
                            f"{[c.nome[:24] for c in estranhos[:4]]}")
            else:
                ok("nenhum desligado antigo sobrando na folha aberta")

        # ══════ 4. EVENTOS x CADASTRO ══════
        print("\n=== 4. EVENTOS x CADASTRO ===")
        # 'importacao' e' a admissao da carga historica — a movimentacao do
        # dashboard ja' conta os dois tipos juntos
        sem_adm = ativos.exclude(
            id__in=DpEvento.objects.filter(tipo__in=["admissao", "importacao"])
            .values_list("colaborador_id", flat=True)).count()
        deslig = DpColaborador.objects.filter(status="inativo")
        sem_desl = deslig.exclude(
            id__in=DpEvento.objects.filter(tipo="desligamento")
            .values_list("colaborador_id", flat=True))
        sem_desl = [c for c in sem_desl if not hasattr(c, "transferencia_saida")]
        if sem_adm:
            p("eventos", f"{sem_adm} ativos sem evento de admissao/importacao")
        else:
            ok("todo ativo tem evento de admissao")
        if sem_desl:
            p("eventos", f"{len(sem_desl)} inativos sem evento de desligamento: "
                         f"{[c.nome[:22] for c in sem_desl[:4]]}")
        else:
            ok("todo desligado tem evento (ou e' transferencia)")

        # ══════ 5. SALARIO-FAMILIA x DEPENDENTES ══════
        print("\n=== 5. SALARIO-FAMILIA x DEPENDENTES ===")
        if aberta:
            errados = []
            for it in aberta.itens.filter(salario_familia__gt=0):
                deps = DpDependente.objects.filter(
                    colaborador_id=it.colaborador_id, ativo=True)
                eleg = sum(1 for d in deps if d.elegivel_em(aberta.ano, aberta.mes))
                if eleg != (it.salario_familia_cotas or 0):
                    errados.append((it.nome[:24], it.salario_familia_cotas, eleg))
            if errados:
                p("sal-familia", f"cotas != dependentes elegiveis: {errados[:4]}")
            else:
                ok("cotas pagas = dependentes elegiveis")
            clt_dep = DpColaborador.objects.filter(
                status="ativo", regime="clt", dependentes__ativo=True).distinct()
            sem_cota = [c for c in clt_dep
                        if not aberta.itens.filter(colaborador=c,
                                                   salario_familia__gt=0).exists()
                        and any(d.elegivel_em(aberta.ano, aberta.mes)
                                for d in c.dependentes.filter(ativo=True))
                        and (c.salario_bruto or 0) <= 1980.38]
            if sem_cota:
                p("sal-familia", f"{len(sem_cota)} CLT com dependente elegivel SEM cota "
                                 f"(recalcule a folha): "
                                 f"{[c.nome[:22] for c in sem_cota[:4]]}")
            else:
                ok("ninguem com direito ficou sem a cota")

        # ══════ 6. CONSIGNADO x FOLHA ══════
        print("\n=== 6. CONSIGNADO x FOLHA ===")
        if aberta:
            errs = []
            for c in DpColaborador.objects.filter(consignados__isnull=False).distinct():
                esperado = sum(x.parcela_no_mes(aberta.ano, aberta.mes)
                               for x in c.consignados.all())
                lanc = DpLancamento.objects.filter(
                    colaborador=c, competencia=aberta).first()
                manual = (lanc.desconto_consignado if lanc else 0) or 0
                it = aberta.itens.filter(colaborador=c).first()
                if it and abs((it.desconto_consignado or 0) - (esperado + manual)) > 0.01:
                    errs.append((c.nome[:22], it.desconto_consignado, esperado + manual))
            if errs:
                p("consignado", f"folha != contratos+ajuste (recalcule): {errs[:4]}")
            else:
                ok("desconto na folha = contratos + ajuste manual")

        # ══════ 7. ESTRUTURA: percentuais fecham ══════
        print("\n=== 7. ESTRUTURA - percentuais ===")
        antes = len(problemas)
        for linha in LinhaFaturamento.objects.all():
            alocs = Alocacao.objects.filter(linha=linha)
            if alocs.exists():
                tot = sum((a.percentual or 0) for a in alocs)
                if abs(tot - 100) > 0.05:
                    p("estrutura", f"linha '{linha.nome}' soma {tot:.1f}%")
        soma_cs = {}
        for cs in CentroSede.objects.all():
            soma_cs[cs.centro_id] = soma_cs.get(cs.centro_id, 0) + (cs.percentual or 0)
        for cid, v in soma_cs.items():
            if abs(v - 100) > 0.05:
                nome = CentroFaturamento.objects.get(id=cid).nome
                p("estrutura", f"rateio por sede de '{nome}' soma {v:.1f}%")
        if len(problemas) == antes:
            ok("linhas alocadas somam 100% e rateios por sede somam 100%")

        # ══════ 8. COBERTURA do rateio ══════
        print("\n=== 8. COBERTURA - ninguem fora do rateio ===")
        soma_eq = {}
        for a in Alocacao.objects.all():
            soma_eq[a.equipe_id] = soma_eq.get(a.equipe_id, 0) + (a.percentual or 0)
        sem_eq = ativos.filter(equipe_ref=None).count()
        hc = {}
        for eid in ativos.exclude(equipe_ref=None).values_list("equipe_ref_id", flat=True):
            hc[eid] = hc.get(eid, 0) + 1
        chegam = sum(n for eid, n in hc.items() if soma_eq.get(eid))
        perdidos = ativos.count() - chegam
        orfas = (LinhaFaturamento.objects.filter(setor_legado=None).count()
                 + CentroFaturamento.objects.filter(tipo="infraestrutura",
                                                    setor_legado=None).count())
        if sem_eq:
            p("cobertura", f"{sem_eq} ativos sem equipe")
        if perdidos and not sem_eq:
            p("cobertura", f"{perdidos} ativos nao chegam a alocacao nenhuma")
        if orfas:
            p("cobertura", f"{orfas} linha(s)/centro(s) sem setor no painel")
        if not (sem_eq or perdidos or orfas):
            ok(f"{ativos.count()} ativos, todos chegam a uma linha ou centro")

        # ══════ 9. TRANSFERENCIAS ══════
        print("\n=== 9. TRANSFERENCIAS ===")
        errs_t = []
        for t in DpTransferenciaContrato.objects.select_related("origem", "destino"):
            if t.origem.status != "inativo":
                errs_t.append(f"origem {t.origem.nome[:20]} nao inativa")
        if errs_t:
            p("transferencia", "; ".join(errs_t[:3]))
        else:
            ok(f"{DpTransferenciaContrato.objects.count()} transferencia(s) consistentes")

        # ══════ RESUMO ══════
        print("\n" + "=" * 66)
        if problemas:
            print(f"RESULTADO: {len(problemas)} PROBLEMA(S):")
            for x in problemas:
                print(f"  - {x}")
            sys.exit(1)
        print("RESULTADO: todos os modulos correspondem entre si")
