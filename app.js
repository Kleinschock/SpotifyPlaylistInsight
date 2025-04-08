// --- Configuration ---
const CLIENT_ID = '732dc1eab09c4120945541da8f197de8'; // Your Spotify Client ID
const REDIRECT_URI = window.location.origin + window.location.pathname;
const LASTFM_API_KEY = '0d01968c9827680d5686e7bb324fc8e8'; // Your Last.fm API Key
const LASTFM_API_BASE_URL = 'https://ws.audioscrobbler.com/2.0/';
const LASTFM_API_DELAY = 210; // Milliseconds between Last.fm calls (approx 5/sec limit)

// --- State Variables ---
let spotifyAccessToken = null;
let currentPlaylistData = null;
let activeGenreSource = 'spotify'; // 'spotify' or 'lastfm'
let activeTrackGenreSource = 'spotify'; // 'spotify', 'lastfm', or 'both'
let currentGenreFilter = null;
let chartInstances = {}; // Store chart instances { pie, bar, year, artists }
let lastFmApiCallTimestamp = 0; // For rate limiting

// --- DOM Elements ---
const loginButton = document.getElementById('login-button');
const analyzeButton = document.getElementById('analyze-button');
const playlistInput = document.getElementById('playlist-input');
const loginContainer = document.getElementById('login-container');
const instructionsSection = document.getElementById('instructions');
const playlistContainer = document.getElementById('playlist-container');
const resultsContainer = document.getElementById('results-container');
const initialLoadingOverlay = document.getElementById('initial-loading-overlay'); // Initial load
const loadingOverlay = document.getElementById('loading-overlay'); // Generic overlay (currently unused, but keep if needed)
const loadingMessage = document.getElementById('loading-message'); // For generic overlay message
const resultsSkeletonLoader = document.getElementById('results-skeleton-loader');
const resultsActualContent = document.getElementById('results-actual-content');
const playlistInfoDiv = document.getElementById('playlist-info');
const trackGenresListDiv = document.getElementById('track-genres-list');
const apiErrorDiv = document.getElementById('api-error');
const genreSourceButtons = document.querySelectorAll('.toggle-button[data-source]');
const trackGenreSourceRadios = document.querySelectorAll('input[name="trackGenreSource"]');
const similarArtistsButtonsContainer = document.getElementById('similar-artists-buttons');
const similarArtistsResultsPanel = document.getElementById('similar-artists-results');
const similarArtistsListDiv = document.getElementById('similar-artists-list');
const selectedArtistSpan = document.getElementById('selected-artist-similar');
const genreRadioButtonsContainer = document.getElementById('genre-radio-buttons');
const genreRadioResultsPanel = document.getElementById('genre-radio-results');
const genreRadioListDiv = document.getElementById('genre-radio-list');
const selectedGenreRadioSpan = document.getElementById('selected-genre-radio');
const pieChartTitle = document.getElementById('genre-pie-chart-title');
const barChartTitle = document.getElementById('genre-bar-chart-title');
const filterNoticeContainer = document.getElementById('filter-notice-container');
// Stat elements
const totalTracksEl = document.getElementById('total-tracks');
const totalDurationEl = document.getElementById('total-duration');
const uniqueArtistsEl = document.getElementById('unique-artists');
const uniqueGenresEl = document.getElementById('unique-genres');
const topArtistsListContainer = document.getElementById('top-artists-list');
const topArtistCountEl = document.getElementById('top-artist-count'); // Added span for count


// --- UI & Utilities ---

/**
 * Replaces elements with data-feather attributes with SVG icons.
 */
function replaceFeatherIcons() {
    if (typeof feather !== 'undefined') {
        try {
            feather.replace();
            // console.log("Feather icons replaced.");
        } catch (e) {
            console.error("Feather icons script error during replacement:", e);
        }
    } else {
        // console.warn("Feather icons script not loaded.");
    }
}

/**
 * Sets up Intersection Observer to add 'is-visible' class for animations.
 */
function setupIntersectionObserver() {
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.1 // Adjust threshold as needed
    };

    const observerCallback = (entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                observer.unobserve(entry.target);
            }
        });
    };

    const observer = new IntersectionObserver(observerCallback, observerOptions);
    const targets = document.querySelectorAll('.animate-on-scroll');
    targets.forEach(target => {
        // Reset animation state if needed (e.g., if re-analyzing)
        target.classList.remove('is-visible');
        observer.observe(target);
    });
    // console.log(`Intersection Observer watching ${targets.length} elements.`);
}

/**
 * Shows/hides the skeleton loader and actual content area.
 * @param {boolean} show - True to show skeleton, false to show actual content.
 */
function showSkeletonLoader(show) {
    if (!resultsSkeletonLoader || !resultsActualContent) return;

    if (show) {
        resultsSkeletonLoader.classList.remove('hidden');
        resultsActualContent.classList.add('hidden');
        // Ensure results container is visible to show the skeleton
        resultsContainer.classList.remove('hidden');
    } else {
        resultsSkeletonLoader.classList.add('hidden');
        resultsActualContent.classList.remove('hidden');
        // Trigger animations/icons AFTER content is visible and skeleton hidden
        setTimeout(() => {
             replaceFeatherIcons();
             setupIntersectionObserver();
         }, 50);
    }
}

/**
 * Updates the copyright year in the footer.
 */
function updateFooterYear() {
    const yearEl = document.getElementById('current-year');
    if (yearEl) {
        yearEl.textContent = new Date().getFullYear();
    }
}

/**
 * Shows a generic loading overlay (used for background tasks).
 * @param {boolean} show
 * @param {string} message
 */
function showLoading(show, message = "Processing...") {
    // This overlay is now primarily for short background tasks AFTER initial load
    // The main analysis uses the skeleton loader.
    if (loadingOverlay && loadingMessage) {
        if (show) {
            loadingMessage.textContent = message;
            loadingOverlay.classList.remove('hidden');
            console.log("Loading:", message);
        } else {
            loadingOverlay.classList.add('hidden');
        }
    }
}

