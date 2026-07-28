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
]
MODULO_KEYS = [k for k, _ in MODULOS]

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
        """Dict completo (toda key da tabela presente; ausente = False)."""
        base = {k: False for k in MODULO_KEYS}
        base.update({k: bool(v) for k, v in (self.modulos or {}).items() if k in base})
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