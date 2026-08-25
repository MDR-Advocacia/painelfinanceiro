from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from .estrutura_views import (
    _competencia_do_periodo, _enquadramento_da_competencia, _impostos,
    _quadro_ativo_por_equipe,
)
from .models import (
    CentroFaturamento, DpAuditLog, DpCentroCusto, DpColaborador, DpCompetencia,
    DpFolhaItem, Equipe, LinhaFaturamento, Sede, Setor,
)
from .models_estrutura import CompetenciaEnquadramento, congelar_competencia


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
    def test_impostos_usam_defaults_quando_registro_antigo_so_tem_bruto(self):
        impostos = _impostos({"bruto": 814673.38, "descontos": 0})

        self.assertEqual(impostos["total"], 116372.04)

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


class EquipeHistoricoTests(TestCase):
    def setUp(self):
        user = User.objects.create_user("equipes", password="senha", is_staff=True)
        token = Token.objects.create(user=user)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")

        cc = DpCentroCusto.objects.create(codigo=3, nome="Autor - BB")
        self.equipe = Equipe.objects.create(
            slug="ajuizamento-teste", nome="Ajuizamento", grupo="credito")
        self.comp = DpCompetencia.objects.create(ano=2026, mes=7, status="aberta")
        self.pessoas = []
        for n in range(5):
            pessoa = DpColaborador.objects.create(
                matricula=2000 + n, nome=f"Pessoa {n}", unidade="Manhattan",
                centro_custo=cc, equipe_ref=self.equipe, regime="clt", status="ativo",
            )
            self.pessoas.append(pessoa)
        for pessoa in self.pessoas[:3]:
            DpFolhaItem.objects.create(
                competencia=self.comp, colaborador=pessoa, matricula=pessoa.matricula,
                nome=pessoa.nome, regime=pessoa.regime, centro_custo_nome=cc.nome,
                salario_bruto=2000, custo_total=3000, total_pagar=2000,
            )

    def test_quadro_atual_e_historico_da_folha_sao_separados(self):
        url = f"/api/estrutura/equipes/{self.equipe.id}/detalhe/?periodo=2026-07"

        atual = self.client.get(url + "&composicao=atual")
        historico = self.client.get(url + "&composicao=historica")

        self.assertEqual(atual.status_code, 200)
        self.assertEqual(historico.status_code, 200)
        self.assertEqual(atual.json()["totais"]["ativos"], 5)
        self.assertEqual(historico.json()["totais"]["ativos"], 3)
        self.assertEqual(historico.json()["historico_origem"], "folha_e_quadro_atual")

    def test_retrato_da_competencia_preserva_as_cinco_pessoas_de_hoje(self):
        CompetenciaEnquadramento.objects.bulk_create([
            CompetenciaEnquadramento(
                competencia=self.comp, colaborador=pessoa, equipe=self.equipe,
            )
            for pessoa in self.pessoas
        ])
        DpAuditLog.objects.create(
            usuario="teste", acao="salvar_retrato", entidade="dp_competencia",
            entidade_id=str(self.comp.id), depois={"foto_enquadramentos": 5},
        )

        url = (f"/api/estrutura/equipes/{self.equipe.id}/detalhe/"
               "?periodo=2026-07&composicao=historica")
        historico = self.client.get(url)

        self.assertEqual(historico.status_code, 200)
        self.assertEqual(historico.json()["totais"]["ativos"], 5)
        self.assertEqual(historico.json()["historico_origem"], "retrato_competencia")

    def test_retrato_parcial_nao_remove_enquadramento_usado_pelos_custos(self):
        CompetenciaEnquadramento.objects.create(
            competencia=self.comp, colaborador=self.pessoas[0], equipe=self.equipe,
        )

        enquadramento = _enquadramento_da_competencia(self.comp)

        self.assertEqual(len(enquadramento), 5)
        self.assertEqual(enquadramento[self.pessoas[4].id], self.equipe.id)

    def test_retrato_manual_define_headcount_e_nao_e_sobrescrito_no_fechamento(self):
        retratadas = self.pessoas[:3]
        CompetenciaEnquadramento.objects.bulk_create([
            CompetenciaEnquadramento(
                competencia=self.comp, colaborador=pessoa, equipe=self.equipe,
            )
            for pessoa in retratadas
        ])
        DpAuditLog.objects.create(
            usuario="teste", acao="salvar_retrato", entidade="dp_competencia",
            entidade_id=str(self.comp.id), depois={"foto_enquadramentos": 3},
        )

        quadro = _quadro_ativo_por_equipe(self.comp)
        congelar_competencia(self.comp)

        self.assertEqual(quadro[str(self.equipe.id)]["total"], 3)
        self.assertEqual(
            CompetenciaEnquadramento.objects.filter(
                competencia=self.comp, equipe=self.equipe,
            ).count(),
            3,
        )
