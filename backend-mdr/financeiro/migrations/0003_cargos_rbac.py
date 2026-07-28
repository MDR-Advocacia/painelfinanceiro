# RBAC por cargo: tabela `cargos` (permissões de visualização por módulo,
# JSONField {modulo: bool}) + `perfis_usuario` (user 1:1 cargo). Seeda os
# cargos padrão da casa — o menu do ADM permite ajustar/criar outros.
import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def seed_cargos(apps, schema_editor):
    Cargo = apps.get_model("financeiro", "Cargo")
    todos = ["dashboard", "projecoes", "ranking", "honorarios",
             "config-estrategica", "sedes", "setores"]

    def m(*keys):
        return {k: (k in keys) for k in todos}

    defaults = [
        ("Admin", m(*todos)),
        ("Sócio", m(*todos)),
        ("Supervisor", m("dashboard", "projecoes", "ranking", "setores")),
        ("Departamento Pessoal", m("setores")),
        ("Financeiro", m("dashboard", "projecoes", "ranking", "honorarios", "sedes")),
    ]
    for nome, modulos in defaults:
        Cargo.objects.get_or_create(nome=nome, defaults={"modulos": modulos})


def unseed_cargos(apps, schema_editor):
    Cargo = apps.get_model("financeiro", "Cargo")
    Cargo.objects.filter(nome__in=[
        "Admin", "Sócio", "Supervisor", "Departamento Pessoal", "Financeiro",
    ]).delete()


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("financeiro", "0002_vpdconfig_despesasbase_vpdconfig_headcount_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="Cargo",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False,
                                        primary_key=True, serialize=False)),
                ("nome", models.CharField(max_length=100, unique=True)),
                ("modulos", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={"db_table": "cargos", "ordering": ["nome"]},
        ),
        migrations.CreateModel(
            name="PerfilUsuario",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True,
                                           serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("cargo", models.ForeignKey(blank=True, null=True,
                                            on_delete=django.db.models.deletion.SET_NULL,
                                            related_name="usuarios", to="financeiro.cargo")),
                ("user", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE,
                                              related_name="perfil",
                                              to=settings.AUTH_USER_MODEL)),
            ],
            options={"db_table": "perfis_usuario"},
        ),
        migrations.RunPython(seed_cargos, unseed_cargos),
    ]