/**
 * Displays an error or warning message.
 * @param {string} message - The message to display.
 * @param {boolean} [isWarning=false] - If true, styles as a warning.
 */
function showError(message, isWarning = false) {
    apiErrorDiv.textContent = message;
    apiErrorDiv.className = isWarning ? 'error-message warning' : 'error-message error';
    apiErrorDiv.classList.remove('hidden');
}

/**
 * Clears any currently displayed error message.
 */
function clearError() {
     apiErrorDiv.classList.add('hidden');
     apiErrorDiv.textContent = '';
}

/**
 * Debounce function to limit execution frequency.
 * @param {Function} func - The function to debounce.
 * @param {number} wait - Debounce delay in milliseconds.
 * @returns {Function} Debounced function.
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Generates a random string for state parameter.
 * @param {number} length
 * @returns {string}
 */
function generateRandomString(length) {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let text = '';
    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

// --- Spotify Authentication ---

/**
 * Handles the authentication flow, checking URL, storage, and expiry.
 */
function handleAuthentication() {
    const tokenFromStorage = sessionStorage.getItem('spotify_access_token');
    const expiryTime = sessionStorage.getItem('spotify_token_expiry');
    const tokenFromUrl = getAccessTokenFromUrl();

    if (tokenFromUrl) {
        spotifyAccessToken = tokenFromUrl.token;
        const expires_in = tokenFromUrl.expires_in;
        sessionStorage.setItem('spotify_access_token', spotifyAccessToken);
        sessionStorage.setItem('spotify_token_expiry', Date.now() + expires_in * 1000);
        console.log("Spotify Access Token obtained and stored.");
        history.pushState("", document.title, window.location.pathname + window.location.search);
    } else if (tokenFromStorage && expiryTime && Date.now() < expiryTime) {
        spotifyAccessToken = tokenFromStorage;
        console.log("Using stored Spotify Access Token.");
    } else {
        sessionStorage.removeItem('spotify_access_token');
        sessionStorage.removeItem('spotify_token_expiry');
        spotifyAccessToken = null;
        console.log("No valid Spotify token found.");
    }

    updateLoginState();

    // Hide the very initial loading overlay once auth check is complete
    if(initialLoadingOverlay) initialLoadingOverlay.classList.add('hidden');
}

/**
 * Updates the UI based on the current login status.
 */
function updateLoginState() {
     if (spotifyAccessToken) {
        loginContainer.classList.add('hidden');
        playlistContainer.classList.remove('hidden');
        instructionsSection.classList.remove('hidden');
        // Setup observer for initially visible elements if logged in and content is ready
        setTimeout(setupIntersectionObserver, 50);
    } else {
        loginContainer.classList.remove('hidden');
        playlistContainer.classList.add('hidden');
        instructionsSection.classList.remove('hidden');
        resultsContainer.classList.add('hidden');
    }
}

/**
 * Redirects the user to the Spotify login page.
 */
function redirectToSpotifyLogin() {
    const scope = 'playlist-read-private playlist-read-collaborative';
    const state = generateRandomString(16);
    sessionStorage.setItem('spotify_auth_state', state);

    const authUrl = new URL("https://accounts.spotify.com/authorize");
    authUrl.searchParams.append('client_id', CLIENT_ID);
    authUrl.searchParams.append('response_type', 'token');
    authUrl.searchParams.append('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.append('scope', scope);
    authUrl.searchParams.append('state', state);

    window.location.href = authUrl.toString();
}

/**
 * Parses the access token and state from the URL hash.
 * @returns {object|null} Token and expiry info, or null if invalid.
 */
function getAccessTokenFromUrl() {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const token = params.get('access_token');
    const state = params.get('state');
    const storedState = sessionStorage.getItem('spotify_auth_state');
    const expires_in = params.get('expires_in');

    if (token && state && state === storedState && expires_in) {
        sessionStorage.removeItem('spotify_auth_state');
        return { token, expires_in: parseInt(expires_in, 10) };
    }
    return null;
}

/**
 * Logs the user out by clearing stored token info.
 */
function logout() {
    spotifyAccessToken = null;
    sessionStorage.removeItem('spotify_access_token');
    sessionStorage.removeItem('spotify_token_expiry');
    updateLoginState();
    console.log("User logged out.");
}

// --- API Fetching ---

/**
 * Fetches data from the Spotify Web API.
 * @param {string} endpoint - API endpoint (e.g., 'playlists/...')
 * @param {string} [method='GET'] - HTTP method.
 * @param {object|null} [body=null] - Request body for POST/PUT.
 * @returns {Promise<object|null>} API response data or null on error.
 */
async function fetchSpotifyAPI(endpoint, method = 'GET', body = null) {
    if (!spotifyAccessToken) {
        console.error('Spotify Access Token missing!');
        showError("Spotify authentication required or token expired. Please re-login.");
        logout();
        return null;
    }
    const url = `https://api.spotify.com/v1/${endpoint}`;
    try {
        const response = await fetch(url, {
            method: method,
            headers: { 'Authorization': `Bearer ${spotifyAccessToken}`, 'Content-Type': 'application/json' },
            body: body ? JSON.stringify(body) : null
        });

        if (response.status === 401) {
             console.error('Spotify API Error 401: Unauthorized.');
             showError("Spotify session expired. Please login again.");
             logout();
             return null;
        }
        if (response.status === 429) {
             console.warn('Spotify API Error 429: Rate limit hit. Waiting...');
             showError("Spotify rate limit hit. Please wait a moment and try again.", true); // Show as warning
             await new Promise(resolve => setTimeout(resolve, response.headers.get('Retry-After') * 1000 || 5000)); // Use Retry-After header if available
             return fetchSpotifyAPI(endpoint, method, body); // Retry
        }

        // Try to parse JSON regardless of status code, as errors often contain info
        const responseData = await response.json();

        if (!response.ok) {
            console.error(`Spotify API Error ${response.status}:`, responseData);
            showError(`Spotify API Error: ${responseData.error?.message || response.statusText}`);
            return null;
        }
        return responseData;
    } catch (error) {
        console.error('Network error fetching Spotify API:', error);
        showError("Network error connecting to Spotify. Please check your connection.");
        return null;
    }
}

/**
 * Simple rate limiter for Last.fm API calls.
 * @returns {Promise<void>}
 */
async function lastFmRateLimiter() {
    const now = Date.now();
    const timeSinceLastCall = now - lastFmApiCallTimestamp;
    if (timeSinceLastCall < LASTFM_API_DELAY) {
        const delay = LASTFM_API_DELAY - timeSinceLastCall;
        await new Promise(resolve => setTimeout(resolve, delay));
    }
    lastFmApiCallTimestamp = Date.now();
}

/**
 * Fetches data from the Last.fm API.
 * @param {object} params - API method parameters.
 * @returns {Promise<object|null>} API response data or null on error.
 */
async function fetchLastFmAPI(params) {
    params.api_key = LASTFM_API_KEY;
    params.format = 'json';
    const queryString = new URLSearchParams(params).toString();
    const url = `${LASTFM_API_BASE_URL}?${queryString}`;

    await lastFmRateLimiter(); // Apply rate limiting

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (!response.ok || data.error) {
            const errorCode = data.error || response.status;
            const errorMsg = data.message || response.statusText || 'Unknown Last.fm error';
            console.error(`Last.fm API Error ${errorCode}: ${errorMsg}`, params);
            // Avoid showing common "not found" errors directly to user unless debugging
            // if (errorCode !== 6 && errorCode !== 8) { // 6=NotFound, 8=OperationFailed (e.g., bad API key)
            //      showError(`Last.fm API Error: ${errorMsg}`);
            // }
            return null;
        }
        return data;
    } catch (error) {
        console.error('Network error fetching Last.fm API:', error);
        showError("Network error connecting to Last.fm. Please check your connection.");
        return null;
    }
}

// --- Data Processing ---

/**
 * Extracts Spotify Playlist ID from various input formats.
 * @param {string} input - User input (URL, URI, or ID).
 * @returns {string|null} Playlist ID or null if invalid.
 */
function extractPlaylistId(input) {
    try {
        if (input.includes('open.spotify.com/playlist/')) {
            const url = new URL(input);
            const pathParts = url.pathname.split('/');
            const idIndex = pathParts.indexOf('playlist');
            if (idIndex !== -1 && pathParts.length > idIndex + 1) {
                return pathParts[idIndex + 1].split('?')[0];
            }
        }
        else if (input.startsWith('spotify:playlist:')) {
             return input.split(':')[2];
        }
        else if (/^[a-zA-Z0-9]{22}$/.test(input)) {
            return input;
        }
    } catch (e) { console.error("Error parsing playlist input:", e); }
    return null;
}

/**
 * Fetches all tracks from a Spotify playlist, handling pagination.
 * @param {string} playlistId
 * @returns {Promise<Array|null>} Array of track items or null on error.
 */
async function getPlaylistTracks(playlistId) {
    let tracks = [];
    let url = `playlists/${playlistId}/tracks?fields=items(track(id,name,duration_ms,explicit,external_urls(spotify),artists(id,name),album(id,name,release_date,release_date_precision,images))),next&limit=50`;
    let trackCount = 0;
    const maxTracks = 1000; // Safety limit

    showLoading(true, "Fetching playlist tracks...");

    while (url && trackCount < maxTracks) {
        const data = await fetchSpotifyAPI(url);
        if (!data || !data.items) {
             showError("Failed to fetch playlist tracks page from Spotify.");
             // Return tracks fetched so far? Or null? Decide based on desired behavior.
             return tracks.length > 0 ? tracks : null;
        }
        const validItems = data.items.filter(item => item?.track?.id);
        tracks = tracks.concat(validItems);
        trackCount = tracks.length;
        showLoading(true, `Fetched ${trackCount} tracks...`);
        url = data.next ? data.next.replace('https://api.spotify.com/v1/', '') : null;
        if(url) await new Promise(resolve => setTimeout(resolve, 50)); // Small delay
    }

    if (trackCount >= maxTracks) {
        console.warn(`Reached track limit of ${maxTracks}.`);
        showError(`Analyzed the first ${maxTracks} tracks. Playlist may be larger.`, true);
    }
    console.log(`Fetched a total of ${trackCount} valid tracks.`);
    return tracks;
}

/**
 * Fetches details (genres, images) for a list of artist IDs from Spotify and Last.fm tags.
 * @param {Array<string>} artistIds
 * @returns {Promise<object|null>} Object mapping artist ID to details, or null.
 */
async function getArtistDetailsAndGenres(artistIds) {
    const uniqueArtistIds = [...new Set(artistIds)];
    const artistDetails = {};
    const batchSize = 50;
    const totalArtists = uniqueArtistIds.length;

    showLoading(true, `Fetching details for ${totalArtists} artists (Spotify)...`);
    for (let i = 0; i < totalArtists; i += batchSize) {
        const batchIds = uniqueArtistIds.slice(i, i + batchSize);
        const data = await fetchSpotifyAPI(`artists?ids=${batchIds.join(',')}`);
        if (data?.artists) {
            data.artists.forEach(artist => {
                if (artist) {
                    artistDetails[artist.id] = {
                        name: artist.name,
                        spotifyGenres: artist.genres || [],
                        imageUrl: artist.images?.length ? artist.images[1]?.url || artist.images[0]?.url : null,
                        lastFmTags: [],
                        spotifyUrl: artist.external_urls?.spotify
                    };
                }
            });
        }
        showLoading(true, `Fetched Spotify details for ${Math.min(i + batchSize, totalArtists)}/${totalArtists} artists...`);
        if (i + batchSize < totalArtists) await new Promise(resolve => setTimeout(resolve, 50));
    }

    showLoading(true, `Fetching tags from Last.fm for ${totalArtists} artists...`);
    let lastfmFetchedCount = 0;
    for (const artistId of uniqueArtistIds) {
         if (!artistDetails[artistId]) { lastfmFetchedCount++; continue; }
        const artistName = artistDetails[artistId].name;
        const params = { method: 'artist.gettoptags', artist: artistName, autocorrect: 1 };
        const lastfmData = await fetchLastFmAPI(params); // Uses rate limiter

        if (lastfmData?.toptags?.tag) {
             const tags = Array.isArray(lastfmData.toptags.tag) ? lastfmData.toptags.tag : [lastfmData.toptags.tag];
             artistDetails[artistId].lastFmTags = tags.slice(0, 10).map(tag => tag.name.toLowerCase().trim()).filter(Boolean);
        }
        lastfmFetchedCount++;
         if (lastfmFetchedCount % 20 === 0 || lastfmFetchedCount === totalArtists) {
            showLoading(true, `Fetched Last.fm tags for ${lastfmFetchedCount}/${totalArtists} artists...`);
         }
    }
    console.log("Finished fetching artist details and tags.");
    return artistDetails;
}

/**
 * Processes raw playlist data into a structured format for display.
 * @param {object} playlistInfo - Basic playlist metadata.
 * @param {Array} tracks - Raw track items from Spotify API.
 * @param {object} artistDetails - Fetched artist details.
 * @returns {object} Structured playlist data.
 */
function processPlaylistData(playlistInfo, tracks, artistDetails) {
    const processedTracks = tracks.map(item => {
        const track = item.track;
        if (!track || !track.artists?.length) return null;

        let trackSpotifyGenres = new Set();
        let trackLastFmTags = new Set();
        track.artists.forEach(a => {
            const details = artistDetails[a.id];
            if (details) {
                details.spotifyGenres.forEach(g => trackSpotifyGenres.add(g.toLowerCase().trim()));
                details.lastFmTags.forEach(t => trackLastFmTags.add(t.toLowerCase().trim()));
            }
        });
         const primaryArtistDetails = artistDetails[track.artists[0].id];

        return {
            id: track.id, title: track.name, artist: track.artists.map(a => a.name).join(', '),
            primaryArtistName: primaryArtistDetails?.name || track.artists[0].name, album: track.album.name,
            imageUrl: track.album.images?.length ? track.album.images[1]?.url || track.album.images[0]?.url : null,
            spotifyUrl: track.external_urls?.spotify,
            releaseYear: track.album.release_date ? parseInt(track.album.release_date.substring(0, 4)) : null,
            durationMs: track.duration_ms, explicit: track.explicit,
            spotifyGenres: [...trackSpotifyGenres].filter(Boolean).sort(),
            lastFmTags: [...trackLastFmTags].filter(Boolean).sort()
        };
    }).filter(Boolean);

    const totalDurationMs = processedTracks.reduce((sum, track) => sum + (track.durationMs || 0), 0);
    const totalMinutes = Math.floor(totalDurationMs / 60000);
    const totalSeconds = Math.floor((totalDurationMs % 60000) / 1000).toString().padStart(2, '0');
    const uniqueArtistNames = new Set(processedTracks.map(t => t.primaryArtistName));

    return {
        id: playlistInfo.id, name: playlistInfo.name,
        description: playlistInfo.description?.replace(/<[^>]*>?/gm, ''), // Basic sanitize
        imageUrl: playlistInfo.images?.length ? playlistInfo.images[0].url : null,
        owner: playlistInfo.owner.display_name, spotifyUrl: playlistInfo.external_urls.spotify,
        tracks: processedTracks,
        stats: {
            totalTracks: processedTracks.length,
            totalDurationFormatted: `${totalMinutes}m ${totalSeconds}s`,
            uniqueArtists: uniqueArtistNames.size
        },
        artistDetails: artistDetails
    };
}

// --- UI Display ---

/**
 * Displays the main playlist header information.
 * @param {object} playlistData
 */
function displayPlaylistInfo(playlistData) {
    playlistInfoDiv.innerHTML = `
        <img src="${playlistData.imageUrl || 'placeholder.png'}" alt="${playlistData.name} cover art" loading="lazy">
        <div class="playlist-details">
            <h3>${playlistData.name}</h3>
            <p>By ${playlistData.owner}</p>
            ${playlistData.description ? `<p class="description">${playlistData.description}</p>` : ''}
            <p><a href="${playlistData.spotifyUrl}" target="_blank" rel="noopener noreferrer" class="button-primary small">
                <span data-feather="external-link" class="icon button-icon"></span>View on Spotify
            </a></p>
        </div>
    `;
    totalTracksEl.textContent = playlistData.stats.totalTracks;
    totalDurationEl.textContent = playlistData.stats.totalDurationFormatted;
    uniqueArtistsEl.textContent = playlistData.stats.uniqueArtists;
}

/**
 * Calculates genre counts for the active source and updates the stat card.
 * @param {Array} tracks
 * @param {string} source - 'spotify' or 'lastfm'.
 * @returns {Array} Sorted array of { genre, count }.
 */
function getGenreCounts(tracks, source = 'spotify') {
    const genreCounts = {};
    const key = source === 'lastfm' ? 'lastFmTags' : 'spotifyGenres';
    tracks.forEach(track => {
        track[key]?.forEach(genre => {
            if (genre) { genreCounts[genre] = (genreCounts[genre] || 0) + 1; }
        });
    });
    const sortedGenres = Object.entries(genreCounts)
        .map(([genre, count]) => ({ genre, count }))
        .sort((a, b) => b.count - a.count);
    uniqueGenresEl.textContent = sortedGenres.length; // Update stat card
    return sortedGenres;
}

// --- Chart Rendering ---

/**
 * Creates or updates a Chart.js instance.
 * @param {string} chartId - Canvas element ID.
 * @param {string} chartType - Chart type (e.g., 'pie', 'bar').
 * @param {object} data - Chart.js data object.
 * @param {object} options - Chart.js options object.
 * @param {string} instanceKey - Key to store the instance in chartInstances.
 */
function createOrUpdateChart(chartId, chartType, data, options, instanceKey) {
    const ctx = document.getElementById(chartId)?.getContext('2d');
    if (!ctx) { console.error(`Canvas element with ID '${chartId}' not found.`); return; }
    if (chartInstances[instanceKey]) { chartInstances[instanceKey].destroy(); }
    try {
        chartInstances[instanceKey] = new Chart(ctx, { type: chartType, data, options });
    } catch(e) { console.error(`Error creating chart '${instanceKey}':`, e); showError(`Could not render the ${instanceKey} chart.`); }
}

/**
 * Debounced function to update the genre pie and bar charts.
 */
const debouncedUpdateCharts = debounce((genreData) => {
    const sourceName = activeGenreSource === 'lastfm' ? 'Last.fm Tags' : 'Spotify Genres';
    if (!genreData || genreData.length === 0) {
        if (chartInstances.pie) chartInstances.pie.destroy();
        if (chartInstances.bar) chartInstances.bar.destroy();
        pieChartTitle.textContent = `Genre Distribution (${sourceName} - No Data)`;
        barChartTitle.textContent = `Top Genres (${sourceName} - No Data)`;
        populateGenreRadioButtons([]); // Clear radio buttons
        return;
    }
    const topN = 15;
    const topGenres = genreData.slice(0, topN);
    const labels = topGenres.map(g => g.genre);
    const counts = topGenres.map(g => g.count);
    const backgroundColors = generateConsistentColors(labels);

    const pieData = { labels, datasets: [{ data: counts, backgroundColor: backgroundColors, borderColor: '#ffffff', borderWidth: 1 }] };
    const pieOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels:{ boxWidth: 12, padding: 8, font: { size: 11 } } }, tooltip: { callbacks: { label: (c) => `${c.label}: ${c.raw}` } } }, onClick: (e, el) => handleChartClick(e, el, labels) };
    createOrUpdateChart('genre-pie-chart', 'pie', pieData, pieOptions, 'pie');
    pieChartTitle.textContent = `Genre Distribution (${sourceName})`;

    const barData = { labels, datasets: [{ label: 'Track Count', data: counts, backgroundColor: backgroundColors, borderWidth: 0 }] };
    const barOptions = { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.raw} tracks` } } }, scales: { x: { beginAtZero: true, grid: { display: false } }, y: { grid: { display: false } } }, onClick: (e, el) => handleChartClick(e, el, labels) };
    createOrUpdateChart('genre-bar-chart', 'bar', barData, barOptions, 'bar');
    barChartTitle.textContent = `Top Genres (${sourceName})`;

    populateGenreRadioButtons(genreData.slice(0, 12));
}, 250);

/**
 * Handles clicks on chart segments/bars to filter tracks.
 * @param {Event} event
 * @param {Array} elements - Clicked chart elements.
 * @param {Array<string>} labels - Chart labels corresponding to elements.
 */
function handleChartClick(event, elements, labels) {
     if (elements.length > 0) {
        try {
             const genre = labels[elements[0].index];
             if (genre) { filterTracksByGenre(genre); }
        } catch (e) { console.error("Error handling chart click:", e); }
     }
}

/**
 * Creates or updates the release year line chart.
 * @param {Array} tracks
 */
function createReleaseYearChart(tracks) {
     if (!tracks || tracks.length === 0) return;
     const yearCounts = {};
     let minYear = Infinity, maxYear = -Infinity;
     tracks.forEach(track => {
         if (track.releaseYear && track.releaseYear > 1900 && track.releaseYear <= new Date().getFullYear() + 1) { // Basic validation
             yearCounts[track.releaseYear] = (yearCounts[track.releaseYear] || 0) + 1;
             minYear = Math.min(minYear, track.releaseYear);
             maxYear = Math.max(maxYear, track.releaseYear);
         }
     });
     if (Object.keys(yearCounts).length === 0) { console.log("No valid release year data for chart."); return; }

     const labels = []; const data = [];
     for (let year = minYear; year <= maxYear; year++) { labels.push(year.toString()); data.push(yearCounts[year] || 0); }

     const chartData = { labels, datasets: [{ label: 'Tracks Released', data, borderColor: 'rgba(79, 70, 229, 0.8)', backgroundColor: 'rgba(79, 70, 229, 0.1)', fill: true, tension: 0.3, pointRadius: 2, pointHoverRadius: 5 }] }; // Using secondary accent color
     const chartOptions = { responsive: true, maintainAspectRatio: false, scales: { x: { title: { display: false }, grid: { display: false } }, y: { beginAtZero: true, title: { display: false }, grid: { color: '#eee' } } }, plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } } };
     createOrUpdateChart('release-year-chart', 'line', chartData, chartOptions, 'year');
}

/**
 * Displays the top artists doughnut chart and list.
 * @param {Array} tracks
 * @param {object} artistDetails
 */
function displayTopArtists(tracks, artistDetails) {
    if (!tracks || tracks.length === 0 || !artistDetails) { topArtistsListContainer.innerHTML = '<p>No artist data.</p>'; return; }
    const artistCounts = {};
    tracks.forEach(track => { if (track.primaryArtistName) { artistCounts[track.primaryArtistName] = (artistCounts[track.primaryArtistName] || 0) + 1; } });
    const sortedArtists = Object.entries(artistCounts)
        .map(([name, count]) => ({ name, count, details: Object.values(artistDetails).find(d => d.name === name) }))
        .sort((a, b) => b.count - a.count);

    const topN = 10;
    const topArtists = sortedArtists.slice(0, topN);
    if (topArtistCountEl) topArtistCountEl.textContent = topArtists.length; // Update count in header

    // Chart
    const chartLabels = topArtists.map(a => a.name);
    const chartData = topArtists.map(a => a.count);
    const chartColors = generateConsistentColors(chartLabels);
    const doughnutData = { labels: chartLabels, datasets: [{ label: 'Appearances', data: chartData, backgroundColor: chartColors, borderColor: '#ffffff', borderWidth: 2 }] };
    const doughnutOptions = { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.label}: ${c.raw} tracks` } } } };
    createOrUpdateChart('top-artists-chart', 'doughnut', doughnutData, doughnutOptions, 'artists');

    // List
    topArtistsListContainer.innerHTML = '';
    if (topArtists.length === 0) { topArtistsListContainer.innerHTML = '<p class="small-text">No top artists found.</p>'; return; }
    topArtists.forEach(artist => {
        const card = document.createElement('div');
        card.className = 'artist-card';
        const imageUrl = artist.details?.imageUrl;
        const spotifyUrl = artist.details?.spotifyUrl;
        card.innerHTML = `
            <img src="${imageUrl || 'placeholder.png'}" alt="${artist.name}" loading="lazy" class="${imageUrl ? '' : 'artist-placeholder'}">
            <div class="artist-info">
                <h4>${spotifyUrl ? `<a href="${spotifyUrl}" target="_blank" rel="noopener noreferrer" title="View ${artist.name} on Spotify">${artist.name}</a>` : artist.name}</h4>
                <p>${artist.count} track${artist.count !== 1 ? 's' : ''}</p>
            </div>
        `;
        topArtistsListContainer.appendChild(card);
    });

    populateSimilarArtistButtons(topArtists);
}

