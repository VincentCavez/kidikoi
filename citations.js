// Page de consultation de toutes les citations (politiques + fiction)

const QUOTE_FILES = [
    { path: 'data/spreadsheet/politiques_citations.csv', sourceField: 'source_url' },
    { path: 'data/spreadsheet/personnages_citations.csv', sourceField: 'source' }
];
const REMOVED_STORAGE_KEY = 'kidikoi-citations-a-retirer';

let allQuotes = [];
let quoteFiles = []; // { path, header, rawLines } pour régénérer les CSV
let removedKeys = new Set(); // citations cochées « Retirer de la base de données »
let peopleById = {};

async function fetchText(path) {
    const resp = await fetch(path);
    return resp.text();
}

function fullName(person) {
    return [person.prenom, person.nom].filter(Boolean).join(' ');
}

// Normalise pour une recherche insensible aux accents et à la casse
function normalize(text) {
    return (text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Le stockage local peut être indisponible (navigation privée, etc.)
function loadRemovedKeys() {
    try {
        return new Set(JSON.parse(localStorage.getItem(REMOVED_STORAGE_KEY) || '[]'));
    } catch (error) {
        return new Set();
    }
}

function saveRemovedKeys() {
    try {
        localStorage.setItem(REMOVED_STORAGE_KEY, JSON.stringify([...removedKeys]));
    } catch (error) {
        console.warn('Impossible de mémoriser les citations à retirer :', error);
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
    quoteFiles = QUOTE_FILES.map((file, fileIndex) => {
        const [header, ...rawLines] = quoteTexts[fileIndex].trim().split('\n');
        // Chaque ligne est parsée seule pour garder le lien avec sa ligne brute
        rawLines.forEach(line => {
            const q = parseCSV(`${header}\n${line}`)[0];
            if (!q || !q.citation_courte) return;
            const person = peopleById[q.id] || { name: q.id, sortKey: q.id, group: '' };
            allQuotes.push({
                key: `${file.path}|${q.id}|${q.citation_courte}`,
                file: file.path,
                rawLine: line,
                id: q.id,
                author: person.name,
                sortKey: person.sortKey,
                group: person.group,
                candidat2027: !!person.candidat2027,
                text: q.citation_courte,
                context: q.contexte_complet,
                date: q.date,
                source: q[file.sourceField] || ''
            });
        });
        return { path: file.path, header, rawLines };
    });

    allQuotes.forEach(q => {
        q.searchText = normalize([q.text, q.author, q.context, q.date].join(' '));
    });
    allQuotes.sort((a, b) => a.sortKey.localeCompare(b.sortKey, 'fr'));

    // Oublie les clés de citations qui n'existent plus dans les CSV
    const existingKeys = new Set(allQuotes.map(q => q.key));
    removedKeys = new Set([...loadRemovedKeys()].filter(k => existingKeys.has(k)));

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

function renderQuote(q) {
    const card = document.createElement('article');
    card.className = 'quote-card';
    card.classList.toggle('to-remove', removedKeys.has(q.key));

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
    meta.querySelector('.quote-tag').textContent = q.candidat2027 ? 'Présidentielle 2027' : q.group;
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
        link.textContent = new URL(q.source).hostname.replace(/^www\./, '');
        source.append('Source : ', link);
    } else if (q.source) {
        source.textContent = `Source : ${q.source}`;
    } else {
        source.innerHTML = '<span class="missing">Sans source</span>';
    }
    footer.appendChild(source);

    const removeLabel = document.createElement('label');
    removeLabel.className = 'remove-toggle';
    const removeBox = document.createElement('input');
    removeBox.type = 'checkbox';
    removeBox.checked = removedKeys.has(q.key);
    removeBox.addEventListener('change', () => {
        if (removeBox.checked) removedKeys.add(q.key);
        else removedKeys.delete(q.key);
        saveRemovedKeys();
        card.classList.toggle('to-remove', removeBox.checked);
        updateRemovalBar();
    });
    removeLabel.append(removeBox, ' Retirer de la base de données');
    footer.appendChild(removeLabel);

    body.appendChild(footer);
    card.appendChild(body);
    return card;
}

function applyFilters() {
    const terms = normalize(document.getElementById('search').value).split(/\s+/).filter(Boolean);
    const corpus = document.getElementById('corpus').value;
    const personId = document.getElementById('person').value;
    const onlyMissing = document.getElementById('no-source').checked;
    const onlyRemoved = document.getElementById('only-removed').checked;

    const results = allQuotes.filter(q =>
        matchesCorpus(q, corpus) &&
        (!personId || q.id === personId) &&
        (!onlyMissing || !q.source) &&
        (!onlyRemoved || removedKeys.has(q.key)) &&
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

function updateRemovalBar() {
    const n = removedKeys.size;
    document.getElementById('removal-bar').hidden = n === 0;
    document.getElementById('removal-count').textContent =
        `${n} citation${n > 1 ? 's' : ''} à retirer`;
}

// Télécharge chaque CSV concerné, sans les lignes cochées
function downloadCleanedCSVs() {
    const removedLines = new Set(allQuotes.filter(q => removedKeys.has(q.key)).map(q => `${q.file}\n${q.rawLine}`));
    quoteFiles.forEach(file => {
        const kept = file.rawLines.filter(line => !removedLines.has(`${file.path}\n${line}`));
        if (kept.length === file.rawLines.length) return;
        const blob = new Blob([[file.header, ...kept].join('\n') + '\n'], { type: 'text/csv;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = file.path.split('/').pop();
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    });
}

function clearRemovals() {
    removedKeys.clear();
    saveRemovedKeys();
    updateRemovalBar();
    applyFilters();
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await loadQuotes();
    } catch (error) {
        console.error('Error loading CSV data:', error);
        document.getElementById('count').textContent = 'Impossible de charger les citations.';
        return;
    }
    ['search', 'person', 'no-source', 'only-removed'].forEach(id => {
        document.getElementById(id).addEventListener('input', applyFilters);
    });
    document.getElementById('corpus').addEventListener('input', () => {
        fillPersonSelect();
        applyFilters();
    });
    document.getElementById('download-cleaned').addEventListener('click', downloadCleanedCSVs);
    document.getElementById('clear-removals').addEventListener('click', clearRemovals);
    updateRemovalBar();
    applyFilters();
});
