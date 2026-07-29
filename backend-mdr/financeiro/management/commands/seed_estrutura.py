# Semeia a ESTRUTURA DE FATURAMENTO acordada em 2026-07-28 — idempotente
# (rodar de novo atualiza sem duplicar e sem tocar em percentual editado).
#
#   python manage.py seed_estrutura
#
# Fatos que o seed materializa:
#   • Equipes = vocabulário canônico do Flow (14) + ADM/TI (infra).
#   • Linhas do BB individualizadas; "Cadastro Técnico" RESSUSCITADA como
#     linha de faturamento, atendida pela CONTROLADORIA.
#   • Ajuizamento atende TODOS os clientes da recuperação de crédito
#     (Banese Autor, SICREDI, FLORARTE) além da linha do BB.
#   • Banese Réu é atendida pela equipe Ativos Réu.
#   • Histórico de faturamento copiado dos setores legados (nada se perde).
#   • Equipes da mesma linha nascem com percentuais IGUAIS (regra da casa);
#     edição manual é preservada em re-runs.
from django.core.management.base import BaseCommand
from django.db import transaction

from financeiro.models import (
    Alocacao, CentroFaturamento, CentroSede, DpCentroCusto, Equipe,
    LinhaFaturamento, Sede, Setor,
)

# Regra da casa (2026-07-29): crédito é Manhattan, passivo é Capim Macio.
SEDE_POR_AREA = {"credito": "Manhattan", "passivo": "Capim Macio"}

# slug do Flow → (nome, grupo, nome do centro de custo no DP)
EQUIPES = [
    ("bb-reu", "BB Réu", "passivo", "Réu - BB Defesa e Recurso"),
    ("bb-execucao", "BB Execução & Encerramento", "passivo", "Réu - BB Encerramento"),
    ("bb-acordos", "BB Acordos", "passivo", "Réu - BB Acordo"),
    # decisão 2026-07-29: o estratégico são DUAS equipes, uma por área
    ("bb-estrategico", "Estratégico Passivo", "passivo", None),
    ("master-reu", "Master Réu", "passivo", "Réu - Master Liquidante"),
    ("ativos-reu", "Ativos Réu", "passivo", "Réu - Ativos S/A"),
    ("trabalhista", "Trabalhista", "passivo", "Trabalhista"),
    ("bb-autor-processual", "BB Autor — Processual", "credito", "Autor - BB"),
    ("ativos-autor", "Ativos Autor", "credito", "Autor - Banese e Ativos S/A"),
    ("autor-recursal", "Autor — Recursal", "credito", None),
    ("ajuizamento", "Ajuizamento", "credito", None),
    ("estrategico-autor", "Estratégico Ativo", "credito", None),
    ("equipe-mista", "Equipe Mista", "especializada", None),
    # key preservada do Flow: Controladoria sucede o antigo BB Cadastro
    ("bb-cadastro", "Controladoria", "especializada", "Réu - BB Cadastro Técnico"),
    ("adm", "Administrativo", "infra", "ADM"),
    ("ti", "TI", "infra", "TI"),
]

# centros de FATURAMENTO (ordem de exibição)
CENTROS = ["Banco do Brasil", "Ativos S.A.", "Banco Master", "Banese",
           "Santander", "SICREDI", "FLORARTE"]

# linhas: (centro, nome, área, setor legado de onde vem o histórico, [equipes])
LINHAS = [
    ("Banco do Brasil", "Defesas e Recursos", "passivo",
     "Defesas e Recursos - BB Réu", ["bb-reu"]),
    ("Banco do Brasil", "Encerramento e Cumprimento", "passivo",
     "Encerramento e Cumprimento de Sentença - BB Réu", ["bb-execucao"]),
    ("Banco do Brasil", "Acordos", "passivo",
     "Acordos - BB Réu", ["bb-acordos"]),
    # ressuscitada como linha de faturamento; a CONTROLADORIA atende
    ("Banco do Brasil", "Cadastro Técnico", "passivo",
     "Cadastro Técnico - BB Réu", ["bb-cadastro"]),
    ("Banco do Brasil", "BB - Recuperação de Crédito", "credito",
     "BB Autor", ["bb-autor-processual", "autor-recursal", "estrategico-autor", "ajuizamento"]),
    ("Ativos S.A.", "Ativos Réu", "passivo",
     "Ativos S.A. - Réu", ["ativos-reu"]),
    # decisão 2026-07-29: o histórico Banese/Ativos fica AQUI; a separação
    # com a linha Banese Autor vale só para lançamentos daqui pra frente
    ("Ativos S.A.", "Ativos Autor", "credito",
     "Banese/Ativos - Autor", ["ativos-autor", "ajuizamento"]),
    ("Banese", "Banese Réu", "passivo", None, ["ativos-reu"]),
    ("Banese", "Banese Autor", "credito", None, ["ajuizamento"]),
    ("Banco Master", "Master Réu", "passivo", "Master", ["master-reu"]),
    ("Santander", "Trabalhista", "passivo", "Trabalhista", ["trabalhista"]),
    ("SICREDI", "Recuperação de Crédito", "credito", None, ["ajuizamento"]),
    ("FLORARTE", "Recuperação de Crédito", "credito", None, ["ajuizamento"]),
]