// --- Track List Rendering ---

/**
 * Displays the list of tracks, optionally filtered by genre.
 * @param {Array} tracks
 * @param {string|null} filterGenre
 * @param {string} genreSourceToShow - 'spotify', 'lastfm', or 'both'.
 */
function displayTrackList(tracks, filterGenre = null, genreSourceToShow = 'spotify') {
    trackGenresListDiv.innerHTML = '';
    filterNoticeContainer.innerHTML = '';

    if (filterGenre) {
        const noticeDiv = document.createElement('div');
        noticeDiv.className = 'filter-notice';
        noticeDiv.innerHTML = `
            <span><span data-feather="filter" class="icon"></span> Filtered by: <strong>${filterGenre}</strong></span>
            <button id="clear-filter-btn" class="clear-filter-button">Clear</button>
        `;
        filterNoticeContainer.appendChild(noticeDiv);
        document.getElementById('clear-filter-btn').addEventListener('click', () => filterTracksByGenre(null));
        replaceFeatherIcons(); // Replace icon in notice
    }

    const filteredTracks = filterGenre
        ? tracks.filter(track => new Set([...(track.spotifyGenres || []), ...(track.lastFmTags || [])]).has(filterGenre))
        : tracks;

    if (filteredTracks.length === 0) {
        trackGenresListDiv.innerHTML = `<p class="small-text centered-section">No tracks found${filterGenre ? ` matching the filter "${filterGenre}"` : ''}.</p>`;
        return;
    }

    const fragment = document.createDocumentFragment();
    filteredTracks.forEach(track => {
        const trackCard = document.createElement('div');
        trackCard.className = 'track-card animate-on-scroll'; // Add animation class here too

        const genresToShow = new Set();
        if (genreSourceToShow === 'spotify' || genreSourceToShow === 'both') { track.spotifyGenres?.forEach(g => genresToShow.add({ genre: g, source: 'spotify' })); }
        if (genreSourceToShow === 'lastfm' || genreSourceToShow === 'both') { track.lastFmTags?.forEach(g => genresToShow.add({ genre: g, source: 'lastfm' })); }
        const sortedGenres = [...genresToShow].sort((a, b) => a.genre.localeCompare(b.genre));
        const genresHtml = sortedGenres.map(item =>
            `<span class="track-genre genre-${item.source}" data-genre="${item.genre}" title="Filter by ${item.genre}">${item.genre}</span>`
        ).join('');

        trackCard.innerHTML = `
            <img src="${track.imageUrl || 'placeholder.png'}" alt="${track.album}" loading="lazy">
            <div class="track-info">
                <div class="track-title" title="${track.title}${track.explicit ? ' (Explicit)' : ''}">${track.title}${track.explicit ? ' <span class="explicit-tag" title="Explicit">E</span>' : ''}</div>
                <div class="track-artist">${track.artist}</div>
                <div class="track-album">${track.album} (${track.releaseYear || '?'})</div>
                ${track.spotifyUrl ? `<a href="${track.spotifyUrl}" target="_blank" rel="noopener noreferrer" class="spotify-link" title="Listen on Spotify"><span data-feather="play-circle" class="icon button-icon"></span>Listen</a>` : ''}
                <div class="track-genres">${genresHtml || '<span class="no-genres">No tags available</span>'}</div>
            </div>
        `;
        trackCard.querySelectorAll('.track-genre').forEach(tag => {
            tag.addEventListener('click', (e) => { e.stopPropagation(); filterTracksByGenre(tag.dataset.genre); });
        });
        fragment.appendChild(trackCard);
    });
    trackGenresListDiv.appendChild(fragment);
    // Need to re-run feather icons and observer setup after adding track cards
    replaceFeatherIcons();
    setupIntersectionObserver(); // Re-observe new track cards
}

