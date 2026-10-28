// Page de consultation de toutes les citations (politiques + fiction)

let allQuotes = [];

async function fetchCSV(path) {
    const resp = await fetch(path);
    return parseCSV(await resp.text());
}

function fullName(person) {
    return [person.prenom, person.nom].filter(Boolean).join(' ');
}

// Normalise pour une recherche insensible aux accents et à la casse
function normalize(text) {
    return (text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

async function loadQuotes() {
    const [polPeople, polQuotes, popPeople, popQuotes] = await Promise.all([
        fetchCSV('data/spreadsheet/politiques.csv'),
        fetchCSV('data/spreadsheet/politiques_citations.csv'),
        fetchCSV('data/spreadsheet/personnages.csv'),
        fetchCSV('data/spreadsheet/personnages_citations.csv')
    ]);

    const peopleById = {};
    polPeople.forEach(p => { peopleById[p.id] = { name: fullName(p), sortKey: p.nom || p.prenom, group: 'Politiques' }; });
    popPeople.forEach(p => { peopleById[p.id] = { name: fullName(p), sortKey: p.nom || p.prenom, group: 'Fiction' }; });

    const toEntry = (q, sourceField) => {
        const person = peopleById[q.id] || { name: q.id, sortKey: q.id, group: '' };
        return {
            id: q.id,
            author: person.name,
            sortKey: person.sortKey,
            group: person.group,
            text: q.citation_courte,
            context: q.contexte_complet,
            date: q.date,
            source: q[sourceField] || ''
        };
    };

    allQuotes = [
        ...polQuotes.map(q => toEntry(q, 'source_url')),
        ...popQuotes.map(q => toEntry(q, 'source'))
    ].filter(q => q.text);

    allQuotes.forEach(q => {
        q.searchText = normalize([q.text, q.author, q.context, q.date].join(' '));
    });
    allQuotes.sort((a, b) => a.sortKey.localeCompare(b.sortKey, 'fr'));

    fillPersonSelect(peopleById);
}

function fillPersonSelect(peopleById) {
    const select = document.getElementById('person');
    const counts = {};
    allQuotes.forEach(q => { counts[q.id] = (counts[q.id] || 0) + 1; });

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
        select.appendChild(optgroup);
    });
}

function hasUrl(source) {
    return /^https?:\/\//.test(source);
}

function renderQuote(q) {
    const card = document.createElement('article');
    card.className = 'quote-card';

    const img = document.createElement('img');
    img.src = `data/photos/${q.id}.jpg`;
    img.alt = q.author;
    img.loading = 'lazy';
    img.onerror = () => { img.onerror = null; img.src = 'data/photos/default.jpg'; };
    card.appendChild(img);

    const body = document.createElement('div');

    const meta = document.createElement('div');
    meta.className = 'quote-meta';
    meta.innerHTML = '<span class="quote-author"></span><span class="quote-date"></span><span class="quote-tag"></span>';
    meta.querySelector('.quote-author').textContent = q.author;
    meta.querySelector('.quote-date').textContent = q.date;
    meta.querySelector('.quote-tag').textContent = q.group;
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

    const source = document.createElement('div');
    source.className = 'quote-source';
    if (hasUrl(q.source)) {
        const link = document.createElement('a');
        link.href = q.source;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = new URL(q.source).hostname.replace(/^www\./, '');
        source.append('Source : ', link);
    } else if (q.source) {
        source.textContent = `Source : ${q.source}`;
    } else {
        source.innerHTML = '<span class="missing">Sans source</span>';
    }
    body.appendChild(source);

    card.appendChild(body);
    return card;
}

function applyFilters() {
    const terms = normalize(document.getElementById('search').value).split(/\s+/).filter(Boolean);
    const personId = document.getElementById('person').value;
    const onlyMissing = document.getElementById('no-source').checked;

    const results = allQuotes.filter(q =>
        (!personId || q.id === personId) &&
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

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await loadQuotes();
    } catch (error) {
        console.error('Error loading CSV data:', error);
        document.getElementById('count').textContent = 'Impossible de charger les citations.';
        return;
    }
    ['search', 'person', 'no-source'].forEach(id => {
        document.getElementById(id).addEventListener('input', applyFilters);
    });
    applyFilters();
});
