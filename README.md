# Generic Web API for LLM Integration

A flexible Node.js web API that allows you to create LLM-powered applications by simply editing a Markdown prompt file. No code changes required for different use cases.

## 中間課題の提出情報

- **作品名**：よりみち日和 — AI週末旅プランナー
- **作品概要**：
  行き先や日数、予算、気分を入力すると、AIが週末の旅程を提案します。  
  ウェブ検索で見つけた観光スポットと参照元リンクも確認できます。  
  使い方は作品ページ内に案内しています。
- **作品URL**：https://generic-webapi-kc53.onrender.com/tabi.html
- **作品ソース**：https://github.com/OWU131324150/generic-webapi

### Render への公開

Render で Web Service を作成し、Build Command に `npm install`、Start Command に `npm start` を設定します。Environment Variables に `OPENAI_API_KEY` を登録してください。公開後の作品ページは `/tabi.html` です。旅程生成には OpenAI API キーと API 利用料金が必要です。

## Features

- 🎯 **Generic Design**: One API endpoint for any LLM application
- 📝 **Markdown Prompts**: Define your application logic in `prompt.md`
- 🔄 **Variable Substitution**: Automatic replacement of `${variable}` placeholders
- 🤖 **Multi-Provider**: Supports OpenAI and Google Gemini
- ⚡ **No Code Changes**: Switch between applications by editing `prompt.md`

## Quick Start

### 1. Installation

```bash
npm install
```

### 2. Environment Setup

Copy `.env.example` to `.env.local` and set your API key:

```bash
cp .env.example .env.local
```

Edit `.env.local`:
```env
# For OpenAI (default)
OPENAI_API_KEY=your_openai_api_key_here

# For Gemini (if switching)
GEMINI_API_KEY=your_gemini_api_key_here

PORT=8080
```

> `.env.local` holds your real keys and is git-ignored. Do not commit it.

### 3. Configure LLM Provider

Edit the `PROVIDER` constant near the top of `server.js`:

```javascript
// For OpenAI (default) -> gpt-6-luna
const PROVIDER = 'openai';

// For Gemini -> gemini-4-hydrogen
// const PROVIDER = 'gemini';
```

The model is selected automatically from the `MODELS` map based on `PROVIDER`.

### 4. Start Server

```bash
npm start
```

Visit `http://localhost:8080`

## How It Works

### Architecture

```
Client (quiz.html) → POST /api/ → server.js → LLM → Response
                                     ↓
                              prompt.md (template)
```

### Variable Substitution

The API automatically replaces variables in `prompt.md` with request data:

**prompt.md:**
```markdown
Create ${count} questions about ${topic}.
Format: JSON array
```

**Request:**
```json
{
  "count": 5,
  "topic": "JavaScript"
}
```

**Result:** Variables `${count}` and `${topic}` are replaced with actual values.

### API Endpoint

**POST** `/api/`

**Request Body:**
```json
{
  "title": "My Quiz",
  "count": 5,
  "any_variable": "value"
}
```

**Response:**
```json
{
  "title": "My Quiz",
  "data": [...]
}
```

## Example Applications

### 1. よりみち日和（週末の小さな旅プランナー）

**Files:**
- `itinerary-prompt.md` - 旅程JSONの生成ルール
- `public/tabi.html`, `public/tabi.css`, `public/tabi.js` - 入力フォームと旅程表示
- `POST /api/itinerary` - 旅の条件をLLMに渡すAPI

行き先、日数、予算、旅の気分、同行者を入力すると、OpenAI Responses API のウェブ検索で実在するスポットを調べ、その結果を使ってAIが旅程をJSONで生成します。画面には旅程に加えて、検索で参照したページへのリンクも表示します。検索機能には有効な OpenAI API キーが必要で、OpenAI の API 利用料金がかかります。

旅の風景イラストは、このアプリ用にSVGで自作しています。外部の写真や音源は使用していません。

### 2. IT Certification Quiz (Included)

**Files:**
- `prompt.md` - Defines IT quiz generation logic
- `public/quiz.html` - Quiz interface

**Usage:** Generate IT certification practice questions

### 3. Translation App (Example)

**prompt.md:**
```markdown
# Translation Service

Translate the following text to ${target_language}:

"${text}"

Return only the translated text.
```

**Request:**
```json
{
  "text": "Hello world",
  "target_language": "Japanese"
}
```

### 4. Code Review App (Example)

**prompt.md:**
```markdown
# Code Review Assistant

Review this ${language} code and provide feedback:

```${language}
${code}
```

Provide:
1. Issues found
2. Suggestions for improvement
3. Best practices
```

**Request:**
```json
{
  "language": "Python",
  "code": "def hello():\n    print('world')"
}
```

## File Structure

```
generic-webapi/
├── server.js          # Generic API server (no changes needed)
├── prompt.md          # Application-specific prompt template
├── package.json       # Dependencies
├── .env.example       # Environment variables template
├── public/            # Static files
│   ├── quiz.html     # IT quiz application
│   ├── style.css     # Styles
│   └── quiz.css      # Quiz-specific styles
└── README.md         # This file
```

## Creating New Applications

1. **Edit `prompt.md`** - Define your application logic and variables
2. **Create client HTML** - Build your user interface in `public/`
3. **Send requests** - Use any variables you defined in `prompt.md`

No server code changes required!

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GEMINI_API_KEY` | Google Gemini API key | Yes (if using Gemini) |
| `OPENAI_API_KEY` | OpenAI API key | Yes (if using OpenAI) |
| `PORT` | Server port | No (default: 8080) |

## LLM Provider Configuration

### Switch to OpenAI (default)

1. Edit `server.js`:
```javascript
const PROVIDER = 'openai';
```

2. Set OpenAI API key in `.env.local`:
```env
OPENAI_API_KEY=your_key_here
```

### Switch to Gemini

1. Edit `server.js`:
```javascript
const PROVIDER = 'gemini';
```

2. Set Gemini API key in `.env.local`:
```env
GEMINI_API_KEY=your_key_here
```

## Development

### Run with auto-restart:
```bash
npm run dev
```

### Supported Models

**OpenAI:**
- `gpt-6-luna` (default)

**Gemini:**
- `gemini-4-hydrogen` (called with `thinkingLevel: "LOW"`; thinking tokens count toward `maxOutputTokens`)

## License

MIT

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request
