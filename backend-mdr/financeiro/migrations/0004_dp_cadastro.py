# Módulo Controle de Pessoal (DP) — F1: cadastro.
# Tabelas dp_centros_custo, dp_cargos, dp_colaboradores, dp_eventos, dp_audit_log.
# Data migration: libera o módulo `pessoal` nos cargos padrão (Departamento
# Pessoal = editar; Sócio = ver; Admin já bypassa por is_staff).
import uuid

import django.db.models.deletion
from django.db import migrations, models


def libera_modulo_pessoal(apps, schema_editor):
    Cargo = apps.get_model("financeiro", "Cargo")
    for nome, nivel in [("Departamento Pessoal", "editar"), ("Sócio", "ver"), ("Admin", "editar")]:
        c = Cargo.objects.filter(nome=nome).first()
        if c:
            mods = dict(c.modulos or {})
            mods["pessoal"] = nivel
            c.modulos = mods
            c.save(update_fields=["modulos"])


def remove_modulo_pessoal(apps, schema_editor):
    Cargo = apps.get_model("financeiro", "Cargo")
    for c in Cargo.objects.all():
        mods = dict(c.modulos or {})
        if "pessoal" in mods:
            mods.pop("pessoal")
            c.modulos = mods
            c.save(update_fields=["modulos"])


class Migration(migrations.Migration):

    dependencies = [
        ("financeiro", "0003_cargos_rbac"),
    ]

    operations = [
        migrations.CreateModel(
            name="DpCentroCusto",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("codigo", models.IntegerField()),
                ("nome", models.CharField(max_length=120, unique=True)),
                ("ativo", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={"db_table": "dp_centros_custo", "ordering": ["codigo", "nome"]},
        ),
        migrations.CreateModel(
            name="DpCargo",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("area", models.CharField(blank=True, default="", max_length=20)),
                ("nome", models.CharField(max_length=120, unique=True)),
                ("salario_base", models.FloatField(default=0)),
                ("dias_mes", models.IntegerField(default=30)),
                ("carga_horaria_mes", models.IntegerField(default=220)),
                ("ativo", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={"db_table": "dp_cargos", "ordering": ["area", "nome"]},
        ),
        migrations.CreateModel(
            name="DpColaborador",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("matricula", models.IntegerField(unique=True)),
                ("nome", models.CharField(max_length=200)),
                ("sexo", models.CharField(blank=True, default="", max_length=10)),
                ("cpf", models.CharField(blank=True, default="", max_length=14)),
                ("unidade", models.CharField(blank=True, default="", max_length=80)),
                ("area", models.CharField(blank=True, default="", max_length=20)),
                ("supervisor", models.CharField(blank=True, default="", max_length=120)),
                ("equipe", models.CharField(blank=True, default="", max_length=120)),
                ("regime", models.CharField(choices=[("estagiario", "Estagiário (TCE)"), ("clt", "CLT"), ("associado", "Associado"), ("pj", "PJ")], max_length=20)),
                ("status", models.CharField(choices=[("ativo", "Ativo"), ("inativo", "Inativo")], default="ativo", max_length=10)),
                ("data_entrada", models.DateField(blank=True, null=True)),
                ("data_admissao", models.DateField(blank=True, null=True)),
                ("data_demissao", models.DateField(blank=True, null=True)),
                ("salario_bruto", models.FloatField(default=0)),
                ("saldo_livre", models.FloatField(default=0)),
                ("vt", models.FloatField(default=0)),
                ("opta_vt", models.BooleanField(default=True)),
                ("va", models.FloatField(default=0)),
                ("conta_bb", models.CharField(blank=True, default="", max_length=60)),
                ("pix", models.CharField(blank=True, default="", max_length=120)),
                ("conta_caixa", models.CharField(blank=True, default="", max_length=60)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("cargo", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="colaboradores", to="financeiro.dpcargo")),
                ("centro_custo", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="colaboradores", to="financeiro.dpcentrocusto")),
            ],
            options={"db_table": "dp_colaboradores", "ordering": ["nome"]},
        ),
        migrations.CreateModel(
            name="DpEvento",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("tipo", models.CharField(choices=[("admissao", "Admissão"), ("desligamento", "Desligamento"), ("transferencia_cc", "Transferência de CC"), ("reajuste", "Reajuste salarial"), ("edicao", "Edição cadastral"), ("importacao", "Importação de planilha")], max_length=30)),
                ("data_efeito", models.DateField()),
                ("payload", models.JSONField(blank=True, default=dict)),
                ("autor", models.CharField(blank=True, default="", max_length=150)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("colaborador", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="eventos", to="financeiro.dpcolaborador")),
            ],
            options={"db_table": "dp_eventos", "ordering": ["-data_efeito", "-created_at"]},
        ),
        migrations.CreateModel(
            name="DpAuditLog",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False)),
                ("usuario", models.CharField(max_length=150)),
                ("acao", models.CharField(max_length=40)),
                ("entidade", models.CharField(max_length=60)),
                ("entidade_id", models.CharField(blank=True, default="", max_length=60)),
                ("antes", models.JSONField(blank=True, null=True)),
                ("depois", models.JSONField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={"db_table": "dp_audit_log", "ordering": ["-created_at"]},
        ),
        migrations.RunPython(libera_modulo_pessoal, remove_modulo_pessoal),
    ]