/**
 * Applies or clears the genre filter for the track list.
 * @param {string|null} genre - The genre to filter by, or null to clear.
 */
function filterTracksByGenre(genre) {
    currentGenreFilter = genre;
    if (currentPlaylistData) {
        displayTrackList(currentPlaylistData.tracks, currentGenreFilter, activeTrackGenreSource);
        // Smooth scroll to the track list section
        document.getElementById('track-genres-container')?.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
    }
}

// --- Source Toggling Logic ---

/**
 * Updates the active source for genre charts and features.
 * @param {string} newSource - 'spotify' or 'lastfm'.
 */
function updateActiveGenreSource(newSource) {
     if (!currentPlaylistData || activeGenreSource === newSource) return;
     activeGenreSource = newSource;
     genreSourceButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.source === newSource));
     const genreCounts = getGenreCounts(currentPlaylistData.tracks, activeGenreSource);
     debouncedUpdateCharts(genreCounts); // Update charts and radio buttons
     console.log(`Genre source switched to: ${newSource}`);
}

/**
 * Updates the genre source displayed on individual track cards.
 * @param {string} newSource - 'spotify', 'lastfm', or 'both'.
 */
function updateActiveTrackGenreSource(newSource) {
    if (!currentPlaylistData || activeTrackGenreSource === newSource) return;
    activeTrackGenreSource = newSource;
    displayTrackList(currentPlaylistData.tracks, currentGenreFilter, activeTrackGenreSource);
    console.log(`Track genre display switched to: ${newSource}`);
}

