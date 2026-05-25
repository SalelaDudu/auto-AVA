// ==UserScript==
// @name         Auto AVA (NUKE)
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Extrator TXT e Resolução 100% Automática pela API do Gemini. 100% Furtivo (Apenas Alerts).
// @author       Salela + Gemini
// @match        https://ava3.cefor.ifes.edu.br/mod/quiz/attempt.php*
// @match        https://ava3.cefor.ifes.edu.br/mod/quiz/review.php*
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      generativelanguage.googleapis.com
// ==/UserScript==

(function() {
    'use strict';

    // ==========================================
    // 🔑 COLOQUE SUA CHAVE DE API ABAIXO
    // ==========================================
    const API_KEY = 'api_key';

    // Evita rodar em iframes ocultos
    if (window !== window.top) return;

    // Gerenciamento de Estado do Robô
    const avaState = localStorage.getItem('ava_state');

    if (avaState === 'extracting_txt') {
        processarPaginaAtualExtrator('txt');
    } else if (avaState === 'extracting_gemini') {
        processarPaginaAtualExtrator('gemini');
    } else if (avaState === 'filling') {
        esperarEditorEPreencher();
    } else {
        // Estado Ocioso: Registra os menus do Tampermonkey
        GM_registerMenuCommand("📥 Extrair Questões (TXT)", () => iniciarExtrator('txt'));
        GM_registerMenuCommand("📝 Responder (Colar Texto)", iniciarPromptRespondedor);
        GM_registerMenuCommand("✨ Resolver Tudo com Gemini Automático", () => iniciarExtrator('gemini'));
    }

    // ==========================================
    // 1. LÓGICA DO EXTRATOR
    // ==========================================
    function iniciarExtrator(destino) {
        let msg = destino === 'gemini'
            ? 'O script vai coletar as questoes, enviar para o Gemini e preencher as respostas sozinho. Nao clique em nada. Deseja comecar?'
            : 'O script vai navegar por todas as paginas para baixar o TXT. Nao clique em nada. Deseja comecar?';

        if (confirm(msg)) {
            localStorage.setItem('ava_state', destino === 'gemini' ? 'extracting_gemini' : 'extracting_txt');
            localStorage.setItem('ava_questoes', JSON.stringify([]));
            irParaPagina1OuProcessar(() => processarPaginaAtualExtrator(destino));
        }
    }

    function processarPaginaAtualExtrator(destino) {
        setTimeout(() => {
            let questoesSalvas = JSON.parse(localStorage.getItem('ava_questoes') || '[]');
            const questionNodes = document.querySelectorAll('.que');

            questionNodes.forEach(qNode => {
                const qNoElement = qNode.querySelector('.qno');
                const qTextElement = qNode.querySelector('.qtext');

                if (qNoElement && qTextElement) {
                    let textoCompleto = qTextElement.innerText.trim();

                    // Coleta alternativas de múltipla escolha
                    const options = qNode.querySelectorAll('.answer [data-region="answer-label"], .answer label');
                    if (options.length > 0) {
                        textoCompleto += '\n';
                        options.forEach(opt => {
                            textoCompleto += '\n' + opt.innerText.trim().replace(/\s+/g, ' ');
                        });
                    }

                    questoesSalvas.push({
                        numero: parseInt(qNoElement.innerText.trim(), 10),
                        texto: textoCompleto
                    });
                }
            });

            // Remove duplicatas
            const mapUnique = new Map();
            questoesSalvas.forEach(q => mapUnique.set(q.numero, q));
            questoesSalvas = Array.from(mapUnique.values());

            localStorage.setItem('ava_questoes', JSON.stringify(questoesSalvas));

            // Navegação
            const currentPageBtn = document.querySelector('.qnbutton.thispage');
            if (currentPageBtn) {
                const currentPgIndex = parseInt(currentPageBtn.getAttribute('data-quiz-page'), 10);
                const nextPgBtn = document.querySelector(`.qnbutton[data-quiz-page="${currentPgIndex + 1}"]`);

                if (nextPgBtn) {
                    window.location.href = nextPgBtn.href.split('#')[0];
                } else {
                    finalizarExtracao(questoesSalvas, destino);
                }
            } else {
                finalizarExtracao(questoesSalvas, destino);
            }
        }, 1000);
    }

    function finalizarExtracao(questoes, destino) {
        questoes.sort((a, b) => a.numero - b.numero);

        if (questoes.length === 0) {
            limparEstado();
            alert('Aviso: Nenhuma questao foi encontrada.');
            return location.reload();
        }

        if (destino === 'txt') {
            limparEstado();
            let textoFinal = '';
            questoes.forEach(q => { textoFinal += `${q.numero}) ${q.texto}\n\n`; });
            baixarTXT(textoFinal, 'questoes_questionario.txt');
            alert(`Extracao finalizada com ${questoes.length} questoes salvas em TXT.`);
            location.reload();
        } else if (destino === 'gemini') {
            pedirRespostasAoGemini(questoes);
        }
    }

    // ==========================================
    // 2. INTEGRAÇÃO AUTOMÁTICA COM GEMINI API
    // ==========================================
    function pedirRespostasAoGemini(questoes) {
        if (!API_KEY || API_KEY === 'SUA_API_KEY_AQUI') {
            limparEstado();
            alert("Erro: API Key não configurada. Edite o script no Tampermonkey e insira sua chave do Gemini.");
            return location.reload();
        }

        // Alerta nativo e invisível no DOM informando a comunicação com a API
        alert(`🧠 Enviando ${questoes.length} questões para o Gemini...\n\nIsso pode levar de 5 a 20 segundos. Clique em OK e aguarde o script iniciar o preenchimento automático. NÃO recarregue a página.`);

        const textoQuestoes = questoes.map(q => `${q.numero}) ${q.texto}`).join('\n\n');

        const prompt = `Você é um assistente acadêmico automatizado. Resolva as questões abaixo.
REGRAS VITAIS DE FORMATAÇÃO (Seu retorno será lido por um script):
- Seu retorno DEVE ser APENAS uma lista numerada. Sem introduções, sem explicações extras.
- Não use formatação Markdown (como ** ou blocos de código \`\`\`).
- O formato exato obrigatório é:
1) resposta
2) resposta
- Para questões de Múltipla Escolha, responda APENAS a letra correta, pura e simples (ex: 1) a).
- Para questões Dissertativas, forneça a resposta direta e concisa.

QUESTÕES:
${textoQuestoes}`;

        GM_xmlhttpRequest({
            method: "POST",
            url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
            headers: { "Content-Type": "application/json" },
            data: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] }),
            onload: function(response) {
                try {
                    const data = JSON.parse(response.responseText);
                    if (data.error) throw new Error(data.error.message);

                    let botReply = data.candidates[0].content.parts[0].text;

                    // Limpa possíveis formatações residuais do Gemini (ex: tirando blocos markdown)
                    botReply = botReply.replace(/```[a-z]*\n?/gi, '').trim();

                    // Dispara o auto-preenchimento com o texto recebido da IA
                    iniciarPreenchimentoOculto(botReply);

                } catch (e) {
                    limparEstado();
                    alert("Erro ao contatar Gemini: " + e.message);
                    location.reload();
                }
            },
            onerror: function() {
                limparEstado();
                alert("Erro de conexão com o Google Gemini. Verifique sua internet.");
                location.reload();
            }
        });
    }

    // ==========================================
    // 3. LÓGICA DO RESPONDEDOR
    // ==========================================
    function iniciarPromptRespondedor() {
        const textoBase = prompt('Cole suas respostas abaixo seguindo o padrao numerico (Ex: "1) a" ou "2) texto") e clique em OK:');
        if (textoBase === null) return;

        if (!textoBase.trim()) {
            return alert('Nenhum texto foi inserido. Processo cancelado.');
        }

        iniciarPreenchimentoOculto(textoBase);
    }

    function iniciarPreenchimentoOculto(textoBase) {
        const regex = /(?:^|\n)\s*(\d+)\)\s*([\s\S]*?)(?=\n\s*\d+\)|$)/g;
        let match;
        const respostas = {};
        let count = 0;

        while ((match = regex.exec(textoBase)) !== null) {
            respostas[match[1]] = match[2].trim();
            count++;
        }

        if (count === 0) {
            limparEstado();
            return alert('Falha ao identificar respostas. O Gemini falhou ou o texto copiado esta fora do padrao "1) resposta".');
        }

        localStorage.setItem('ava_state', 'filling');
        localStorage.setItem('ava_respostas', JSON.stringify(respostas));
        irParaPagina1OuProcessar(esperarEditorEPreencher);
    }

    function esperarEditorEPreencher() {
        let tentativas = 0;
        const intervalo = setInterval(() => {
            tentativas++;
            // Verifica se as instâncias do TinyMCE existem ou se deu timeout (5s)
            if ((typeof tinymce !== 'undefined' && tinymce.editors && tinymce.editors.length > 0) || tentativas > 10) {
                clearInterval(intervalo);
                preencherRespostasEAvancar();
            }
        }, 500);
    }

    function preencherRespostasEAvancar() {
        const respostas = JSON.parse(localStorage.getItem('ava_respostas') || '{}');
        const questionNodes = document.querySelectorAll('.que');

        questionNodes.forEach(qNode => {
            const qNoElement = qNode.querySelector('.qno');
            if (!qNoElement) return;

            const qNo = qNoElement.innerText.trim();

            if (respostas[qNo]) {
                const textoResposta = respostas[qNo];

                const textarea = qNode.querySelector('textarea[id$="_answer_id"], textarea.form-control');
                const radios = qNode.querySelectorAll('input[type="radio"]');

                // Preenchimento de Texto
                if (textarea) {
                    const id = textarea.id;
                    if (typeof tinymce !== 'undefined' && tinymce.get(id)) {
                        tinymce.get(id).setContent(textoResposta);
                    } else {
                        textarea.value = textoResposta;
                    }
                }
                // Preenchimento de Alternativas
                else if (radios.length > 0) {
                    // Pega só a primeira letra da resposta
                    const targetLetter = textoResposta.replace(/[^a-zA-Z]/g, '').charAt(0).toLowerCase();
                    let matched = false;

                    radios.forEach(radio => {
                        if (matched) return;
                        let labelText = '';

                        const labelEl = qNode.querySelector(`label[for="${radio.id}"]`);
                        if (labelEl) {
                            labelText = labelEl.innerText.trim().toLowerCase();
                        } else {
                            const ariaId = radio.getAttribute('aria-labelledby');
                            if (ariaId) {
                                const ariaEl = document.getElementById(ariaId);
                                if (ariaEl) labelText = ariaEl.innerText.trim().toLowerCase();
                            }
                        }

                        if (labelText) {
                            if (labelText.startsWith(targetLetter + '.') ||
                                labelText.startsWith(targetLetter + ')') ||
                                labelText === targetLetter) {
                                radio.click();
                                matched = true;
                            }
                        }
                    });
                }
            }
        });

        // Espera renderizar os cliques/textos e avança
        setTimeout(() => {
            const btnNext = document.querySelector('input[name="next"], button.mod_quiz-next-nav');
            if (btnNext) {
                btnNext.click();
            } else {
                limparEstado();
                alert('✨ Processo Finalizado!\n\nAs paginas foram percorridas e respondidas. Por favor, confira na revisao antes de finalizar definitivamente a tentativa.');
            }
        }, 1500);
    }

    // ==========================================
    // 4. FUNÇÕES UTILITÁRIAS
    // ==========================================
    function limparEstado() {
        localStorage.removeItem('ava_state');
        localStorage.removeItem('ava_questoes');
        localStorage.removeItem('ava_respostas');
    }

    function baixarTXT(conteudo, nomeArquivo) {
        const blob = new Blob([conteudo], { type: 'text/plain;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = nomeArquivo;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    function irParaPagina1OuProcessar(funcaoProcessamento) {
        const btnPage1 = document.querySelector('.qnbutton[data-quiz-page="0"]');
        if (btnPage1 && window.location.href.split('#')[0] !== btnPage1.href.split('#')[0]) {
            window.location.href = btnPage1.href.split('#')[0];
        } else {
            funcaoProcessamento === esperarEditorEPreencher ? location.reload() : funcaoProcessamento();
        }
    }

})();
