# ═══════════ ESTRUTURA DE FATURAMENTO (proposta de reestruturação) ═══════════
# Modelo acordado com o operador em 2026-07-28:
#
#   CENTRO DE FATURAMENTO  = o CLIENTE (quem paga): BB, Ativos S.A., Master…
#     └── LINHA DE FATURAMENTO = receita individualizável dentro do cliente
#           └── ALOCAÇÕES = equipes que atendem a linha, com % de participação
#
#   CENTRO DE INFRAESTRUTURA = setor que não fatura (Administrativo, TI…);
#     também recebe equipes, e o custo dele vira rateio (VPD).
#
# A EQUIPE é a unidade de trabalho — vocabulário canônico do Flow
# (app/services/performance/teams.py): 14 equipes em 3 grupos. Uma equipe pode
# estar alocada em N linhas (ex.: Ajuizamento atende TODOS os clientes da
# recuperação de crédito) e uma linha pode ter N equipes. Via de regra as
# equipes de uma mesma linha dividem em percentuais IGUAIS; o percentual é
# editável caso a casa decida ponderar diferente.
import uuid

from django.db import models


class Equipe(models.Model):
    """Equipe de trabalho — espelha o vocabulário do Flow (Minha Equipe).

    `slug` preserva a key do Flow (ex.: `bb-cadastro` → Controladoria) para o
    dia em que os sistemas conversarem por API. `centro_custo` amarra a equipe
    ao centro de custo do DP — é por aqui que o custo real da folha desce.
    """
    GRUPOS = [
        ("passivo", "Contencioso Passivo"),
        ("credito", "Recuperação de Crédito"),
        ("especializada", "Especializada"),
        ("infra", "Infraestrutura"),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    slug = models.CharField(max_length=60, unique=True)
    nome = models.CharField(max_length=120)
    grupo = models.CharField(max_length=20, choices=GRUPOS)
    centro_custo = models.ForeignKey(
        "financeiro.DpCentroCusto", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="equipes_estrutura",
        help_text="Centro de custo do DP de onde vem o custo real desta equipe")
    ativo = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "ef_equipes"
        ordering = ["grupo", "nome"]

    def __str__(self):
        return self.nome


class CentroFaturamento(models.Model):
    """O cliente (quem paga) — ou, no tipo `infraestrutura`, o agrupador de
    setores que não faturam."""
    TIPOS = [("faturamento", "Centro de Faturamento"),
             ("infraestrutura", "Centro de Infraestrutura")]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nome = models.CharField(max_length=120, unique=True)
    tipo = models.CharField(max_length=20, choices=TIPOS, default="faturamento")
    # Centro de INFRAESTRUTURA nao tem linha de faturamento (nao fatura), entao
    # o custo dele nao tinha por onde descer ate' o painel legado — Administrativo
    # e TI simplesmente SUMIAM do card "Custos de pessoal", que mostrava 356 mil
    # contra 478 mil de folha real. Este vinculo fecha o caminho: a alocacao
    # feita direto no centro cai no setor administrativo correspondente.
    setor_legado = models.ForeignKey(
        "financeiro.Setor", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="centros_infra",
        help_text="Setor do painel legado que recebe o custo deste centro "
                  "quando ele nao tem linha de faturamento.")
    ordem = models.IntegerField(default=0)
    ativo = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "ef_centros"
        ordering = ["tipo", "ordem", "nome"]

    def __str__(self):
        return self.nome


class LinhaFaturamento(models.Model):
    """Receita individualizável dentro do cliente (ex.: BB → "Acordos").

    `periodos` guarda o faturamento por mês no MESMO formato do Setor legado
    ({"2026-06": {"bruto": …, "descontos": …, …}}) — a migração copia o
    histórico do setor de origem (`setor_legado`) sem perder nada. Cliente sem
    linha específica usa uma linha "Geral".
    """
    AREAS = [("passivo", "Contencioso Passivo"),
             ("credito", "Recuperação de Crédito"),
             ("especializada", "Especializada")]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    centro = models.ForeignKey(CentroFaturamento, on_delete=models.CASCADE,
                               related_name="linhas")
    nome = models.CharField(max_length=120)
    area = models.CharField(max_length=20, choices=AREAS)
    # SEDE onde a linha é operada. Regra da casa: Recuperação de Crédito é
    # Manhattan, Contencioso Passivo é Capim Macio — mas o campo é editável,
    # porque a exceção existe e o operador manda.
    sede = models.ForeignKey("financeiro.Sede", on_delete=models.SET_NULL,
                             null=True, blank=True, related_name="linhas_faturamento")
    periodos = models.JSONField(default=dict, blank=True)
    setor_legado = models.ForeignKey("financeiro.Setor", on_delete=models.SET_NULL,
                                     null=True, blank=True, related_name="linhas_novas",
                                     help_text="Setor do painel antigo que originou esta linha")
    # linha que existe mas não recebe mais receita nova (ex.: Cadastro Técnico
    # quando a transição pra Controladoria terminar)
    ativo = models.BooleanField(default=True)
    ordem = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "ef_linhas"
        ordering = ["ordem", "nome"]
        unique_together = [("centro", "nome")]

    def __str__(self):
        return f"{self.centro.nome} · {self.nome}"


class CentroSede(models.Model):
    """Rateio de um centro de INFRAESTRUTURA entre as sedes.

    Infra não tem área (nem receita), então não dá pra deduzir a sede: o custo
    é dividido por percentual — igual entre as sedes, por padrão.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    centro = models.ForeignKey(CentroFaturamento, on_delete=models.CASCADE,
                               related_name="sedes")
    sede = models.ForeignKey("financeiro.Sede", on_delete=models.CASCADE,
                             related_name="centros_estrutura")
    percentual = models.FloatField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "ef_centro_sedes"
        ordering = ["sede__nome"]
        constraints = [models.UniqueConstraint(fields=["centro", "sede"], name="uq_centro_sede")]

    def __str__(self):
        return f"{self.centro.nome} · {self.sede.nome} ({self.percentual:g}%)"


class Alocacao(models.Model):
    """Equipe alocada numa linha de faturamento OU num centro de infraestrutura.

    `percentual` é a participação da equipe na receita da linha (e o rateio do
    custo dela quando serve a várias). Regra da casa: equipes da mesma linha
    nascem com percentuais iguais; o campo é editável.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    linha = models.ForeignKey(LinhaFaturamento, on_delete=models.CASCADE,
                              null=True, blank=True, related_name="alocacoes")
    centro = models.ForeignKey(CentroFaturamento, on_delete=models.CASCADE,
                               null=True, blank=True, related_name="alocacoes",
                               help_text="Alocação direta no centro (infraestrutura ou cliente sem linhas)")
    equipe = models.ForeignKey(Equipe, on_delete=models.CASCADE, related_name="alocacoes")
    percentual = models.FloatField(default=100.0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "ef_alocacoes"
        constraints = [
            models.UniqueConstraint(fields=["linha", "equipe"], name="uq_alocacao_linha_equipe"),
            models.UniqueConstraint(fields=["centro", "equipe"], name="uq_alocacao_centro_equipe"),
            # exatamente UM destino: linha ou centro
            models.CheckConstraint(
                name="ck_alocacao_um_destino",
                check=(models.Q(linha__isnull=False, centro__isnull=True)
                       | models.Q(linha__isnull=True, centro__isnull=False)),
            ),
        ]

    def __str__(self):
        destino = self.linha or self.centro
        return f"{self.equipe.nome} em {destino} ({self.percentual:g}%)"


def _caminho_doc_faturamento(instance, filename):
    """media/faturamento/<linha>/<periodo>/<arquivo>."""
    return f"faturamento/{instance.linha_id}/{instance.periodo}/{filename}"


class FaturamentoDocumento(models.Model):
    """Comprovação do faturamento do mês (nota fiscal, medição, relatório).

    Fica preso ao par LINHA + PERÍODO, que é a granularidade do lançamento.
    Como no DP, o arquivo NUNCA é servido direto pelo nginx — o download passa
    por endpoint autenticado, porque nota fiscal é documento do cliente.
    """
    TIPOS = [
        ("nota", "Nota fiscal"),
        ("medicao", "Relatório de medição"),
        ("contrato", "Contrato / aditivo"),
        ("comprovante", "Comprovante de pagamento"),
        ("outro", "Outro documento"),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    linha = models.ForeignKey(LinhaFaturamento, on_delete=models.CASCADE,
                              related_name="documentos")
    periodo = models.CharField(max_length=7, help_text="AAAA-MM")
    tipo = models.CharField(max_length=20, choices=TIPOS, default="nota")
    arquivo = models.FileField(upload_to=_caminho_doc_faturamento)
    nome_original = models.CharField(max_length=255)
    tamanho = models.IntegerField(default=0)
    descricao = models.CharField(max_length=200, blank=True, default="")
    enviado_por = models.CharField(max_length=150, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "ef_faturamento_documentos"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["linha", "periodo"])]

    def __str__(self):
        return f"{self.linha.nome} {self.periodo} — {self.nome_original}"


# ═══════════ FOTO DA COMPETÊNCIA (congelamento no fechamento) ═══════════
# A margem de um mês fechado não pode mudar porque alguém trocou de equipe
# hoje. Ao FECHAR a competência tiramos uma foto de duas coisas:
#   1) onde cada pessoa estava enquadrada;
#   2) como as equipes estavam alocadas (linha/centro e percentual).
# A partir daí, todo cálculo daquele mês lê a foto. Reabrir a competência
# apaga a foto — ela é tirada de novo no próximo fechamento.

class CompetenciaEnquadramento(models.Model):
    """Onde a pessoa estava quando o mês fechou."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    competencia = models.ForeignKey("financeiro.DpCompetencia", on_delete=models.CASCADE,
                                    related_name="foto_enquadramentos")
    colaborador = models.ForeignKey("financeiro.DpColaborador", on_delete=models.CASCADE,
                                    related_name="fotos_enquadramento")
    equipe = models.ForeignKey(Equipe, on_delete=models.PROTECT,
                               related_name="fotos_enquadramento")

    class Meta:
        db_table = "ef_foto_enquadramentos"
        constraints = [models.UniqueConstraint(fields=["competencia", "colaborador"],
                                               name="uq_foto_enq_comp_colab")]


class CompetenciaAlocacao(models.Model):
    """Como a equipe estava alocada quando o mês fechou."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    competencia = models.ForeignKey("financeiro.DpCompetencia", on_delete=models.CASCADE,
                                    related_name="foto_alocacoes")
    equipe = models.ForeignKey(Equipe, on_delete=models.PROTECT, related_name="fotos_alocacao")
    linha = models.ForeignKey(LinhaFaturamento, on_delete=models.SET_NULL, null=True, blank=True,
                              related_name="fotos_alocacao")
    centro = models.ForeignKey(CentroFaturamento, on_delete=models.SET_NULL, null=True, blank=True,
                               related_name="fotos_alocacao")
    percentual = models.FloatField(default=0)

    class Meta:
        db_table = "ef_foto_alocacoes"


def congelar_competencia(competencia):
    """Tira a foto do enquadramento e das alocações. Idempotente."""
    from .models import DpColaborador
    CompetenciaEnquadramento.objects.filter(competencia=competencia).delete()
    CompetenciaAlocacao.objects.filter(competencia=competencia).delete()
    CompetenciaEnquadramento.objects.bulk_create([
        CompetenciaEnquadramento(competencia=competencia, colaborador_id=cid, equipe_id=eid)
        for cid, eid in DpColaborador.objects.exclude(equipe_ref=None)
                                             .values_list("id", "equipe_ref_id")
    ])
    CompetenciaAlocacao.objects.bulk_create([
        CompetenciaAlocacao(competencia=competencia, equipe_id=a.equipe_id,
                            linha_id=a.linha_id, centro_id=a.centro_id,
                            percentual=a.percentual or 0)
        for a in Alocacao.objects.all()
    ])
    return (CompetenciaEnquadramento.objects.filter(competencia=competencia).count(),
            CompetenciaAlocacao.objects.filter(competencia=competencia).count())


def descongelar_competencia(competencia):
    """Reabriu o mês: a foto sai e volta a valer o estado ao vivo."""
    n1 = CompetenciaEnquadramento.objects.filter(competencia=competencia).delete()[0]
    n2 = CompetenciaAlocacao.objects.filter(competencia=competencia).delete()[0]
    return n1, n2


# ─────────────────────── ARQUIVO CONTÁBIL DO EXERCÍCIO ───────────────────────
# Estoque permanente dos relatórios técnico-contábeis: um PDF por exercício
# cobrindo a movimentação inteira do ano (receita, tributos, folha, margem,
# quebras e rastreabilidade das competências).
#
# REGRA DO ARQUIVO: nada é sobrescrito. Cada geração cria uma VERSÃO nova e as
# anteriores continuam baixáveis. Arquivo contábil que apaga o que já emitiu
# não serve de arquivo — se um número mudou, o valor está justamente em poder
# comparar a emissão antiga com a nova.

def _caminho_relatorio_exercicio(instance, filename):
    """media/arquivo-contabil/<exercicio>/<arquivo>."""
    return f"arquivo-contabil/{instance.exercicio}/{filename}"


class RelatorioExercicio(models.Model):
    """Um PDF técnico-contábil fechado, de um exercício, congelado no tempo."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    exercicio = models.IntegerField(help_text="Ano do exercício (ex.: 2026)")
    versao = models.IntegerField(default=1)
    arquivo = models.FileField(upload_to=_caminho_relatorio_exercicio)
    nome_arquivo = models.CharField(max_length=255)
    tamanho = models.IntegerField(default=0)
    # impressão digital do PDF: prova que o arquivo baixado hoje é byte a byte
    # o mesmo que foi emitido na data da geração
    sha256 = models.CharField(max_length=64, blank=True, default="")
    gerado_por = models.CharField(max_length=150, blank=True, default="")
    gerado_em = models.DateTimeField(auto_now_add=True)
    # DEFINITIVO = os 12 meses do exercício existem e estão todos fechados.
    # Parcial não é defeito: é o retrato de um exercício ainda em curso, e o
    # PDF diz isso na cara para ninguém arquivar um ano incompleto como final.
    definitivo = models.BooleanField(default=False)
    competencias_no_ano = models.IntegerField(default=0)
    competencias_fechadas = models.IntegerField(default=0)
    # números de capa, para a listagem não precisar abrir o PDF
    resumo = models.JSONField(null=True, blank=True)

    class Meta:
        db_table = "ef_relatorios_exercicio"
        ordering = ["-exercicio", "-versao"]
        constraints = [models.UniqueConstraint(fields=["exercicio", "versao"],
                                               name="uq_relatorio_exercicio_versao")]

    def __str__(self):
        return f"Relatório técnico-contábil {self.exercicio} (v{self.versao})"
