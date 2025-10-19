const STATS = ['hp', 'attack', 'defense', 'sp_attack', 'sp_defense', 'speed'];
const HINTS = ['type1', 'type2', 'generation'];

let pokemonData = [];
let targetPokemon = null;
let guesses = [];
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
    headerRow.innerHTML = `<div class="guess-cell">Name</div>` + 
                          STATS.map(s => `<div class="guess-cell">${s.toUpperCase().replace('_', '. ')}</div>`).join('') +
                          `<div class="guess-cell">Metadata</div>`;
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

        // 3. Metadata Feedback
        let metaFeedback = [];
        if (guess.pokemon.type1 === targetPokemon.type1) metaFeedback.push(`T1: ${guess.pokemon.type1}`);
        if (guess.pokemon.type2 === targetPokemon.type2) metaFeedback.push(`T2: ${guess.pokemon.type2}`);
        if (guess.pokemon.generation === targetPokemon.generation) metaFeedback.push(`Gen: ${guess.pokemon.generation}`);
        
        row.innerHTML += `<div class="guess-cell">${metaFeedback.join(', ') || '-'}</div>`;

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
        gameWon: gameWon
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
        if (gameWon) {
            document.getElementById('message').className = 'correct-guess';
            document.getElementById('message').textContent = `Correct! It was ${targetPokemon.name}!`;
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
            gameWon = true;
            document.getElementById('submit-guess-btn').disabled = true;

            const guessCount = guesses.length;
            const hintsUsedList = HINTS.filter(h => hintsUsed[h]).map(h => h.charAt(0).toUpperCase()); // T1, T2, G

            const summaryText = `🎉 Poké-Stats Guesser Solved! (${new Date().toLocaleDateString()})\n` +
                                `Guesses: ${guessCount}\n` +
                                `Hints Used: ${hintsUsedList.join(', ') || 'None'}\n\n` +
                                `https://arung54.github.io/Poke-Guesser/`;

            const messageEl = document.getElementById('message');
            
            // Victory message above all guesses
            messageEl.className = 'correct-guess';
            messageEl.innerHTML = `
                <h2>CONGRATULATIONS!</h2>
                <p>You correctly identified ${targetPokemon.name} in ${guessCount} guesses!</p>
                <textarea id="share-summary" rows="5" readonly>${summaryText}</textarea>
                <button onclick="navigator.clipboard.writeText(document.getElementById('share-summary').value)">Copy Summary</button>
            `;

            // Since the victory message now provides the name, we don't need to show the full name
            // inside the guess history, but we keep the history to show the path.
        }

        // 3. Update UI and State
        inputEl.value = '';
        renderGuessHistory();
        renderHints(); // Update hint button state
        saveGameState();
    }

function handleHintClick(hintType) {
    if (gameWon || hintsUsed[hintType]) return;

    if (hintType === 'type2' && !targetPokemon.type2) {
        document.getElementById('message').textContent = 'This Pokémon only has one type!';
        return;
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