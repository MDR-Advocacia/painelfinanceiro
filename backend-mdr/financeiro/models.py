import uuid
from django.conf import settings
from django.db import models

# ─── Tabela canônica de MÓDULOS do painel (permissão de visualização) ───
# key = view do frontend; label = como aparece no menu do ADM.
MODULOS = [
    ("dashboard", "Dashboard Consolidado"),
    ("projecoes", "Projeções"),
    ("ranking", "Rentabilidade"),
    ("honorarios", "Honorários BB"),
    ("config-estrategica", "Gestão Estratégica (VPD)"),
    ("sedes", "Sedes (estrutura/custos)"),
    ("setores", "Setores (pessoal/faturamento)"),
    ("pessoal", "Controle de Pessoal (DP)"),
]
MODULO_KEYS = [k for k, _ in MODULOS]

# Níveis de permissão por módulo (RBAC v2): o valor no JSON `modulos` do cargo
# pode ser False/"nada", "ver" (só visualização) ou "editar" (ver+alterar).
# Legado: True (checkbox antigo) equivale a "editar" — preserva o comportamento
# de quem já tinha o módulo antes dos níveis existirem.
NIVEL_NADA, NIVEL_VER, NIVEL_EDITAR = "nada", "ver", "editar"


def normalizar_nivel(valor) -> str:
    if valor is True or valor == NIVEL_EDITAR:
        return NIVEL_EDITAR
    if valor == NIVEL_VER:
        return NIVEL_VER
    return NIVEL_NADA

