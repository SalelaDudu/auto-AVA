// ==UserScript==
// @name         MiniGemini
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Chat flutuante com o Gemini
// @author       Salela + Gemini
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      generativelanguage.googleapis.com
// ==/UserScript==

(function() {
    'use strict';

    // ==========================================
    // 🔑 COLOQUE SUA CHAVE DE API ABAIXO
    // ==========================================
    const API_KEY = 'api_key';

    // Evita que o chat abra dentro de iframes (anúncios, vídeos embutidos)
    if (window !== window.top) return;

    // Carrega o histórico salvo ou inicia vazio
    let chatHistory = GM_getValue('gemini_history', []);

    // Criação dos elementos da interface
    const container = document.createElement('div');
    container.id = 'gemini-float-container';

    container.innerHTML = `
        <div id="gemini-header">
            <span id="gemini-title">✨ Gemini <i>mini</i></span>
            <div id="gemini-header-buttons">
                <button id="gemini-clear-btn" title="Reiniciar Chat">↻</button>
                <button id="gemini-min-btn" title="Minimizar">_</button>
                <button id="gemini-close-btn" title="Fechar">X</button>
            </div>
        </div>
        <div id="gemini-chat-area"></div>
        <div id="gemini-input-area">
            <textarea id="gemini-input" placeholder="Fale com o Gemini..."></textarea>
            <button id="gemini-send-btn">➤</button>
        </div>
    `;

    // Estilos CSS
    const styles = document.createElement('style');
    styles.innerHTML = `
        #gemini-float-container {
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 280px;
            height: 380px;
            background: #1e1e2e;
            color: #cdd6f4;
            border-radius: 12px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.5);
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            z-index: 999999;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            transition: width 0.3s, height 0.3s, border-radius 0.3s;
            box-sizing: border-box;
        }

        /* ESTILOS DA BOLINHA MINIMIZADA */
        #gemini-float-container.minimized {
            width: 60px !important;
            height: 60px !important;
            border-radius: 50% !important;
            cursor: pointer;
        }
        #gemini-float-container.minimized #gemini-header {
            padding: 0;
            width: 100%;
            height: 100%;
            display: flex;
            justify-content: center;
            align-items: center;
            background: #181825;
        }
        #gemini-float-container.minimized #gemini-title {
            font-size: 28px;
            margin: 0;
            padding: 0;
            line-height: 1;
            cursor: move;
        }
        #gemini-float-container.minimized #gemini-chat-area,
        #gemini-float-container.minimized #gemini-input-area,
        #gemini-float-container.minimized #gemini-header-buttons {
            display: none;
        }

        #gemini-header {
            background: #181825;
            padding: 10px 15px;
            cursor: move;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-weight: bold;
            user-select: none;
            height: 40px;
            box-sizing: border-box;
            width: 100%;
        }
        #gemini-header button {
            background: none;
            border: none;
            color: #cdd6f4;
            cursor: pointer;
            font-weight: bold;
            margin-left: 5px;
            font-size: 14px;
        }
        #gemini-header button:hover { color: #f38ba8; }

        /* BOTÃO DE RECARREGAR (VERMELHO) */
        #gemini-clear-btn {
            color: #ff5e5e !important;
            font-size: 16px !important;
        }
        #gemini-clear-btn:hover {
            color: #ff8c8c !important;
        }

        #gemini-chat-area {
            flex-grow: 1;
            padding: 10px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 8px;
            font-size: 13px;
        }
        .msg-bubble {
            max-width: 85%;
            padding: 8px 12px;
            border-radius: 8px;
            line-height: 1.4;
            display: flex;
            align-items: flex-start;
            gap: 8px;
            justify-content: space-between;
        }
        .msg-content {
            flex-grow: 1;
            word-wrap: break-word;
            overflow-wrap: break-word;
            white-space: pre-wrap;
        }
        .copy-btn {
            background: transparent;
            border: none;
            cursor: pointer;
            padding: 0;
            font-size: 14px;
            opacity: 0.6;
            color: inherit;
        }
        .copy-btn:hover { opacity: 1; }

        .msg-user { background: #89b4fa; color: #11111b; align-self: flex-end; }
        .msg-model { background: #313244; color: #cdd6f4; align-self: flex-start; }

        #gemini-input-area {
            display: flex;
            padding: 10px;
            background: #181825;
            gap: 8px;
        }
        #gemini-input {
            flex-grow: 1;
            background: #313244;
            border: none;
            color: white;
            border-radius: 6px;
            padding: 8px;
            resize: none;
            height: 20px;
            font-family: inherit;
            font-size: 12px;
            outline: none;
        }
        #gemini-send-btn {
            background: #89b4fa;
            color: #11111b;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            padding: 0 12px;
            font-weight: bold;
        }
        #gemini-send-btn:hover { background: #74c7ec; }
    `;

    document.head.appendChild(styles);
    document.body.appendChild(container);

    // Seletores úteis
    const header = document.getElementById('gemini-header');
    const chatArea = document.getElementById('gemini-chat-area');
    const inputField = document.getElementById('gemini-input');
    const sendBtn = document.getElementById('gemini-send-btn');
    const minBtn = document.getElementById('gemini-min-btn');
    const closeBtn = document.getElementById('gemini-close-btn');
    const clearBtn = document.getElementById('gemini-clear-btn');

    // ==========================================
    // Lógica da Interface (Arrastar, Minimizar, Fechar, Limpar)
    // ==========================================
    let isDragging = false, startX, startY, initialX, initialY;

    header.addEventListener('mousedown', (e) => {
        if(e.target.tagName === 'BUTTON') return;
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        initialX = container.offsetLeft;
        initialY = container.offsetTop;
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', stopDrag);
    });

    function drag(e) {
        if (!isDragging) return;
        container.style.right = 'auto';
        container.style.bottom = 'auto';
        container.style.left = (initialX + e.clientX - startX) + 'px';
        container.style.top = (initialY + e.clientY - startY) + 'px';
    }

    function stopDrag() {
        isDragging = false;
        document.removeEventListener('mousemove', drag);
        document.removeEventListener('mouseup', stopDrag);
    }

    minBtn.addEventListener('click', () => {
        container.classList.add('minimized');
        document.getElementById('gemini-title').innerHTML = '✨';
    });

    header.addEventListener('dblclick', () => {
        if (container.classList.contains('minimized')) {
            container.classList.remove('minimized');
            document.getElementById('gemini-title').innerHTML = '✨ Gemini <i>mini</i>';
        }
    });

    closeBtn.addEventListener('click', () => container.remove());

    clearBtn.addEventListener('click', () => {
        if (confirm('Tem certeza que deseja reiniciar o chat e começar do zero?')) {
            chatHistory = [];
            GM_setValue('gemini_history', chatHistory);
            chatArea.innerHTML = '';
        }
    });

    // ==========================================
    // Lógica do Chat e da API
    // ==========================================

    function addMessageToUI(text, role, isError = false) {
        const bubble = document.createElement('div');
        bubble.className = `msg-bubble msg-${role}`;

        // Estrutura interna com o texto e o botão de copiar
        bubble.innerHTML = `
            <div class="msg-content"></div>
            ${!isError ? '<button class="copy-btn" title="Copiar">📋</button>' : ''}
        `;

        // Insere o texto com segurança
        bubble.querySelector('.msg-content').textContent = text;

        // Adiciona lógica de copiar (se não for erro)
        if (!isError) {
            const copyBtn = bubble.querySelector('.copy-btn');
            copyBtn.addEventListener('click', () => {
                navigator.clipboard.writeText(text).then(() => {
                    copyBtn.innerText = '✅';
                    setTimeout(() => { copyBtn.innerText = '📋'; }, 2000);
                }).catch(err => {
                    console.error('Erro ao copiar: ', err);
                });
            });
        }

        chatArea.appendChild(bubble);
        chatArea.scrollTop = chatArea.scrollHeight;
    }

    chatHistory.forEach(msg => {
        addMessageToUI(msg.parts[0].text, msg.role);
    });

    function sendMessage() {
        const text = inputField.value.trim();
        if (!text || API_KEY === 'minha_api_key') {
            if(API_KEY === 'minha_api_key') alert('Por favor, insira sua Chave de API no script do Tampermonkey!');
            return;
        }

        addMessageToUI(text, 'user');
        inputField.value = '';

        chatHistory.push({ role: "user", parts: [{ text: text }] });
        GM_setValue('gemini_history', chatHistory);

        const loadingId = 'loading-' + Date.now();
        const loadingBubble = document.createElement('div');
        loadingBubble.id = loadingId;
        loadingBubble.className = 'msg-bubble msg-model';
        loadingBubble.innerText = 'Digitando...';
        chatArea.appendChild(loadingBubble);
        chatArea.scrollTop = chatArea.scrollHeight;

        GM_xmlhttpRequest({
            method: "POST",
            url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
            headers: {
                "Content-Type": "application/json"
            },
            data: JSON.stringify({ contents: chatHistory }),
            onload: function(response) {
                const loadingElement = document.getElementById(loadingId);
                if (loadingElement) loadingElement.remove();

                try {
                    const data = JSON.parse(response.responseText);

                    if (data.error) {
                        addMessageToUI("Erro na API: " + data.error.message, 'model', true);
                        chatHistory.pop();
                        return;
                    }

                    const botReply = data.candidates[0].content.parts[0].text;

                    addMessageToUI(botReply, 'model');
                    chatHistory.push({ role: "model", parts: [{ text: botReply }] });
                    GM_setValue('gemini_history', chatHistory);

                } catch (e) {
                    addMessageToUI("Ops! Ocorreu um erro ao ler a resposta.", 'model', true);
                }
            },
            onerror: function() {
                const loadingElement = document.getElementById(loadingId);
                if (loadingElement) loadingElement.remove();
                addMessageToUI("Erro de conexão. Verifique sua internet.", 'model', true);
            }
        });
    }

    sendBtn.addEventListener('click', sendMessage);
    inputField.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

})();
