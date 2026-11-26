const form = document.getElementById('trip-form');
const emptyState = document.getElementById('empty-state');
const loadingState = document.getElementById('loading-state');
const resultRoot = document.getElementById('trip-result');
const submitButton = form.querySelector('button[type="submit"]');
const toast = document.getElementById('toast');
let toastTimer;

form.addEventListener('submit', async event => {
    event.preventDefault();
    const formData = new FormData(form);
    const requestData = Object.fromEntries(formData.entries());
    requestData.title = 'よりみち日和｜' + requestData.destination;

    showState('loading');
    submitButton.disabled = true;

    try {
        const response = await fetch('/api/itinerary', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });
        const payload = await readApiResponse(response);
        if (!response.ok) throw new Error(payload.error || '旅の提案を作れませんでした。');

        // サーバーがLLMのJSONをJSON.parse()した結果を受け取り、構造を確かめてから画面に反映する。
        const plan = payload.data?.[0];
        if (!plan || typeof plan.name !== 'string' || !Array.isArray(plan.days)) {
            throw new Error('旅程データの形式が正しくありません。もう一度お試しください。');
        }
        renderPlan(plan, requestData.destination, payload.sources);
        showState('result');
    } catch (error) {
        showState(resultRoot.childElementCount ? 'result' : 'empty');
        showToast(error.message || '通信に失敗しました。');
        if (!resultRoot.childElementCount) showInlineError(error.message);
    } finally {
        submitButton.disabled = false;
    }
});

async function readApiResponse(response) {
    const body = await response.text();
    try {
        return JSON.parse(body);
    } catch {
        if (/^\s*</.test(body) || (response.headers.get('content-type') || '').includes('text/html')) {
            const apiUrl = new URL('/api/itinerary', window.location.origin).href;
            throw new Error(`旅程APIがHTMLを返しました (${apiUrl})。Cloud Shellのターミナルでサーバーを再起動し、このページを再読み込みしてください。`);
        }
        throw new Error(`APIの応答を読み取れませんでした (HTTP ${response.status})。`);
    }
}

function showState(state) {
    emptyState.hidden = state !== 'empty';
    loadingState.hidden = state !== 'loading';
    resultRoot.hidden = state !== 'result';
}

function renderPlan(plan, destination, sources = []) {
    resultRoot.replaceChildren();
    const top = make('div', 'result-topline');
    top.append(make('span', '', `${destination} / YOUR WEEKEND PLAN`), make('span', 'spark', '✳'));
    resultRoot.append(top, make('h2', '', plan.name), make('p', 'trip-intro', plan.intro));

    const budgetStrip = make('div', 'budget-strip');
    const budgetText = make('div');
    budgetText.append(make('div', 'budget-label', 'ESTIMATED TOTAL'), make('p', 'budget-note', plan.budgetNote || '交通費・食事代を含む概算です。'));
    const amount = make('div', 'budget-amount');
    amount.append(document.createTextNode(formatYen(plan.totalBudget)), make('small', '', ' 円'));
    budgetStrip.append(budgetText, amount);
    resultRoot.append(budgetStrip);

    for (const [index, day] of plan.days.entries()) {
        const heading = make('div', 'day-heading');
        heading.append(make('strong', '', `DAY ${day.day || index + 1}`), make('span', '', day.theme || '寄り道を楽しむ日'));
        resultRoot.append(heading);
        const timeline = make('div', 'timeline');
        for (const stop of (Array.isArray(day.stops) ? day.stops : [])) {
            const row = make('article', 'stop');
            row.append(make('time', 'stop-time', stop.time || '—'), make('span', 'stop-pin'));
            const copy = make('div', 'stop-copy');
            const titleRow = make('div', 'stop-title-row');
            titleRow.append(make('h4', '', stop.place || '立ち寄りスポット'));
            if (stop.category) titleRow.append(make('span', 'category-tag', stop.category));
            copy.append(titleRow, make('p', '', stop.description || ''));
            if (stop.access) copy.append(make('div', 'stop-meta', `↳ ${stop.access}`));
            if (Number.isFinite(Number(stop.cost))) copy.append(make('div', 'stop-meta', `目安 ${formatYen(Number(stop.cost))}円`));
            row.append(copy);
            timeline.append(row);
        }
        resultRoot.append(timeline);
    }

    const sourceLinks = makeSourceLinks(sources);
    if (sourceLinks) resultRoot.append(sourceLinks);

    const actions = make('div', 'result-actions');
    actions.append(make('p', '', '営業時間・交通情報は出発前にご確認ください'));
    const again = make('button', 'text-button', '条件を変えてつくる');
    again.type = 'button';
    again.addEventListener('click', () => {
        document.getElementById('destination').focus();
        document.getElementById('trip-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    again.append(make('span', '', '↗'));
    actions.append(again);
    resultRoot.append(actions);
}

function makeSourceLinks(sources) {
    if (!Array.isArray(sources)) return null;
    const safeSources = sources.filter(source => {
        if (!source || typeof source.url !== 'string') return false;
        try {
            return new URL(source.url).protocol === 'https:';
        } catch {
            return false;
        }
    });
    if (!safeSources.length) return null;

    const section = make('section', 'research-sources');
    section.append(make('h3', '', '検索して参照した情報'));
    const list = make('ul');
    for (const source of safeSources) {
        const item = make('li');
        const link = make('a', '', source.title || source.url);
        link.href = source.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        item.append(link);
        list.append(item);
    }
    section.append(list);
    return section;
}

function showInlineError(message) {
    const error = make('div', 'error-note', message);
    resultRoot.replaceChildren(error);
    showState('result');
}

function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3400);
}

function make(tag, className = '', text = '') {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = text;
    return element;
}

function formatYen(value) {
    const amount = Number(value);
    return Number.isFinite(amount) ? new Intl.NumberFormat('ja-JP').format(amount) : '—';
}
