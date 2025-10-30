const STATS = ['hp', 'attack', 'defense', 'sp_attack', 'sp_defense', 'speed'];
const HINTS = ['type1', 'type2', 'generation'];

let pokemonData = [];
let targetPokemon = null;
let guesses = [];
let gameHistoryString = '';
let hintsUsed = { type1: false, type2: false, generation: false };
let gameWon = false;

// --- A. Utility Functions ---

/**
 * Deterministic PRNG using a simple LCG
 * @param {number} seed 
 */
function seededRandom(seed) {
    let m = 0x80000000; // 2^31
    let a = 1103515245;
    let c = 12345;
    let state = seed;
    
    return function() {
        state = (a * state + c) % m;
        return state / m; // Normalized float between 0 and 1
    }
}

/**
 * Generates a seed based on the current date (YYYYMMDD)
 */
function getDailySeed() {
    const today = new Date();
    const dateString = today.getFullYear().toString() + 
                       (today.getMonth() + 1).toString().padStart(2, '0') + 
                       today.getDate().toString().padStart(2, '0');
    
    let seed = 0;
    for (let i = 0; i < dateString.length; i++) {
        seed = (seed * 31 + dateString.charCodeAt(i)) % 1000000007;
    }
    return seed;
}

// --- B. Core Game Logic ---

/**
 * Selects the target Pokémon deterministically based on the date.
 */
function selectDailyPokemon(data) {
    const seed = getDailySeed();
    const rng = seededRandom(seed);
    const randomIndex = Math.floor(rng() * data.length); 
    
    return data[randomIndex];
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
    const summaryText = `🎉 Poké-Guesser Solved! (${new Date().toLocaleDateString()})\n` +
                        `Guesses: ${guessCount}\n` +
                        `History: ${historyEmojis}\n\n` +
                        `#PokemonGuesser`;

    const messageEl = document.getElementById('message');
    
    // 1. Set the victory message content
    messageEl.className = 'correct-guess';
    messageEl.innerHTML = `
        <h2>CONGRATULATIONS!</h2>
        <p>You correctly identified ${targetPokemon.name} in ${guessCount} guesses!</p>
        <textarea id="share-summary" rows="5" readonly>${summaryText}</textarea>
        <button onclick="navigator.clipboard.writeText(document.getElementById('share-summary').value)">Copy Summary</button>
    `;

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
    if (!targetPokemon) return; // Safety check

    const statValuesEl = document.getElementById('stat-values');
    
    // Calculate total for display
    const total = STATS.reduce((sum, stat) => sum + parseInt(targetPokemon[stat]), 0);
    
    let html = STATS.map(stat => `
        <tr>
            <td>${stat.toUpperCase().replace('_', '. ')}</td>
            <td>${targetPokemon[stat]}</td>
        </tr>
    `).join('');
    
    // Add the Total stat
    html += `
        <tr style="font-weight: bold; border-top: 2px solid #333;">
            <td>TOTAL</td>
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
    saveGameState();
}

/**
 * Populates the datalist for auto-completion.
 */
function populateDatalist() {
    const datalist = document.getElementById('pokemon-list');
    datalist.innerHTML = pokemonData
        .map(p => `<option value="${p.name}">`)
        .join('');
}

// --- E. Initialization ---

async function initializeGame() {
    try {
        const response = await fetch('pokemon_data.json');
        pokemonData = await response.json();
    } catch (error) {
        console.error("Error loading Pokémon data:", error);
        document.getElementById('message').textContent = "Error loading Pokémon data. Make sure 'pokemon_data.json' exists.";
        return;
    }

    targetPokemon = selectDailyPokemon(pokemonData);
    
    // Load state and then render everything
    loadGameState();
    renderTargetStats();
    renderHints();
    renderGuessHistory();
    populateDatalist();

    // Setup Event Listeners
    document.getElementById('submit-guess-btn').addEventListener('click', handleSubmitGuess);
    document.getElementById('pokemon-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSubmitGuess();
    });

    document.getElementById('hint-type1-btn').addEventListener('click', () => handleHintClick('type1'));
    document.getElementById('hint-type2-btn').addEventListener('click', () => handleHintClick('type2'));
    document.getElementById('hint-gen-btn').addEventListener('click', () => handleHintClick('generation'));
}

// Start the game!
initializeGame();