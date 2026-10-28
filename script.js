// Global variables for quotes
let politicsQuotes = [];
let popCultureQuotes = [];

// Global maps for people (id -> person info)
let politicsPeopleById = {};
let popCulturePeopleById = {};

// Global object for current question
let currentQuestion = {
    quote: '',
    quoteData: null, // Full CSV row of the current quote
    correctId: '',
    allIds: [] // Array of 4 ids including the correct one
};

// Game mode: 'all' (tous les politiques) or '2027' (candidats à la présidentielle 2027)
let gameMode = 'all';
let pendingGamePage = null; // Game page to open once the mode is chosen

// Timer & game variables
let timerInterval = null;
let timerStartTime = null;
const TIMER_DURATION = 20000; // 20 seconds in milliseconds
let currentRound = 0; // 1..10
let score = 0; // number of correct answers

// Navigation between pages
document.addEventListener('DOMContentLoaded', function() {
    const backButtons = document.querySelectorAll('.back-button');
    const pages = document.querySelectorAll('.page');

    // Function to show a specific page
    function showPage(pageId) {
        // Hide all pages
        pages.forEach(page => {
            page.classList.remove('active');
        });

        // Show the selected page
        const targetPage = document.getElementById(pageId);
        if (targetPage) {
            targetPage.classList.add('active');
        }

        // Scroll to top
        window.scrollTo(0, 0);
        
        // If going to game 1, (re)start game if needed and load a quote
        if (pageId === 'game1-page') {
            startNewGameIfNeeded();
            loadRandomQuote();
        } else {
            // Stop timer if leaving game 1
            stopTimer();
        }
    }

    // Game buttons open the mode choice first
    document.querySelectorAll('.main-button[data-page]').forEach(button => {
        button.addEventListener('click', function() {
            pendingGamePage = this.getAttribute('data-page') + '-page';
            showPage('mode-page');
        });
    });

    // Mode buttons start a fresh game in the chosen mode
    document.querySelectorAll('.main-button[data-mode]').forEach(button => {
        button.addEventListener('click', function() {
            gameMode = this.getAttribute('data-mode');
            score = 0;
            currentRound = 0;
            showPage(pendingGamePage || 'game1-page');
        });
    });

    // Add click event to back buttons
    backButtons.forEach(button => {
        button.addEventListener('click', function() {
            showPage('main-page');
        });
    });
    
    // Load CSV data
    loadCSVData();
    
    // Next quote button
    const nextQuoteBtn = document.getElementById('next-quote-btn');
    if (nextQuoteBtn) {
        nextQuoteBtn.addEventListener('click', loadRandomQuote);
    }

    // End page buttons
    const restartButton = document.getElementById('restart-button');
    if (restartButton) {
        restartButton.addEventListener('click', function() {
            restartGame();
        });
    }
    const menuButton = document.getElementById('menu-button');
    if (menuButton) {
        menuButton.addEventListener('click', function() {
            // reset state when returning to menu
            score = 0;
            currentRound = 0;
            showPage('main-page');
        });
    }
    
    // Event listener for click blocker - to continue to next question
    const clickBlocker = document.getElementById('click-blocker');
    if (clickBlocker) {
        clickBlocker.addEventListener('click', function(event) {
            // Check if click is on info button or inside it
            const infoButton = document.getElementById('info-button');
            if (infoButton && (event.target === infoButton || infoButton.contains(event.target))) {
                return; // Don't continue to next question, let the button handle the click
            }
            
            if (this.classList.contains('clickable')) {
                if (currentRound >= 10) {
                    endGame();
                } else {
                    loadRandomQuote();
                }
            }
        });
    }
    
    // Add click handlers to image options
    setupImageClickHandlers();
    
    // Setup info button click handler
    const infoButton = document.getElementById('info-button');
    if (infoButton) {
        infoButton.addEventListener('click', function(event) {
            event.stopPropagation(); // Prevent click from reaching click-blocker
            showInfoPopup();
        });
    }
    
    // Setup popup overlay click handler (close on click outside)
    const popupOverlay = document.getElementById('popup-overlay');
    if (popupOverlay) {
        popupOverlay.addEventListener('click', function(event) {
            if (event.target === popupOverlay) {
                closeInfoPopup();
            }
        });
    }
});