// --- Last.fm Feature Implementations ---

/**
 * Populates buttons for the Genre Radio feature based on top genres.
 * @param {Array} topGenres - Array of { genre, count }.
 */
function populateGenreRadioButtons(topGenres) {
    genreRadioButtonsContainer.innerHTML = '';
    genreRadioResultsPanel.classList.add('hidden');
    genreRadioListDiv.innerHTML = '';
    if (!topGenres || topGenres.length === 0) {
         genreRadioButtonsContainer.innerHTML = '<p class="small-text">No top genres identified for this source.</p>';
         return;
    }
    topGenres.forEach(({ genre }) => {
        const button = document.createElement('button');
        button.className = 'action-button genre-radio-btn';
        button.textContent = genre;
        button.dataset.genre = genre;
        button.addEventListener('click', () => fetchAndDisplayTopTracksForGenre(genre));
        genreRadioButtonsContainer.appendChild(button);
    });
}

/**
 * Fetches and displays the top tracks for a given genre tag from Last.fm.
 * @param {string} genre
 */
async function fetchAndDisplayTopTracksForGenre(genre) {
    showLoading(true, `Fetching top tracks for '${genre}'...`); // Use simple overlay here
    genreRadioListDiv.innerHTML = '<p class="small-text">Loading tracks...</p>';
    selectedGenreRadioSpan.textContent = genre;
    genreRadioResultsPanel.classList.remove('hidden');

    const params = { method: 'tag.gettoptracks', tag: genre, limit: 12 };
    const data = await fetchLastFmAPI(params);
    showLoading(false);

    if (data?.tracks?.track?.length > 0) {
        genreRadioListDiv.innerHTML = '';
        data.tracks.track.forEach(track => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'lastfm-result-item animate-on-scroll'; // Add animation
            const spotifySearchUrl = `https://open.spotify.com/search/${encodeURIComponent(track.name)}%20artist%3A${encodeURIComponent(track.artist.name)}`;
            itemDiv.innerHTML = `
                <a href="${spotifySearchUrl}" target="_blank" rel="noopener noreferrer" title="Search on Spotify">${track.name}</a>
                <span>by ${track.artist.name}</span>
                ${track.listeners ? `<span><span data-feather="headphones" class="icon xs"></span> ${parseInt(track.listeners).toLocaleString()} listeners</span>` : ''}
            `;
            genreRadioListDiv.appendChild(itemDiv);
        });
    } else {
        genreRadioListDiv.innerHTML = `<p class="small-text">Could not find popular tracks for "${genre}" on Last.fm.</p>`;
    }
     replaceFeatherIcons(); // Replace icons in results
     setupIntersectionObserver(); // Observe new results
     genreRadioResultsPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/**
 * Populates buttons to trigger similar artist search based on playlist's top artists.
 * @param {Array} topArtists - Array of { name, count, details }.
 */
