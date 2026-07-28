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