// Function to setup click handlers on images
function setupImageClickHandlers() {
    const imageOptions = document.querySelectorAll('.image-option');
    imageOptions.forEach(option => {
        option.addEventListener('click', handleImageClick);
    });
}

// Function to handle image click
function handleImageClick(event) {
    const clickedOption = event.currentTarget;
    const clickedIndex = parseInt(clickedOption.getAttribute('data-index'));
    const clickedId = currentQuestion.allIds[clickedIndex];
    
    // Check if already answered (timer text is visible or click blocker is active)
    const timerText = document.getElementById('timer-text');
    const clickBlocker = document.getElementById('click-blocker');
    if (clickedOption.classList.contains('disabled') || 
        (timerText && timerText.style.display === 'block') ||
        (clickBlocker && clickBlocker.style.display === 'block')) {
        return;
    }
    
    // Stop timer
    stopTimer();
    
    // Show click blocker to disable all clicks
    showClickBlocker(false);
    
    // Disable all options except the correct one
    const allOptions = document.querySelectorAll('.image-option');
    let correctIndex = -1;
    
    // Find the correct index
    allOptions.forEach((opt, index) => {
        const optId = currentQuestion.allIds[index];
        if (optId === currentQuestion.correctId) {
            correctIndex = index;
        }
    });
    
    // Disable all options except the correct one
    allOptions.forEach((opt, index) => {
        if (index !== correctIndex) {
            opt.classList.add('disabled');
        }
    });
    
    let resultMessage = '';
    
    if (clickedId === currentQuestion.correctId) {
        // Correct answer
        clickedOption.classList.add('correct');
        resultMessage = 'Bonne réponse !';
        
        // Fade other options
        allOptions.forEach((opt, index) => {
            if (index !== clickedIndex) {
                opt.classList.add('faded');
            }
        });
    } else {
        // Incorrect answer
        clickedOption.classList.add('incorrect');
        resultMessage = 'Mauvaise réponse !';
        
        // Find and highlight the correct answer (only border, no background change on name-label)
        allOptions.forEach((opt, index) => {
            const optId = currentQuestion.allIds[index];
            if (optId === currentQuestion.correctId) {
                // Add only the border styling, not the full "correct" class
                opt.style.borderColor = '#1E8E3E';
                opt.style.borderWidth = '5px';
            } else if (index !== clickedIndex) {
                opt.classList.add('faded');
            }
        });
    }
    
    // Show result message in timer area
    const isCorrect = clickedId === currentQuestion.correctId;
    if (isCorrect) {
        score += 1;
    }
    showResultInTimer(resultMessage, isCorrect);
    
    // Show info button and continue text after 1.5 seconds
    setTimeout(() => {
        // Find the correct option and add the info button to it
        const correctOption = Array.from(allOptions).find((opt, idx) => {
            return currentQuestion.allIds[idx] === currentQuestion.correctId;
        });
        
        const infoButton = document.getElementById('info-button');
        if (infoButton && correctOption) {
            // Move the button to the correct option
            correctOption.appendChild(infoButton);
            correctOption.style.zIndex = '600'; // Ensure it's above the click-blocker
            infoButton.style.display = 'block';
        }
        
        // Show "Appuyez pour continuer" text
        showContinueText();
        
        // Make click blocker clickable to continue
        showClickBlocker(true);
    }, 1500);
}

function isPlayable(quote) {
    return (quote.statut || '').trim() !== 'refuse';
}

