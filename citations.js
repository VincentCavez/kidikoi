// Page de consultation et de validation de toutes les citations (politiques + fiction)

const QUOTE_FILES = [
    { key: 'politiques', path: 'data/spreadsheet/politiques_citations.csv', sourceField: 'source_url' },
    { key: 'personnages', path: 'data/spreadsheet/personnages_citations.csv', sourceField: 'source' }
];
const STATUS_LABELS = { '': 'À valider', valide: 'Validée', refuse: 'Refusée' };

let allQuotes = [];
let peopleById = {};
let canEdit = false; // vrai seulement avec scripts/serveur_validation.py

async function fetchText(path) {
    // no-store : après une validation, on veut le CSV tel qu'il est sur le disque
    const resp = await fetch(path, { cache: 'no-store' });
    return resp.text();
}

function fullName(person) {
    return [person.prenom, person.nom].filter(Boolean).join(' ');
}

// Normalise pour une recherche insensible aux accents et à la casse
function normalize(text) {
    return (text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Le serveur local de validation répond sur /api/ping ; GitHub Pages non
async function detectEditMode() {
    try {
        const resp = await fetch('api/ping', { cache: 'no-store' });
        return resp.ok && (await resp.json()).ok === true;
    } catch (error) {
        return false;
    }
}

async function loadQuotes() {
    const [polPeopleText, popPeopleText, ...quoteTexts] = await Promise.all([
        fetchText('data/spreadsheet/politiques.csv'),
        fetchText('data/spreadsheet/personnages.csv'),
        ...QUOTE_FILES.map(f => fetchText(f.path))
    ]);

    peopleById = {};
    parseCSV(polPeopleText).forEach(p => {
        peopleById[p.id] = {
            name: fullName(p),
            sortKey: p.nom || p.prenom,
            group: 'Politiques',
            candidat2027: (p.presidentielle_2027 || '').trim().toLowerCase() === 'oui'
        };
    });
    parseCSV(popPeopleText).forEach(p => { peopleById[p.id] = { name: fullName(p), sortKey: p.nom || p.prenom, group: 'Fiction' }; });

    allQuotes = [];
    QUOTE_FILES.forEach((file, fileIndex) => {
        const [header, ...rawLines] = quoteTexts[fileIndex].trim().split('\n');
        // Chaque ligne est parsée seule pour connaître son numéro de ligne dans le fichier
        rawLines.forEach((line, index) => {
            const q = parseCSV(`${header}\n${line}`)[0];
            if (!q || !q.citation_courte) return;
            const person = peopleById[q.id] || { name: q.id, sortKey: q.id, group: '' };
            allQuotes.push({
                file: file.key,
                line: index + 1,
                id: q.id,
                author: person.name,
                sortKey: person.sortKey,
                group: person.group,
                candidat2027: !!person.candidat2027,
                text: q.citation_courte,
                context: q.contexte_complet,
                date: q.date,
                source: q[file.sourceField] || '',
                sourceText: (q.source_texte || '').trim(),
                status: (q.statut || '').trim()
            });
        });
    });

    allQuotes.forEach(q => {
        q.searchText = normalize([q.text, q.author, q.context, q.date].join(' '));
    });
    allQuotes.sort((a, b) => a.sortKey.localeCompare(b.sortKey, 'fr'));

    fillPersonSelect();
}

function matchesCorpus(q, corpus) {
    if (corpus === '2027') return q.candidat2027;
    if (corpus === 'politiques') return q.group === 'Politiques';
    if (corpus === 'fiction') return q.group === 'Fiction';
    return true;
}

// Liste des personnes limitée au corpus choisi
function fillPersonSelect() {
    const select = document.getElementById('person');
    const corpus = document.getElementById('corpus').value;
    const previous = select.value;
    const counts = {};
    allQuotes.filter(q => matchesCorpus(q, corpus)).forEach(q => { counts[q.id] = (counts[q.id] || 0) + 1; });

    select.querySelectorAll('optgroup').forEach(g => g.remove());
    ['Politiques', 'Fiction'].forEach(group => {
        const optgroup = document.createElement('optgroup');
        optgroup.label = group;
        Object.keys(counts)
            .filter(id => peopleById[id] && peopleById[id].group === group)
            .sort((a, b) => peopleById[a].sortKey.localeCompare(peopleById[b].sortKey, 'fr'))
            .forEach(id => {
                const option = document.createElement('option');
                option.value = id;
                option.textContent = `${peopleById[id].name} (${counts[id]})`;
                optgroup.appendChild(option);
            });
        if (optgroup.children.length > 0) select.appendChild(optgroup);
    });
    select.value = counts[previous] ? previous : '';
}

function hasUrl(source) {
    return /^https?:\/\//.test(source);
}

// Enregistre le statut dans le CSV via le serveur local
async function saveStatus(q, status, card) {
    const resp = await fetch('api/statut', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fichier: q.file, ligne: q.line, citation: q.text, statut: status })
    });
    const result = await resp.json().catch(() => ({}));
    if (!resp.ok) {
        alert(`Statut non enregistré : ${result.erreur || resp.status}`);
        return;
    }
    q.status = status;
    card.replaceWith(renderQuote(q));
    updateProgress();
}

