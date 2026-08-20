# 🚀 Auto AVA (NUKE)
**Extrator TXT, Resolução API c/ Múltiplos PDFs, Suporte a Verdadeiro/Falso. 100% Furtivo.**

Este repositório/guia contém as instruções passo a passo para instalar, configurar e utilizar o script de usuário **Auto AVA (NUKE)**. Este script foi projetado para automatizar a extração e resolução de questionários no ambiente AVA (Moodle) utilizando inteligência artificial através da API do Google Gemini.

---

## 📋 Funcionalidades
- **Extração em TXT:** Baixa todas as questões do questionário em um arquivo de texto.
- **Resolução Automática (Gemini):** Lê as questões, envia para a IA e preenche os campos automaticamente.
- **Leitura de Contexto (PDFs):** Permite anexar arquivos PDF (até 15MB no total) para que a IA use como base (consulta) antes de responder.
- **Preenchimento Furtivo e Inteligente:** Identifica campos de texto (incluindo TinyMCE), múltipla escolha e Verdadeiro/Falso.
- **Atalhos de Teclado:** Pressione `ALT + X` para resolver instantaneamente apenas as questões da página atual.

---

## 🛠️ Passo 1: Instalando a Extensão Tampermonkey

Para que o script funcione no seu navegador, você precisa de um gerenciador de *userscripts*. O mais recomendado é o **Tampermonkey**.

1. Acesse a loja de extensões do seu navegador:
   - [Chrome Web Store (Google Chrome, Brave, Edge)](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
   - [Add-ons for Firefox (Mozilla Firefox)](https://addons.mozilla.org/pt-BR/firefox/addon/tampermonkey/)
2. Clique em **Usar no Chrome** (ou equivalente) e confirme em **Adicionar Extensão**.
3. Fixe o ícone do Tampermonkey na barra superior do seu navegador para facilitar o acesso.

---

## 🔑 Passo 2: Obtendo a Chave de API do Google Gemini

O script usa a inteligência do **Google Gemini (versão 2.5 Flash)** para resolver as questões. Para isso, você precisa de uma chave gratuita.

1. Acesse o **[Google AI Studio](https://aistudio.google.com/app/apikey)** (faça login com sua conta Google).
2. No menu lateral esquerdo, clique em **Get API key** ou **Create API key**.
3. Clique no botão azul **Create API key** e depois em **Create API key in new project**.
4. Uma longa sequência de letras e números será gerada (Ex: `AIzaSyB...`). **Copie essa chave** e guarde-a com segurança.

---

## ⚙️ Passo 3: Instalando e Configurando o Script

1. Clique no ícone do **Tampermonkey** no seu navegador e selecione **"Adicionar novo script"** (ou *Create a new script*).
2. Apague qualquer código que já estiver no editor de texto.
3. **Cole todo o código** do script `Auto AVA (NUKE)` que você possui.
4. No código, localize a linha (por volta da linha 20):
   ```javascript
   const API_KEY = 'CHAVE_API';
   ```
5. Substitua `'CHAVE_API'` pela chave que você copiou no Passo 2. Deve ficar parecido com isso:
   ```javascript
   const API_KEY = 'AIzaSyYourGeneratedKeyHere12345';
   ```
6. Salve o script pressionando `CTRL + S` (ou `CMD + S` no Mac) ou clicando em **Arquivo > Salvar**.

---

## 🔌 Passo 4: Ativando os Scripts de Usuário (Importante)

Para que o Tampermonkey consiga executar o código no seu navegador, você precisa garantir que a extensão tem as permissões corretas e que o script está ligado.

1. **Ative o Modo do Desenvolvedor (Google Chrome / Edge):** 
   - Devido a políticas recentes de segurança, navegadores baseados em Chromium exigem que o "Modo do Desenvolvedor" esteja ativo para rodar scripts de usuário.
   - Abra uma nova aba e digite `chrome://extensions/` (ou `edge://extensions/`).
   - No canto superior direito da tela, ative a chave **"Modo do desenvolvedor"**.
2. **Ative o Script no Tampermonkey:**
   - Clique no ícone do Tampermonkey na barra do navegador e vá em **"Painel de Controle"** (Dashboard).
   - Na lista de scripts instalados, localize o **Auto AVA (NUKE) - V/F Atualizado**.
   - Certifique-se de que a chave (toggle) na coluna à esquerda do nome esteja **verde (ativada)**.

---

## 🎯 Passo 5: Como Utilizar no AVA

Acesse a página do seu questionário no AVA (o link deve conter `/mod/quiz/attempt.php` ou `review.php`). 

Clique no ícone do **Tampermonkey** para abrir o menu do script. Você verá as seguintes opções:

### 📄 1. Anexar PDF(s) de Referência (Recomendado)
Se o seu questionário é baseado em um texto, slide ou apostila:
1. Clique em **📄 Anexar PDF(s) de Referência**.
2. Clique em qualquer lugar da tela e selecione seus arquivos PDF no computador (limite de 15MB somados).
3. Uma mensagem confirmará que os PDFs estão na memória do script. O Gemini lerá esses PDFs para responder às questões com muito mais precisão.

### ✨ 2. Resolver Tudo com Gemini Automático
Esta é a função principal (Nuke):
1. Clique nesta opção no menu do Tampermonkey.
2. Confirme o aviso na tela.
3. **Não clique em nada.** O script vai varrer as páginas, coletar todas as questões, enviar ao Gemini (junto com os PDFs, se anexados) e preencher todas as respostas (múltipla escolha, V/F ou texto).
4. Ao final, ele avisará que concluiu. **Sempre revise as respostas antes de enviar!**

### 🎯 3. Resolver Apenas Página Atual (Atalho: ALT + X)
Se você quer resolver o questionário página por página:
- Pressione **`ALT + X`** no teclado ou clique nesta opção no menu.
- Ele enviará apenas as questões visíveis na tela para a IA e as preencherá em segundos.

### 📥 4. Extrair Questões (TXT)
Se você apenas quer salvar as perguntas no seu computador para estudar depois:
- Clique nesta opção. Ele navegará pelo questionário e fará o download de um arquivo `questoes_questionario.txt`.

### 🗑️ 5. Limpar PDF(s)
- Use essa opção quando terminar a prova para apagar os PDFs da memória e não atrapalhar o próximo questionário.

---

## ⚠️ Avisos e Boas Práticas

- **Tempo de Resposta:** Se você anexar PDFs muito grandes ou houver muitas questões discursivas, o Gemini pode levar de 15 a 40 segundos para processar. **Aguarde e não recarregue a página** após iniciar o comando.
- **Revisão:** A IA é poderosa, mas pode cometer pequenos erros. **Revise as alternativas preenchidas** e os textos antes de finalizar a tentativa do questionário.
- **Tamanho dos Arquivos:** O limite de 15MB de PDFs é uma restrição da requisição do navegador. Se passar disso, divida o arquivo ou use compressores de PDF online.
- **Sigilo da API:** Nunca compartilhe seu script com a sua `API_KEY` preenchida em computadores públicos.

---
*Desenvolvido por Salela , Crazzy Man, com suporte de Mik4el e Gemini_Vibe_codass*