// Function to load CSV data
async function loadCSVData() {
    try {
        // Load people and quotes for politics
        const [polPeopleResp, polQuotesResp] = await Promise.all([
            fetch('data/spreadsheet/politiques.csv'),
            fetch('data/spreadsheet/politiques_citations.csv')
        ]);
        const [polPeopleText, polQuotesText] = await Promise.all([
            polPeopleResp.text(),
            polQuotesResp.text()
        ]);
        const politicsPeople = parseCSV(polPeopleText);
        // Les citations refusées restent dans le CSV (pour ne pas être reproposées) mais pas dans le jeu
        politicsQuotes = parseCSV(polQuotesText).filter(isPlayable);
        politicsPeopleById = {};
        politicsPeople.forEach(p => {
            const pid = (p.id || '').trim();
            if (!pid) return;
            politicsPeopleById[pid] = {
                prenom: p.prenom || '',
                nom: p.nom || '',
                genre: p.genre || '',
                parti: p.parti || '',
                candidat2027: (p.presidentielle_2027 || '').trim().toLowerCase() === 'oui'
            };
        });

        // Load people and quotes for pop culture
        const [popPeopleResp, popQuotesResp] = await Promise.all([
            fetch('data/spreadsheet/personnages.csv'),
            fetch('data/spreadsheet/personnages_citations.csv')
        ]);
        const [popPeopleText, popQuotesText] = await Promise.all([
            popPeopleResp.text(),
            popQuotesResp.text()
        ]);
        const popPeople = parseCSV(popPeopleText);
        popCultureQuotes = parseCSV(popQuotesText).filter(isPlayable);
        popCulturePeopleById = {};
        popPeople.forEach(p => {
            const pid = (p.id || '').trim();
            if (!pid) return;
            popCulturePeopleById[pid] = {
                prenom: p.prenom || '',
                nom: p.nom || '',
                genre: p.genre || ''
            };
        });

        console.log(`Loaded ${politicsQuotes.length} political quotes, ${Object.keys(politicsPeopleById).length} politicians`);
        console.log(`Loaded ${popCultureQuotes.length} pop-culture quotes, ${Object.keys(popCulturePeopleById).length} characters`);
    } catch (error) {
        console.error('Error loading CSV data:', error);
    }
}

function isCandidate2027(id) {
    return !!(politicsPeopleById[id] && politicsPeopleById[id].candidat2027);
}

// Political quotes of the current game mode
function getActivePoliticsQuotes() {
    if (gameMode === '2027') {
        return politicsQuotes.filter(q => isCandidate2027(q.id));
    }
    return politicsQuotes;
}

// A politician can only appear as an option if they belong to the current game mode
function isAllowedInMode(id) {
    return gameMode !== '2027' || !isPoliticsId(id) || isCandidate2027(id);
}

// Function to choose dataset with Bernoulli distribution (75% politics, 25% pop culture)
function chooseDataset() {
    const random = Math.random();
    return random < 0.75 ? getActivePoliticsQuotes() : popCultureQuotes;
}

// Function to get random quote from array
function getRandomQuote(quotesArray) {
    if (quotesArray.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * quotesArray.length);
    return quotesArray[randomIndex];
}

// Function to get all unique ids from both datasets
function getAllIds() {
    const politicsIds = getActivePoliticsQuotes().map(q => q.id).filter(id => id && id.trim() !== '');
    const popCultureIds = popCultureQuotes.map(q => q.id).filter(id => id && id.trim() !== '');
    
    return {
        politics: [...new Set(politicsIds)],
        popCulture: [...new Set(popCultureIds)]
    };
}

// Helpers utilitaires
function parseIdList(value) {
    if (!value) return [];
    // Supporte séparateurs virgule/point-virgule et espaces
    return value
        .split(/[;,]/)
        .map(s => s.trim())
        .filter(s => s.length > 0);
}

function isPoliticsId(id) {
    return !!politicsPeopleById[id];
}

// Helpers: genre/parti par id
function getGenderForId(id) {
    if (politicsPeopleById[id]) return (politicsPeopleById[id].genre || '').toLowerCase();
    if (popCulturePeopleById[id]) return (popCulturePeopleById[id].genre || '').toLowerCase();
    return '';
}

function getPartyForId(id) {
    if (politicsPeopleById[id]) return (politicsPeopleById[id].parti || '').toLowerCase();
    return '';
}

// Pool de candidats configurables
function getCandidatePool({ includePolitics, includePop, excludeIds, genre, party }) {
    const allIds = getAllIds();
    let pool = [];

    if (includePolitics) {
        let ids = allIds.politics.slice();
        if (party) {
            const p = party.toLowerCase();
            ids = ids.filter(id => getPartyForId(id) === p);
        }
        pool = pool.concat(ids);
    }
    if (includePop) {
        pool = pool.concat(allIds.popCulture);
    }

    // Filtre genre si précisé
    if (genre) {
        const g = genre.toLowerCase();
        pool = pool.filter(id => getGenderForId(id) === g);
    }

    // Exclusions et déduplication
    const excludeSet = new Set(excludeIds || []);
    const seen = new Set();
    const filtered = [];
    for (const id of pool) {
        if (excludeSet.has(id)) continue;
        if (seen.has(id)) continue;
        seen.add(id);
        filtered.push(id);
    }
    return filtered;
}

