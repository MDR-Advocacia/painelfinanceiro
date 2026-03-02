import uuid
from django.db import models

class Sede(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user_id = models.UUIDField(help_text="ID do usuário (Herdado do Supabase auth.users)")
    nome = models.CharField(max_length=255)
    periodos = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'sedes' # Força o nome exato da tabela do backup

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
    # db_column='sede_id' garante que o Django crie a coluna com o nome exato do Supabase
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
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'vpd_configs'

    def __str__(self):
        return f"VPD {self.periodo}: R$ {self.valor}"

class BaseReferencia(models.Model):
    # A tabela usada no módulo Honorários BB para cruzar NPJ com o Polo
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    npj_original = models.TextField(null=True, blank=True)
    npj_limpo = models.TextField(unique=True)
    polo = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'base_referencia'

    def __str__(self):
        return self.npj_limpo