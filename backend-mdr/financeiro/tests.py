from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from .estrutura_views import _competencia_do_periodo
from .models import CentroFaturamento, DpCompetencia, LinhaFaturamento, Sede, Setor


class FaturamentoEspelhoTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("admin", password="senha", is_staff=True)
        token = Token.objects.create(user=self.user)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")

        sede = Sede.objects.create(user_id="00000000-0000-0000-0000-000000000001",
                                   nome="Capim Macio")
        self.setor = Setor.objects.create(
            user_id="00000000-0000-0000-0000-000000000001",
            nome="Defesas e Recursos - BB Réu", tipo="operacional", sede=sede,
            periodos={},
        )
        centro = CentroFaturamento.objects.create(nome="Banco do Brasil")
        self.linha = LinhaFaturamento.objects.create(
            centro=centro, nome="Defesas e Recursos", area="passivo",
            sede=sede, setor_legado=self.setor,
        )

    def test_lancamento_individual_espelha_faturamento_no_dashboard(self):
        resposta = self.client.patch(
            f"/api/estrutura/linhas/{self.linha.id}/faturamento/",
            {"periodo": "2026-07", "bruto": 600700, "descontos": 700},
            format="json",
        )

        self.assertEqual(resposta.status_code, 200)
        self.assertEqual(resposta.json()["espelhado_em"], [self.setor.nome])
        self.setor.refresh_from_db()
        faturamento = self.setor.periodos["2026-07"]["faturamento"]
        self.assertEqual(faturamento["bruto"], 600700)
        self.assertEqual(faturamento["descontos"], 700)

    def test_informe_do_centro_espelha_faturamento_no_dashboard(self):
        resposta = self.client.patch(
            f"/api/estrutura/centros/{self.linha.centro_id}/faturamento/",
            {"periodo": "2026-07", "lancamentos": [
                {"linha_id": str(self.linha.id), "bruto": 600700, "descontos": 0},
            ]},
            format="json",
        )

        self.assertEqual(resposta.status_code, 200)
        self.setor.refresh_from_db()
        self.assertEqual(
            self.setor.periodos["2026-07"]["faturamento"]["bruto"], 600700,
        )

    def test_linha_nova_ja_nasce_com_setor_para_nao_sumir_do_dashboard(self):
        resposta = self.client.post(
            "/api/estrutura/linhas/",
            {"centro_id": str(self.linha.centro_id),
             "nome": "Faturamentos diversos", "area": "especializada"},
            format="json",
        )

        self.assertEqual(resposta.status_code, 201)
        linha = LinhaFaturamento.objects.get(pk=resposta.json()["id"])
        self.assertIsNotNone(linha.setor_legado_id)
        self.assertEqual(linha.setor_legado.nome, "Faturamentos diversos")

        lancamento = self.client.patch(
            f"/api/estrutura/linhas/{linha.id}/faturamento/",
            {"periodo": "2026-07", "bruto": 146166.43, "descontos": 0},
            format="json",
        )
        self.assertEqual(lancamento.status_code, 200)
        linha.setor_legado.refresh_from_db()
        faturamento = linha.setor_legado.periodos["2026-07"]["faturamento"]
        self.assertEqual(faturamento["bruto"], 146166.43)
        self.assertEqual(faturamento["aliquotaLucroPresumido"], 0.32)

class CompetenciaEstruturaTests(TestCase):
    def test_receita_de_julho_usa_folha_de_julho_mesmo_aberta(self):
        DpCompetencia.objects.create(ano=2026, mes=5, status="fechada")
        julho = DpCompetencia.objects.create(ano=2026, mes=7, status="aberta")

        competencia, parcial = _competencia_do_periodo("2026-07")

        self.assertEqual(competencia.id, julho.id)
        self.assertTrue(parcial)

    def test_periodo_sem_folha_cai_na_ultima_fechada(self):
        maio = DpCompetencia.objects.create(ano=2026, mes=5, status="fechada")

        competencia, parcial = _competencia_do_periodo("2026-06")

        self.assertEqual(competencia.id, maio.id)
        self.assertFalse(parcial)