function pickNRandom(arr, n) {
    const copy = arr.slice();
    const out = [];
    while (out.length < n && copy.length > 0) {
        const idx = Math.floor(Math.random() * copy.length);
        out.push(copy[idx]);
        copy.splice(idx, 1);
    }
    return out;
}

// Nouvelle sélection des 3 autres ids selon les règles
function selectIdsForQuote(quote, isPolitics) {
    const correctId = quote.id;
    const genreConstraint = (quote.genre_citation || '').trim().toLowerCase();
    const partyConstraint = isPolitics ? (quote.parti_citation || '').trim().toLowerCase() : '';
    const forbidFictif = isPolitics && ((quote.autorisation_fictif || '').trim().toLowerCase() === 'non');
    const obligationRaw = (quote.obligation || '').trim();
    const interdictionRaw = (quote.interdiction || '').trim();
    const interdictionIdsSet = new Set(parseIdList(interdictionRaw));
    let obligationIds = parseIdList(obligationRaw);

    let otherIds = [];

    // Retire de l'obligation l'id correct et toute interdiction
    obligationIds = obligationIds.filter(id => id && id !== correctId && !interdictionIdsSet.has(id) && isAllowedInMode(id));

    if (isPolitics) {
        if (partyConstraint) {
            // 4 options = politiciens du même parti
            // Pré-sélection des obligations compatibles (même parti et genre si défini)
            const preOblig = [];
            obligationIds.forEach(id => {
                if (!isPoliticsId(id)) return;
                if (genreConstraint && getGenderForId(id) !== genreConstraint) return;
                if (getPartyForId(id) !== partyConstraint) return;
                if (preOblig.length < 3) preOblig.push(id);
            });
            otherIds = otherIds.concat(preOblig);

            const excludeBase = [correctId, ...otherIds, ...Array.from(interdictionIdsSet)];
            let pool = getCandidatePool({
                includePolitics: true,
                includePop: false,
                excludeIds: excludeBase,
                genre: genreConstraint,
                party: partyConstraint
            });
            otherIds = otherIds.concat(pickNRandom(pool, 3 - otherIds.length));

            // Fallback: si pas assez, on relâche le parti mais on garde le dataset politique
            if (otherIds.length < 3) {
                pool = getCandidatePool({
                    includePolitics: true,
                    includePop: false,
                    excludeIds: [correctId, ...otherIds, ...Array.from(interdictionIdsSet)],
                    genre: genreConstraint
                });
                otherIds = otherIds.concat(pickNRandom(pool, 3 - otherIds.length));
            }
        } else if (forbidFictif) {
            // 4 options = politiciens uniquement
            // Pré-sélection des obligations compatibles (politiciens et genre si défini)
            const preOblig = [];
            obligationIds.forEach(id => {
                if (!isPoliticsId(id)) return;
                if (genreConstraint && getGenderForId(id) !== genreConstraint) return;
                if (preOblig.length < 3) preOblig.push(id);
            });
            otherIds = otherIds.concat(preOblig);

            let pool = getCandidatePool({
                includePolitics: true,
                includePop: false,
                excludeIds: [correctId, ...otherIds, ...Array.from(interdictionIdsSet)],
                genre: genreConstraint
            });
            otherIds = otherIds.concat(pickNRandom(pool, 3 - otherIds.length));

            // Fallback: si pas assez, on relâche le genre mais on garde le dataset politique
            if (otherIds.length < 3) {
                pool = getCandidatePool({
                    includePolitics: true,
                    includePop: false,
                    excludeIds: [correctId, ...otherIds, ...Array.from(interdictionIdsSet)]
                });
                otherIds = otherIds.concat(pickNRandom(pool, 3 - otherIds.length));
            }
        } else {
            // Ni parti, ni interdiction de fictif:
            // exactement 1 ou 2 personnages pop-culture (au hasard), le reste en politiciens
            // Pré-sélection obligations compatibles avec genre
            const preOblig = [];
            obligationIds.forEach(id => {
                if (genreConstraint && getGenderForId(id) !== genreConstraint) return;
                if (preOblig.length < 3) preOblig.push(id);
            });
            otherIds = otherIds.concat(preOblig);

            let nbPop = 1 + Math.floor(Math.random() * 2); // 1 ou 2
            const numObligPop = preOblig.filter(id => !isPoliticsId(id)).length;
            const numObligPol = preOblig.filter(id => isPoliticsId(id)).length;
            // Ajuste pour respecter les obligations déjà posées
            nbPop = Math.max(nbPop, numObligPop);
            nbPop = Math.min(nbPop, 3 - numObligPol);

            const baseExclude = [correctId, ...otherIds, ...Array.from(interdictionIdsSet)];

            const popPool = getCandidatePool({
                includePolitics: false,
                includePop: true,
                excludeIds: baseExclude,
                genre: genreConstraint
            });
            const polPool = getCandidatePool({
                includePolitics: true,
                includePop: false,
                excludeIds: baseExclude,
                genre: genreConstraint
            });

            const neededPop = Math.max(0, nbPop - preOblig.filter(id => !isPoliticsId(id)).length);
            const neededPol = Math.max(0, 3 - otherIds.length - neededPop);
            const chosenPop = pickNRandom(popPool, neededPop);
            const chosenPol = pickNRandom(polPool, neededPol);
            otherIds = otherIds.concat(chosenPop).concat(chosenPol);

            // Fallback: compléter si nécessaire (on respecte le genre si possible)
            if (otherIds.length < 3) {
                const fillPool = getCandidatePool({
                    includePolitics: true,
                    includePop: true,
                    excludeIds: [correctId, ...otherIds, ...Array.from(interdictionIdsSet)],
                    genre: genreConstraint
                });
                otherIds = otherIds.concat(pickNRandom(fillPool, 3 - otherIds.length));
            }
        }
    } else {
        // Citation pop-culture: ignorer parti et autorisation_fictif
        // Respecter le genre si précisé et imposer exactement 1 ou 2 personnages au total
        // (donc parmi les 3 autres: 0 ou 1 personnages)

        // Pré-sélection obligations compatibles (respecte genre si défini)
        const preOblig = [];
        obligationIds.forEach(id => {
            if (genreConstraint && getGenderForId(id) !== genreConstraint) return;
            if (preOblig.length < 3) preOblig.push(id);
        });
        otherIds = otherIds.concat(preOblig);

        const popPool = getCandidatePool({
            includePolitics: false,
            includePop: true,
            excludeIds: [correctId, ...otherIds, ...Array.from(interdictionIdsSet)],
            genre: genreConstraint
        });
        const polPool = getCandidatePool({
            includePolitics: true,
            includePop: false,
            excludeIds: [correctId, ...otherIds, ...Array.from(interdictionIdsSet)],
            genre: genreConstraint
        });

        // 0 ou 1 personnage en plus (au hasard), ajusté par obligations pop déjà incluses
        const numObligPop = preOblig.filter(id => !isPoliticsId(id)).length;
        const numObligPol = preOblig.filter(id => isPoliticsId(id)).length;
        let desiredNbPopOther = Math.floor(Math.random() * 2); // 0 ou 1
        desiredNbPopOther = Math.max(desiredNbPopOther, numObligPop);
        desiredNbPopOther = Math.min(desiredNbPopOther, 3 - numObligPol);

        // Adapter aux disponibilités des pools
        if (popPool.length < desiredNbPopOther) {
            desiredNbPopOther = popPool.length;
        }
        if (polPool.length < (3 - otherIds.length - desiredNbPopOther)) {
            // Ajuste pour pouvoir compléter avec des politiciens
            const maxPopGivenPol = 3 - otherIds.length - polPool.length;
            desiredNbPopOther = Math.min(desiredNbPopOther, Math.max(0, maxPopGivenPol));
            desiredNbPopOther = Math.max(desiredNbPopOther, numObligPop);
        }

        const neededPop = Math.max(0, desiredNbPopOther);
        const neededPol = Math.max(0, 3 - otherIds.length - neededPop);
        const chosenPop = pickNRandom(popPool, neededPop);
        const chosenPol = pickNRandom(polPool, neededPol);
        otherIds = otherIds.concat(chosenPol).concat(chosenPop);

        // Fallback final si le total n'atteint pas 3 (toujours respecter le genre si présent)
        if (otherIds.length < 3) {
            const fillPool = getCandidatePool({
                includePolitics: true,
                includePop: true,
                excludeIds: [correctId, ...otherIds, ...Array.from(interdictionIdsSet)],
                genre: genreConstraint
            });
            otherIds = otherIds.concat(pickNRandom(fillPool, 3 - otherIds.length));
        }
    }

    return otherIds;
}

