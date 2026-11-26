const express = require('express');
const fs = require('fs');
// API Key などの環境変数は .env.local から読み込む
require('dotenv').config({ path: '.env.local' });

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());
app.use(express.static('public'));

// ===== 設定 =====
// 利用するLLMプロバイダを選択します（'openai' または 'gemini'）
const PROVIDER = 'openai';

// プロバイダごとに利用するモデル
const MODELS = {
    openai: 'gpt-6-luna',        // OpenAI（デフォルト）
    gemini: 'gemini-4-hydrogen', // Google Gemini
};
const MODEL = MODELS[PROVIDER];

let promptTemplate;
try {
    promptTemplate = fs.readFileSync('prompt.md', 'utf8');
} catch (error) {
    console.error('Error reading prompt.md:', error);
    process.exit(1);
}

let itineraryPromptTemplate;
try {
    itineraryPromptTemplate = fs.readFileSync('itinerary-prompt.md', 'utf8');
} catch (error) {
    console.error('Error reading itinerary-prompt.md:', error);
    process.exit(1);
}

const OPENAI_API_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const OPENAI_RESPONSES_ENDPOINT = 'https://api.openai.com/v1/responses';
const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/';

// public/ 内の .html 一覧を返す（index.html がこの一覧を使ってリンクを表示する）
app.get('/api/pages', (req, res) => {
    const files = fs.readdirSync('public')
        .filter(name => name.endsWith('.html') && name !== 'index.html');
    res.json(files);
});

// 問題数の上限（過剰なリクエストでトークンを浪費しないようにする）
const MAX_COUNT = 20;

app.post('/api/', async (req, res) => {
    try {
        // title と、変数置換に使うその他のキーを受け取る
        // （prompt.md がプロンプトを定義するので、リクエストでの上書きは許可しない）
        const { title = 'Generated Content', ...variables } = req.body;

        // count が指定されている場合は 1〜MAX_COUNT の範囲に収める
        if (variables.count !== undefined) {
            const count = Number(variables.count);
            if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) {
                return res.status(400).json({
                    error: `count must be an integer between 1 and ${MAX_COUNT}`,
                });
            }
        }

        // prompt.md のテンプレート変数 ${key} をリクエストの値で置換する
        const finalPrompt = fillTemplate(promptTemplate, variables);

        let result;
        if (PROVIDER === 'openai') {
            result = await callOpenAI(finalPrompt);
        } else if (PROVIDER === 'gemini') {
            result = await callGemini(finalPrompt);
        } else {
            return res.status(400).json({ error: 'Invalid provider configuration' });
        }

        res.json({
            title: title,
            data: result,
        });

    } catch (error) {
        // 詳細はサーバーログにのみ出力し、クライアントには汎用メッセージを返す
        console.error('API Error:', error);
        res.status(500).json({ error: 'Failed to generate content. Please try again.' });
    }
});

// 旅程ジェネレーター用。既存クイズと同じ LLM API を使い、専用プロンプトでJSONを生成する。
app.post('/api/itinerary', async (req, res) => {
    try {
        const { title = '週末の小さな旅', ...variables } = req.body;
        const requiredFields = ['destination', 'days', 'budget', 'mood', 'companion'];
        const missingField = requiredFields.find(field => !String(variables[field] || '').trim());
        if (missingField) {
            return res.status(400).json({ error: '旅の条件をすべて入力してください。' });
        }

        const days = Number(variables.days);
        if (!Number.isInteger(days) || days < 1 || days > 3) {
            return res.status(400).json({ error: '日数は1〜3日の範囲で選んでください。' });
        }

        if (PROVIDER !== 'openai') {
            return res.status(400).json({ error: '旅程のウェブ検索は現在 OpenAI の設定でのみ利用できます。' });
        }

        const result = await callOpenAIWithSearch(itineraryPromptTemplate, variables);
        res.json({ title, data: result.data, sources: result.sources });
    } catch (error) {
        console.error('Itinerary API Error:', error);
        res.status(500).json({ error: '旅の提案を作れませんでした。少し待ってからもう一度お試しください。' });
    }
});

// APIへの未定義パスもHTMLではなくJSONで返す
app.use('/api', (req, res) => {
    res.status(404).json({ error: '指定されたAPIが見つかりません。' });
});

