# DP — F2: competência mensal + folha. Tabelas dp_tabelas_fiscais (versionada
# por vigência, seed 2026 com a INSS OFICIAL), dp_competencias, dp_lancamentos,
# dp_folha_itens.
import uuid

import django.db.models.deletion
from django.db import migrations, models


def seed_fiscal_2026(apps, schema_editor):
    T = apps.get_model("financeiro", "DpTabelaFiscal")
    T.objects.get_or_create(
        vigencia_inicio="2026-01-01",
        defaults={
            # Tabela INSS 2026 oficial (mesmas faixas da aba TABELA INSS da planilha)
            "inss_faixas": [
                {"ate": 1621.00, "aliquota": 0.075, "deducao": 0.00},
                {"ate": 2902.84, "aliquota": 0.09, "deducao": 24.32},
                {"ate": 4354.27, "aliquota": 0.12, "deducao": 111.40},
                {"ate": 8475.55, "aliquota": 0.14, "deducao": 198.49},
            ],
            "vt_percent": 0.06,
            "fgts_percent": 0.08,
            "multa_fgts_percent": 0.40,
            "inss_patronal_percent": 0.21,
            # espelha a planilha até o DP decidir mudar pro padrão contábil
            "provisao_base": "bruto_menos_inss",
        },
    )


class Migration(migrations.Migration):

    dependencies = [
        ("financeiro", "0004_dp_cadastro"),
    ]

    operations = [
        migrations.CreateModel(
            name="DpTabelaFiscal",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("vigencia_inicio", models.DateField(unique=True)),
                ("inss_faixas", models.JSONField(default=list)),
                ("vt_percent", models.FloatField(default=0.06)),
                ("fgts_percent", models.FloatField(default=0.08)),
                ("multa_fgts_percent", models.FloatField(default=0.4)),
                ("inss_patronal_percent", models.FloatField(default=0.21)),
                ("provisao_base", models.CharField(choices=[("bruto_menos_inss", "Bruto − INSS (planilha)"), ("bruto", "Bruto (padrão contábil)")], default="bruto_menos_inss", max_length=20)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={"db_table": "dp_tabelas_fiscais", "ordering": ["-vigencia_inicio"]},
        ),
        migrations.CreateModel(
            name="DpCompetencia",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("ano", models.IntegerField()),
                ("mes", models.IntegerField()),
                ("dias_mes", models.IntegerField(default=30)),
                ("dias_uteis", models.IntegerField(default=22)),
                ("status", models.CharField(choices=[("aberta", "Aberta"), ("em_revisao", "Em revisão"), ("fechada", "Fechada")], default="aberta", max_length=15)),
                ("aberta_por", models.CharField(blank=True, default="", max_length=150)),
                ("enviada_revisao_por", models.CharField(blank=True, default="", max_length=150)),
                ("fechada_por", models.CharField(blank=True, default="", max_length=150)),
                ("fechada_em", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={"db_table": "dp_competencias", "ordering": ["-ano", "-mes"],
                     "unique_together": {("ano", "mes")}},
        ),
        migrations.CreateModel(
            name="DpLancamento",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("faltas_dias", models.FloatField(default=0)),
                ("faltas_horas", models.FloatField(default=0)),
                ("premiacoes", models.FloatField(default=0)),
                ("acerto_contabil", models.FloatField(default=0)),
                ("obs", models.TextField(blank=True, default="")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("colaborador", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="lancamentos", to="financeiro.dpcolaborador")),
                ("competencia", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="lancamentos", to="financeiro.dpcompetencia")),
            ],
            options={"db_table": "dp_lancamentos",
                     "unique_together": {("competencia", "colaborador")}},
        ),
        migrations.CreateModel(
            name="DpFolhaItem",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("matricula", models.IntegerField()),
                ("nome", models.CharField(max_length=200)),
                ("regime", models.CharField(max_length=20)),
                ("centro_custo_nome", models.CharField(max_length=120)),
                ("salario_bruto", models.FloatField(default=0)),
                ("vt", models.FloatField(default=0)),
                ("va", models.FloatField(default=0)),
                ("saldo_livre", models.FloatField(default=0)),
                ("faltas_dias", models.FloatField(default=0)),
                ("faltas_horas", models.FloatField(default=0)),
                ("premiacoes", models.FloatField(default=0)),
                ("acerto_contabil", models.FloatField(default=0)),
                ("desc_faltas", models.FloatField(default=0)),
                ("salario_com_faltas", models.FloatField(default=0)),
                ("vt_com_faltas", models.FloatField(default=0)),
                ("va_com_faltas", models.FloatField(default=0)),
                ("desc_inss", models.FloatField(default=0)),
                ("desc_vt", models.FloatField(default=0)),
                ("salario_com_descontos", models.FloatField(default=0)),
                ("total_pagar", models.FloatField(default=0)),
                ("decimo_mensal", models.FloatField(default=0)),
                ("ferias_mensal", models.FloatField(default=0)),
                ("terco_ferias_mensal", models.FloatField(default=0)),
                ("fgts_mensal", models.FloatField(default=0)),
                ("multa_fgts_mensal", models.FloatField(default=0)),
                ("recesso_mensal", models.FloatField(default=0)),
                ("inss_patronal", models.FloatField(default=0)),
                ("custo_provisoes", models.FloatField(default=0)),
                ("custo_total", models.FloatField(default=0)),
                ("memoria", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("colaborador", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="folha_itens", to="financeiro.dpcolaborador")),
                ("competencia", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="itens", to="financeiro.dpcompetencia")),
            ],
            options={"db_table": "dp_folha_itens", "ordering": ["nome"],
                     "unique_together": {("competencia", "colaborador")}},
        ),
        migrations.RunPython(seed_fiscal_2026, migrations.RunPython.noop),
    ]
