# Ficha de RPG

Site de ficha de RPG com React + Vite, hospedado na Vercel, com banco de dados e login no Supabase.

## Estrutura

```
ficha-rpg/
├── supabase/
│   └── schema.sql        # tabela e regras de segurança (rodar no Supabase)
├── src/
│   ├── main.jsx          # ponto de entrada
│   ├── App.jsx           # sessão e navegação
│   ├── Login.jsx         # entrar / criar conta
│   ├── Lista.jsx         # lista de fichas
│   ├── Ficha.jsx         # ficha editável com salvamento automático
│   ├── ListaItens.jsx    # listas de implantes, equipamento, vantagens
│   ├── Foto.jsx          # envio de fotos (Supabase Storage)
│   ├── calc.js           # fórmulas (HP, sanidade, carga...) - edite aqui
│   ├── supabase.js       # cliente do Supabase
│   └── styles.css
├── index.html
├── package.json
├── vite.config.js
├── .env                  # suas chaves (não vai para o GitHub)
└── .env.example          # modelo do .env
```

## Passo a passo

1. **Supabase:** crie um projeto, abra *SQL Editor*, cole o conteúdo de `supabase/schema.sql` e clique em *Run*.
2. **Chaves:** em *Project Settings → API*, copie a *Project URL* e a chave *anon public* para o `.env`
   (`VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`). Nunca use a chave `service_role`.
3. **Rodar localmente:** `npm install` e depois `npm run dev`.
4. **Vercel:** suba a pasta para o GitHub e importe em vercel.com/new. Em *Settings → Environment Variables*,
   crie as mesmas duas variáveis e faça o deploy.
5. **Supabase:** em *Authentication → URL Configuration*, coloque o endereço da Vercel em *Site URL*.

Dica: para testar sem confirmar o e-mail, desative *Confirm email* em *Authentication → Providers → Email*.

## Fotos e cálculos

- Rode de novo o `supabase/schema.sql` (ele cria o bucket `fichas-fotos` e as regras de acesso).
- As fórmulas ficam em `src/calc.js`; ajuste ali para as regras da sua mesa.

## Limites de acesso

O `schema.sql` não impõe limite de acessos, de contas nem de fichas. Os limites que existirem vêm do plano
contratado no Supabase e na Vercel (usuários ativos por mês, tamanho do banco, armazenamento de fotos e tráfego).
Confira os valores atuais em supabase.com/pricing e vercel.com/pricing.

## Erro "email rate limit exceeded"

O envio de e-mails padrão do Supabase é bem limitado (cerca de 2 por hora no projeto inteiro). Duas saídas:

1. **Mais simples:** em *Authentication → Providers → Email*, desative **Confirm email**. O cadastro passa a entrar direto, sem enviar e-mail.
2. **Para uso com muita gente:** em *Authentication → Emails → SMTP Settings*, ative *Custom SMTP* com um serviço como Resend, Brevo ou SendGrid.

Contas que ficaram sem confirmar podem ser liberadas no SQL Editor:

```sql
update auth.users set email_confirmed_at = now() where email_confirmed_at is null;
```

## IA (Gemini)

A IA roda numa Edge Function (`supabase/functions/ia/index.ts`), que guarda a chave do Gemini e controla o limite diário por pessoa.

1. Crie uma chave em aistudio.google.com (Get API key).
2. Rode o `supabase/schema.sql` de novo (cria o contador `ia_uso` e a função `ia_consumir`).
3. No Supabase: *Edge Functions → Deploy a new function → Via Editor*, nome `ia`, cole o conteúdo de `index.ts` e faça o deploy.
4. Em *Edge Functions → Secrets*, crie `GEMINI_API_KEY` com a sua chave. Opcionais: `GEMINI_MODEL` (padrão `gemini-3.1-flash-lite`) e `IA_LIMITE_DIARIO` (padrão 30 usos por pessoa por dia).
5. Faça o deploy do site na Vercel (não há variável nova).

Nunca coloque a chave do Gemini no `.env` do site nem em variáveis `VITE_`: elas ficam visíveis no navegador.

## Celular (perfil, bate-papo, Pix e CLOVE)

O botão de celular no canto da tela abre o aplicativo. Perfil e @usuario, aliados, chat privado em tempo real,
DINHEIRO (pontos) com Pix entre aliados e a CLOVE (IA). O saldo só muda por funções do banco (`pix_enviar`,
`admin_dar_dinheiro`); o navegador não consegue alterá-lo.

1. Crie a sua conta no site (e-mail e senha) e escolha o @usuario no Perfil.
2. Rode o `supabase/schema.sql` de novo. No final ele torna o e-mail da KILL JOY administradora e libera a CLOVE só para ela.
   Se rodar antes de a conta existir, rode de novo depois de criá-la.
3. Edge Functions: crie a função `clove` (cole `supabase/functions/clove/index.ts`) e atualize a `ia` (o código mudou:
   agora só responde a quem a KILL JOY liberou). Os secrets são os mesmos (`GEMINI_API_KEY`); opcionais:
   `CLOVE_LIMITE_DIARIO` (padrão 100) e `CLOVE_PERSONA` (muda a personalidade da CLOVE).
4. Faça o deploy do site na Vercel.

A KILL JOY libera outros jogadores, e dá ou tira DINHEIRO, no app "KILL JOY" do celular (só aparece para ela).
Limites do Realtime no plano grátis do Supabase: 200 conexões simultâneas e 100 mensagens por segundo.

## Analisar a própria conversa (CLOVE)