# centros de INFRAESTRUTURA e as equipes dentro deles
INFRA = [
    ("Administrativo", ["adm"]),
    ("Tecnologia", ["ti"]),
]

# alocações DIRETAS no centro de faturamento (equipe atende o cliente como um
# todo, sem linha de receita própria — caso do Estratégico Passivo no BB)
DIRETAS = [
    ("Banco do Brasil", "bb-estrategico"),
]


# renomeações e remoções pra quem rodou versões anteriores do seed
RENOMEAR = {("Banco do Brasil", "Autor — Processual"): "BB - Recuperação de Crédito"}
REMOVER = [("Banco do Brasil", "Estratégico")]  # não fatura: é só equipe


class Command(BaseCommand):
    help = "Semeia centros/linhas de faturamento e alocações (idempotente)."

    @transaction.atomic
    def handle(self, *args, **kwargs):
        for (centro_nome, antigo), novo in RENOMEAR.items():
            LinhaFaturamento.objects.filter(centro__nome=centro_nome, nome=antigo).update(nome=novo)
        for centro_nome, nome in REMOVER:
            LinhaFaturamento.objects.filter(centro__nome=centro_nome, nome=nome).delete()

        ccs = {c.nome: c for c in DpCentroCusto.objects.all()}
        setores = {s.nome: s for s in Setor.objects.all()}

        equipes = {}
        for slug, nome, grupo, cc_nome in EQUIPES:
            eq, _ = Equipe.objects.update_or_create(
                slug=slug,
                defaults={"nome": nome, "grupo": grupo,
                          "centro_custo": ccs.get(cc_nome) if cc_nome else None})
            equipes[slug] = eq

        centros = {}
        for i, nome in enumerate(CENTROS):
            c, _ = CentroFaturamento.objects.update_or_create(
                nome=nome, defaults={"tipo": "faturamento", "ordem": i})
            centros[nome] = c
        for i, (nome, _slugs) in enumerate(INFRA):
            c, _ = CentroFaturamento.objects.update_or_create(
                nome=nome, defaults={"tipo": "infraestrutura", "ordem": 100 + i})
            centros[nome] = c

        sedes = {s.nome: s for s in Sede.objects.all()}
        criadas = atualizadas = 0
        for i, (centro_nome, nome, area, setor_nome, slugs) in enumerate(LINHAS):
            setor = setores.get(setor_nome) if setor_nome else None
            receita = {}
            if setor:
                # só o bloco de faturamento de cada período (pessoal fica no DP)
                receita = {per: (d or {}).get("faturamento", {})
                           for per, d in (setor.periodos or {}).items()
                           if (d or {}).get("faturamento")}
            sede = sedes.get(SEDE_POR_AREA.get(area, ""))
            linha, criada = LinhaFaturamento.objects.get_or_create(
                centro=centros[centro_nome], nome=nome,
                defaults={"area": area, "ordem": i, "setor_legado": setor,
                          "periodos": receita, "sede": sede})
            if criada:
                criadas += 1
            else:
                # re-run atualiza vínculo e histórico, sem tocar em percentuais
                linha.area, linha.ordem = area, i
                linha.setor_legado = setor or linha.setor_legado
                # só preenche a sede se ainda estiver vazia (respeita ajuste manual)
                if sede and not linha.sede_id:
                    linha.sede = sede
                if receita:
                    linha.periodos = receita
                linha.save()
                atualizadas += 1

            atuais = {a.equipe.slug: a for a in linha.alocacoes.select_related("equipe")}
            novos = [s for s in slugs if s not in atuais]
            if novos:
                # regra da casa: mesma linha ⇒ percentuais iguais entre TODAS
                # as equipes (as que já existiam entram na redivisão, a menos
                # que alguém já tenha editado percentual à mão — aí preserva)
                editado = any(abs(a.percentual - round(100.0 / max(len(atuais), 1), 2)) > 0.02
                              for a in atuais.values()) if atuais else False
                total = len(atuais) + len(novos)
                igual = round(100.0 / total, 2)
                for s in novos:
                    Alocacao.objects.create(linha=linha, equipe=equipes[s],
                                            percentual=igual)
                if not editado:
                    for a in atuais.values():
                        a.percentual = igual
                        a.save(update_fields=["percentual"])

        for nome, slugs in INFRA:
            for s in slugs:
                Alocacao.objects.get_or_create(centro=centros[nome], equipe=equipes[s],
                                               defaults={"percentual": 100.0})
        for nome, slug in DIRETAS:
            Alocacao.objects.get_or_create(centro=centros[nome], equipe=equipes[slug],
                                           defaults={"percentual": 100.0})

        # infraestrutura: rateio IGUAL entre as sedes (só cria o que falta —
        # se alguém editou o percentual, o re-run preserva)
        todas = list(sedes.values())
        if todas:
            parte = round(100.0 / len(todas), 2)
            for nome, _slugs in INFRA:
                for sede in todas:
                    CentroSede.objects.get_or_create(centro=centros[nome], sede=sede,
                                                     defaults={"percentual": parte})

        self.stdout.write(self.style.SUCCESS(
            f"Estrutura: {len(centros)} centros · linhas +{criadas}/{atualizadas} atualizadas · "
            f"{Equipe.objects.count()} equipes · {Alocacao.objects.count()} alocações"))