// Function to load and display a random quote
function loadRandomQuote() {
    if (politicsQuotes.length === 0 && popCultureQuotes.length === 0) {
        document.getElementById('quote-text').textContent = 'Chargement des citations...';
        return;
    }
    
    const dataset = chooseDataset();
    const quote = getRandomQuote(dataset);
    
    if (quote) {
        const quoteText = quote.citation_courte || quote.contexte_complet || 'Citation non disponible';
        document.getElementById('quote-text').textContent = quoteText;
        
        // Determine if quote is from politics dataset
        const isPolitics = politicsQuotes.includes(quote);
        
        // Get the correct id (now both datasets use an explicit id)
        let correctId = quote.id;
        
        // Sélectionne 3 autres ids selon les règles
        const otherIds = selectIdsForQuote(quote, isPolitics);
        
        // Create the global question object
        currentQuestion = {
            quote: quoteText,
            quoteData: quote,
            correctId: correctId,
            allIds: [correctId, ...otherIds]
        };
        
        // Shuffle the ids so the correct answer isn't always first
        currentQuestion.allIds.sort(() => Math.random() - 0.5);
        
        console.log('Current question:', currentQuestion);
        
        // Load images for the 4 ids
        loadImages();
        
        // Reset image options states
        resetImageOptions();
    } else {
        document.getElementById('quote-text').textContent = 'Aucune citation disponible';
    }
}