function populateSimilarArtistButtons(topArtists) {
    similarArtistsButtonsContainer.innerHTML = '';
    similarArtistsResultsPanel.classList.add('hidden');
    similarArtistsListDiv.innerHTML = '';
    if (!topArtists || topArtists.length === 0) {
         similarArtistsButtonsContainer.innerHTML = '<p class="small-text">No top artists identified yet.</p>';
         return;
    }
    topArtists.slice(0, 10).forEach(({ name }) => {
        const button = document.createElement('button');
        button.className = 'action-button similar-artist-btn';
        button.textContent = name;
        button.dataset.artist = name;
        button.addEventListener('click', () => fetchAndDisplaySimilarArtists(name));
        similarArtistsButtonsContainer.appendChild(button);
    });
}

/**
 * Fetches and displays artists similar to a given artist from Last.fm.
 * @param {string} artistName
 */
async function fetchAndDisplaySimilarArtists(artistName) {
    showLoading(true, `Fetching artists similar to '${artistName}'...`);
    similarArtistsListDiv.innerHTML = '<p class="small-text">Loading similar artists...</p>';
    selectedArtistSpan.textContent = artistName;
    similarArtistsResultsPanel.classList.remove('hidden');

    const params = { method: 'artist.getsimilar', artist: artistName, autocorrect: 1, limit: 12 };
    const data = await fetchLastFmAPI(params);
    showLoading(false);

    if (data?.similarartists?.artist?.length > 0) {
         similarArtistsListDiv.innerHTML = '';
        data.similarartists.artist.forEach(artist => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'lastfm-result-item animate-on-scroll';
            const spotifySearchUrl = `https://open.spotify.com/search/artist%3A${encodeURIComponent(artist.name)}`;
            itemDiv.innerHTML = `
                 <a href="${spotifySearchUrl}" target="_blank" rel="noopener noreferrer" title="Search '${artist.name}' on Spotify">${artist.name}</a>
                <span><span data-feather="percent" class="icon xs"></span> Match: ${Math.round(artist.match * 100)}%</span>
            `;
            similarArtistsListDiv.appendChild(itemDiv);
        });
    } else {
        similarArtistsListDiv.innerHTML = `<p class="small-text">Could not find similar artists for "${artistName}" on Last.fm.</p>`;
    }
    replaceFeatherIcons(); // Replace icons
    setupIntersectionObserver(); // Observe new results
    similarArtistsResultsPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// --- Main Analysis Flow ---

