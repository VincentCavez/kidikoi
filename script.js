// Global variables for quotes
let politicsQuotes = [];
let popCultureQuotes = [];

// Global object for current question
let currentQuestion = {
    quote: '',
    correctId: '',
    allIds: [] // Array of 4 ids including the correct one
};

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
    
    // Add click handlers to image options
    setupImageClickHandlers();
    
    // Setup info button click handler
    const infoButton = document.getElementById('info-button');
    if (infoButton) {
        infoButton.addEventListener('click', showInfoPopup);
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
    
    // Check if already answered
    if (clickedOption.classList.contains('disabled')) {
        return;
    }
    
    // Disable all options
    const allOptions = document.querySelectorAll('.image-option');
    allOptions.forEach(opt => opt.classList.add('disabled'));
    
    if (clickedId === currentQuestion.correctId) {
        // Correct answer
        clickedOption.classList.add('correct');
        
        // Fade other options
        allOptions.forEach((opt, index) => {
            if (index !== clickedIndex) {
                opt.classList.add('faded');
            }
        });
    } else {
        // Incorrect answer
        clickedOption.classList.add('incorrect');
        
        // Find and highlight the correct answer
        allOptions.forEach((opt, index) => {
            const optId = currentQuestion.allIds[index];
            if (optId === currentQuestion.correctId) {
                opt.classList.add('correct');
            } else if (index !== clickedIndex) {
                opt.classList.add('faded');
            }
        });
    }
    
    // Show info button
    const infoButton = document.getElementById('info-button');
    if (infoButton) {
        infoButton.style.display = 'block';
    }
}

// Function to parse CSV
function parseCSV(text) {
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',');
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
            } else if (char === ',' && !insideQuotes) {
                values.push(currentValue.trim());
                currentValue = '';
            } else {
                currentValue += char;
            }
        }
        values.push(currentValue.trim());
        
        if (values.length === headers.length) {
            const obj = {};
            headers.forEach((header, index) => {
                obj[header.trim()] = values[index];
            });
            data.push(obj);
        }
    }
    
    return data;
}

// Function to load CSV data
async function loadCSVData() {
    try {
        // Load politics quotes
        const politicsResponse = await fetch('data/spreadsheet/politiques.csv');
        const politicsText = await politicsResponse.text();
        politicsQuotes = parseCSV(politicsText);
        
        // Load pop culture quotes
        const popCultureResponse = await fetch('data/spreadsheet/pop_culture.csv');
        const popCultureText = await popCultureResponse.text();
        popCultureQuotes = parseCSV(popCultureText);
        
        console.log(`Loaded ${politicsQuotes.length} political quotes`);
        console.log(`Loaded ${popCultureQuotes.length} pop culture quotes`);
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
    const popCultureIds = popCultureQuotes.map(q => {
        // For pop culture, create a unique id from nom and prenom
        const nom = q.nom || '';
        const prenom = q.prenom || '';
        return (prenom + nom).toLowerCase().replace(/\s+/g, '');
    }).filter(id => id && id.trim() !== '');
    
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
        
        // Get the correct id
        let correctId;
        if (isPolitics) {
            correctId = quote.id;
        } else {
            // For pop culture, create id from nom and prenom
            const nom = quote.nom || '';
            const prenom = quote.prenom || '';
            correctId = (prenom + nom).toLowerCase().replace(/\s+/g, '');
        }
        
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
    });
    
    // Hide info button
    const infoButton = document.getElementById('info-button');
    if (infoButton) {
        infoButton.style.display = 'none';
    }
}

// Function to get person info by id
function getPersonInfoById(id) {
    // Search in politics quotes
    const politicsMatch = politicsQuotes.find(q => q.id === id);
    if (politicsMatch) {
        return {
            prenom: politicsMatch.prenom || '',
            nom: politicsMatch.nom || ''
        };
    }
    
    // Search in pop culture quotes
    const popCultureMatch = popCultureQuotes.find(q => {
        const nom = q.nom || '';
        const prenom = q.prenom || '';
        const generatedId = (prenom + nom).toLowerCase().replace(/\s+/g, '');
        return generatedId === id;
    });
    
    if (popCultureMatch) {
        return {
            prenom: popCultureMatch.prenom || '',
            nom: popCultureMatch.nom || ''
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
        
        // Try different image extensions
        const extensions = ['jpg', 'png', 'jpeg', 'webp'];
        let imageFound = false;
        
        // Try to load the image
        const tryLoadImage = (extIndex) => {
            if (extIndex >= extensions.length) {
                // No image found, use white placeholder
                imgElement.src = createWhitePlaceholder();
                imgElement.style.backgroundColor = 'white';
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
    
    // Search in pop culture quotes  
    const popCultureMatch = popCultureQuotes.find(q => {
        const nom = q.nom || '';
        const prenom = q.prenom || '';
        const generatedId = (prenom + nom).toLowerCase().replace(/\s+/g, '');
        return generatedId === id;
    });
    
    return popCultureMatch || null;
}

// Function to show info popup
function showInfoPopup() {
    const quoteData = getFullQuoteData(currentQuestion.correctId);
    
    if (!quoteData) return;
    
    // Populate popup content
    document.getElementById('popup-quote').textContent = quoteData.citation_courte || quoteData.contexte_complet || '';
    
    const prenom = quoteData.prenom || '';
    const nom = quoteData.nom || '';
    document.getElementById('popup-author').textContent = nom ? `${prenom} ${nom}` : prenom;
    
    document.getElementById('popup-date').textContent = quoteData.date || 'Non renseignée';
    
    document.getElementById('popup-context').textContent = quoteData.contexte_complet || 'Non renseigné';
    
    const link = quoteData.source_url || quoteData.source || '#';
    const linkElement = document.getElementById('popup-link');
    linkElement.href = link;
    if (link === '#') {
        linkElement.style.display = 'none';
    } else {
        linkElement.style.display = 'inline';
    }
    
    // Show popup
    document.getElementById('popup-overlay').style.display = 'flex';
}

// Function to close info popup
function closeInfoPopup() {
    document.getElementById('popup-overlay').style.display = 'none';
}