// Function to reset image options to initial state
function resetImageOptions() {
    const allOptions = document.querySelectorAll('.image-option');
    allOptions.forEach(opt => {
        opt.classList.remove('correct', 'incorrect', 'faded', 'disabled');
        // Reset inline styles
        opt.style.borderColor = '';
        opt.style.borderWidth = '';
        opt.style.zIndex = '';
    });
    
    // Hide and remove info button from image option
    const infoButton = document.getElementById('info-button');
    if (infoButton) {
        infoButton.style.display = 'none';
        // Move it back to container
        const container = document.querySelector('.container');
        if (container && infoButton.parentElement) {
            container.appendChild(infoButton);
        }
    }
    
    // Hide click blocker
    hideClickBlocker();
    
    // Reset timer and advance round
    resetTimer();
    currentRound += 1;
    if (currentRound > 10) {
        endGame();
        return;
    }
    const roundCounter = document.getElementById('round-counter');
    if (roundCounter) {
        roundCounter.textContent = `${currentRound}/10`;
    }
    startTimer();
}

// Function to start the timer
function startTimer() {
    const timerBar = document.getElementById('timer-bar');
    const timerText = document.getElementById('timer-text');
    
    if (!timerBar) return;
    
    // Reset and show timer bar
    timerBar.style.width = '100%';
    timerBar.style.backgroundColor = '#002395'; // Start with blue
    timerBar.style.display = 'block';
    timerText.style.display = 'none';
    
    timerStartTime = Date.now();
    
    timerInterval = setInterval(() => {
        const elapsed = Date.now() - timerStartTime;
        const remaining = Math.max(0, TIMER_DURATION - elapsed);
        const percentage = (remaining / TIMER_DURATION) * 100;
        
        timerBar.style.width = percentage + '%';
        
        // Calculate color transition from blue to red
        // percentage: 100% = blue (#002395), 0% = red (#C1121F)
        const ratio = percentage / 100;
        const red = Math.round(0 + (193 - 0) * (1 - ratio)); // 00 to C1
        const green = Math.round(35 + (18 - 35) * (1 - ratio)); // 23 to 12
        const blue = Math.round(149 + (31 - 149) * (1 - ratio)); // 95 to 1F
        
        timerBar.style.backgroundColor = `rgb(${red}, ${green}, ${blue})`;
        
        if (remaining <= 0) {
            handleTimerEnd();
        }
    }, 100);
}

// Function to stop the timer
function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

// Function to reset the timer
function resetTimer() {
    stopTimer();
    const timerBar = document.getElementById('timer-bar');
    const timerText = document.getElementById('timer-text');
    
    if (timerBar) {
        timerBar.style.width = '100%';
        timerBar.style.backgroundColor = '#002395'; // Reset to blue
        timerBar.style.display = 'block';
    }
    
    if (timerText) {
        timerText.style.display = 'none';
    }
}