// JSONボディの解析エラーもAPIではJSON形式で返す
app.use((error, req, res, next) => {
    if (req.path.startsWith('/api/')) {
        console.error('API Request Error:', error);
        return res.status(error.status || 400).json({ error: 'リクエストを読み取れませんでした。' });
    }
    next(error);
});

// prompt.md 内の ${key} を variables の値で安全に置換する
function fillTemplate(template, variables) {
    return template.replace(/\$\{(\w+)\}/g, (match, key) => {
        return Object.prototype.hasOwnProperty.call(variables, key)
            ? String(variables[key])
            : match; // 対応する値がなければそのまま残す
    });
}

async function callOpenAIWithSearch(instructions, preferences) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error('OPENAI_API_KEY environment variable is not set');
    }

    const response = await fetch(OPENAI_RESPONSES_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: MODEL,
            instructions,
            input: `次のJSONを旅の希望として使ってください:\n${JSON.stringify(preferences)}`,
            tools: [{
                type: 'web_search',
                external_web_access: true,
                search_context_size: 'medium',
                user_location: { type: 'approximate', country: 'JP' }
            }],
            tool_choice: 'required',
            include: ['web_search_call.action.sources'],
            max_output_tokens: 6000
        })
    });

    const payload = await response.json();
    if (!response.ok) {
        throw new Error(payload.error?.message || 'OpenAI web search API error');
    }

    const responseText = (payload.output || [])
        .filter(item => item.type === 'message')
        .flatMap(item => item.content || [])
        .filter(item => item.type === 'output_text' && typeof item.text === 'string')
        .map(item => item.text)
        .join('\n');

    if (!responseText) {
        throw new Error('OpenAI returned no itinerary text');
    }

    const parsed = JSON.parse(responseText);
    const data = Array.isArray(parsed) ? parsed : parsed.data;
    if (!Array.isArray(data)) {
        throw new Error('No itinerary array found in the OpenAI response');
    }

    const sourceMap = new Map();
    for (const item of payload.output || []) {
        const actionSources = item.type === 'web_search_call' ? item.action?.sources || [] : [];
        const citations = item.type === 'message'
            ? (item.content || []).flatMap(content => content.annotations || [])
            : [];
        for (const source of [...actionSources, ...citations]) {
            const url = source.url;
            if (typeof url === 'string' && /^https:\/\//i.test(url)) {
                sourceMap.set(url, { title: source.title || url, url });
            }
        }
    }

    return { data, sources: [...sourceMap.values()].slice(0, 8) };
}

async function callOpenAI(prompt) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error('OPENAI_API_KEY environment variable is not set');
    }

    const response = await fetch(OPENAI_API_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: MODEL,
            messages: [
                { role: 'system', content: prompt }
            ],
            max_completion_tokens: 2000,
            response_format: { type: "json_object" }
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'OpenAI API error');
    }

    const data = await response.json();
    const responseText = data.choices[0].message.content;
    return extractArray(responseText);
}

async function callGemini(prompt) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY environment variable is not set');
    }

    const response = await fetch(`${GEMINI_API_BASE_URL}${MODEL}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            contents: [{
                parts: [{ text: prompt }]
            }],
            generationConfig: {
                // 思考型モデルでは思考トークンもこの上限に含まれるため、余裕を持たせる
                maxOutputTokens: 8192,
                response_mime_type: "application/json",
                // クイズ生成に深い思考は不要。HIGH（既定）だと思考で上限に達し JSON が途中で切れることがある
                thinkingConfig: { thinkingLevel: "LOW" }
            }
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Gemini API error');
    }

    const data = await response.json();
    const responseText = data.candidates[0].content.parts[0].text;
    return extractArray(responseText);
}

// LLM が返した JSON 文字列をパースし、最初に見つかった配列を取り出す
function extractArray(responseText) {
    let parsedData;
    try {
        parsedData = JSON.parse(responseText);
    } catch (parseError) {
        throw new Error('Failed to parse LLM response: ' + parseError.message);
    }

    const arrayData = Object.values(parsedData).find(Array.isArray);
    if (!arrayData) {
        throw new Error('No array found in the LLM response object.');
    }
    return arrayData;
}

// Cloud Shell のポート転送からも到達できるよう、全ネットワークインターフェースで待ち受ける。
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on 0.0.0.0:${PORT}`);
    console.log(`Config: ${PROVIDER} - ${MODEL}`);
});
