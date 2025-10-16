// Global variables for quotes
let politicsQuotes = [];
let popCultureQuotes = [];

// Global maps for people (id -> person info)
let politicsPeopleById = {};
let popCulturePeopleById = {};

// Global object for current question
let currentQuestion = {
    quote: '',
    correctId: '',
    allIds: [] // Array of 4 ids including the correct one
};

// Timer variables
let timerInterval = null;
let timerStartTime = null;
const TIMER_DURATION = 15000; // 15 seconds in milliseconds

// Navigation between pages
document.addEventListener('DOMContentLoaded', function() {
    // Get all main buttons
    const mainButtons = document.querySelectorAll('.main-button');
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
        
        // If going to game 1, load a quote
        if (pageId === 'game1-page') {
            loadRandomQuote();
        } else {
            // Stop timer if leaving game 1
            stopTimer();
        }
    }

    // Add click event to main buttons
    mainButtons.forEach(button => {
        button.addEventListener('click', function() {
            const targetPage = this.getAttribute('data-page') + '-page';
            showPage(targetPage);
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
                loadRandomQuote();
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
                opt.style.borderColor = '#51cb00';
                opt.style.borderWidth = '5px';
            } else if (index !== clickedIndex) {
                opt.classList.add('faded');
            }
        });
    }
    
    // Show result message in timer area
    const isCorrect = clickedId === currentQuestion.correctId;
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

// Function to parse CSV with automatic delimiter detection ("," or ";")
function parseCSV(text) {
    const trimmed = text.trim();
    if (!trimmed) return [];
    const lines = trimmed.split('\n');

    // Detect delimiter based on header line
    const headerLine = lines[0];
    const commaCount = (headerLine.match(/,/g) || []).length;
    const semiCount = (headerLine.match(/;/g) || []).length;
    const delimiter = semiCount > commaCount ? ';' : ',';

    const headers = headerLine.split(delimiter).map(h => h.trim());
    const data = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        const values = [];
        let currentValue = '';
        let insideQuotes = false;

        for (let j = 0; j < line.length; j++) {
            const char = line[j];

            if (char === '"') {
                insideQuotes = !insideQuotes;
            } else if (char === delimiter && !insideQuotes) {
                values.push(currentValue.trim());
                currentValue = '';
            } else {
                currentValue += char;
            }
        }
        values.push(currentValue.trim());

        if (values.length >= headers.length) {
            const obj = {};
            headers.forEach((header, index) => {
                obj[header] = values[index] !== undefined ? values[index] : '';
            });
            data.push(obj);
        }
    }

    return data;
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
        politicsQuotes = parseCSV(polQuotesText);
        politicsPeopleById = {};
        politicsPeople.forEach(p => {
            const pid = (p.id || '').trim();
            if (!pid) return;
            politicsPeopleById[pid] = {
                prenom: p.prenom || '',
                nom: p.nom || '',
                genre: p.genre || '',
                parti: p.parti || ''
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
        popCultureQuotes = parseCSV(popQuotesText);
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

// Function to choose dataset with Bernoulli distribution (75% politics, 25% pop culture)
function chooseDataset() {
    const random = Math.random();
    return random < 0.75 ? politicsQuotes : popCultureQuotes;
}

// Function to get random quote from array
function getRandomQuote(quotesArray) {
    if (quotesArray.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * quotesArray.length);
    return quotesArray[randomIndex];
}

// Function to get all unique ids from both datasets
function getAllIds() {
    const politicsIds = politicsQuotes.map(q => q.id).filter(id => id && id.trim() !== '');
    const popCultureIds = popCultureQuotes.map(q => q.id).filter(id => id && id.trim() !== '');
    
    return {
        politics: [...new Set(politicsIds)],
        popCulture: [...new Set(popCultureIds)]
    };
}

// Function to select 3 random ids (excluding the correct one)
// Ensures at least one politics id and one pop culture id
function selectRandomIds(correctId, isCorrectIdPolitics) {
    const allIds = getAllIds();
    const availablePoliticsIds = allIds.politics.filter(id => id !== correctId);
    const availablePopCultureIds = allIds.popCulture.filter(id => id !== correctId);
    
    let selectedIds = [];
    
    if (isCorrectIdPolitics) {
        // Correct answer is politics, so we MUST have at least one pop culture id
        // Select 1 pop culture id
        if (availablePopCultureIds.length > 0) {
            const randomPopIndex = Math.floor(Math.random() * availablePopCultureIds.length);
            selectedIds.push(availablePopCultureIds[randomPopIndex]);
            availablePopCultureIds.splice(randomPopIndex, 1);
        }
        
        // Fill remaining 2 slots with random ids from both datasets
        const combinedAvailable = [...availablePoliticsIds, ...availablePopCultureIds];
        while (selectedIds.length < 3 && combinedAvailable.length > 0) {
            const randomIndex = Math.floor(Math.random() * combinedAvailable.length);
            selectedIds.push(combinedAvailable[randomIndex]);
            combinedAvailable.splice(randomIndex, 1);
        }
    } else {
        // Correct answer is pop culture, so we MUST have at least one politics id
        // Select 1 politics id
        if (availablePoliticsIds.length > 0) {
            const randomPolIndex = Math.floor(Math.random() * availablePoliticsIds.length);
            selectedIds.push(availablePoliticsIds[randomPolIndex]);
            availablePoliticsIds.splice(randomPolIndex, 1);
        }
        
        // Fill remaining 2 slots with random ids from both datasets
        const combinedAvailable = [...availablePoliticsIds, ...availablePopCultureIds];
        while (selectedIds.length < 3 && combinedAvailable.length > 0) {
            const randomIndex = Math.floor(Math.random() * combinedAvailable.length);
            selectedIds.push(combinedAvailable[randomIndex]);
            combinedAvailable.splice(randomIndex, 1);
        }
    }
    
    return selectedIds;
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
        
        // Select 3 other random ids
        const otherIds = selectRandomIds(correctId, isPolitics);
        
        // Create the global question object
        currentQuestion = {
            quote: quoteText,
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
    
    // Reset timer
    resetTimer();
    startTimer();
}

// Function to start the timer
function startTimer() {
    const timerBar = document.getElementById('timer-bar');
    const timerText = document.getElementById('timer-text');
    
    if (!timerBar) return;
    
    // Reset and show timer bar
    timerBar.style.width = '100%';
    timerBar.style.backgroundColor = '#51cb00'; // Start with green
    timerBar.style.display = 'block';
    timerText.style.display = 'none';
    
    timerStartTime = Date.now();
    
    timerInterval = setInterval(() => {
        const elapsed = Date.now() - timerStartTime;
        const remaining = Math.max(0, TIMER_DURATION - elapsed);
        const percentage = (remaining / TIMER_DURATION) * 100;
        
        timerBar.style.width = percentage + '%';
        
        // Calculate color transition from green to red
        // percentage: 100% = green (#51cb00), 0% = red (#ff0000)
        const ratio = percentage / 100;
        const red = Math.round(81 + (255 - 81) * (1 - ratio)); // 51 to FF
        const green = Math.round(203 * ratio); // CB to 00
        const blue = 0; // Always 00
        
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
        timerBar.style.backgroundColor = '#51cb00'; // Reset to green
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
        timerText.textContent = 'Appuyez pour continuer';
        timerText.style.display = 'block';
        timerText.style.cursor = 'pointer';
        // Remove result color classes and force white color
        timerText.classList.remove('correct-result', 'incorrect-result');
        timerText.style.color = 'white';
    }
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
            opt.style.borderColor = '#51cb00';
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
        
        // Try only jpg extension
        const extensions = ['jpg'];
        let imageFound = false;
        
        // Try to load the image
        const tryLoadImage = (extIndex) => {
            if (extIndex >= extensions.length) {
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
            
            const ext = extensions[extIndex];
            const imagePath = `data/photos/${id}.${ext}`;
            
            // Test if image exists
            const testImg = new Image();
            testImg.onload = function() {
                imgElement.src = imagePath;
                imgElement.style.backgroundColor = 'transparent';
            };
            testImg.onerror = function() {
                // Try next extension
                tryLoadImage(extIndex + 1);
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

// Function to get full quote data by id
function getFullQuoteData(id) {
    // Search in politics quotes
    const politicsMatch = politicsQuotes.find(q => q.id === id);
    if (politicsMatch) {
        return politicsMatch;
    }
    
    // Search in pop culture quotes by explicit id
    const popCultureMatch = popCultureQuotes.find(q => q.id === id);
    
    return popCultureMatch || null;
}

// Function to show info popup
function showInfoPopup() {
    const quoteData = getFullQuoteData(currentQuestion.correctId);
    
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
    const linkElement = document.getElementById('popup-link');
    const isUrl = /^https?:\/\//i.test(rawLink);
    if (isUrl) {
        linkElement.href = rawLink;
        linkElement.style.display = 'inline';
    } else {
        linkElement.style.display = 'none';
    }
    
    // Show popup
    document.getElementById('popup-overlay').style.display = 'flex';
}

// Function to close info popup
function closeInfoPopup() {
    document.getElementById('popup-overlay').style.display = 'none';
}