/**
 * Orchestrates the entire playlist analysis process.
 */
async function analyzePlaylist() {
    const playlistInputVal = playlistInput.value.trim();
    if (!playlistInputVal) { showError("Please enter a Spotify Playlist URL or ID."); return; }
    const playlistId = extractPlaylistId(playlistInputVal);
    if (!playlistId) { showError("Invalid Spotify Playlist URL or ID format."); return; }

    showSkeletonLoader(true); // Show skeleton immediately
    clearError();
    currentPlaylistData = null; currentGenreFilter = null;
    genreRadioResultsPanel.classList.add('hidden'); similarArtistsResultsPanel.classList.add('hidden');

    try {
        // Use simple overlay for API steps, skeleton covers main content area
        showLoading(true, "Fetching playlist details...");
        const playlistInfo = await fetchSpotifyAPI(`playlists/${playlistId}?fields=id,name,description,images,owner(display_name),external_urls,tracks(total)`);
        if (!playlistInfo) throw new Error("Could not fetch playlist details.");
        if (playlistInfo.tracks?.total === 0) throw new Error("This playlist appears to be empty.");

        const tracksRaw = await getPlaylistTracks(playlistId); // Uses showLoading internally
        if (!tracksRaw || tracksRaw.length === 0) throw new Error("Playlist tracks empty or fetch failed.");

        const artistIds = [...new Set(tracksRaw.flatMap(item => item?.track?.artists?.map(a => a.id)).filter(Boolean))];
        if (artistIds.length === 0) throw new Error("No valid artists found.");

        const artistDetails = await getArtistDetailsAndGenres(artistIds); // Uses showLoading internally
        if (!artistDetails) throw new Error("Failed to fetch artist details.");

        showLoading(true, "Processing data...");
        currentPlaylistData = processPlaylistData(playlistInfo, tracksRaw, artistDetails);
        showLoading(false); // Hide simple overlay

        // --- Render Content (while skeleton is still shown) ---
        displayPlaylistInfo(currentPlaylistData);
        const initialGenreCounts = getGenreCounts(currentPlaylistData.tracks, activeGenreSource);
        debouncedUpdateCharts(initialGenreCounts); // Will eventually render charts & radio buttons
        createReleaseYearChart(currentPlaylistData.tracks);
        displayTopArtists(currentPlaylistData.tracks, currentPlaylistData.artistDetails); // Will render chart/list & similar buttons
        displayTrackList(currentPlaylistData.tracks, null, activeTrackGenreSource); // Will render track list

        // --- Swap Skeleton for Content ---
        showSkeletonLoader(false); // Hide skeleton, reveal actual content

        console.log("Analysis complete.");
         setTimeout(() => {
             resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
         }, 100);

    } catch (error) {
        console.error("Analysis pipeline failed:", error);
        showError(`Analysis failed: ${error.message}. Please check the playlist URL/ID and try again.`);
        showSkeletonLoader(false); // Hide skeleton on error
        resultsContainer.classList.add('hidden'); // Hide results container
        showLoading(false); // Ensure simple overlay is hidden
    }
}


