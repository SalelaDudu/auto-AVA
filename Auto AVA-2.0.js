// ==UserScript==
// @name         Auto AVA (NUKE) - V/F Atualizado
// @namespace    http://tampermonkey.net/
// @version      2.2
// @description  Extrator TXT, Resolução API c/ Múltiplos PDFs, Suporte a Verdadeiro/Falso. 100% Furtivo.
// @author       Salela + Gemini + Crazy Man
// @match        https://ava3.cefor.ifes.edu.br/mod/quiz/attempt.php*
// @match        https://ava3.cefor.ifes.edu.br/mod/quiz/review.php*
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      generativelanguage.googleapis.com
// ==/UserScript==

(function() {
    'use strict';

    // ==========================================
    // 🔑 COLOQUE SUA CHAVE DE API ABAIXO
    // ==========================================
    const API_KEY = 'CHAVE_API';

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
        GM_registerMenuCommand("🎯 Resolver Apenas Página Atual (ALT+X)", resolverPaginaAtualComGemini);
        GM_registerMenuCommand("📄 Anexar PDF(s) de Referência", carregarPDF);
        GM_registerMenuCommand("🗑️ Limpar PDF(s)", limparPDF);
    }

    // ==========================================
    // 0. LÓGICA DE PDF DE CONTEXTO (MÚLTIPLOS)
    // ==========================================
    function carregarPDF() {
        alert("Após selecionar OK, clique em qualquer lugar da tela para selecionar os pdf's.");

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/pdf';
        input.multiple = true;
        input.style.display = 'none';
        document.body.appendChild(input);

        input.onchange = async (e) => {
            const files = Array.from(e.target.files);
            if (files.length === 0) {
                document.body.removeChild(input);
                return;
            }

            const totalSize = files.reduce((acc, file) => acc + file.size, 0);
            if (totalSize > 15 * 1024 * 1024) {
                alert("O tamanho total dos arquivos excede 15MB. A requisição pode falhar. Selecione menos arquivos.");
                document.body.removeChild(input);
                return;
            }

            try {
                const base64Promises = files.map(file => {
                    return new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = evt => resolve(evt.target.result.split(',')[1]);
                        reader.onerror = err => reject(err);
                        reader.readAsDataURL(file);
                    });
                });

                const base64Files = await Promise.all(base64Promises);
                GM_setValue('ava_pdf_refs', JSON.stringify(base64Files));
                alert(`📄 ${files.length} PDF(s) carregado(s) com sucesso na memória!`);
            } catch (error) {
                alert("Erro ao processar os arquivos PDF.");
            }

            document.body.removeChild(input);
        };

        const dispararJanela = () => {
            input.click();
            document.removeEventListener('click', dispararJanela, { capture: true });
        };
        document.addEventListener('click', dispararJanela, { capture: true, once: true });
    }

    function limparPDF() {
        GM_setValue('ava_pdf_refs', '[]');
        alert("🗑️ Os PDFs de referência foram removidos da memória.");
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
        let questoesSalvas = JSON.parse(localStorage.getItem('ava_questoes') || '[]');
        const questionNodes = document.querySelectorAll('.que');

        questionNodes.forEach(qNode => {
            const qNoElement = qNode.querySelector('.qno');
            const qTextElement = qNode.querySelector('.qtext');

            if (qNoElement && qTextElement) {
                let textoCompleto = qTextElement.innerText.trim();

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

        const mapUnique = new Map();
        questoesSalvas.forEach(q => mapUnique.set(q.numero, q));
        questoesSalvas = Array.from(mapUnique.values());

        localStorage.setItem('ava_questoes', JSON.stringify(questoesSalvas));

        const currentPageBtn = document.querySelector('.qnbutton.thispage');
        if (currentPageBtn) {
            const currentPgIndex = parseInt(currentPageBtn.getAttribute('data-quiz-page'), 10);
            const nextPgBtn = document.querySelector(`.qnbutton[data-quiz-page="${currentPgIndex + 1}"]`);

            if (nextPgBtn) {
                window.location.replace(nextPgBtn.href.split('#')[0]);
            } else {
                finalizarExtracao(questoesSalvas, destino);
            }
        } else {
            finalizarExtracao(questoesSalvas, destino);
        }
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

        alert(`🧠 Enviando ${questoes.length} questões para o Gemini...\n\nIsso pode levar alguns segundos. Clique em OK e aguarde o script iniciar o preenchimento automático. NÃO recarregue a página.`);

        const textoQuestoes = questoes.map(q => `${q.numero}) ${q.texto}`).join('\n\n');

        const prompt = `Você é um assistente acadêmico especializado em resolver atividades com máxima precisão.

OBJETIVO:
Resolver todas as questões apresentadas utilizando prioritariamente os materiais anexados (PDFs, textos, imagens ou outros documentos fornecidos). Quando houver conflito entre conhecimento externo e o material fornecido, priorize o conteúdo do material.

REGRAS DE RESPOSTA (OBRIGATÓRIAS):
Retorne APENAS as respostas solicitadas.
Não inclua introduções, conclusões, cumprimentos ou comentários adicionais.
Não explique seu raciocínio.
Não justifique respostas.
Não forneça referências bibliográficas.
Não utilize observações, notas ou avisos.
Não utilize Markdown.
Não utilize listas, tópicos ou qualquer formatação diferente da especificada.
Não adicione texto antes ou depois das respostas.

FORMATO OBRIGATÓRIO:
Cada questão deve seguir exatamente o padrão:
1: "resposta"
2: "resposta"
3: "resposta"

Para respostas com múltiplas linhas:
1: "linha 1
linha 2
linha 3"

QUESTÕES DE MÚLTIPLA ESCOLHA E VERDADEIRO/FALSO:
- Para múltipla escolha tradicional, retorne SOMENTE a letra correta em minúsculo. Exemplo: 1: "a" ou 2: "c"
- Para questões de Verdadeiro ou Falso, retorne exatamente a palavra por extenso em minúsculo: "verdadeiro" ou "falso". Exemplo: 3: "verdadeiro" ou 4: "falso"

QUESTÕES DISSERTATIVAS:
Responda de forma objetiva, clara e diretamente relacionada ao conteúdo do material fornecido.
Utilize apenas as informações necessárias para responder corretamente.
Não exceda limites de palavras quando especificados na questão.

VALIDAÇÃO FINAL:
Antes de finalizar, verifique se todas as questões foram respondidas, se a numeração está correta e se todas as respostas estão entre aspas duplas.

QUESTÕES:
${textoQuestoes}`;

        const parts = [{ text: prompt }];

        const pdfsJson = GM_getValue('ava_pdf_refs', '[]');
        let pdfList = [];
        try { pdfList = JSON.parse(pdfsJson); } catch (e) {}

        if (Array.isArray(pdfList) && pdfList.length > 0) {
            pdfList.forEach(base64 => {
                parts.push({
                    inlineData: {
                        mimeType: "application/pdf",
                        data: base64
                    }
                });
            });
        }

        GM_xmlhttpRequest({
            method: "POST",
            url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
            headers: { "Content-Type": "application/json" },
            data: JSON.stringify({ contents: [{ role: "user", parts: parts }] }),
            onload: function(response) {
                try {
                    const data = JSON.parse(response.responseText);
                    if (data.error) throw new Error(data.error.message);

                    let botReply = data.candidates[0].content.parts[0].text;
                    botReply = botReply.replace(/```[a-z]*\n?/gi, '').trim();

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
        const textoBase = prompt('Cole suas respostas abaixo usando aspas duplas (Ex: 1: "a" ou 2: "verdadeiro") e clique em OK:');
        if (textoBase === null) return;

        if (!textoBase.trim()) {
            return alert('Nenhum texto foi inserido. Processo cancelado.');
        }

        iniciarPreenchimentoOculto(textoBase);
    }

    function iniciarPreenchimentoOculto(textoBase) {
        const regex = /^\s*(\d+):\s*"([\s\S]*?)"/gm;
        let match;
        const respostas = {};
        let count = 0;

        while ((match = regex.exec(textoBase)) !== null) {
            respostas[match[1]] = match[2].trim();
            count++;
        }

        if (count === 0) {
            limparEstado();
            return alert('Falha ao identificar respostas. Certifique-se que estão no padrão com aspas:\n1: "resposta"');
        }

        localStorage.setItem('ava_state', 'filling');
        localStorage.setItem('ava_respostas', JSON.stringify(respostas));
        irParaPagina1OuProcessar(esperarEditorEPreencher);
    }

    function esperarEditorEPreencher() {
        let tentativas = 0;
        const intervalo = setInterval(() => {
            tentativas++;
            const temQuestoesTexto = document.querySelectorAll('textarea[id$="_answer_id"], textarea.form-control').length > 0;
            const tinyPronto = typeof tinymce !== 'undefined' && tinymce.editors && tinymce.editors.length > 0;

            if (!temQuestoesTexto || tinyPronto || tentativas > 50) {
                clearInterval(intervalo);
                preencherRespostasEAvancar();
            }
        }, 100);
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

                if (textarea) {
                    const id = textarea.id;
                    if (typeof tinymce !== 'undefined' && tinymce.get(id)) {
                        tinymce.get(id).setContent(textoResposta);
                    } else {
                        textarea.value = textoResposta;
                    }
                }
                else if (radios.length > 0) {
                    const respostaLimpa = textoResposta.trim().toLowerCase();
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
                            if (respostaLimpa === 'verdadeiro' || respostaLimpa === 'falso') {
                                if (labelText === respostaLimpa || labelText.startsWith(respostaLimpa)) {
                                    radio.click();
                                    matched = true;
                                }
                            } else {
                                const targetLetter = respostaLimpa.replace(/[^a-zA-Z]/g, '').charAt(0);
                                if (labelText.startsWith(targetLetter + '.') ||
                                    labelText.startsWith(targetLetter + ')') ||
                                    labelText === targetLetter) {
                                    radio.click();
                                    matched = true;
                                }
                            }
                        }
                    });
                }
            }
        });

        setTimeout(() => {
            const currentPageBtn = document.querySelector('.qnbutton.thispage');
            let isLastPage = true;

            if (currentPageBtn) {
                const currentPgIndex = parseInt(currentPageBtn.getAttribute('data-quiz-page'), 10);
                const nextPgBtn = document.querySelector(`.qnbutton[data-quiz-page="${currentPgIndex + 1}"]`);
                if (nextPgBtn) isLastPage = false;
            }

            if (!isLastPage) {
                const btnNext = document.querySelector('input[name="next"], button.mod_quiz-next-nav');
                if (btnNext) {
                    btnNext.click();
                } else {
                    finalizarPreenchimento();
                }
            } else {
                finalizarPreenchimento();
            }
        }, 200);
    }

    function finalizarPreenchimento() {
        limparEstado();
        alert('Processo Finalizado!\nPor favor, confira as respostas antes de terminar a tentativa manualmente.');
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
            window.location.replace(btnPage1.href.split('#')[0]);
        } else {
            funcaoProcessamento === esperarEditorEPreencher ? location.reload() : funcaoProcessamento();
        }
    }

    // ==========================================
    // 5. RESOLVER APENAS A PÁGINA ATUAL (ALT+X)
    // ==========================================
    function resolverPaginaAtualComGemini() {
        if (!API_KEY || API_KEY === 'api_key') {
            return alert("Erro: API Key não configurada. Edite o script no Tampermonkey e insira sua chave do Gemini.");
        }

        const questionNodes = document.querySelectorAll('.que');
        let questoesPagina = [];

        questionNodes.forEach(qNode => {
            const qNoElement = qNode.querySelector('.qno');
            const qTextElement = qNode.querySelector('.qtext');

            if (qNoElement && qTextElement) {
                let textoCompleto = qTextElement.innerText.trim();
                const options = qNode.querySelectorAll('.answer [data-region="answer-label"], .answer label');
                if (options.length > 0) {
                    textoCompleto += '\n';
                    options.forEach(opt => {
                        textoCompleto += '\n' + opt.innerText.trim().replace(/\s+/g, ' ');
                    });
                }
                questoesPagina.push({
                    numero: parseInt(qNoElement.innerText.trim(), 10),
                    texto: textoCompleto
                });
            }
        });

        if (questoesPagina.length === 0) {
            return alert("Nenhuma questão encontrada nesta página.");
        }

        const textoQuestoes = questoesPagina.map(q => `${q.numero}) ${q.texto}`).join('\n\n');

        const prompt = `Você é um assistente acadêmico especializado em resolver atividades com máxima precisão.

OBJETIVO:
Resolver todas as questões apresentadas utilizando prioritariamente os materiais anexados (PDFs, textos, imagens ou outros documentos fornecidos). Quando houver conflito entre conhecimento externo e o material fornecido, priorize o conteúdo do material.

REGRAS DE RESPOSTA (OBRIGATÓRIAS):
Retorne APENAS as respostas solicitadas.
Não inclua introduções, conclusões, cumprimentos ou comentários adicionais.
Não explique seu raciocínio.
Não justifique respostas.
Não forneça referências bibliográficas.
Não utilize observações, notas ou avisos.
Não utilize Markdown.
Não utilize listas, tópicos ou qualquer formatação diferente da especificada.
Não adicione texto antes ou depois das respostas.

FORMATO OBRIGATÓRIO:
Cada questão deve seguir exatamente o padrão:
1: "resposta"
2: "resposta"

QUESTÕES DE MÚLTIPLA ESCOLHA E VERDADEIRO/FALSO:
- Para múltipla escolha tradicional, retorne SOMENTE a letra correta em minúsculo. Exemplo: 1: "a"
- Para questões de Verdadeiro ou Falso, retorne exatamente a palavra por extenso em minúsculo: "verdadeiro" ou "falso". Exemplo: 2: "verdadeiro"

QUESTÕES DISSERTATIVAS:
Responda de forma objetiva, clara e diretamente relacionada ao conteúdo do material fornecido.

VALIDAÇÃO FINAL:
Ganta que o formato de retorno obedeça rigorosamente a estrutura pedida.

QUESTÕES:
${textoQuestoes}`;

        const parts = [{ text: prompt }];
        const pdfsJson = GM_getValue('ava_pdf_refs', '[]');
        let pdfList = [];
        try { pdfList = JSON.parse(pdfsJson); } catch (e) {}

        if (Array.isArray(pdfList) && pdfList.length > 0) {
            pdfList.forEach(base64 => parts.push({ inlineData: { mimeType: "application/pdf", data: base64 } }));
        }

        GM_xmlhttpRequest({
            method: "POST",
            url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
            headers: { "Content-Type": "application/json" },
            data: JSON.stringify({ contents: [{ role: "user", parts: parts }] }),
            onload: function(response) {
                try {
                    const data = JSON.parse(response.responseText);
                    if (data.error) throw new Error(data.error.message);

                    let botReply = data.candidates[0].content.parts[0].text;
                    botReply = botReply.replace(/```[a-z]*\n?/gi, '').trim();

                    preencherRespostasPaginaAtual(botReply);

                } catch (e) {
                    alert("Erro ao contatar Gemini (Página Atual): " + e.message);
                }
            },
            onerror: function() {
                alert("Erro de conexão com o Google Gemini.");
            }
        });
    }

    function preencherRespostasPaginaAtual(textoBase) {
        const regex = /^\s*(\d+):\s*"([\s\S]*?)"/gm;
        let match;
        const respostas = {};
        let count = 0;

        while ((match = regex.exec(textoBase)) !== null) {
            respostas[match[1]] = match[2].trim();
            count++;
        }

        if (count === 0) {
            return alert('Falha ao identificar respostas do Gemini. Verifique se o formato retornou corretamente.');
        }

        const questionNodes = document.querySelectorAll('.que');
        questionNodes.forEach(qNode => {
            const qNoElement = qNode.querySelector('.qno');
            if (!qNoElement) return;

            const qNo = qNoElement.innerText.trim();
            if (respostas[qNo]) {
                const textoResposta = respostas[qNo];
                const textarea = qNode.querySelector('textarea[id$="_answer_id"], textarea.form-control');
                const radios = qNode.querySelectorAll('input[type="radio"]');

                if (textarea) {
                    const id = textarea.id;
                    if (typeof tinymce !== 'undefined' && tinymce.get(id)) {
                        tinymce.get(id).setContent(textoResposta);
                    } else {
                        textarea.value = textoResposta;
                    }
                } else if (radios.length > 0) {
                    const respostaLimpa = textoResposta.trim().toLowerCase();
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
                            if (respostaLimpa === 'verdadeiro' || respostaLimpa === 'falso') {
                                if (labelText === respostaLimpa || labelText.startsWith(respostaLimpa)) {
                                    radio.click();
                                    matched = true;
                                }
                            } else {
                                const targetLetter = respostaLimpa.replace(/[^a-zA-Z]/g, '').charAt(0);
                                if (labelText.startsWith(targetLetter + '.') || labelText.startsWith(targetLetter + ')') || labelText === targetLetter) {
                                    radio.click();
                                    matched = true;
                                }
                            }
                        }
                    });
                }
            }
        });
    }

    // ==========================================
    // 6. ATALHOS DE TECLADO
    // ==========================================
    document.addEventListener('keydown', (e) => {
        if (e.altKey && e.key.toLowerCase() === 'x') {
            e.preventDefault();
            resolverPaginaAtualComGemini();
        }
    });

})();