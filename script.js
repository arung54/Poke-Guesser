const STATS = ['hp', 'attack', 'defense', 'sp_attack', 'sp_defense', 'speed'];
const HINTS = ['type1', 'type2', 'generation'];

let pokemonData = [];
let targetPokemon = null;
let guesses = [];
let gameHistoryString = '';
let hintsUsed = { type1: false, type2: false, generation: false };
let gameWon = false;
let isPracticeMode = window.location.pathname.includes('practice.html'); // NEW: Detect mode based on URL
let currentSeed = ''; // NEW: Stores the seed for the current game

// --- A. Robust PRNG Functions (Replacement Block) ---

/**
 * cyrb128: A non-cryptographic string hash function (128-bit)
 * Used to turn the date string into four 32-bit seeds for sfc32.
 */
function cyrb128(str) {
    let h1 = 1779033703, h2 = 3144134277,
        h3 = 1013904242, h4 = 2773480762;
    for (let i = 0, k; i < str.length; i++) {
        k = str.charCodeAt(i);
        h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
        h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
        h3 = h4 ^ Math.imul(h4 ^ k, 951274213);
        h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
    h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
    h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    h1 ^= (h2 ^ h3 ^ h4), h2 ^= h1, h3 ^= h1, h4 ^= h1;
    // We only need the first four 32-bit parts as seeds
    return [h1>>>0, h2>>>0, h3>>>0, h4>>>0];
}

/**
 * sfc32: A highly performant 32-bit PRNG generator function.
 * It returns a function that, when called, produces a random number (0 to 1).
 */
function sfc32(a, b, c, d) {
    return function() {
        a |= 0; b |= 0; c |= 0; d |= 0;
        let t = (a + b | 0) + d | 0;
        d = d + 1 | 0;
        a = b ^ b >>> 9;
        b = c + (c << 3) | 0;
        c = (c << 21 | c >>> 11);
        c = c + t | 0;
        return (t >>> 0) / 4294967296; // Normalize to 0-1
    }
}

/**
 * seededRandom: Takes the date seed, hashes it, and returns the PRNG generator.
 * @param {string} seedString - The date string from getDailySeed().
 * @returns {function} - The PRNG generator function (sfc32 closure).
 */
function seededRandom(seedString) {
    // 1. Hash the date string to get four robust seeds
    const seeds = cyrb128(seedString);
    
    // 2. Return the sfc32 generator function using those seeds
    return sfc32(seeds[0], seeds[1], seeds[2], seeds[3]);
}
/**
 * Generates a seed based on the current date (YYYYMMDD)
 */
function getDailySeed() {
    const today = new Date();
    const dateString = today.getFullYear().toString() + 
                       (today.getMonth() + 1).toString().padStart(2, '0') + 
                       today.getDate().toString().padStart(2, '0');
    return dateString
}
/**
 * Gets a random seed for practice mode.
 */
function getRandomSeed() { 
    // Use a combination of Math.random and Date.now for a robust random seed
    return Math.random().toString() + Date.now().toString(); 
}

/**
 * Toggles the autocomplete suggestions on the input field.
 * @param {boolean} enabled - True to show datalist, False to hide.
 */
function toggleAutocomplete(enabled) {
    const inputEl = document.getElementById('pokemon-input');
    const checkboxEl = document.getElementById('toggle-autocomplete');

    if (enabled) {
        inputEl.setAttribute('list', 'pokemon-list');
        checkboxEl.checked = true;
    } else {
        inputEl.removeAttribute('list');
        checkboxEl.checked = false;
    }
    // Save the user's preference
    localStorage.setItem('pokeGuesser_autocomplete', enabled);
}

/**
 * Loads the user's autocomplete preference from local storage.
 */
function loadAutocompletePreference() {
    const preference = localStorage.getItem('pokeGuesser_autocomplete');
    
    // Default to true (enabled) if no preference is found
    const enabled = (preference === 'false') ? false : true; 
    
    toggleAutocomplete(enabled);
}

// --- B. Core Game Logic ---

/**
 * Deterministically select a Pokémon based on a provided seed string.
 * (Replaces the old selectDailyPokemon and generalizes it)
 */
function selectPokemonBySeed(data, seedString) {
    const seed = cyrb128(seedString);
    const rand = sfc32(...seed);

    // Get a random index deterministically
    const index = Math.floor(rand() * data.length);
    return data[index];
}

/**
 * Renders the victory message and shareable text when the game is won.
 */
function renderVictoryMessage() {
    const guessCount = guesses.length;
    // Map Type1/Type2/Generation to T1, T2, G for the share summary
    const hintsUsedList = HINTS.filter(h => hintsUsed[h]).map(h => h.charAt(0).toUpperCase()); 
    
    // Map the history string characters to emojis for the share text
    const historyEmojis = gameHistoryString
        .split('')
        .map(char => {
            switch (char) {
                case 'X': return '❌';
                case 'O': return '✅';
                case 'T': return '1️⃣'; // Type 1
                case 'Y': return '2️⃣'; // Type 2
                case 'G': return '🗓️'; // Generation
                default: return char;
            }
        })
        .join('');

    // Construct the summary text
    const summaryText = `🎉 Poké-Stats Guesser Solved! (${new Date().toLocaleDateString()})\n` +
                        `Guesses/Hints: ${historyEmojis}\n\n` +
                        `https://arung54.github.io/Poke-Guesser/`;

    const messageEl = document.getElementById('message');
    
    // 1. Set the victory message content
    messageEl.className = 'correct-guess';
    if (isPracticeMode) {
        messageEl.innerHTML = `
            <h2>CONGRATULATIONS!</h2>
            <p>You correctly identified ${targetPokemon.name} in ${guessCount} guesses!</p>
        `;
    }
    else {
        messageEl.innerHTML = `
            <h2>CONGRATULATIONS!</h2>
            <p>You correctly identified ${targetPokemon.name} in ${guessCount} guesses!</p>
            <textarea id="share-summary" rows="5" readonly>${summaryText}</textarea>
            <button onclick="navigator.clipboard.writeText(document.getElementById('share-summary').value)">Copy Summary</button>
        `;
    }

    // 2. Move the message element above the guess history.
    const container = document.querySelector('.container');
    container.insertBefore(messageEl, document.getElementById('guess-history').previousSibling);
}

/**
 * Compares the guessed Pokémon's stats against the target.
 * @param {object} guessPokemon - The Pokémon the user guessed.
 * @param {object} targetPokemon - The target Pokémon.
 * @returns {Array<object>} - Array of feedback for each stat.
 */
function compareGuess(guessPokemon, targetPokemon) {
    const feedback = [];
    const closeRange = 5; // Define a "close" range for stats

    for (const stat of STATS) {
        const guessVal = parseInt(guessPokemon[stat]);
        const targetVal = parseInt(targetPokemon[stat]);
        let colorClass = 'red';
        let indicator = '';

        if (guessVal === targetVal) {
            colorClass = 'green';
        } else if (Math.abs(guessVal - targetVal) <= closeRange) {
            colorClass = 'yellow';
        }

        if (guessVal < targetVal) {
            indicator = '↑'; // Higher
        } else if (guessVal > targetVal) {
            indicator = '↓'; // Lower
        }

        feedback.push({
            stat,
            value: guessVal,
            class: colorClass,
            indicator: indicator
        });
    }

    const guessTotal = STATS.reduce((sum, stat) => sum + parseInt(guessPokemon[stat]), 0);
    const targetTotal = STATS.reduce((sum, stat) => sum + parseInt(targetPokemon[stat]), 0);

    let totalColorClass = 'red';
    let totalIndicator = '';
    const totalCloseRange = 20; // A wider range for 'close' Total comparison

    if (guessTotal === targetTotal) {
        totalColorClass = 'green';
    } else if (Math.abs(guessTotal - targetTotal) <= totalCloseRange) {
        totalColorClass = 'yellow';
    }

    if (guessTotal < targetTotal) {
        totalIndicator = '↑';
    } else if (guessTotal > targetTotal) {
        totalIndicator = '↓';
    }

    feedback.push({
        stat: 'total', // Use 'total' as the key
        value: guessTotal,
        class: totalColorClass,
        indicator: totalIndicator
    });

    return feedback;
}


// --- C. UI and State Management ---

/**
 * Renders the target stats
 */
function renderTargetStats() {
    if (!targetPokemon) return; 

    const statValuesEl = document.getElementById('stat-values');
    
    const total = STATS.reduce((sum, stat) => sum + parseInt(targetPokemon[stat]), 0);
    const MAX_STAT_VALUE = 255; 
    const STAT_ABBREVIATIONS = {
        'hp': 'HP', 'attack': 'ATK', 'defense': 'DEF', 
        'sp_attack': 'SPA', 'sp_defense': 'SPD', 'speed': 'SPE'
    };

    let html = STATS.map(stat => {
        const value = parseInt(targetPokemon[stat]);
        const widthPercent = (value / MAX_STAT_VALUE) * 100;

        // --- NEW PIECEWISE CONTINUOUS COLOR LOGIC ---
        const CLAMP_POINT = 130;
        const HUE_AT_CLAMP = 120; // Green/Blue-Green
        const MAX_HUE = 200;      // Blue/Purple

        let hue;

        if (value <= CLAMP_POINT) {
            // Segment 1: 0 to 130 (Hue 0° to 120°)
            // Formula: H = (Value / 130) * 120
            hue = (value / CLAMP_POINT) * HUE_AT_CLAMP;
        } else {
            // Segment 2: 130 to 255 (Hue 120° to 200°)
            // We are mapping the range (130 to 255) to the Hue range (120° to 200°)
            const valueRange = MAX_STAT_VALUE - CLAMP_POINT; // 125
            const hueRange = MAX_HUE - HUE_AT_CLAMP;         // 80
            
            // Linear interpolation calculation:
            hue = HUE_AT_CLAMP + ((value - CLAMP_POINT) / valueRange) * hueRange;
        }

        // Final calculated hue (clamped for safety)
        const finalHue = Math.round(Math.min(Math.max(hue, 0), 360));
        
        // Define the HSL color string: Saturation (S=70%), Lightness (L=60%)
        const continuousColor = `hsl(${finalHue}, 70%, 60%)`;
        
        return `
            <tr>
                <td>${STAT_ABBREVIATIONS[stat]}</td>
                <td class="stat-bar-cell">
                    <div class="stat-bar-container">
                        <div class="stat-bar" style="width: ${widthPercent}%; background-color: ${continuousColor};"></div>
                        <span class="stat-value-overlay">${value}</span>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
    
    // Add the Total stat 
    html += `
        <tr style="font-weight: bold; border-top: 2px solid #333;">
            <td>BST</td>
            <td>${total}</td>
        </tr>
    `;

    statValuesEl.innerHTML = html;
}
const STAT_ABBREVIATIONS = {
    'hp': 'HP',
    'attack': 'ATK',
    'defense': 'DEF',
    'sp_attack': 'SPA',
    'sp_defense': 'SPD',
    'speed': 'SPE'
    // 'total' will be handled separately as 'BST'
};
/**
 * Renders the history of user guesses.
 */
function renderGuessHistory() {
    const historyEl = document.getElementById('guess-history');
    historyEl.innerHTML = ''; // Clear existing history

    if (guesses.length === 0) {
        historyEl.innerHTML = '<p>Start guessing!</p>';
        return;
    }

    // Add header row for guess history
    const headerRow = document.createElement('div');
    headerRow.className = 'guess-row';
    headerRow.style.fontWeight = 'bold';
    const statHeaders = STATS.map(s => `<div class="guess-cell">${STAT_ABBREVIATIONS[s]}</div>`).join('');
    headerRow.innerHTML = `<div class="guess-cell">Name</div>` + 
                          statHeaders +
                          `<div class="guess-cell">BST</div>`; // <-- BST for Base Stat Total
    historyEl.appendChild(headerRow);

    // KEY CHANGE: Iterate over a reversed copy of the array
    [...guesses].reverse().forEach(guess => {
        const row = document.createElement('div');
        row.className = 'guess-row';
        
        // 1. Pokémon Name
        row.innerHTML += `<div class="guess-cell">${guess.name}</div>`;

        // 2. Stat Feedback
        guess.feedback.forEach(f => {
            row.innerHTML += `<div class="guess-cell ${f.class}">${f.value} ${f.indicator}</div>`;
        });

        historyEl.appendChild(row);
    });
}

/**
 * Renders the revealed hint information.
 */
function renderHints() {
    document.getElementById('clue-type1').textContent = hintsUsed.type1 ? targetPokemon.type1 : '???';
    document.getElementById('clue-type2').textContent = hintsUsed.type2 ? targetPokemon.type2 : '???';
    document.getElementById('clue-gen').textContent = hintsUsed.generation ? targetPokemon.generation : '???';

    document.getElementById('hint-type1-btn').disabled = hintsUsed.type1 || gameWon;
    document.getElementById('hint-type2-btn').disabled = hintsUsed.type2 || gameWon || !targetPokemon.type2;
    document.getElementById('hint-gen-btn').disabled = hintsUsed.generation || gameWon;

    // Handle case where Type 2 doesn't exist (e.g., single-type Pokémon)
    if (!targetPokemon || !targetPokemon.type2) {
        document.getElementById('hint-type2-btn').textContent = 'Type 2 N/A';
        document.getElementById('hint-type2-btn').disabled = true;
    }
}

/**
 * Saves the current game state to Local Storage.
 */
function saveGameState() {
    const state = {
        date: getDailySeed(),
        guesses: guesses,
        hintsUsed: hintsUsed,
        gameWon: gameWon,
        gameHistoryString: gameHistoryString
    };
    localStorage.setItem('pokeGuesserState', JSON.stringify(state));
}

/**
 * Loads the game state from Local Storage.
 */
function loadGameState() {
    const storedState = localStorage.getItem('pokeGuesserState');
    if (!storedState) return;

    const state = JSON.parse(storedState);
    
    // Check if the game state is for today
    if (state.date === getDailySeed()) {
        guesses = state.guesses;
        hintsUsed = state.hintsUsed;
        gameWon = state.gameWon;
        gameHistoryString = state.gameHistoryString || ''
        if (gameWon) {
            renderVictoryMessage(); 
            document.getElementById('submit-guess-btn').disabled = true;
        }
    } else {
        // Old game state, clear it
        localStorage.removeItem('pokeGuesserState');
    }
}

// --- D. Event Handlers ---

function handleSubmitGuess() {
    if (gameWon) return;

    const inputEl = document.getElementById('pokemon-input');
    const guessName = inputEl.value.trim();
    
    if (!guessName) {
        document.getElementById('message').textContent = 'Please enter a Pokémon name.';
        return;
    }

    const guessedPokemon = pokemonData.find(p => p.name.toLowerCase() === guessName.toLowerCase());

    if (!guessedPokemon) {
        document.getElementById('message').textContent = 'Invalid Pokémon name. Try again.';
        return;
    }

    // Check if already guessed
    if (guesses.some(g => g.name.toLowerCase() === guessName.toLowerCase())) {
        document.getElementById('message').textContent = 'You already guessed that Pokémon!';
        return;
    }
    
    document.getElementById('message').textContent = '';

    // 1. Process Guess

    const feedback = compareGuess(guessedPokemon, targetPokemon);
    guesses.push({ name: guessedPokemon.name, pokemon: guessedPokemon, feedback: feedback });

    // 2. Check for Win
    if (guessedPokemon.name.toLowerCase() === targetPokemon.name.toLowerCase()) {
            gameHistoryString += 'O'; // 'O' for right guess
            gameWon = true;
            document.getElementById('submit-guess-btn').disabled = true;

            renderVictoryMessage();
        } else {
            gameHistoryString += 'X'; // 'X' for wrong guess
        }

        // 3. Update UI and State
        inputEl.value = '';
        renderGuessHistory();
        renderHints(); // Update hint button state
        saveGameState();
    } 

function handleHintClick(hintType) {
    if (gameWon || hintsUsed[hintType]) return;

    switch (hintType) {
        case 'type1': gameHistoryString += 'T'; break;
        case 'type2': gameHistoryString += 'Y'; break; // 'Y' for Type 2
        case 'generation': gameHistoryString += 'G'; break;
    }

    hintsUsed[hintType] = true;
    renderHints();
    populateDatalist();
    saveGameState();
}

/**
 * Populates the datalist for auto-completion.
 */
function populateDatalist() {const datalist = document.getElementById('pokemon-list');
    
    // Start with all Pokémon
    let filteredPokemon = pokemonData;

    // --- Filtering Logic ---
    
    // 1. Filter by Type 1
    if (hintsUsed.type1) {
        const requiredType1 = targetPokemon.type1;
        filteredPokemon = filteredPokemon.filter(p => p.type1 === requiredType1);
    }
    
    // 2. Filter by Type 2
    if (hintsUsed.type2) {
        const requiredType2 = targetPokemon.type2;
        filteredPokemon = filteredPokemon.filter(p => p.type2 === requiredType2);
    }
    
    // 3. Filter by Generation
    if (hintsUsed.generation) {
        const requiredGen = targetPokemon.generation;
        filteredPokemon = filteredPokemon.filter(p => p.generation === requiredGen);
    }

    // --- Generate Datalist Options ---
    
    datalist.innerHTML = filteredPokemon
        .map(p => `<option value="${p.name}">`)
        .join('');
}
// --- E. Initialization ---
function resetGameVariables() { 
    guesses = [];
    gameHistoryString = '';
    hintsUsed = { type1: false, type2: false, generation: false };
    gameWon = false;
    document.getElementById('message').innerHTML = ''; // Clear message and any buttons
    document.getElementById('guess-history').innerHTML = ''; // Clear history
    document.getElementById('pokemon-input').value = ''; // Clear input
    
    // Re-enable all hint buttons
    document.querySelectorAll('.hint-buttons button').forEach(btn => {
        btn.disabled = false;
        btn.style.opacity = '1';
    });
    // Re-enable guess input/button (Assuming disableInputAndButtons is used elsewhere)
    document.getElementById('pokemon-input').disabled = false;
    document.getElementById('submit-guess-btn').disabled = false;
}

/**
 * Starts or restarts a game, selecting the Pokémon based on the current mode.
 */
function startGame() { 
    resetGameVariables();
    
    if (isPracticeMode) {
        currentSeed = getRandomSeed();
        targetPokemon = selectPokemonBySeed(pokemonData, currentSeed);
    } else {
        // Daily Mode Logic
        currentSeed = getDailySeed();
        targetPokemon = selectPokemonBySeed(pokemonData, currentSeed);
        loadGameState(); // Load state for Daily Mode
    }

    renderTargetStats();
    renderHints();
    renderGuessHistory();
    // If game was already won, re-render win state
    if (gameWon) {
        disableInputAndButtons();
        renderMessage(`You already guessed the Pokémon: ${targetPokemon.name}!`, true); 
    }
}

/**
 * Starts a new game in Practice Mode when the 'Play Again' button is clicked.
 */
function startNewPracticeGame() { 
    if (isPracticeMode) {
        startGame(); // This will generate a new random seed and reset the UI
    }
}

// Find and modify `renderMessage(text, isWin = false)` function:
function renderMessage(text, isWin = false) { 
    const messageEl = document.getElementById('message');
    // Clear the message container's content, including any previous buttons/summaries
    messageEl.innerHTML = ''; 
    
    // Create a simple text node for the main message
    const textNode = document.createTextNode(text);
    messageEl.appendChild(textNode);

    if (isWin) {
        disableInputAndButtons();

        if (!isPracticeMode) {
            // Daily Mode: Show copyable summary
            const summaryTitle = document.createElement('h3');
            summaryTitle.textContent = "Today's Result Summary (Copy and Share):";
            messageEl.appendChild(summaryTitle);

            const summaryOutput = document.createElement('pre');
            summaryOutput.id = 'share-summary';
            // Assuming generateGameHistoryString is defined elsewhere
            summaryOutput.textContent = generateGameHistoryString(targetPokemon.name, guesses.length); 
            messageEl.appendChild(summaryOutput);
            
            // Add a Copy to Clipboard button (for daily mode only)
            const copyButton = document.createElement('button');
            copyButton.textContent = 'Copy to Clipboard';
            copyButton.onclick = () => {
                navigator.clipboard.writeText(summaryOutput.textContent).then(() => {
                    copyButton.textContent = 'Copied!';
                    setTimeout(() => copyButton.textContent = 'Copy to Clipboard', 2000);
                }).catch(err => {
                    console.error('Could not copy text: ', err);
                });
            };
            messageEl.appendChild(copyButton);
            
        } else {
            // Practice Mode: Add a Play Again button
            const playAgainButton = document.createElement('button');
            playAgainButton.id = 'play-again-btn';
            playAgainButton.textContent = 'Play Again (New Pokémon)';
            messageEl.appendChild(playAgainButton);
            playAgainButton.addEventListener('click', startNewPracticeGame);
        }
    }
}


// Find and modify `initializeGame` function:
async function initializeGame() { 
    try {
        const response = await fetch('pokemon_data.json');
        pokemonData = await response.json();
    } catch (error) {
        console.error("Error loading Pokémon data:", error);
        document.getElementById('message').textContent = "Error loading Pokémon data. Make sure 'pokemon_data.json' exists.";
        return;
    }

    // ORIGINAL LINES REMOVED/MOVED TO startGame():
    // targetPokemon = selectDailyPokemon(pokemonData);
    // loadGameState();
    // renderTargetStats();
    // renderHints();
    // renderGuessHistory();

    populateDatalist();

    loadAutocompletePreference();

    // Setup Event Listeners (KEEP ORIGINAL)
    document.getElementById('submit-guess-btn').addEventListener('click', handleSubmitGuess);
    document.getElementById('pokemon-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSubmitGuess();
    });

    document.getElementById('hint-type1-btn').addEventListener('click', () => handleHintClick('type1'));
    document.getElementById('hint-type2-btn').addEventListener('click', () => handleHintClick('type2'));
    document.getElementById('hint-gen-btn').addEventListener('click', () => handleHintClick('generation'));
    
    document.getElementById('toggle-autocomplete').addEventListener('change', (e) => {
        toggleAutocomplete(e.target.checked);
    });
    
    // START THE GAME
    startGame(); // NEW: Centralized game start
}

// Start the game!
initializeGame();