// --- Event Listeners ---

/**
 * Sets up all necessary event listeners.
 */
function setupEventListeners() {
    loginButton.addEventListener('click', redirectToSpotifyLogin);
    analyzeButton.addEventListener('click', analyzePlaylist);

    genreSourceButtons.forEach(button => {
        button.addEventListener('click', () => updateActiveGenreSource(button.dataset.source));
    });

    trackGenreSourceRadios.forEach(radio => {
        radio.addEventListener('change', () => { if (radio.checked) { updateActiveTrackGenreSource(radio.value); } });
    });

     playlistInput.addEventListener('keypress', (event) => {
         if (event.key === 'Enter') { event.preventDefault(); analyzeButton.click(); }
     });

     // Optional: Add listener to clear error when input changes
     playlistInput.addEventListener('input', clearError);
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Loaded. Initializing Playlist Visualizer.");
    updateFooterYear();
    replaceFeatherIcons(); // Replace initial static icons
    handleAuthentication(); // Check login, hide initial overlay
    setupEventListeners();
    // Set initial state for toggles
    document.querySelector(`.toggle-button[data-source="${activeGenreSource}"]`)?.classList.add('active');
    document.getElementById(`genre-toggle-${activeTrackGenreSource}`)?.setAttribute('checked', true);
});


// --- Utility - Color Generation ---

/**
 * Simple hash function for string to get a number.
 * @param {string} str
 * @returns {number}
 */
function simpleHash(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) { hash = ((hash << 5) + hash) + str.charCodeAt(i); hash |= 0; }
  return Math.abs(hash);
}

/**
 * Generates consistent colors based on labels using HSL.
 * @param {Array<string>} labels
 * @returns {Array<string>} Array of HSL color strings.
 */
function generateConsistentColors(labels) {
    const colors = [];
    const saturation = 70; const lightness = 55;
    labels.forEach((label) => {
        const hue = simpleHash(label) % 360;
        colors.push(`hsl(${hue}, ${saturation}%, ${lightness}%)`);
    });
    return colors;
}