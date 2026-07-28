# Seed de demonstração: 6 meses de dados financeiros SIMULADOS (sedes, setores
# operacionais/administrativos com pessoal + faturamento, custos de estrutura,
# VPD por período e uma amostra de base de referência).
#
# Uso (ambiente LOCAL — não rodar em produção sem querer):
#   python manage.py seed_demo            # aborta se já houver setores
#   python manage.py seed_demo --wipe     # limpa sedes/setores/vpd antes
#
# Os números foram calibrados pra matemática do frontend (calculations.ts):
# margem líquida = fat.líquido - pessoal - variáveis - eventuais - headcount*VPD,
# de modo que os setores caiam em status variados (excelente/saudável/atenção).
import random
import uuid
from datetime import datetime

from django.core.management.base import BaseCommand

from financeiro.models import BaseReferencia, Sede, Setor, VpdConfig
from financeiro.sso_views import LEGACY_DATA_USER_ID

MESES = 6  # meses de histórico simulados (terminando no mês atual)


def _periodos_ate_hoje(n: int):
    hoje = datetime.now()
    ano, mes = hoje.year, hoje.month
    out = []
    for i in range(n - 1, -1, -1):
        a, m = ano, mes - i
        while m <= 0:
            m += 12
            a -= 1
        out.append(f"{a}-{m:02d}")
    return out


def grupo(qtd, salario, mult=1.0, alim=600.0, transp=220.0, wellhub=60.0, plr=0.0):
    return {
        "quantidade": qtd, "salarioBase": salario, "auxilioAlimentacao": alim,
        "auxilioTransporte": transp, "wellhub": wellhub, "plr": plr,
        "multiplicadorEncargos": mult,
    }


def estagiario(qtd, bolsa):
    g = grupo(qtd, 0, 1.0, alim=450.0, transp=180.0, wellhub=0.0)
    g.update({"bolsa": bolsa, "taxaIntegracao": 70.0})
    return g