Dentro de uma conversa, o botão "Analisar" (só para quem a KILL JOY liberou) envia à CLOVE as últimas N mensagens
(padrão 200, de 10 a 300) mais uma pergunta opcional. A análise aparece só para quem pediu e fica no histórico
privado com a CLOVE; nada é publicado na conversa com o aliado. A CLOVE lê a conversa com o login de quem pergunta,
então só enxerga conversas das quais a pessoa participa. Atualize a Edge Function `clove` com o novo `index.ts`.

## Lote 2 (editar/apagar, bloqueio, não lidas, Pix seguro, extrato, conflito de edição)

- Mensagens de texto podem ser editadas ou apagadas pelo autor nos primeiros **10 minutos** (o prazo é conferido no banco). Pix nunca pode ser alterado.
- Bloquear/desbloquear usuários, contador de mensagens não lidas e de pedidos de amizade, "carregar mensagens anteriores".
- Pix pede confirmação antes de enviar. O app KILL JOY ganhou a aba "Extrato geral" (movimentações de DINHEIRO, nunca mensagens).
- A ficha detecta alteração em outro aparelho e pede para recarregar, em vez de sobrescrever em silêncio.
- As funções `ia` e `clove` tentam um modelo reserva se o principal falhar (secret opcional `GEMINI_MODEL_RESERVA`).
- Para aplicar: rode o `schema.sql` de novo, atualize as Edge Functions `ia` e `clove` e faça o deploy do site.

## Lote 3 (condições, histórico, PDF, papéis de parede, loja)

- **Condições** na ficha (Ferido, Sangrando… ou personalizadas, com nota).
- **Histórico de versões:** botão "Histórico" na ficha; o banco guarda o estado anterior a cada sessão de edição (até 30) e permite restaurar.
- **PDF:** botão "PDF" abre uma folha limpa e chama a impressão; escolha "Salvar como PDF". Permita pop-ups para o site.
- **Papéis de parede** do celular (6 modelos ou imagem própria) no app Perfil.
- **Loja:** todos compram; só quem a KILL JOY marca como "Vendedor" (app KILL JOY) pode anunciar. A compra é atômica, paga o vendedor e entrega o item na ficha escolhida. Itens são desativados, nunca apagados.
- Para aplicar: rode o `schema.sql` de novo e faça o deploy do site. Nenhuma Edge Function mudou.

## Mercado Negro e notificações

- A loja agora se chama **Mercado Negro** (mesmas regras: só vendedores liberados pela KILL JOY anunciam).
- **Notificações com o app fechado** (Web Push). Passo a passo:
  1. No seu computador: `npx web-push generate-vapid-keys` (gera uma chave pública e uma privada).
  2. Coloque a pública em `VITE_VAPID_PUBLIC_KEY` (no `.env` e nas Environment Variables da Vercel). Nunca coloque a privada no site.
  3. Rode o `schema.sql` de novo. Crie a Edge Function `push` com `supabase/functions/push/index.ts`.
  4. Em *Edge Functions → Secrets*: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (por exemplo `mailto:seu@email.com`) e `PUSH_WEBHOOK_SECRET` (uma senha longa inventada por você).
  5. Em *Database → Webhooks*, crie dois webhooks apontando para a função `push` (tipo Supabase Edge Functions), evento **Insert**, um na tabela `mensagens` e outro na tabela `amizades`. Em *HTTP Headers*, adicione `x-webhook-secret` com o mesmo valor do `PUSH_WEBHOOK_SECRET`.
  6. Faça o deploy na Vercel. No Perfil de cada pessoa, toque em "Ativar neste aparelho".
- No iPhone, as notificações só funcionam com o site instalado na Tela de Início (Safari › Compartilhar › Adicionar à Tela de Início).

## Aliados e Equipe

- No Bate-papo, cada amigo tem o botão **☆ Aliado**. Aliado = amigo que você marcou para aparecer na sua Equipe.
- O app **Equipe** mostra um cartão por aliado: personagem, HP, Resistência, Sanidade e condições, em tempo real. Com HP em 25% ou menos, o cartão pulsa em vermelho.
- Cada jogador escolhe a ficha da mesa (app Equipe ou botão "Usar na mesa" na ficha) e liga **"Mostrar meus sinais vitais"**. Vem desligado.
- Você só vê quem: é seu amigo, você marcou como aliado e ativou o compartilhamento. Nada além dos sinais vitais é exposto.
- Para aplicar: rode o `schema.sql` de novo, atualize a função `push` (texto "amigo") e faça o deploy do site.

## Vida e Sanidade

HP máximo e Sanidade máxima são só os valores que você digita na ficha (padrão 150 e 100). Os atributos (Corpo, Resistência,
Autocontrole, Sabedoria...) não somam pontos nelas. As fórmulas de iniciativa, defesa, humanidade efetiva e carga continuam em `src/calc.js`.

## Mestre da mesa

- O e-mail do mestre é definido no fim do `schema.sql` (bloco "LOTE 6"). Ele é administrador (como a KILL JOY) e **mestre**.
- O app **Mestre** (só aparece para ele) lista as fichas de todos os jogadores com HP e Sanidade ao vivo. Ao tocar em **Abrir**, a ficha completa aparece em modo somente leitura e se atualiza em tempo real.
- Cada jogador vê, na própria ficha, o aviso "O mestre da mesa pode ver esta ficha em tempo real."
- Para aplicar: a conta do mestre precisa existir; rode o `schema.sql` de novo e faça o deploy do site.
