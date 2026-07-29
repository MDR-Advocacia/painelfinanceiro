# Foto retroativa das competências já fechadas.
#
# POR QUE EXISTE: competências fechadas ANTES da migration 0019 nunca tiveram
# foto tirada. Sem foto, o cálculo daquele mês cai no fallback "ao vivo" — a
# margem de um mês encerrado continua se mexendo toda vez que alguém troca de
# equipe hoje. Este comando tira a foto que faltou.
#
# LIMITE HONESTO — LEIA ANTES DE RODAR: a foto sai do estado de HOJE, não do
# estado que valia na época. O enquadramento histórico não está gravado em
# lugar nenhum do banco; não há como reconstruí-lo. Portanto o comando NÃO
# corrige o passado: ele CONGELA a partir de agora, para que daquele ponto em
# diante o mês pare de se mexer.
#
# CONSEQUÊNCIA PRÁTICA (a parte tranquilizadora): como o cálculo hoje já usa o
# estado ao vivo quando não há foto, fotografar esse mesmo estado não altera
# NENHUM número agora. O efeito é só para frente — a próxima troca de equipe
# deixa de reescrever meses encerrados.
from django.core.management.base import BaseCommand
from django.db import transaction

from financeiro.models import DpAuditLog, DpCompetencia
from financeiro.models_estrutura import (
    CompetenciaAlocacao, CompetenciaEnquadramento, congelar_competencia,
)

USUARIO_COMANDO = "comando: congelar_retroativo"


class Command(BaseCommand):
    help = ("Tira a foto de enquadramento/alocação das competências FECHADAS "
            "que ficaram sem foto (fechadas antes da migration 0019).")

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true",
                            help="Só mostra o que faria, sem gravar nada.")
        parser.add_argument("--ano", type=int, default=None,
                            help="Restringe a um exercício (ex.: --ano 2025).")
        parser.add_argument("--refazer", action="store_true",
                            help="Refaz a foto mesmo de quem já tem. Use só se a "
                                 "foto anterior estiver comprovadamente errada.")

    def handle(self, *args, **opts):
        dry = opts["dry_run"]
        comps = DpCompetencia.objects.filter(status="fechada").order_by("ano", "mes")
        if opts["ano"]:
            comps = comps.filter(ano=opts["ano"])
        comps = list(comps)

        if not comps:
            self.stdout.write(self.style.WARNING(
                "Nenhuma competência FECHADA encontrada"
                + (f" no exercício {opts['ano']}." if opts["ano"] else ".")))
            return

        com_foto = set(CompetenciaEnquadramento.objects
                       .values_list("competencia_id", flat=True).distinct())
        alvos = comps if opts["refazer"] else [c for c in comps if c.id not in com_foto]
        ja_ok = [c for c in comps if c.id in com_foto and not opts["refazer"]]

        self.stdout.write("")
        self.stdout.write(self.style.MIGRATE_HEADING(
            f"Competências fechadas analisadas: {len(comps)}"))
        for c in ja_ok:
            n_e = CompetenciaEnquadramento.objects.filter(competencia=c).count()
            n_a = CompetenciaAlocacao.objects.filter(competencia=c).count()
            self.stdout.write(f"  {c.mes:02d}/{c.ano}  já congelada "
                              f"({n_e} pessoas, {n_a} alocações) — pulando")
        if not alvos:
            self.stdout.write(self.style.SUCCESS(
                "\nTodas as competências fechadas já têm foto. Nada a fazer."))
            return

        self.stdout.write("")
        self.stdout.write(self.style.WARNING(
            "ATENÇÃO: a foto retroativa retrata o estado de HOJE, não o da época.\n"
            "Ela não reconstrói o histórico — apenas impede que esses meses\n"
            "continuem mudando daqui pra frente. Como o cálculo desses meses já\n"
            "usa o estado ao vivo hoje, NENHUM número muda agora."))
        self.stdout.write("")

        total_e = total_a = 0
        for c in alvos:
            if dry:
                from financeiro.models import DpColaborador
                from financeiro.models import Alocacao
                n_e = DpColaborador.objects.exclude(equipe_ref=None).count()
                n_a = Alocacao.objects.count()
                self.stdout.write(f"  {c.mes:02d}/{c.ano}  [dry-run] congelaria "
                                  f"{n_e} pessoas e {n_a} alocações")
            else:
                with transaction.atomic():
                    n_e, n_a = congelar_competencia(c)
                    DpAuditLog.objects.create(
                        usuario=USUARIO_COMANDO, acao="congelar_retroativo",
                        entidade="dp_competencia", entidade_id=str(c.id),
                        depois={"competencia": f"{c.mes:02d}/{c.ano}",
                                "foto_enquadramentos": n_e,
                                "foto_alocacoes": n_a,
                                "observacao": "Foto retroativa: retrata o estado "
                                              "de hoje, não o da época do fechamento."},
                    )
                self.stdout.write(self.style.SUCCESS(
                    f"  {c.mes:02d}/{c.ano}  congelada — {n_e} pessoas, {n_a} alocações"))
            total_e += n_e
            total_a += n_a

        self.stdout.write("")
        prefixo = "[dry-run] Congelaria" if dry else "Congeladas"
        self.stdout.write(self.style.SUCCESS(
            f"{prefixo} {len(alvos)} competência(s): "
            f"{total_e} enquadramentos e {total_a} alocações."))
        if dry:
            self.stdout.write("Rode sem --dry-run para gravar.")