function renderQuote(q) {
    const card = document.createElement('article');
    card.className = 'quote-card';
    if (q.status) card.classList.add(`status-${q.status}`);

    // Avatar illustré en priorité, puis la photo, puis l'image par défaut
    const imagePaths = [`data/avatars/${q.id}.jpg`, `data/photos/${q.id}.jpg`, `data/photos/${q.id}.png`, 'data/photos/default.jpg'];
    let pathIndex = 0;
    const img = document.createElement('img');
    img.src = imagePaths[pathIndex];
    img.alt = q.author;
    img.loading = 'lazy';
    img.onerror = () => {
        pathIndex += 1;
        if (pathIndex < imagePaths.length) img.src = imagePaths[pathIndex];
        else img.onerror = null;
    };
    card.appendChild(img);

    const body = document.createElement('div');

    const meta = document.createElement('div');
    meta.className = 'quote-meta';
    meta.innerHTML = '<span class="quote-author"></span><span class="quote-date"></span><span class="quote-tag"></span><span class="status-badge"></span>';
    meta.querySelector('.quote-author').textContent = q.author;
    meta.querySelector('.quote-date').textContent = q.date;
    meta.querySelector('.quote-tag').textContent = q.candidat2027 ? 'Présidentielle 2027' : q.group;
    meta.querySelector('.status-badge').textContent = STATUS_LABELS[q.status] || q.status;
    body.appendChild(meta);

    const text = document.createElement('p');
    text.className = 'quote-text';
    text.textContent = `« ${q.text} »`;
    body.appendChild(text);

    if (q.context) {
        const details = document.createElement('details');
        details.innerHTML = '<summary>Contexte</summary><p></p>';
        details.querySelector('p').textContent = q.context;
        body.appendChild(details);
    }

    const footer = document.createElement('div');
    footer.className = 'quote-footer';

    const source = document.createElement('div');
    source.className = 'quote-source';
    if (hasUrl(q.source)) {
        const link = document.createElement('a');
        link.href = q.source;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        const site = new URL(q.source).hostname.replace(/^www\./, '');
        // Référence d'origine (émission, média, date) quand on la connaît, sinon le nom du site
        link.textContent = q.sourceText ? `${q.sourceText} (${site})` : site;
        source.append('Source : ', link);
    } else if (q.source) {
        source.textContent = `Source : ${q.source}`;
    } else {
        source.innerHTML = '<span class="missing">Sans source</span>';
    }
    footer.appendChild(source);

    if (canEdit) {
        const actions = document.createElement('div');
        actions.className = 'review-actions';
        [['valide', '✓ Valider'], ['refuse', '✕ Refuser']].forEach(([status, label]) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `review-button ${status}`;
            button.textContent = label;
            button.setAttribute('aria-pressed', String(q.status === status));
            // Recliquer sur le statut actif remet la citation « à valider »
            button.addEventListener('click', () => saveStatus(q, q.status === status ? '' : status, card));
            actions.appendChild(button);
        });
        footer.appendChild(actions);
    }

    body.appendChild(footer);
    card.appendChild(body);
    return card;
}

function applyFilters() {
    const terms = normalize(document.getElementById('search').value).split(/\s+/).filter(Boolean);
    const corpus = document.getElementById('corpus').value;
    const personId = document.getElementById('person').value;
    const status = document.getElementById('status').value;
    const onlyMissing = document.getElementById('no-source').checked;

    const results = allQuotes.filter(q =>
        matchesCorpus(q, corpus) &&
        (!personId || q.id === personId) &&
        (status === 'tous' || q.status === status) &&
        (!onlyMissing || !q.source) &&
        terms.every(t => q.searchText.includes(t))
    );

    const list = document.getElementById('quote-list');
    list.replaceChildren(...results.map(renderQuote));
    if (results.length === 0) {
        list.innerHTML = '<p class="empty">Aucune citation ne correspond.</p>';
    }
    document.getElementById('count').textContent =
        `${results.length} citation${results.length > 1 ? 's' : ''} sur ${allQuotes.length}`;
}

function updateProgress() {
    const count = status => allQuotes.filter(q => q.status === status).length;
    document.getElementById('progress').textContent =
        `${count('valide')} validées · ${count('refuse')} refusées · ${count('')} à valider`;
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        [canEdit] = await Promise.all([detectEditMode(), loadQuotes()]);
    } catch (error) {
        console.error('Error loading CSV data:', error);
        document.getElementById('count').textContent = 'Impossible de charger les citations.';
        return;
    }
    document.getElementById('read-only-help').hidden = canEdit;
    if (!canEdit) document.getElementById('status').value = 'tous';
    ['search', 'person', 'status', 'no-source'].forEach(id => {
        document.getElementById(id).addEventListener('input', applyFilters);
    });
    document.getElementById('corpus').addEventListener('input', () => {
        fillPersonSelect();
        applyFilters();
    });
    updateProgress();
    applyFilters();
});