// Function to show continue text
function showContinueText() {
    const timerBar = document.getElementById('timer-bar');
    const timerText = document.getElementById('timer-text');
    
    if (timerBar) {
        timerBar.style.display = 'none';
    }
    
    if (timerText) {
        timerText.textContent = (currentRound >= 10) ? 'Appuyer pour afficher le score' : 'Appuyez pour continuer';
        timerText.style.display = 'block';
        timerText.style.cursor = 'pointer';
        // Remove result color classes and let CSS set the color
        timerText.classList.remove('correct-result', 'incorrect-result');
        timerText.style.color = '';
    }
}

// Start a new game lazily when entering the game page
function startNewGameIfNeeded() {
    if (currentRound === 0) {
        score = 0;
        currentRound = 0; // will be incremented to 1 at first resetImageOptions()
    }
}

// End the game and show the score screen
function endGame() {
    stopTimer();
    hideClickBlocker();
    const scoreText = document.getElementById('score-text');
    if (scoreText) {
        scoreText.textContent = `${score} / 10`;
    }
    const pages = document.querySelectorAll('.page');
    pages.forEach(p => p.classList.remove('active'));
    const endPage = document.getElementById('end-page');
    if (endPage) endPage.classList.add('active');
}

// Restart the game from the beginning
function restartGame() {
    score = 0;
    currentRound = 0;
    hideClickBlocker();
    const pages = document.querySelectorAll('.page');
    pages.forEach(p => p.classList.remove('active'));
    const gamePage = document.getElementById('game1-page');
    if (gamePage) gamePage.classList.add('active');
    loadRandomQuote();
}

// Function to handle timer end (no answer clicked)
function handleTimerEnd() {
    stopTimer();
    
    // Show click blocker to disable all clicks
    showClickBlocker(false);
    
    // Disable all options except the correct one
    const allOptions = document.querySelectorAll('.image-option');
    
    // Find and highlight the correct answer (only border, no background change on name-label)
    allOptions.forEach((opt, index) => {
        const optId = currentQuestion.allIds[index];
        if (optId === currentQuestion.correctId) {
            // Add only the border styling, not the full "correct" class
            opt.style.borderColor = '#1E8E3E';
            opt.style.borderWidth = '5px';
            // Don't disable the correct option
        } else {
            opt.classList.add('faded');
            opt.classList.add('disabled'); // Only disable the incorrect options
        }
    });
    
    // Show result message in timer area
    showResultInTimer('Temps écoulé !', false);
    
    // Show info button and continue text after 1.5 seconds
    setTimeout(() => {
        // Find the correct option and add the info button to it
        const correctOption = Array.from(allOptions).find((opt, idx) => {
            return currentQuestion.allIds[idx] === currentQuestion.correctId;
        });
        
        const infoButton = document.getElementById('info-button');
        if (infoButton && correctOption) {
            // Move the button to the correct option
            correctOption.appendChild(infoButton);
            correctOption.style.zIndex = '600'; // Ensure it's above the click-blocker
            infoButton.style.display = 'block';
        }
        
        // Show continue text
        showContinueText();
        
        // Make click blocker clickable to continue
        showClickBlocker(true);
    }, 1500);
}

// Function to show result in timer area
function showResultInTimer(message, isCorrect) {
    const timerBar = document.getElementById('timer-bar');
    const timerText = document.getElementById('timer-text');
    
    if (!timerText) return;
    
    // Hide timer bar
    if (timerBar) {
        timerBar.style.display = 'none';
    }
    
    // Show result message
    timerText.textContent = message;
    timerText.style.display = 'block';
    timerText.style.cursor = 'default';
    
    // Apply color based on result
    timerText.classList.remove('correct-result', 'incorrect-result');
    if (isCorrect) {
        timerText.classList.add('correct-result');
    } else {
        timerText.classList.add('incorrect-result');
    }
}

// Function to show/hide click blocker
function showClickBlocker(clickable) {
    const clickBlocker = document.getElementById('click-blocker');
    if (!clickBlocker) return;
    
    if (clickable) {
        clickBlocker.style.display = 'block';
        clickBlocker.classList.add('clickable');
    } else if (clickable === false) {
        clickBlocker.style.display = 'block';
        clickBlocker.classList.remove('clickable');
    } else {
        clickBlocker.style.display = 'none';
        clickBlocker.classList.remove('clickable');
    }
}

