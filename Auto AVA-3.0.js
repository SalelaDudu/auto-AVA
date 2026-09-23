// ==UserScript==
// @name         Auto AVA (NUKE)
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  Extrator TXT, Resolução API c/ Múltiplos PDFs, Modo Prova e Suporte Otimizado para Moodle 4.x.
// @author       Salela + Gemini + Crazy Man + Mik4el
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
    // 🔑 CONFIGURAÇÕES DE API E MODO PROVA
    // ==========================================
    const API_KEY = 'CHAVE_API';
    const GEMINI_MODEL = 'gemini-3.1-flash-lite';

    // Tempo de espera aleatório entre páginas no Modo Prova (em milissegundos)
    const MODO_PROVA_DELAY_MIN = 10000; // 10 segundos
    const MODO_PROVA_DELAY_MAX = 20000; // 20 segundos

    // Evita rodar em iframes ocultos que não sejam editores
    if (window !== window.top && !window.frameElement) return;

    // Gerenciamento de Estado do Robô
    const avaState = localStorage.getItem('ava_state');
    const isPaused = localStorage.getItem('ava_paused') === 'true';

    // Se o processo estiver pausado, interrompe a execução automática ao carregar a página
    if (isPaused) {
        console.log("🛑 Auto AVA: Processo temporariamente pausado. Pressione ALT+K para retomar.");
    } else if (avaState === 'extracting_txt') {
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
        GM_registerMenuCommand("🎓 Resolver Tudo (Modo Prova - Delays 10-20s)", () => iniciarExtrator('modo_prova'));
        GM_registerMenuCommand("🎯 Resolver Apenas Página Atual (ALT+X)", resolverPaginaAtualComGemini);
        GM_registerMenuCommand("⏸️ Pausar / Retomar Automação (ALT+K)", alternarPausaEmergencia);
        GM_registerMenuCommand("📄 Anexar PDF(s) de Referência", carregarPDF);
        GM_registerMenuCommand("🗑️ Limpar PDF(s)", limparPDF);
    }

    // Inicializa o ouvinte universal dos atalhos ALT+X e ALT+K
    registrarAtalhoGlobal();

    // ==========================================
    // 0. GERENCIAMENTO DE DELAYS E MODOS
    // ==========================================
    function obterDelayPagina() {
        const isModoProva = localStorage.getItem('ava_modo_prova') === 'true';
        if (!isModoProva) return 250; // Delay padrão rápido para modo comum

        const delay = Math.floor(Math.random() * (MODO_PROVA_DELAY_MAX - MODO_PROVA_DELAY_MIN + 1)) + MODO_PROVA_DELAY_MIN;
        console.log(`🎓 Modo Prova: Aguardando ${(delay / 1000).toFixed(1)}s antes de mudar de página...`);
        return delay;
    }

    // ==========================================
    // 1. GERENCIAMENTO DE PDFS DE CONTEXTO
    // ==========================================
    function carregarPDF() {
        alert("Após selecionar OK, clique em qualquer lugar da tela para selecionar os PDFs.");

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
                alert("O tamanho total dos arquivos excede 15MB. Selecione menos arquivos.");
                document.body.removeChild(input);
                return;
            }

            try {
                const base64Promises = files.map(file => new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = evt => resolve(evt.target.result.split(',')[1]);
                    reader.onerror = err => reject(err);
                    reader.readAsDataURL(file);
                }));

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
    // 2. RASPAGEM DE DADOS DO MOODLE 4.X
    // ==========================================
    function extrairQuestoesDaPagina() {
        const questionNodes = document.querySelectorAll('.que');
        const questoes = [];

        questionNodes.forEach(qNode => {
            const qNoElement = qNode.querySelector('.qno, .info .no, .no');
            const qTextElement = qNode.querySelector('.qtext, .formulation .qtext, .formulation');

            if (qNoElement && qTextElement) {
                const numMatch = qNoElement.innerText.match(/\d+/);
                if (!numMatch) return;

                const numero = parseInt(numMatch[0], 10);
                let textoCompleto = qTextElement.innerText.trim();

                const options = qNode.querySelectorAll('.answer [data-region="answer-label"], .answer label, .answer .r0, .answer .r1');
                if (options.length > 0) {
                    textoCompleto += '\n';
                    const opcoesTexto = Array.from(options)
                        .map(opt => opt.innerText.trim().replace(/\s+/g, ' '))
                        .filter((text, idx, self) => text && self.indexOf(text) === idx);

                    textoCompleto += '\n' + opcoesTexto.join('\n');
                }

                questoes.push({ numero, texto: textoCompleto });
            }
        });

        return questoes;
    }

    // ==========================================
    // 3. LÓGICA DO EXTRATOR GERAL
    // ==========================================
    function iniciarExtrator(destino) {
        let msg = '';
        let isProva = false;

        if (destino === 'modo_prova') {
            isProva = true;
            destino = 'gemini';
            msg = '🎓 MODO PROVA ATIVADO:\n\n- Sem janelas de alerta durante a execução.\n- Delays de 10 a 20 segundos entre páginas.\n- Respostas preenchidas automaticamente via Gemini.\n\nDeseja iniciar?';
        } else if (destino === 'gemini') {
            msg = 'O script vai coletar as questões, enviar para o Gemini e preencher as respostas sozinho. Não clique em nada. Deseja começar?';
        } else {
            msg = 'O script vai navegar por todas as páginas para baixar o TXT. Não clique em nada. Deseja começar?';
        }

        if (confirm(msg)) {
            localStorage.removeItem('ava_paused');
            localStorage.setItem('ava_modo_prova', isProva ? 'true' : 'false');
            localStorage.setItem('ava_state', destino === 'gemini' ? 'extracting_gemini' : 'extracting_txt');
            localStorage.setItem('ava_questoes', JSON.stringify([]));
            irParaPagina1OuProcessar(() => processarPaginaAtualExtrator(destino));
        }
    }

    function processarPaginaAtualExtrator(destino) {
        if (localStorage.getItem('ava_paused') === 'true') return;

        let questoesSalvas = JSON.parse(localStorage.getItem('ava_questoes') || '[]');
        const questoesNovas = extrairQuestoesDaPagina();

        questoesSalvas = questoesSalvas.concat(questoesNovas);

        const mapUnique = new Map();
        questoesSalvas.forEach(q => mapUnique.set(q.numero, q));
        questoesSalvas = Array.from(mapUnique.values());

        localStorage.setItem('ava_questoes', JSON.stringify(questoesSalvas));

        const currentPageBtn = document.querySelector('.qnbutton.thispage');
        const delay = obterDelayPagina();

        setTimeout(() => {
            if (localStorage.getItem('ava_paused') === 'true') return;

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
        }, delay);
    }

    function finalizarExtracao(questoes, destino) {
        questoes.sort((a, b) => a.numero - b.numero);

        if (questoes.length === 0) {
            limparEstado();
            alert('Aviso: Nenhuma questão foi encontrada.');
            return location.reload();
        }

        if (destino === 'txt') {
            limparEstado();
            let textoFinal = '';
            questoes.forEach(q => { textoFinal += `${q.numero}) ${q.texto}\n\n`; });
            baixarTXT(textoFinal, 'questoes_questionario.txt');
            alert(`Extração finalizada com ${questoes.length} questões salvas em TXT.`);
            location.reload();
        } else if (destino === 'gemini') {
            pedirRespostasAoGemini(questoes);
        }
    }

    // ==========================================
    // 4. INTEGRAÇÃO COM GEMINI API
    // ==========================================
    function chamarGeminiAPI(promptText, onSuccess, onError) {
        if (!API_KEY || API_KEY === 'CHAVE_API' || API_KEY === 'SUA_API_KEY_AQUI') {
            alert("Erro: API Key não configurada. Edite o script no Tampermonkey e insira sua chave do Gemini.");
            if (onError) onError();
            return;
        }

        const parts = [{ text: promptText }];
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

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${API_KEY}`;

        GM_xmlhttpRequest({
            method: "POST",
            url: url,
            headers: { "Content-Type": "application/json" },
            data: JSON.stringify({ contents: [{ role: "user", parts: parts }] }),
            onload: function(response) {
                try {
                    const data = JSON.parse(response.responseText);
                    if (data.error) throw new Error(data.error.message);

                    let botReply = data.candidates[0].content.parts[0].text;
                    botReply = botReply.replace(/```[a-z]*\n?/gi, '').trim();

                    onSuccess(botReply);
                } catch (e) {
                    if (onError) onError(e);
                    else alert("Erro ao contatar Gemini: " + e.message);
                }
            },
            onerror: function(err) {
                if (onError) onError(err);
                else alert("Erro de conexão com o Google Gemini. Verifique sua conexão.");
            }
        });
    }

    function montarPrompt(textoQuestoes) {
        return `Você é um assistente acadêmico especializado em resolver atividades com máxima precisão.

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

VALIDAÇÃO FINAL:
Antes de finalizar, verifique se todas as questões foram respondidas e no formato exato solicitado.

QUESTÕES:
${textoQuestoes}`;
    }

    function pedirRespostasAoGemini(questoes) {
        const isModoProva = localStorage.getItem('ava_modo_prova') === 'true';

        if (!isModoProva) {
            alert(`🧠 Enviando ${questoes.length} questões para o Gemini (${GEMINI_MODEL})...\n\nAguarde o início do preenchimento. NÃO recarregue a página.`);
        } else {
            console.log(`🧠 Modo Prova: Enviando ${questoes.length} questões para o Gemini silenciosamente...`);
        }

        const textoQuestoes = questoes.map(q => `${q.numero}) ${q.texto}`).join('\n\n');
        const promptText = montarPrompt(textoQuestoes);

        chamarGeminiAPI(promptText, (botReply) => {
            iniciarPreenchimentoOculto(botReply);
        }, (err) => {
            limparEstado();
            if (!isModoProva && err) alert("Erro ao processar resposta da API: " + err.message);
            location.reload();
        });
    }

    // ==========================================
    // 5. PREENCHIMENTO DE RESPOSTAS (MOODLE 4.X)
    // ==========================================
    function parseRespostasTexto(textoBase) {
        const regex = /^\s*(\d+):\s*"([\s\S]*?)"/gm;
        let match;
        const respostas = {};
        let count = 0;

        while ((match = regex.exec(textoBase)) !== null) {
            respostas[match[1]] = match[2].trim();
            count++;
        }
        return { respostas, count };
    }

    function iniciarPromptRespondedor() {
        const textoBase = prompt('Cole suas respostas abaixo usando aspas duplas (Ex: 1: "a" ou 2: "verdadeiro") e clique em OK:');
        if (textoBase === null) return;

        if (!textoBase.trim()) {
            return alert('Nenhum texto foi inserido. Processo cancelado.');
        }

        iniciarPreenchimentoOculto(textoBase);
    }

    function iniciarPreenchimentoOculto(textoBase) {
        const { respostas, count } = parseRespostasTexto(textoBase);

        if (count === 0) {
            limparEstado();
            return alert('Falha ao identificar respostas. Certifique-se de usar o padrão:\n1: "resposta"');
        }

        localStorage.removeItem('ava_paused');
        localStorage.setItem('ava_state', 'filling');
        localStorage.setItem('ava_respostas', JSON.stringify(respostas));
        irParaPagina1OuProcessar(esperarEditorEPreencher);
    }

    function esperarEditorEPreencher() {
        if (localStorage.getItem('ava_paused') === 'true') return;

        let tentativas = 0;
        const intervalo = setInterval(() => {
            tentativas++;
            const temQuestoesTexto = document.querySelectorAll('textarea[id$="_answer_id"], textarea.form-control, textarea').length > 0;
            const tinyPronto = typeof tinymce !== 'undefined' && tinymce.editors && tinymce.editors.length > 0;

            if (!temQuestoesTexto || tinyPronto || tentativas > 50) {
                clearInterval(intervalo);
                preencherRespostasEAvancar();
            }
        }, 100);
    }

    function preencherRespostasNaPagina(respostas) {
        const questionNodes = document.querySelectorAll('.que');

        questionNodes.forEach(qNode => {
            const qNoElement = qNode.querySelector('.qno, .info .no, .no');
            if (!qNoElement) return;

            const numMatch = qNoElement.innerText.match(/\d+/);
            if (!numMatch) return;
            const qNo = numMatch[0];

            if (respostas[qNo]) {
                const textoResposta = respostas[qNo];
                const textarea = qNode.querySelector('textarea[id$="_answer_id"], textarea.form-control, textarea');
                const attoEditable = qNode.querySelector('div.editor_atto_content');
                const radios = qNode.querySelectorAll('input[type="radio"]');

                if (textarea) {
                    const id = textarea.id;
                    if (typeof tinymce !== 'undefined' && tinymce.get(id)) {
                        tinymce.get(id).setContent(textoResposta);
                    } else {
                        textarea.value = textoResposta;
                        textarea.dispatchEvent(new Event('input', { bubbles: true }));
                        textarea.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                } else if (attoEditable) {
                    attoEditable.innerHTML = textoResposta;
                    attoEditable.dispatchEvent(new Event('input', { bubbles: true }));
                }

                if (radios.length > 0) {
                    const respostaLimpa = textoResposta.trim().toLowerCase();
                    let matched = false;

                    radios.forEach(radio => {
                        if (matched) return;
                        let labelText = '';

                        const labelEl = qNode.querySelector(`label[for="${CSS.escape(radio.id)}"]`);
                        if (labelEl) {
                            labelText = labelEl.innerText.trim().toLowerCase();
                        } else {
                            const ariaId = radio.getAttribute('aria-labelledby');
                            if (ariaId) {
                                const ariaEl = document.getElementById(ariaId);
                                if (ariaEl) labelText = ariaEl.innerText.trim().toLowerCase();
                            }
                            if (!labelText && radio.closest('label')) {
                                labelText = radio.closest('label').innerText.trim().toLowerCase();
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
                                if (
                                    labelText.startsWith(targetLetter + '.') ||
                                    labelText.startsWith(targetLetter + ')') ||
                                    labelText.startsWith(targetLetter + ' ') ||
                                    labelText === targetLetter
                                ) {
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

    function preencherRespostasEAvancar() {
        const respostas = JSON.parse(localStorage.getItem('ava_respostas') || '{}');
        preencherRespostasNaPagina(respostas);

        const delay = obterDelayPagina();

        setTimeout(() => {
            if (localStorage.getItem('ava_paused') === 'true') return;

            const currentPageBtn = document.querySelector('.qnbutton.thispage');
            let isLastPage = true;

            if (currentPageBtn) {
                const currentPgIndex = parseInt(currentPageBtn.getAttribute('data-quiz-page'), 10);
                const nextPgBtn = document.querySelector(`.qnbutton[data-quiz-page="${currentPgIndex + 1}"]`);
                if (nextPgBtn) isLastPage = false;
            }

            if (!isLastPage) {
                const btnNext = document.querySelector('input[name="next"], button.mod_quiz-next-nav, input.mod_quiz-next-nav, .nav-link.next');
                if (btnNext) {
                    btnNext.click();
                } else {
                    finalizarPreenchimento();
                }
            } else {
                finalizarPreenchimento();
            }
        }, delay);
    }

    function finalizarPreenchimento() {
        limparEstado();
        alert('🎉 Processo Finalizado!\nPor favor, confira as respostas antes de terminar a tentativa manualmente.');
    }

    // ==========================================
    // 6. RESOLVER APENAS A PÁGINA ATUAL (ALT+X) E PARADA DE EMERGÊNCIA (ALT+K)
    // ==========================================
    function resolverPaginaAtualComGemini() {
        const questoesPagina = extrairQuestoesDaPagina();

        if (questoesPagina.length === 0) {
            return alert("Nenhuma questão encontrada nesta página.");
        }

        const textoQuestoes = questoesPagina.map(q => `${q.numero}) ${q.texto}`).join('\n\n');
        const promptText = montarPrompt(textoQuestoes);

        chamarGeminiAPI(promptText, (botReply) => {
            const { respostas, count } = parseRespostasTexto(botReply);
            if (count === 0) {
                return alert('Falha ao identificar formato de respostas do Gemini.');
            }
            preencherRespostasNaPagina(respostas);
        }, (err) => {
            if (err) alert("Erro ao contatar Gemini (Página Atual): " + err.message);
        });
    }

    function alternarPausaEmergencia() {
        const currentState = localStorage.getItem('ava_state');

        if (!currentState) {
            return alert("⚠️ Nenhum processo automático está rodando no momento.");
        }

        const atualmentePausado = localStorage.getItem('ava_paused') === 'true';

        if (atualmentePausado) {
            localStorage.removeItem('ava_paused');
            alert("▶️ Automação RETOMADA!\nO script continuará do ponto onde parou.");

            if (currentState === 'extracting_txt') {
                processarPaginaAtualExtrator('txt');
            } else if (currentState === 'extracting_gemini') {
                processarPaginaAtualExtrator('gemini');
            } else if (currentState === 'filling') {
                esperarEditorEPreencher();
            }
        } else {
            localStorage.setItem('ava_paused', 'true');
            alert("⏸️ Automação PAUSADA!\nA navegação entre páginas e preenchimento foi suspensa.\nPressione ALT+K novamente para retomar.");
        }
    }

    // ==========================================
    // 7. GERENCIADOR ROBUSTO DE ATALHOS (ALT+X / ALT+K)
    // ==========================================
    function registrarAtalhoGlobal() {
        const tratarTeclas = (e) => {
            const isAlt = e.altKey;
            const isX = (e.key && e.key.toLowerCase() === 'x') || e.code === 'KeyX' || e.keyCode === 88;
            const isK = (e.key && e.key.toLowerCase() === 'k') || e.code === 'KeyK' || e.keyCode === 75;

            if (isAlt && isX) {
                e.preventDefault();
                e.stopPropagation();
                resolverPaginaAtualComGemini();
            } else if (isAlt && isK) {
                e.preventDefault();
                e.stopPropagation();
                alternarPausaEmergencia();
            }
        };

        window.addEventListener('keydown', tratarTeclas, true);
        document.addEventListener('keydown', tratarTeclas, true);

        const anexaEmIFrames = () => {
            document.querySelectorAll('iframe').forEach(iframe => {
                try {
                    if (iframe.contentWindow && !iframe.dataset.altxOuvinte) {
                        iframe.contentWindow.addEventListener('keydown', tratarTeclas, true);
                        iframe.dataset.altxOuvinte = 'true';
                    }
                } catch (err) {}
            });
        };

        anexaEmIFrames();
        setInterval(anexaEmIFrames, 2000);
    }

    // ==========================================
    // 8. FUNÇÕES UTILITÁRIAS
    // ==========================================
    function limparEstado() {
        localStorage.removeItem('ava_state');
        localStorage.removeItem('ava_questoes');
        localStorage.removeItem('ava_respostas');
        localStorage.removeItem('ava_paused');
        localStorage.removeItem('ava_modo_prova');
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

})();