class Sede(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user_id = models.UUIDField(help_text="ID do usuário (Herdado do Supabase auth.users)")
    nome = models.CharField(max_length=255)
    periodos = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'sedes'

    def __str__(self):
        return self.nome

class Setor(models.Model):
    TIPO_CHOICES = [
        ('operacional', 'Operacional'),
        ('administrativo', 'Administrativo'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user_id = models.UUIDField()
    nome = models.CharField(max_length=255)
    tipo = models.CharField(max_length=50, choices=TIPO_CHOICES)
    sede = models.ForeignKey(Sede, on_delete=models.SET_NULL, null=True, blank=True, db_column='sede_id')
    periodos = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'setores'

    def __str__(self):
        return f"{self.nome} ({self.get_tipo_display()})"

class VpdConfig(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user_id = models.UUIDField()
    periodo = models.CharField(max_length=7, unique=True)
    valor = models.FloatField()
    
    # NOVOS CAMPOS PARA MEMÓRIA DE CÁLCULO
    headcount = models.IntegerField(null=True, blank=True)
    despesasBase = models.JSONField(null=True, blank=True)
    pessoalApoio = models.JSONField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'vpd_configs'

    def __str__(self):
        return f"VPD {self.periodo}: R$ {self.valor}"

class Cargo(models.Model):
    """Cargo/papel do RBAC — a política de acesso é POR CARGO, tabelada.

    `modulos` é um dict {modulo_key: bool} sobre a tabela MODULOS: True = o
    cargo enxerga o módulo. Admin (is_staff do Django) bypassa tudo. Cargos
    padrão são seedados na migration 0003 (Admin, Sócio, Supervisor,
    Departamento Pessoal, Financeiro) e o menu do ADM permite criar outros.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nome = models.CharField(max_length=100, unique=True)
    modulos = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'cargos'
        ordering = ['nome']

    def __str__(self):
        return self.nome

    def modulos_efetivos(self) -> dict:
        """Dict completo por NÍVEL: {modulo: "nada"|"ver"|"editar"} (toda key presente).
        Valores legados True/False são normalizados (True→editar)."""
        base = {k: NIVEL_NADA for k in MODULO_KEYS}
        for k, v in (self.modulos or {}).items():
            if k in base:
                base[k] = normalizar_nivel(v)
        return base


class PerfilUsuario(models.Model):
    """Vínculo usuário→cargo (1:1). Usuário sem cargo = sem módulos (exceto staff)."""
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                                related_name='perfil')
    cargo = models.ForeignKey(Cargo, on_delete=models.SET_NULL, null=True, blank=True,
                              related_name='usuarios')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'perfis_usuario'

    def __str__(self):
        return f"{self.user} → {self.cargo or 'sem cargo'}"


class BaseReferencia(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    npj_original = models.TextField(null=True, blank=True)
    npj_limpo = models.TextField(unique=True)
    polo = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'base_referencia'

    def __str__(self):
        return self.npj_limpo


# ═══════════════ MÓDULO CONTROLE DE PESSOAL (DP) — F1: cadastro ═══════════════
# Sistematização da planilha "Controle de Pessoal DP - CC.xlsx".
# Ver docs/controle-pessoal-plano.md (blueprint completo, fases F1..F5).

# Regimes com a lógica de matrícula da casa: Estagiário 10xx · CLT 20xx ·
# Associado 30xx · PJ 40xx (faixa base usada pra gerar a próxima matrícula).
DP_REGIMES = [
    ("estagiario", "Estagiário (TCE)"),
    ("clt", "CLT"),
    ("associado", "Associado"),
    ("pj", "PJ"),
]
DP_MATRICULA_BASE = {"estagiario": 1000, "clt": 2000, "associado": 3000, "pj": 4000}


class DpCentroCusto(models.Model):
    """Catálogo de Centros de Custo (CONFIG da planilha: 1=ADM … 9=Réu-Ativos)."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    codigo = models.IntegerField()
    nome = models.CharField(max_length=120, unique=True)
    ativo = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'dp_centros_custo'
        ordering = ['codigo', 'nome']

    def __str__(self):
        return f"[{self.codigo}] {self.nome}"


class DpCargo(models.Model):
    """Plano de cargos e salários (TB_Cargos da planilha)."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    area = models.CharField(max_length=20, blank=True, default="")  # ADM/TI/JUR/DIR
    nome = models.CharField(max_length=120, unique=True)
    salario_base = models.FloatField(default=0)
    dias_mes = models.IntegerField(default=30)
    carga_horaria_mes = models.IntegerField(default=220)
    ativo = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'dp_cargos'
        ordering = ['area', 'nome']

    def __str__(self):
        return self.nome


class DpColaborador(models.Model):
    """Ficha do colaborador (TB_Colaboradores). Uma linha por MATRÍCULA — a mesma
    pessoa pode ter 2 matrículas na história (ex.: estagiário 10xx que virou CLT
    20xx), igual na planilha."""
    STATUS = [("ativo", "Ativo"), ("inativo", "Inativo")]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    matricula = models.IntegerField(unique=True)
    nome = models.CharField(max_length=200)
    sexo = models.CharField(max_length=10, blank=True, default="")
    cpf = models.CharField(max_length=14, blank=True, default="")
    unidade = models.CharField(max_length=80, blank=True, default="")
    area = models.CharField(max_length=20, blank=True, default="")
    centro_custo = models.ForeignKey(DpCentroCusto, on_delete=models.PROTECT,
                                     related_name="colaboradores")
    supervisor = models.CharField(max_length=120, blank=True, default="")
    equipe = models.CharField(max_length=120, blank=True, default="")
    cargo = models.ForeignKey(DpCargo, on_delete=models.SET_NULL, null=True, blank=True,
                              related_name="colaboradores")
    regime = models.CharField(max_length=20, choices=DP_REGIMES)
    status = models.CharField(max_length=10, choices=STATUS, default="ativo")
    data_entrada = models.DateField(null=True, blank=True)
    data_admissao = models.DateField(null=True, blank=True)
    data_demissao = models.DateField(null=True, blank=True)
    salario_bruto = models.FloatField(default=0)
    saldo_livre = models.FloatField(default=0)      # parcela extra (Associados)
    vt = models.FloatField(default=0)
    opta_vt = models.BooleanField(default=True)
    va = models.FloatField(default=0)
    conta_bb = models.CharField(max_length=60, blank=True, default="")
    pix = models.CharField(max_length=120, blank=True, default="")
    conta_caixa = models.CharField(max_length=60, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'dp_colaboradores'
        ordering = ['nome']

    def __str__(self):
        return f"{self.matricula} · {self.nome}"


class DpEvento(models.Model):
    """Event log de RH: admissão, desligamento, transferência de CC, reajuste,
    edição cadastral. Headcount/turnover/histórico da ficha saem daqui."""
    TIPOS = [
        ("admissao", "Admissão"),
        ("desligamento", "Desligamento"),
        ("transferencia_cc", "Transferência de CC"),
        ("reajuste", "Reajuste salarial"),
        ("edicao", "Edição cadastral"),
        ("importacao", "Importação de planilha"),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    colaborador = models.ForeignKey(DpColaborador, on_delete=models.CASCADE,
                                    related_name="eventos")
    tipo = models.CharField(max_length=30, choices=TIPOS)
    data_efeito = models.DateField()
    payload = models.JSONField(default=dict, blank=True)
    autor = models.CharField(max_length=150, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'dp_eventos'
        ordering = ['-data_efeito', '-created_at']


class DpTabelaFiscal(models.Model):
    """Parâmetros fiscais VERSIONADOS por vigência (nunca sobrescrever o passado
    — cada competência usa a tabela vigente no seu mês).

    `inss_faixas`: [{"ate": 1621.0, "aliquota": 0.075, "deducao": 0.0}, ...]
    (progressiva por parcela a deduzir; a última faixa é o teto — acima dele o
    desconto trava no máximo da última faixa).
    `provisao_base`: "bruto_menos_inss" espelha a planilha do DP;
    "bruto" é o padrão contábil (decisão pendente com o DP — configurável).
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    vigencia_inicio = models.DateField(unique=True)  # ex.: 2026-01-01
    inss_faixas = models.JSONField(default=list)
    vt_percent = models.FloatField(default=0.06)
    fgts_percent = models.FloatField(default=0.08)
    multa_fgts_percent = models.FloatField(default=0.40)   # provisão sobre o FGTS
    inss_patronal_percent = models.FloatField(default=0.21)
    provisao_base = models.CharField(max_length=20, default="bruto_menos_inss",
                                     choices=[("bruto_menos_inss", "Bruto − INSS (planilha)"),
                                              ("bruto", "Bruto (padrão contábil)")])
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'dp_tabelas_fiscais'
        ordering = ['-vigencia_inicio']

    def __str__(self):
        return f"Tabela fiscal desde {self.vigencia_inicio}"


class DpCompetencia(models.Model):
    """O mês de folha. Esteira: aberta → em_revisao → fechada.
    Fechar exige aprovador DIFERENTE de quem enviou pra revisão (4-olhos) e
    congela os itens (snapshot). Reabrir exige justificativa (auditada)."""
    STATUS = [("aberta", "Aberta"), ("em_revisao", "Em revisão"), ("fechada", "Fechada")]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ano = models.IntegerField()
    mes = models.IntegerField()  # 1..12
    dias_mes = models.IntegerField(default=30)
    dias_uteis = models.IntegerField(default=22)
    status = models.CharField(max_length=15, choices=STATUS, default="aberta")
    aberta_por = models.CharField(max_length=150, blank=True, default="")
    enviada_revisao_por = models.CharField(max_length=150, blank=True, default="")
    fechada_por = models.CharField(max_length=150, blank=True, default="")
    fechada_em = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'dp_competencias'
        unique_together = [('ano', 'mes')]
        ordering = ['-ano', '-mes']

    def __str__(self):
        return f"{self.mes:02d}/{self.ano} ({self.status})"


class DpLancamento(models.Model):
    """Ocorrências do colaborador na competência: faltas, premiações, acertos."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    competencia = models.ForeignKey(DpCompetencia, on_delete=models.CASCADE,
                                    related_name="lancamentos")
    colaborador = models.ForeignKey(DpColaborador, on_delete=models.CASCADE,
                                    related_name="lancamentos")
    faltas_dias = models.FloatField(default=0)
    faltas_horas = models.FloatField(default=0)
    premiacoes = models.FloatField(default=0)
    acerto_contabil = models.FloatField(default=0)
    obs = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'dp_lancamentos'
        unique_together = [('competencia', 'colaborador')]


class DpFolhaItem(models.Model):
    """Linha calculada da folha (as 35 colunas da planilha). Recalculável com a
    competência aberta; CONGELADA no fechamento. `memoria` = como cada número
    foi obtido (transparência de cálculo, clicável na UI)."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    competencia = models.ForeignKey(DpCompetencia, on_delete=models.CASCADE,
                                    related_name="itens")
    colaborador = models.ForeignKey(DpColaborador, on_delete=models.PROTECT,
                                    related_name="folha_itens")
    # snapshot cadastral do momento do cálculo (não muda se a ficha mudar depois)
    matricula = models.IntegerField()
    nome = models.CharField(max_length=200)
    regime = models.CharField(max_length=20)
    centro_custo_nome = models.CharField(max_length=120)
    # entradas
    salario_bruto = models.FloatField(default=0)
    vt = models.FloatField(default=0)
    va = models.FloatField(default=0)
    saldo_livre = models.FloatField(default=0)
    faltas_dias = models.FloatField(default=0)
    faltas_horas = models.FloatField(default=0)
    premiacoes = models.FloatField(default=0)
    acerto_contabil = models.FloatField(default=0)
    # calculados
    desc_faltas = models.FloatField(default=0)
    salario_com_faltas = models.FloatField(default=0)
    vt_com_faltas = models.FloatField(default=0)
    va_com_faltas = models.FloatField(default=0)
    desc_inss = models.FloatField(default=0)
    desc_vt = models.FloatField(default=0)
    salario_com_descontos = models.FloatField(default=0)
    total_pagar = models.FloatField(default=0)
    # provisões
    decimo_mensal = models.FloatField(default=0)
    ferias_mensal = models.FloatField(default=0)
    terco_ferias_mensal = models.FloatField(default=0)
    fgts_mensal = models.FloatField(default=0)
    multa_fgts_mensal = models.FloatField(default=0)
    recesso_mensal = models.FloatField(default=0)
    inss_patronal = models.FloatField(default=0)
    custo_provisoes = models.FloatField(default=0)
    custo_total = models.FloatField(default=0)  # total_pagar + provisões + patronal
    memoria = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'dp_folha_itens'
        unique_together = [('competencia', 'colaborador')]
        ordering = ['nome']


class DpAuditLog(models.Model):
    """Trilha de auditoria IMUTÁVEL do módulo DP: toda escrita loga quem, quando,
    o quê e o antes→depois. Nunca é editada nem apagada pela aplicação."""
    id = models.BigAutoField(primary_key=True)
    usuario = models.CharField(max_length=150)
    acao = models.CharField(max_length=40)          # criar/editar/desligar/importar/excluir
    entidade = models.CharField(max_length=60)      # dp_colaborador, dp_cargo, ...
    entidade_id = models.CharField(max_length=60, blank=True, default="")
    antes = models.JSONField(null=True, blank=True)
    depois = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'dp_audit_log'
        ordering = ['-created_at']