// Function to hide click blocker
function hideClickBlocker() {
    const clickBlocker = document.getElementById('click-blocker');
    if (clickBlocker) {
        clickBlocker.style.display = 'none';
        clickBlocker.classList.remove('clickable');
    }
}

// Function to get person info by id
function getPersonInfoById(id) {
    if (politicsPeopleById[id]) {
        return {
            prenom: politicsPeopleById[id].prenom || '',
            nom: politicsPeopleById[id].nom || ''
        };
    }
    if (popCulturePeopleById[id]) {
        return {
            prenom: popCulturePeopleById[id].prenom || '',
            nom: popCulturePeopleById[id].nom || ''
        };
    }
    return { prenom: '', nom: '' };
}

// Function to load images for the current question
function loadImages() {
    currentQuestion.allIds.forEach((id, index) => {
        const imgElement = document.getElementById(`img-${index}`);
        const nameElement = document.getElementById(`name-${index}`);
        
        if (!imgElement) return;
        
        // Get person info
        const personInfo = getPersonInfoById(id);
        
        // Display name
        if (nameElement) {
            if (personInfo.nom) {
                nameElement.textContent = `${personInfo.prenom} ${personInfo.nom}`;
            } else {
                nameElement.textContent = personInfo.prenom;
            }
        }
        
        // Illustrated avatar first, then the photo
        const imagePaths = [`data/avatars/${id}.jpg`, `data/photos/${id}.jpg`, `data/photos/${id}.png`];
        
        // Try to load the image
        const tryLoadImage = (pathIndex) => {
            if (pathIndex >= imagePaths.length) {
                // No image found, use default.jpg, fallback to white placeholder
                const defaultPath = 'data/photos/default.jpg';
                const testDefault = new Image();
                testDefault.onload = function() {
                    imgElement.src = defaultPath;
                    imgElement.style.backgroundColor = 'transparent';
                };
                testDefault.onerror = function() {
                    imgElement.src = createWhitePlaceholder();
                    imgElement.style.backgroundColor = 'white';
                };
                testDefault.src = defaultPath;
                return;
            }
            
            const imagePath = imagePaths[pathIndex];
            
            // Test if image exists
            const testImg = new Image();
            testImg.onload = function() {
                imgElement.src = imagePath;
                imgElement.style.backgroundColor = 'transparent';
            };
            testImg.onerror = function() {
                // Try next path
                tryLoadImage(pathIndex + 1);
            };
            testImg.src = imagePath;
        };
        
        tryLoadImage(0);
    });
}

// Function to create a white placeholder data URL
function createWhitePlaceholder() {
    // Create a 1x1 white pixel as data URL
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 1, 1);
    return canvas.toDataURL();
}

// Function to show info popup
function showInfoPopup() {
    const quoteData = currentQuestion.quoteData;
    
    if (!quoteData) return;
    
    // Populate popup content
    document.getElementById('popup-quote').textContent = quoteData.citation_courte || quoteData.contexte_complet || '';
    
    const person = getPersonInfoById(currentQuestion.correctId);
    const prenom = person.prenom || '';
    const nom = person.nom || '';
    document.getElementById('popup-author').textContent = nom ? `${prenom} ${nom}` : prenom;
    
    document.getElementById('popup-date').textContent = quoteData.date || 'Non renseignée';
    
    document.getElementById('popup-context').textContent = quoteData.contexte_complet || 'Non renseigné';
    
    const rawLink = quoteData.source_url || quoteData.source || '';
    const sourceText = (quoteData.source_texte || '').trim();
    const linkElement = document.getElementById('popup-link');
    const sourceTextElement = document.getElementById('popup-source-text');
    const isUrl = /^https?:\/\//i.test(rawLink);
    if (isUrl) {
        // Référence d'origine (émission, média, date) en texte du lien, sinon le nom du site
        linkElement.href = rawLink;
        linkElement.textContent = sourceText || new URL(rawLink).hostname.replace(/^www\./, '');
        linkElement.style.display = 'inline';
        sourceTextElement.textContent = '';
    } else {
        // Personnages de fiction : la source est le titre de l'œuvre
        linkElement.style.display = 'none';
        sourceTextElement.textContent = sourceText || rawLink || 'Non renseignée';
    }
    
    // Show popup
    document.getElementById('popup-overlay').style.display = 'flex';
}

// Function to close info popup
function closeInfoPopup() {
    document.getElementById('popup-overlay').style.display = 'none';
}