class Command(BaseCommand):
    help = "Semeia 6 meses de dados financeiros simulados (demo/local)."

    def add_arguments(self, parser):
        parser.add_argument("--wipe", action="store_true", help="apaga sedes/setores/vpd antes de semear")

    def handle(self, *args, **opts):
        rng = random.Random(42)  # determinístico
        uid = LEGACY_DATA_USER_ID
        periodos = _periodos_ate_hoje(MESES)

        if opts["wipe"]:
            Setor.objects.all().delete()
            Sede.objects.all().delete()
            VpdConfig.objects.all().delete()
            self.stdout.write("wipe: sedes/setores/vpd apagados")
        elif Setor.objects.exists():
            self.stderr.write("Já existem setores — use --wipe pra recriar. Abortando.")
            return

        # ---------- SEDES (custos de estrutura por período) ----------
        sedes_def = [
            ("Matriz Natal", 1.00),
            ("Filial Fortaleza", 0.55),
            ("Filial Belém", 0.40),
        ]
        base_custos = [
            ("Aluguel", 18000), ("Condomínio", 4200), ("Energia elétrica", 6300),
            ("Link de internet", 2500), ("Limpeza e conservação", 3600),
            ("Segurança", 2100), ("Água", 850), ("Manutenção predial", 1900),
        ]
        sedes = {}
        for nome, fator in sedes_def:
            per = {}
            for p in periodos:
                itens = []
                for desc, valor in base_custos:
                    v = round(valor * fator * rng.uniform(0.92, 1.08), 2)
                    itens.append({"id": str(uuid.uuid4()), "descricao": desc, "valor": v})
                if rng.random() < 0.35:  # eventual da estrutura
                    itens.append({"id": str(uuid.uuid4()), "descricao": "Reforma/adequação pontual",
                                  "valor": round(rng.uniform(2500, 12000), 2)})
                per[p] = itens
            s = Sede.objects.create(user_id=uid, nome=nome, periodos=per)
            sedes[nome] = s
            self.stdout.write(f"sede: {nome}")

        # ---------- SETORES OPERACIONAIS ----------
        # (nome, sede, faturamento base, perfil de equipe [escala], tendência a.m.)
        ops = [
            ("BB Réu",                     "Matriz Natal",      520000, 1.30, 1.020),
            ("BB Autor — Rec. de Crédito", "Matriz Natal",      430000, 1.10, 1.028),
            ("Contencioso Cível Master",   "Filial Fortaleza",  300000, 0.85, 1.012),
            ("Trabalhista",                "Filial Fortaleza",  180000, 0.60, 1.008),
            ("Publicações & Prazos",       "Matriz Natal",      150000, 0.55, 1.015),
            ("Ativos & Cadastro",          "Filial Belém",      120000, 0.45, 0.995),
        ]
        for nome, sede_nome, fat_base, escala, tend in ops:
            per = {}
            for idx, p in enumerate(periodos):
                e = escala
                pessoal = {
                    "estagiarioNivel1": estagiario(max(1, round(4 * e)), 900.0),
                    "estagiarioNivel2": estagiario(max(1, round(2 * e)), 1100.0),
                    "assistenteJuridicoNivel1": grupo(max(1, round(5 * e)), 1950.0, 1.6, plr=1800.0),
                    "assistenteJuridicoNivel2": grupo(round(3 * e), 2350.0, 1.6, plr=2200.0),
                    "advogadoJunior": grupo(round(3 * e), 3400.0, 1.0, plr=3000.0),
                    "advogadoPleno": grupo(round(2 * e), 5100.0, 1.0, plr=4200.0),
                    "advogadoSenior": grupo(max(0, round(1 * e)), 7800.0, 1.0, plr=6000.0),
                    "supervisorNivel1": grupo(1, 3600.0, 1.6, plr=2500.0),
                    "supervisorNivel2": grupo(1 if e >= 1 else 0, 4300.0, 1.6, plr=3000.0),
                    "coordenadorOperacional": grupo(1, 6800.0, 1.6, plr=5000.0),
                }
                advogados = sum(pessoal[k]["quantidade"] for k in
                                ("advogadoJunior", "advogadoPleno", "advogadoSenior"))
                bruto = round(fat_base * (tend ** idx) * rng.uniform(0.94, 1.06), 2)
                fat = {
                    "bruto": bruto,
                    "descontos": round(bruto * rng.uniform(0.008, 0.03), 2),
                    "aliquotaLucroPresumido": 0.32,
                    "aliquotaISS": 0.02,
                    "modoISS": "sociedade",
                    "profissionaisISS": advogados,
                    "premiacaoTotal": round(bruto * rng.uniform(0.01, 0.028), 2),
                    "diversosTotal": round(rng.uniform(800, 4200), 2),
                }
                eventuais = []
                if rng.random() < 0.4:
                    eventuais.append({"id": str(uuid.uuid4()),
                                      "descricao": rng.choice(["Diligências extraordinárias",
                                                               "Custas emergenciais",
                                                               "Consultoria pontual",
                                                               "Treinamento da equipe"]),
                                      "valor": round(rng.uniform(1500, 9000), 2)})
                per[p] = {"pessoal": pessoal, "faturamento": fat, "despesasEventuais": eventuais}
            Setor.objects.create(user_id=uid, nome=nome, tipo="operacional",
                                 sede=sedes[sede_nome], periodos=per)
            self.stdout.write(f"setor operacional: {nome}")

        # ---------- SETORES ADMINISTRATIVOS (centros de custo) ----------
        adms = [
            ("Departamento Pessoal", "Matriz Natal",
             {"auxiliarDP": grupo(3, 2100.0, 1.6, plr=1500.0),
              "auxiliarRH": grupo(2, 2100.0, 1.6, plr=1500.0),
              "auxiliarFinanceiro": grupo(0, 0.0),
              "supervisor": grupo(1, 3800.0, 1.6, plr=2500.0),
              "coordenador": grupo(0, 0.0)}),
            ("Financeiro", "Matriz Natal",
             {"auxiliarDP": grupo(0, 0.0),
              "auxiliarRH": grupo(0, 0.0),
              "auxiliarFinanceiro": grupo(3, 2300.0, 1.6, plr=1800.0),
              "supervisor": grupo(1, 4000.0, 1.6, plr=2800.0),
              "coordenador": grupo(1, 6500.0, 1.6, plr=4500.0)}),
            ("TI & Inovação", "Matriz Natal",
             {"auxiliarDP": grupo(0, 0.0),
              "auxiliarRH": grupo(0, 0.0),
              "auxiliarFinanceiro": grupo(0, 0.0),
              "supervisor": grupo(1, 5200.0, 1.6, plr=3500.0),
              "coordenador": grupo(1, 7200.0, 1.6, plr=5000.0)}),
        ]
        fat_zero = {"bruto": 0, "descontos": 0, "aliquotaLucroPresumido": 0.32,
                    "aliquotaISS": 0.02, "modoISS": "sociedade", "profissionaisISS": 0,
                    "premiacaoTotal": 0, "diversosTotal": 0}
        for nome, sede_nome, pessoal in adms:
            per = {}
            for p in periodos:
                eventuais = []
                if rng.random() < 0.3:
                    eventuais.append({"id": str(uuid.uuid4()),
                                      "descricao": rng.choice(["Software/licenças", "Recrutamento",
                                                               "Auditoria externa"]),
                                      "valor": round(rng.uniform(900, 5200), 2)})
                per[p] = {"pessoal": pessoal, "faturamento": dict(fat_zero),
                          "despesasEventuais": eventuais}
            Setor.objects.create(user_id=uid, nome=nome, tipo="administrativo",
                                 sede=sedes[sede_nome], periodos=per)
            self.stdout.write(f"setor administrativo: {nome}")

        # ---------- VPD por período ----------
        for idx, p in enumerate(periodos):
            valor = round(2472.85 * (1.004 ** idx) * rng.uniform(0.98, 1.02), 2)
            VpdConfig.objects.update_or_create(
                periodo=p,
                defaults={"user_id": uid, "valor": valor,
                          "headcount": None, "despesasBase": [], "pessoalApoio": []},
            )
        self.stdout.write(f"vpd: {len(periodos)} períodos")

        # ---------- Base de referência (amostra, só se estiver vazia) ----------
        if not BaseReferencia.objects.exists():
            amostra = []
            for i in range(500):
                npj = f"20{rng.randint(20, 26)}{rng.randint(0, 999999):06d}"
                amostra.append(BaseReferencia(
                    npj_original=npj, npj_limpo=npj.lstrip("0"),
                    polo=rng.choice(["REU", "REU", "REU", "AUTOR"]),
                ))
            BaseReferencia.objects.bulk_create(amostra, batch_size=500, ignore_conflicts=True)
            self.stdout.write("base_referencia: 500 NPJs de amostra")

        self.stdout.write(self.style.SUCCESS(
            f"SEED OK — {Sede.objects.count()} sedes, {Setor.objects.count()} setores, "
            f"{VpdConfig.objects.count()} VPDs, períodos {periodos[0]}..{periodos[-1]}"
        ))
