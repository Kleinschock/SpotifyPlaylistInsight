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
const initialLoadingOverlay = document.getElementById('initial-loading-overlay');
// const loadingOverlay = document.getElementById('loading-overlay'); // Simple overlay used less now
// const loadingMessage = document.getElementById('loading-message'); // Simple overlay used less now
const resultsSkeletonLoader = document.getElementById('results-skeleton-loader');
const resultsActualContent = document.getElementById('results-actual-content');
const playlistInfoDiv = document.getElementById('playlist-info');
const trackGenresListDiv = document.getElementById('track-genres-list');
const apiErrorDiv = document.getElementById('api-error');
const genreSourceButtons = document.querySelectorAll('.toggle-button[data-source]');
const trackGenreSourceRadios = document.querySelectorAll('input[name="trackGenreSource"]');

// Specific Feature Elements
const similarArtistsContainer = document.getElementById('similar-artists-container'); // Container for the whole section
const similarArtistsButtonsPlaceholder = document.getElementById('similar-artists-buttons'); // Placeholder for loading text
const similarArtistsResultsPanel = document.getElementById('similar-artists-results'); // Panel for results
const similarArtistsListDiv = document.getElementById('similar-artists-list'); // The list div

const genreRadioButtonsContainer = document.getElementById('genre-radio-buttons');
const genreRadioResultsPanel = document.getElementById('genre-radio-results');
const genreRadioListDiv = document.getElementById('genre-radio-list');
const selectedGenreRadioSpan = document.getElementById('selected-genre-radio');
const pieChartTitle = document.getElementById('genre-pie-chart-title');
const barChartTitle = document.getElementById('genre-bar-chart-title');
const filterNoticeContainer = document.getElementById('filter-notice-container');
const totalTracksEl = document.getElementById('total-tracks');
const totalDurationEl = document.getElementById('total-duration');
const uniqueArtistsEl = document.getElementById('unique-artists');
const uniqueGenresEl = document.getElementById('unique-genres');
const topArtistsListContainer = document.getElementById('top-artists-list');
const topArtistCountEl = document.getElementById('top-artist-count');


// --- UI & Utilities ---

function replaceFeatherIcons() {
    if (typeof feather !== 'undefined') {
        try { feather.replace(); } catch (e) { console.error("Feather icons error:", e); }
    } else {
        console.warn("Feather icons script not loaded or executed yet.");
    }
}

function setupIntersectionObserver() {
    const observerOptions = { root: null, rootMargin: '0px', threshold: 0.1 };
    const observerCallback = (entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                observer.unobserve(entry.target);
            }
        });
    };
    const observer = new IntersectionObserver(observerCallback, observerOptions);
    document.querySelectorAll('.animate-on-scroll').forEach(target => {
        target.classList.remove('is-visible'); // Reset before observing
        observer.observe(target);
    });
}

function showSkeletonLoader(show) {
    if (!resultsSkeletonLoader || !resultsActualContent) return;
    if (show) {
        resultsSkeletonLoader.classList.remove('hidden');
        resultsActualContent.classList.add('hidden');
        resultsContainer.classList.remove('hidden');
    } else {
        resultsSkeletonLoader.classList.add('hidden');
        resultsActualContent.classList.remove('hidden');
        // Defer icon replacement and observer setup slightly to ensure elements are rendered
        setTimeout(() => {
            replaceFeatherIcons();
            setupIntersectionObserver();
        }, 100); // Increased delay slightly
    }
}

function updateFooterYear() {
    const yearEl = document.getElementById('current-year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();
}

// Simplified showLoading for intermediate steps (e.g., API calls within analysis)
function showLoading(show, message = "Processing...") {
    // This function can update a dedicated small loading indicator if needed,
    // but for now, just logs to console during background API calls.
    if (show) {
        console.log("Loading:", message);
        // Example: If a small spinner element exists:
        // const smallSpinner = document.getElementById('api-spinner');
        // if (smallSpinner) smallSpinner.classList.remove('hidden');
    } else {
        console.log("Loading finished.");
        // const smallSpinner = document.getElementById('api-spinner');
        // if (smallSpinner) smallSpinner.classList.add('hidden');
    }
}


function showError(message, isWarning = false) {
    apiErrorDiv.textContent = message;
    apiErrorDiv.className = isWarning ? 'error-message warning' : 'error-message error';
    apiErrorDiv.classList.remove('hidden');
}

function clearError() {
     apiErrorDiv.classList.add('hidden'); apiErrorDiv.textContent = '';
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => { clearTimeout(timeout); func(...args); };
        clearTimeout(timeout); timeout = setTimeout(later, wait);
    };
}

function generateRandomString(length) {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let text = '';
    for (let i = 0; i < length; i++) { text += possible.charAt(Math.floor(Math.random() * possible.length)); }
    return text;
}

// --- Spotify Authentication --- (No changes needed)
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
        // Clear the hash from the URL
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
    // Ensure initial overlay hides AFTER checking token
    if(initialLoadingOverlay) initialLoadingOverlay.classList.add('hidden');
}
function updateLoginState() {
     if (spotifyAccessToken) {
        loginContainer.classList.add('hidden');
        playlistContainer.classList.remove('hidden');
        instructionsSection.classList.remove('hidden'); // Show instructions after login check
        setTimeout(setupIntersectionObserver, 50); // Setup animations for newly shown elements
    } else {
        loginContainer.classList.remove('hidden');
        playlistContainer.classList.add('hidden');
        instructionsSection.classList.remove('hidden'); // Show instructions if not logged in too
        resultsContainer.classList.add('hidden'); // Ensure results are hidden
    }
     replaceFeatherIcons(); // Make sure icons render correctly on state change
}
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
function getAccessTokenFromUrl() {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const token = params.get('access_token');
    const state = params.get('state');
    const storedState = sessionStorage.getItem('spotify_auth_state');
    const expires_in = params.get('expires_in');
    if (token && state && state === storedState && expires_in) {
        sessionStorage.removeItem('spotify_auth_state'); // Clean up state
        return { token, expires_in: parseInt(expires_in, 10) };
    }
    // Clear hash if it doesn't contain a valid token response
    if (window.location.hash) {
         history.pushState("", document.title, window.location.pathname + window.location.search);
    }
    return null;
}
function logout() {
    spotifyAccessToken = null;
    sessionStorage.removeItem('spotify_access_token');
    sessionStorage.removeItem('spotify_token_expiry');
    updateLoginState();
    console.log("User logged out.");
    // Optionally redirect to home or clear results
    resultsContainer.classList.add('hidden');
    playlistInput.value = ''; // Clear input field
}

// --- API Fetching --- (No changes needed)
async function fetchSpotifyAPI(endpoint, method = 'GET', body = null) {
    if (!spotifyAccessToken) {
        console.error('Spotify Access Token is missing or expired.');
        showError("Authentication required. Please log in again.");
        logout(); // Force logout if token is missing during API call
        return null;
    }
    const url = `https://api.spotify.com/v1/${endpoint}`;
    try {
        const response = await fetch(url, {
            method,
            headers: {
                'Authorization': `Bearer ${spotifyAccessToken}`,
                'Content-Type': 'application/json'
            },
            body: body ? JSON.stringify(body) : null
        });
        if (response.status === 401) {
            console.error('Spotify API returned 401 (Unauthorized). Token likely expired.');
            showError("Your session has expired. Please log in again.");
            logout(); // Force logout on 401
            return null;
        }
        if (response.status === 429) {
             console.warn('Spotify API rate limit hit (429). Retrying after delay...');
             const retryAfterSeconds = parseInt(response.headers.get('Retry-After') || '5', 10);
             showError(`Rate limit hit. Retrying in ${retryAfterSeconds}s...`, true);
             await new Promise(resolve => setTimeout(resolve, retryAfterSeconds * 1000));
             return fetchSpotifyAPI(endpoint, method, body); // Retry the request
        }
        // Try parsing JSON even for errors, as Spotify often includes error details
        const responseData = await response.json().catch(() => null); // Avoid crash if body is not JSON

        if (!response.ok) {
            const errorMessage = responseData?.error?.message || response.statusText || `HTTP Error ${response.status}`;
            console.error(`Spotify API Error ${response.status}: ${errorMessage}`, responseData);
            showError(`Spotify Error: ${errorMessage}`);
            return null; // Return null for non-successful responses
        }
        return responseData;
    } catch (error) {
        console.error('Network error fetching Spotify API:', error);
        showError("Network error connecting to Spotify. Please check your connection.");
        return null;
    }
}
async function lastFmRateLimiter() {
    const now = Date.now();
    const timeSinceLastCall = now - lastFmApiCallTimestamp;
    if (timeSinceLastCall < LASTFM_API_DELAY) {
        const delayNeeded = LASTFM_API_DELAY - timeSinceLastCall;
        // console.log(`Last.fm rate limit: delaying for ${delayNeeded}ms`);
        await new Promise(resolve => setTimeout(resolve, delayNeeded));
    }
    lastFmApiCallTimestamp = Date.now(); // Update timestamp *after* potential delay
}
async function fetchLastFmAPI(params) {
    params.api_key = LASTFM_API_KEY;
    params.format = 'json';
    const queryString = new URLSearchParams(params).toString();
    const url = `${LASTFM_API_BASE_URL}?${queryString}`;

    await lastFmRateLimiter(); // Ensure rate limiting before fetch

    try {
        const response = await fetch(url);
        const data = await response.json();

        // Check for Last.fm specific error structure
        if (data.error) {
            // Error 6: "Parameters requires" or "Artist not found" is common and not always a critical failure
            if (data.error !== 6) {
                 console.error(`Last.fm API Error ${data.error}: ${data.message}`, params);
                 showError(`Last.fm Error (${params.method}): ${data.message}`, true); // Show as warning
            } else {
                 console.log(`Last.fm Info (${params.method}): ${data.message}`); // Log non-critical errors quietly
            }
            return null; // Return null on any Last.fm error
        }
        if (!response.ok) {
             // Handle general HTTP errors if Last.fm doesn't provide an error code
             console.error(`Last.fm HTTP Error ${response.status}: ${response.statusText}`, params);
             showError(`Last.fm Error: ${response.statusText || 'Unknown error'}`, true);
             return null;
        }
        return data;
    } catch (error) {
        console.error('Network error fetching Last.fm API:', error);
        showError("Network error connecting to Last.fm. Please check your connection.", true);
        return null;
    }
}

// --- Data Processing --- (No changes needed)
function extractPlaylistId(input) {
    try {
        // Check for full URL
        if (input.includes('open.spotify.com/playlist/')) {
            const url = new URL(input);
            const pathParts = url.pathname.split('/');
            const idIndex = pathParts.indexOf('playlist');
            if (idIndex !== -1 && pathParts.length > idIndex + 1) {
                return pathParts[idIndex + 1].split('?')[0]; // Get ID part before query params
            }
        }
        // Check for Spotify URI
        else if (input.startsWith('spotify:playlist:')) {
            return input.split(':')[2];
        }
        // Check for raw ID (22 alphanumeric characters)
        else if (/^[a-zA-Z0-9]{22}$/.test(input)) {
            return input;
        }
    } catch (e) {
        console.error("Error parsing playlist input:", e);
        showError("Could not parse the provided playlist input. Please use a valid URL or ID.");
    }
    return null; // Return null if no valid format is detected
}
async function getPlaylistTracks(playlistId) {
    let tracks = [];
    // Added popularity field
    let url = `playlists/${playlistId}/tracks?fields=items(track(id,name,duration_ms,explicit,popularity,external_urls(spotify),artists(id,name),album(id,name,release_date,release_date_precision,images))),next&limit=50`;
    let trackCount = 0;
    const maxTracks = 1000; // Limit analysis for performance and API usage reasons

    showLoading(true, "Fetching playlist tracks..."); // Use console logging for intermediate steps
    let page = 1;

    while (url && trackCount < maxTracks) {
        showLoading(true, `Fetching track page ${page}...`);
        const data = await fetchSpotifyAPI(url);
        // Critical check: if data is null (due to error/logout), stop fetching
        if (!data) {
             showError("Failed to fetch tracks (authentication issue or API error). Analysis stopped.");
             return null; // Signal failure
        }
        // Graceful handling if items array is missing or empty
        if (!data.items || data.items.length === 0) {
            console.log("No more track items found on this page.");
            break; // Exit loop if no items are returned
        }

        const validItems = data.items.filter(item => item && item.track && item.track.id); // Ensure item and track exist
        tracks = tracks.concat(validItems);
        trackCount = tracks.length;

        console.log(`Fetched ${trackCount} tracks so far...`); // Log progress

        url = data.next ? data.next.replace('https://api.spotify.com/v1/', '') : null;
        page++;

        // Small delay between pages to be kind to the API
        if (url) await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (trackCount >= maxTracks) {
        console.warn(`Reached track limit of ${maxTracks}. Analyzing the first ${maxTracks} tracks.`);
        showError(`Playlist contains more than ${maxTracks} tracks. Analysis limited to the first ${maxTracks}.`, true);
    }

    console.log(`Finished fetching. Total valid tracks: ${trackCount}`);
    showLoading(false); // Finished track fetching phase
    return tracks; // Return the array of track items
}
async function getArtistDetailsAndGenres(artistIds) {
    const uniqueArtistIds = [...new Set(artistIds)]; // Ensure uniqueness
    const artistDetails = {}; // Store results { artistId: { details } }
    const batchSize = 50; // Spotify API limit for artist lookup
    const totalArtists = uniqueArtistIds.length;

    console.log(`Fetching details for ${totalArtists} unique artists...`);

    // --- Fetch Spotify Artist Details (Genres, Images) ---
    showLoading(true, `Fetching Spotify details (batch 1)...`);
    for (let i = 0; i < totalArtists; i += batchSize) {
        const batchIds = uniqueArtistIds.slice(i, i + batchSize);
        const endpoint = `artists?ids=${batchIds.join(',')}`;
        showLoading(true, `Fetching Spotify batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(totalArtists / batchSize)}...`);
        const data = await fetchSpotifyAPI(endpoint);

        if (data?.artists) {
            data.artists.forEach(artist => {
                if (artist) { // Check if artist object is valid
                    artistDetails[artist.id] = {
                        name: artist.name,
                        spotifyGenres: artist.genres || [],
                        // Select a reasonably sized image, fallback if needed
                        imageUrl: artist.images?.find(img => img.width >= 50 && img.width <= 300)?.url || artist.images?.[1]?.url || artist.images?.[0]?.url || null,
                        lastFmTags: [], // Initialize Last.fm tags array
                        spotifyUrl: artist.external_urls?.spotify
                    };
                }
            });
        } else if (!data && !spotifyAccessToken) {
             return null; // Stop if auth failed during fetch
        }
        // Brief pause between Spotify batches if needed
        if (i + batchSize < totalArtists) await new Promise(resolve => setTimeout(resolve, 50));
    }
     console.log("Fetched Spotify artist details.");

    // --- Fetch Last.fm Top Tags ---
    showLoading(true, `Fetching Last.fm tags (0/${totalArtists})...`);
    let lastfmFetchedCount = 0;
    for (const artistId of uniqueArtistIds) {
        // Skip if artist wasn't found on Spotify or missing name
        if (!artistDetails[artistId] || !artistDetails[artistId].name) {
            lastfmFetchedCount++;
            continue;
        }
        const artistName = artistDetails[artistId].name;
        const params = { method: 'artist.gettoptags', artist: artistName, autocorrect: 1 };
        const lastfmData = await fetchLastFmAPI(params); // Already includes rate limiting

        if (lastfmData?.toptags?.tag) {
             // Handle cases where 'tag' might be a single object or an array
             const tags = Array.isArray(lastfmData.toptags.tag) ? lastfmData.toptags.tag : [lastfmData.toptags.tag];
             // Get top N tags, lowercase, trim, filter out empty strings
             artistDetails[artistId].lastFmTags = tags
                .slice(0, 10) // Limit to top 10 tags
                .map(tag => tag.name.toLowerCase().trim())
                .filter(Boolean); // Remove any empty tags resulting from trimming
        }
        lastfmFetchedCount++;
        // Update progress periodically
        if (lastfmFetchedCount % 10 === 0 || lastfmFetchedCount === totalArtists) {
            showLoading(true, `Fetching Last.fm tags (${lastfmFetchedCount}/${totalArtists})...`);
        }
    }
    console.log("Finished fetching Last.fm tags.");
    showLoading(false); // Finished all artist detail fetching
    return artistDetails;
}
function processPlaylistData(playlistInfo, tracks, artistDetails) {
    if (!tracks || tracks.length === 0) {
        console.warn("No tracks provided to processPlaylistData");
        return { /* return a default structure or null */ };
    }
    const processedTracks = tracks.map(item => {
        const track = item.track;
        // Basic validation for track and essential properties
        if (!track || !track.id || !track.artists || track.artists.length === 0 || !track.album) {
            console.warn("Skipping invalid track item:", item);
            return null; // Skip this item if essential data is missing
        }

        let trackSpotifyGenres = new Set();
        let trackLastFmTags = new Set();
        track.artists.forEach(artist => {
            const details = artistDetails[artist.id];
            if (details) {
                details.spotifyGenres?.forEach(g => trackSpotifyGenres.add(g.toLowerCase().trim()));
                details.lastFmTags?.forEach(t => trackLastFmTags.add(t.toLowerCase().trim()));
            }
        });

        const primaryArtistDetails = artistDetails[track.artists[0].id];
        const releaseDate = track.album.release_date;
        let releaseYear = null;
        if (releaseDate) {
            // Handle different precisions ('year', 'month', 'day')
            if (track.album.release_date_precision === 'year') {
                releaseYear = parseInt(releaseDate, 10);
            } else { // 'month' or 'day' - take first 4 chars
                releaseYear = parseInt(releaseDate.substring(0, 4), 10);
            }
            // Basic sanity check for year
            if (isNaN(releaseYear) || releaseYear < 1900 || releaseYear > new Date().getFullYear() + 2) {
                releaseYear = null;
            }
        }

        // Select album image
        const imageUrl = track.album.images?.find(img => img.width >= 50 && img.width <= 300)?.url
                       || track.album.images?.[1]?.url
                       || track.album.images?.[0]?.url
                       || null;

        return {
            id: track.id,
            title: track.name,
            artist: track.artists.map(a => a.name).join(', '),
            // Use primary artist name from details if available, fallback to API data
            primaryArtistName: primaryArtistDetails?.name || track.artists[0].name,
            album: track.album.name,
            imageUrl: imageUrl,
            spotifyUrl: track.external_urls?.spotify,
            releaseYear: releaseYear,
            durationMs: track.duration_ms,
            explicit: track.explicit,
            popularity: track.popularity, // Include popularity
            // Convert Sets to sorted arrays, filter out empty strings again just in case
            spotifyGenres: [...trackSpotifyGenres].filter(Boolean).sort(),
            lastFmTags: [...trackLastFmTags].filter(Boolean).sort()
        };
    }).filter(Boolean); // Remove any null entries from the map operation

    // Calculate stats based on processed tracks
    const totalDurationMs = processedTracks.reduce((sum, track) => sum + (track.durationMs || 0), 0);
    const totalMinutes = Math.floor(totalDurationMs / 60000);
    const totalSeconds = Math.floor((totalDurationMs % 60000) / 1000).toString().padStart(2, '0');
    const uniqueArtistNames = new Set(processedTracks.map(t => t.primaryArtistName)); // Use primary artist name for uniqueness

    return {
        id: playlistInfo.id,
        name: playlistInfo.name,
        description: playlistInfo.description?.replace(/<[^>]*>?/gm, ''), // Basic HTML tag stripping
        imageUrl: playlistInfo.images?.length ? playlistInfo.images[0].url : null,
        owner: playlistInfo.owner?.display_name || 'Unknown Owner', // Handle missing owner
        spotifyUrl: playlistInfo.external_urls?.spotify,
        tracks: processedTracks,
        stats: {
            totalTracks: processedTracks.length,
            totalDurationFormatted: `${totalMinutes}m ${totalSeconds}s`,
            uniqueArtists: uniqueArtistNames.size,
            // Genre count will be calculated dynamically based on source
        },
        // Include artistDetails for potential future use or direct access if needed
        artistDetails: artistDetails
    };
}

// --- UI Display ---
function displayPlaylistInfo(playlistData) {
    // Default image if none is found
    const defaultImage = 'placeholder.png'; // Consider creating a simple placeholder image
    const imageUrl = playlistData.imageUrl || defaultImage;

    playlistInfoDiv.innerHTML = `
        <img src="${imageUrl}" alt="${playlistData.name || 'Playlist'} cover art" loading="lazy" onerror="this.onerror=null;this.src='${defaultImage}';">
        <div class="playlist-details">
            <h3>${playlistData.name || 'Playlist Name'}</h3>
            <p>By ${playlistData.owner || 'Unknown Owner'}</p>
            ${playlistData.description ? `<p class="description">${playlistData.description}</p>` : ''}
            ${playlistData.spotifyUrl ? `
            <p>
                <a href="${playlistData.spotifyUrl}" target="_blank" rel="noopener noreferrer" class="button-primary small">
                    <span data-feather="external-link" class="icon button-icon"></span>View on Spotify
                </a>
            </p>` : ''}
        </div>
    `;
    // Update stats section
    totalTracksEl.textContent = playlistData.stats?.totalTracks ?? '-';
    totalDurationEl.textContent = playlistData.stats?.totalDurationFormatted ?? '-';
    uniqueArtistsEl.textContent = playlistData.stats?.uniqueArtists ?? '-';
    // uniqueGenresEl is updated when genre counts are calculated
    replaceFeatherIcons(); // Replace icon in the button
}
function getGenreCounts(tracks, source = 'spotify') {
    const genreCounts = {};
    const key = source === 'lastfm' ? 'lastFmTags' : 'spotifyGenres';

    if (!tracks || tracks.length === 0) {
        uniqueGenresEl.textContent = '0'; // Update UI even if no tracks
        return []; // Return empty array if no tracks
    }

    tracks.forEach(track => {
        // Ensure the track has the genre key and it's an array
        if (track && Array.isArray(track[key])) {
            track[key].forEach(genre => {
                if (genre) { // Ensure genre is not null/empty
                    genreCounts[genre] = (genreCounts[genre] || 0) + 1;
                }
            });
        }
    });

    const sortedGenres = Object.entries(genreCounts)
        .map(([genre, count]) => ({ genre, count }))
        .sort((a, b) => b.count - a.count); // Sort descending by count

    // Update the unique genre count display
    uniqueGenresEl.textContent = sortedGenres.length;

    return sortedGenres;
}

// --- Chart Rendering ---
function createOrUpdateChart(chartId, chartType, data, options, instanceKey) {
    const ctx = document.getElementById(chartId)?.getContext('2d');
    if (!ctx) {
        console.error(`Canvas context for ID '${chartId}' not found.`);
        return; // Exit if canvas context is not available
    }

    // Destroy existing chart instance if it exists
    if (chartInstances[instanceKey]) {
        try {
            chartInstances[instanceKey].destroy();
            console.log(`Destroyed existing chart: ${instanceKey}`);
        } catch (e) {
            console.error(`Error destroying chart '${instanceKey}':`, e);
        }
        chartInstances[instanceKey] = null; // Clear reference
    }

    // Create new chart instance
    try {
        chartInstances[instanceKey] = new Chart(ctx, { type: chartType, data, options });
        console.log(`Created chart: ${instanceKey}`);
    } catch (e) {
        console.error(`Error creating chart '${instanceKey}':`, e);
        showError(`Could not render the ${instanceKey} chart.`);
    }
}
function handleChartClick(event, elements, labels) {
     if (elements && elements.length > 0) {
        try {
            // Get the index of the clicked element
            const index = elements[0].index;
            // Get the corresponding label (genre)
            const genre = labels[index];
            if (genre) {
                console.log(`Chart clicked: Filtering by genre '${genre}'`);
                filterTracksByGenre(genre); // Call the filter function
            }
        } catch (e) {
            console.error("Error handling chart click:", e);
        }
    }
}
function createReleaseYearChart(tracks) {
     if (!tracks || tracks.length === 0) {
        console.log("No tracks available for release year chart.");
        // Optionally clear or hide the chart area
         if (chartInstances.year) { chartInstances.year.destroy(); chartInstances.year = null; }
         document.getElementById('release-year-chart').style.display = 'none'; // Hide canvas
         document.getElementById('release-year-container').querySelector('.chart-tip').textContent = 'No release year data available.'; // Update tip
        return;
     }
    document.getElementById('release-year-chart').style.display = 'block'; // Ensure canvas is visible
    document.getElementById('release-year-container').querySelector('.chart-tip').textContent = 'Track count by year of release'; // Restore tip

     const yearCounts = {};
     let minYear = Infinity, maxYear = -Infinity;
     let validYearCount = 0;

     tracks.forEach(track => {
         // Validate release year: should be a number, within a reasonable range
         if (track && typeof track.releaseYear === 'number' && track.releaseYear >= 1900 && track.releaseYear <= new Date().getFullYear() + 1) {
             yearCounts[track.releaseYear] = (yearCounts[track.releaseYear] || 0) + 1;
             minYear = Math.min(minYear, track.releaseYear);
             maxYear = Math.max(maxYear, track.releaseYear);
             validYearCount++;
         }
     });

     if (validYearCount === 0) {
         console.log("No valid release year data found in tracks.");
         if (chartInstances.year) { chartInstances.year.destroy(); chartInstances.year = null; }
         document.getElementById('release-year-chart').style.display = 'none';
         document.getElementById('release-year-container').querySelector('.chart-tip').textContent = 'No valid release year data found.';
         return;
     }

     // Generate labels and data for the range of years with data
     const labels = [];
     const data = [];
     for (let year = minYear; year <= maxYear; year++) {
         labels.push(year.toString());
         data.push(yearCounts[year] || 0); // Use 0 for years with no tracks in the range
     }

     const chartData = {
         labels,
         datasets: [{
             label: 'Tracks Released',
             data,
             borderColor: 'rgba(79, 70, 229, 0.8)', // Indigo color
             backgroundColor: 'rgba(79, 70, 229, 0.1)',
             fill: true,
             tension: 0.3, // Smoother curve
             pointRadius: 2,
             pointHoverRadius: 5
         }]
     };
     const chartOptions = {
         responsive: true,
         maintainAspectRatio: false,
         scales: {
             x: {
                 title: { display: false, text: 'Year' },
                 grid: { display: false }
             },
             y: {
                 beginAtZero: true,
                 title: { display: false, text: 'Number of Tracks' },
                 grid: { color: '#eee' } // Lighter grid lines
             }
         },
         plugins: {
             legend: { display: false }, // Hide legend for cleaner look
             tooltip: {
                 mode: 'index', // Show tooltip for all points at the same x-value
                 intersect: false // Tooltip appears even if not directly hovering over point
             }
         }
     };
     createOrUpdateChart('release-year-chart', 'line', chartData, chartOptions, 'year');
}

/**
 * Debounced function to update the genre pie and bar charts.
 * Also populates genre radio buttons.
 */
const debouncedUpdateCharts = debounce((genreData) => {
    const sourceName = activeGenreSource === 'lastfm' ? 'Last.fm Tags' : 'Spotify Genres';
    const pieCanvas = document.getElementById('genre-pie-chart');
    const barCanvas = document.getElementById('genre-bar-chart');

    // Clear existing charts and hide if no data
    if (chartInstances.pie) { chartInstances.pie.destroy(); chartInstances.pie = null; }
    if (chartInstances.bar) { chartInstances.bar.destroy(); chartInstances.bar = null; }

    if (!genreData || genreData.length === 0) {
        pieChartTitle.textContent = `Genre Distribution (${sourceName} - No Data)`;
        barChartTitle.textContent = `Top Genres (${sourceName} - No Data)`;
        if (pieCanvas) pieCanvas.style.display = 'none';
        if (barCanvas) barCanvas.style.display = 'none';
        populateGenreRadioButtons([]); // Clear radio buttons
        return;
    }

    // Ensure canvases are visible
    if (pieCanvas) pieCanvas.style.display = 'block';
    if (barCanvas) barCanvas.style.display = 'block';

    const topN = 15; // Number of genres for charts
    const topGenres = genreData.slice(0, topN);
    const labels = topGenres.map(g => g.genre);
    const counts = topGenres.map(g => g.count);
    const backgroundColors = generateConsistentColors(labels); // Use consistent colors

    // --- Pie Chart ---
    const pieData = {
        labels,
        datasets: [{
            data: counts,
            backgroundColor: backgroundColors,
            borderColor: '#ffffff', // White border for separation
            borderWidth: 1
        }]
    };
    const pieOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'right', // Better for more labels
                labels: {
                    boxWidth: 12,
                    padding: 10, // Increased padding
                    font: { size: 11 }
                }
            },
            tooltip: {
                callbacks: {
                    label: (context) => {
                        const label = context.label || '';
                        const value = context.raw || 0;
                        const total = context.chart.getDatasetMeta(0).total;
                        const percentage = total > 0 ? ((value / total) * 100).toFixed(1) + '%' : '0%';
                        return `${label}: ${value} (${percentage})`;
                    }
                }
            }
        },
        onClick: (e, elements) => handleChartClick(e, elements, labels) // Pass labels to handler
    };
    createOrUpdateChart('genre-pie-chart', 'pie', pieData, pieOptions, 'pie');
    pieChartTitle.textContent = `Genre Distribution (${sourceName})`;

    // --- Bar Chart ---
    const barData = {
        labels,
        datasets: [{
            label: 'Track Count',
            data: counts,
            backgroundColor: backgroundColors,
            borderWidth: 0 // No border for bars
        }]
    };
    const barOptions = {
        indexAxis: 'y', // Horizontal bar chart
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false }, // No legend needed for single dataset
            tooltip: {
                callbacks: {
                    label: (context) => `${context.raw} tracks`
                }
            }
        },
        scales: {
            x: { beginAtZero: true, grid: { display: false } }, // Hide x-axis grid
            y: { grid: { display: false } } // Hide y-axis grid
        },
        onClick: (e, elements) => handleChartClick(e, elements, labels) // Pass labels to handler
    };
    createOrUpdateChart('genre-bar-chart', 'bar', barData, barOptions, 'bar');
    barChartTitle.textContent = `Top Genres (${sourceName})`;

    // Populate radio buttons with top genres (limit to a reasonable number)
    populateGenreRadioButtons(genreData.slice(0, 12));
}, 250); // Debounce time

/**
 * Displays the top artists chart and list.
 * Calculates top artists based on primary artist name count.
 * @param {Array} tracks - Processed track data.
 * @param {object} artistDetails - Details fetched for artists.
 * @returns {Array} List of top artist objects { name, count, details } sorted by count.
 */
function displayTopArtists(tracks, artistDetails) {
    const artistChartCanvas = document.getElementById('top-artists-chart');
    const artistListDiv = topArtistsListContainer;

    // Clear previous state
    if (chartInstances.artists) { chartInstances.artists.destroy(); chartInstances.artists = null;}
    if (artistListDiv) artistListDiv.innerHTML = '<p class="small-text">Calculating top artists...</p>';
    if (topArtistCountEl) topArtistCountEl.textContent = '0';
    if (artistChartCanvas) artistChartCanvas.style.display = 'none'; // Hide chart initially

    if (!tracks || tracks.length === 0 || !artistDetails) {
        console.warn("Cannot display top artists: Missing tracks or artist details.");
        if (artistListDiv) artistListDiv.innerHTML = '<p class="small-text">No artist data available to display.</p>';
        return []; // Return empty array if data is missing
    }

    // Count occurrences of each primary artist
    const artistCounts = {};
    tracks.forEach(track => {
        if (track && track.primaryArtistName) {
            artistCounts[track.primaryArtistName] = (artistCounts[track.primaryArtistName] || 0) + 1;
        }
    });

    // Create sorted list of artists with their details
    const sortedArtists = Object.entries(artistCounts)
        .map(([name, count]) => {
            // Find the details object matching the name
            // Note: This assumes artist names are unique identifiers here. If multiple artists
            // share the same name, this might pick the first match. Spotify IDs are better for uniqueness.
            const details = Object.values(artistDetails).find(d => d && d.name === name);
            return { name, count, details };
        })
        .sort((a, b) => b.count - a.count); // Sort descending by track count

    const topN = 10; // How many artists to show in chart/list
    const topArtistsForDisplay = sortedArtists.slice(0, topN);

    if (topArtistCountEl) topArtistCountEl.textContent = topArtistsForDisplay.length;

    if (topArtistsForDisplay.length === 0) {
        console.log("No top artists found after processing.");
        if (artistListDiv) artistListDiv.innerHTML = '<p class="small-text">No top artists found in this playlist.</p>';
        return sortedArtists; // Return the full sorted list even if top N is empty
    }

    // --- Doughnut Chart ---
    if (artistChartCanvas) artistChartCanvas.style.display = 'block'; // Show chart
    const chartLabels = topArtistsForDisplay.map(a => a.name);
    const chartData = topArtistsForDisplay.map(a => a.count);
    const chartColors = generateConsistentColors(chartLabels); // Use consistent colors
    const doughnutData = {
        labels: chartLabels,
        datasets: [{
            label: 'Track Appearances',
            data: chartData,
            backgroundColor: chartColors,
            borderColor: '#ffffff', // White border for separation
            borderWidth: 2
        }]
    };
    const doughnutOptions = {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '60%', // Adjust doughnut thickness
        plugins: {
            legend: { display: false }, // Legend might be redundant with the list
            tooltip: {
                callbacks: {
                    label: (context) => {
                        const label = context.label || '';
                        const value = context.raw || 0;
                        return `${label}: ${value} track${value !== 1 ? 's' : ''}`;
                    }
                }
            }
        }
    };
    createOrUpdateChart('top-artists-chart', 'doughnut', doughnutData, doughnutOptions, 'artists');

    // --- Artist List ---
    if (artistListDiv) {
        artistListDiv.innerHTML = ''; // Clear loading message
        const fragment = document.createDocumentFragment();
        topArtistsForDisplay.forEach(artist => {
            const card = document.createElement('div');
            card.className = 'artist-card animate-on-scroll'; // Add animation class
            const imageUrl = artist.details?.imageUrl;
            const spotifyUrl = artist.details?.spotifyUrl;
            const placeholderClass = imageUrl ? '' : 'artist-placeholder'; // Class for styling missing images

            card.innerHTML = `
                <img src="${imageUrl || 'placeholder.png'}" alt="${artist.name}" loading="lazy" class="${placeholderClass}" onerror="this.onerror=null;this.src='placeholder.png';">
                <div class="artist-info">
                    <h4>${spotifyUrl ? `<a href="${spotifyUrl}" target="_blank" rel="noopener noreferrer" title="View ${artist.name} on Spotify">${artist.name}</a>` : artist.name}</h4>
                    <p>${artist.count} track${artist.count !== 1 ? 's' : ''}</p>
                </div>
            `;
            fragment.appendChild(card);
        });
        artistListDiv.appendChild(fragment);
        // We need to trigger observer setup *after* adding items to the DOM
        // The setupIntersectionObserver() call in showSkeletonLoader(false) should handle this.
    }

    // Return the *full* sorted list of artists, as the aggregate function might want more than top N
    return sortedArtists;
}


// --- Track List Rendering ---
function displayTrackList(tracks, filterGenre = null, genreSourceToShow = 'spotify') {
    trackGenresListDiv.innerHTML = ''; // Clear previous list
    filterNoticeContainer.innerHTML = ''; // Clear previous filter notice

    // Display filter notice if a genre filter is active
    if (filterGenre) {
        const noticeDiv = document.createElement('div');
        noticeDiv.className = 'filter-notice';
        noticeDiv.innerHTML = `
            <span>
                <span data-feather="filter" class="icon"></span> Filtered by genre: <strong>${filterGenre}</strong>
            </span>
            <button id="clear-filter-btn" class="clear-filter-button">Clear Filter</button>
        `;
        filterNoticeContainer.appendChild(noticeDiv);
        // Add event listener to the new clear button
        document.getElementById('clear-filter-btn').addEventListener('click', () => {
            filterTracksByGenre(null); // Call filter function with null to clear
        });
        replaceFeatherIcons(); // Render the feather icon in the notice
    }

    // Filter tracks if a genre is specified
    const tracksToDisplay = filterGenre
        ? tracks.filter(track => {
            // Combine genres from both sources for filtering purposes
            const allGenres = new Set([
                ...(track.spotifyGenres || []),
                ...(track.lastFmTags || [])
            ]);
            return allGenres.has(filterGenre);
          })
        : tracks; // Use all tracks if no filter

    if (!tracksToDisplay || tracksToDisplay.length === 0) {
        trackGenresListDiv.innerHTML = `<p class="small-text centered-section">No tracks found${filterGenre ? ` matching the genre "${filterGenre}"` : ' in this playlist'}.</p>`;
        return; // Exit if no tracks to display
    }

    // Build track cards efficiently using a DocumentFragment
    const fragment = document.createDocumentFragment();
    tracksToDisplay.forEach(track => {
        const trackCard = document.createElement('div');
        trackCard.className = 'track-card animate-on-scroll'; // Add animation class

        // Determine which genres to display based on the toggle
        const genresToShow = new Set();
        if (genreSourceToShow === 'spotify' || genreSourceToShow === 'both') {
            track.spotifyGenres?.forEach(g => genresToShow.add({ genre: g, source: 'spotify' }));
        }
        if (genreSourceToShow === 'lastfm' || genreSourceToShow === 'both') {
            // Avoid adding duplicates if genre exists in both and 'both' is selected
            track.lastFmTags?.forEach(g => {
                 if (genreSourceToShow !== 'both' || ![...(track.spotifyGenres || [])].includes(g)) {
                     genresToShow.add({ genre: g, source: 'lastfm' });
                 }
            });
        }

        // Sort genres alphabetically for consistent display
        const sortedGenres = [...genresToShow].sort((a, b) => a.genre.localeCompare(b.genre));
        const genresHtml = sortedGenres.length > 0
            ? sortedGenres.map(item =>
                `<span class="track-genre genre-${item.source}" data-genre="${item.genre}" title="Filter by ${item.genre}">${item.genre}</span>`
              ).join('')
            : '<span class="no-genres">No tags available</span>'; // Message if no genres match the display toggle

        trackCard.innerHTML = `
            <img src="${track.imageUrl || 'placeholder.png'}" alt="${track.album || 'Album'}" loading="lazy" onerror="this.onerror=null;this.src='placeholder.png';">
            <div class="track-info">
                <div class="track-title" title="${track.title}${track.explicit ? ' (Explicit)' : ''}">
                    ${track.title}
                    ${track.explicit ? ' <span class="explicit-tag" title="Explicit">E</span>' : ''}
                </div>
                <div class="track-artist">${track.artist}</div>
                <div class="track-album">${track.album} (${track.releaseYear || 'Year ?'})</div>
                ${track.spotifyUrl ? `
                    <a href="${track.spotifyUrl}" target="_blank" rel="noopener noreferrer" class="spotify-link" title="Listen on Spotify">
                        <span data-feather="play-circle" class="icon button-icon"></span>Listen
                    </a>` : ''}
                <div class="track-genres">${genresHtml}</div>
            </div>`;

        // Add click listeners to genre tags for filtering
        trackCard.querySelectorAll('.track-genre').forEach(tag => {
            tag.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent card click if any
                filterTracksByGenre(tag.dataset.genre);
            });
        });
        fragment.appendChild(trackCard);
    });

    trackGenresListDiv.appendChild(fragment); // Append all cards at once
    replaceFeatherIcons(); // Render icons (e.g., play button)
    // Trigger animation observer setup after adding items. Handled by showSkeletonLoader(false).
}
function filterTracksByGenre(genre) {
    // Update the current filter state
    currentGenreFilter = genre;
    console.log(`Filtering track list by genre: ${genre || 'None'}`);

    if (currentPlaylistData && currentPlaylistData.tracks) {
        // Re-render the track list with the new filter
        displayTrackList(currentPlaylistData.tracks, currentGenreFilter, activeTrackGenreSource);

        // Scroll to the track list section smoothly
        const trackListSection = document.getElementById('track-genres-container');
        if (trackListSection) {
            trackListSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    } else {
        console.warn("Cannot filter tracks: Playlist data is not available.");
    }
}

// --- Source Toggling Logic ---
function updateActiveGenreSource(newSource) {
     if (!currentPlaylistData || activeGenreSource === newSource) {
         console.log(`Genre source already set to ${newSource} or no data loaded.`);
         return; // Do nothing if source is already active or no data loaded
     }
     activeGenreSource = newSource;
     console.log(`Switching main genre source to: ${newSource}`);

     // Update button styles
     genreSourceButtons.forEach(btn => {
         btn.classList.toggle('active', btn.dataset.source === newSource);
     });

     // Recalculate genre counts and update charts/radio buttons
     if (currentPlaylistData.tracks) {
         const genreCounts = getGenreCounts(currentPlaylistData.tracks, activeGenreSource);
         uniqueGenresEl.textContent = genreCounts.length; // Update stat display
         debouncedUpdateCharts(genreCounts); // Update charts and radio buttons
     } else {
         // If no tracks, ensure charts/radio buttons are cleared
         uniqueGenresEl.textContent = '0';
         debouncedUpdateCharts([]);
     }
}
function updateActiveTrackGenreSource(newSource) {
    if (activeTrackGenreSource === newSource) {
        console.log(`Track genre display source already set to ${newSource}.`);
        return; // No change needed
    }
    activeTrackGenreSource = newSource;
    console.log(`Switching track genre display source to: ${newSource}`);

    // Re-render the track list with the current filter and new source display setting
    if (currentPlaylistData && currentPlaylistData.tracks) {
        displayTrackList(currentPlaylistData.tracks, currentGenreFilter, activeTrackGenreSource);
    } else {
        console.warn("Cannot update track genre display: Playlist data not available.");
        // Optionally clear the track list if no data
        trackGenresListDiv.innerHTML = '<p class="small-text centered-section">Load a playlist to see tracks.</p>';
    }
}

// --- Last.fm Feature Implementations ---
function populateGenreRadioButtons(topGenres) {
    genreRadioButtonsContainer.innerHTML = ''; // Clear previous buttons
    genreRadioResultsPanel.classList.add('hidden'); // Hide results panel
    genreRadioListDiv.innerHTML = ''; // Clear previous results

    if (!topGenres || topGenres.length === 0) {
        genreRadioButtonsContainer.innerHTML = '<p class="small-text">No top genres identified for radio.</p>';
        return;
    }

    const fragment = document.createDocumentFragment();
    topGenres.forEach(({ genre }) => {
        const button = document.createElement('button');
        button.className = 'action-button genre-radio-btn animate-on-scroll'; // Add animation class
        button.textContent = genre;
        button.dataset.genre = genre; // Store genre in data attribute
        button.addEventListener('click', () => fetchAndDisplayTopTracksForGenre(genre));
        fragment.appendChild(button);
    });
    genreRadioButtonsContainer.appendChild(fragment);
    // Animation handled by observer setup after content is shown
}
async function fetchAndDisplayTopTracksForGenre(genre) {
    console.log(`Fetching top Last.fm tracks for genre: ${genre}`);
    showLoading(true, `Fetching top tracks for '${genre}'...`); // Console log feedback
    genreRadioListDiv.innerHTML = '<p class="small-text">Loading popular tracks...</p>';
    selectedGenreRadioSpan.textContent = genre; // Update the selected genre display
    genreRadioResultsPanel.classList.remove('hidden'); // Show the results panel

    const params = { method: 'tag.gettoptracks', tag: genre, limit: 12 };
    const data = await fetchLastFmAPI(params);
    showLoading(false); // Finished fetching

    if (data?.tracks?.track && data.tracks.track.length > 0) {
        genreRadioListDiv.innerHTML = ''; // Clear loading message
        const fragment = document.createDocumentFragment();
        data.tracks.track.forEach(track => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'lastfm-result-item animate-on-scroll'; // Add animation class
            // Create a Spotify search link
            const spotifySearchUrl = `https://open.spotify.com/search/${encodeURIComponent(track.name)}%20artist%3A${encodeURIComponent(track.artist.name)}`;
            // Safely parse listeners, provide fallback
            const listeners = track.listeners ? parseInt(track.listeners, 10) : 0;

            itemDiv.innerHTML = `
                <a href="${spotifySearchUrl}" target="_blank" rel="noopener noreferrer" title="Search '${track.name}' by ${track.artist.name} on Spotify">${track.name}</a>
                <span>by ${track.artist.name}</span>
                ${listeners > 0 ? `<span><span data-feather="headphones" class="icon xs"></span> ${listeners.toLocaleString()} listeners</span>` : ''}
            `;
            fragment.appendChild(itemDiv);
        });
        genreRadioListDiv.appendChild(fragment);
    } else {
        console.log(`No popular tracks found for "${genre}" on Last.fm.`);
        genreRadioListDiv.innerHTML = `<p class="small-text">Could not find popular tracks for "${genre}" on Last.fm.</p>`;
    }
     replaceFeatherIcons(); // Render icons in results
     setupIntersectionObserver(); // Re-run observer for new animated items
     // Scroll smoothly to the results
     genreRadioResultsPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}


// --- NEW: Aggregate Similar Artist Recommendation ---

/**
 * Fetches similar artists for multiple source artists, aggregates recommendations,
 * filters out existing playlist artists, ranks them, and displays the results.
 * @param {Array} topPlaylistArtists - Array of { name, count, details } for top artists in the playlist (full sorted list).
 * @param {Set<string>} allPlaylistArtistNamesLower - Set of all unique primary artist names in the playlist (lowercase).
 */
async function fetchAndDisplayAggregateRecommendations(topPlaylistArtists, allPlaylistArtistNamesLower) {
    // Determine the actual "top N" to use for fetching recommendations
    const numArtistsToQuery = Math.min(topPlaylistArtists.length, 10); // Use top 10 or fewer if less available
    const artistsForQuery = topPlaylistArtists.slice(0, numArtistsToQuery);

    if (artistsForQuery.length === 0) {
        console.log("No top artists available to find recommendations.");
        similarArtistsContainer.classList.add('hidden'); // Hide the section
        return;
    }

    console.log(`Starting aggregate recommendations based on top ${artistsForQuery.length} artists.`);
    similarArtistsContainer.classList.remove('hidden'); // Ensure section is visible

    // Update Title/Description for Aggregate View
    const titleElement = similarArtistsContainer.querySelector('h3');
    const descElement = similarArtistsContainer.querySelector('p');
    if (titleElement) titleElement.innerHTML = `<span data-feather="thumbs-up" class="icon"></span> Recommended Artists`;
    if (descElement) descElement.textContent = `Artists similar to your top ${artistsForQuery.length} playlist artists, ranked by recommendation frequency (excluding artists already in the playlist).`;
    replaceFeatherIcons(); // Update icon in title

    // Use the placeholder div for loading status
    if (similarArtistsButtonsPlaceholder) {
        similarArtistsButtonsPlaceholder.classList.remove('hidden');
        similarArtistsButtonsPlaceholder.innerHTML = `<p class="small-text">Analyzing recommendations based on your top ${artistsForQuery.length} artists...</p>`;
    }

    similarArtistsResultsPanel.classList.remove('hidden'); // Show panel for loading/results
    similarArtistsListDiv.innerHTML = '<div class="loader small"></div><p class="small-text">Fetching similar artists from Last.fm...</p>'; // Initial loading state

    // Structure to store recommendations: { artistNameLower: { name: properName, count: N, matchSum: M } }
    const recommendations = {};
    let fetchedCount = 0;
    const totalToFetch = artistsForQuery.length;

    showLoading(true, `Fetching similar artists (0/${totalToFetch})...`); // Console log start

    for (const sourceArtist of artistsForQuery) {
        if (!sourceArtist || !sourceArtist.name) continue; // Skip invalid artist entries

        // Log which artist is being queried
        // console.log(`Fetching similar artists for: ${sourceArtist.name}`);

        const params = {
            method: 'artist.getsimilar',
            artist: sourceArtist.name,
            autocorrect: 1,
            limit: 15 // Fetch slightly more per artist initially (e.g., 15)
        };
        const data = await fetchLastFmAPI(params); // Includes rate limiting
        fetchedCount++;
        showLoading(true, `Fetching similar artists (${fetchedCount}/${totalToFetch})...`); // Update console log

        // Update placeholder text with progress
        if (similarArtistsButtonsPlaceholder) {
            similarArtistsButtonsPlaceholder.innerHTML = `<p class="small-text">Analyzing recommendations... (${fetchedCount}/${totalToFetch} artists checked)</p>`;
        }

        if (data?.similarartists?.artist && data.similarartists.artist.length > 0) {
            data.similarartists.artist.forEach(similar => {
                if (!similar || !similar.name) return; // Skip invalid similar artist entries

                const nameLower = similar.name.toLowerCase().trim();
                if (!nameLower || allPlaylistArtistNamesLower.has(nameLower)) {
                    // console.log(`Skipping recommendation: '${similar.name}' (already in playlist or empty)`);
                    return; // Skip empty names or artists already in the playlist
                }

                // Initialize if new recommendation
                if (!recommendations[nameLower]) {
                    recommendations[nameLower] = {
                        name: similar.name, // Store the proper-cased name
                        count: 0,
                        matchSum: 0
                    };
                }
                // Increment count and add match score (handle potential non-numeric match values)
                recommendations[nameLower].count++;
                recommendations[nameLower].matchSum += parseFloat(similar.match || 0);
            });
        } else {
            // console.log(`No similar artists found for ${sourceArtist.name}`);
        }
    }
    showLoading(false); // Console log end

    // Hide the progress placeholder once done fetching
    if (similarArtistsButtonsPlaceholder) {
         similarArtistsButtonsPlaceholder.classList.add('hidden');
    }

    // --- Process and Display Recommendations ---
    const rankedRecommendations = Object.values(recommendations)
        .sort((a, b) => {
            // Sort primarily by count (descending)
            if (b.count !== a.count) {
                return b.count - a.count;
            }
            // Secondarily by average match score (descending) for tie-breaking
            const avgMatchA = a.count > 0 ? a.matchSum / a.count : 0;
            const avgMatchB = b.count > 0 ? b.matchSum / b.count : 0;
            return avgMatchB - avgMatchA;
        })
        .slice(0, 15); // Show top 15 recommendations

    similarArtistsListDiv.innerHTML = ''; // Clear loading state

    if (rankedRecommendations.length > 0) {
        console.log(`Displaying top ${rankedRecommendations.length} aggregated recommendations.`);
        const fragment = document.createDocumentFragment();
        rankedRecommendations.forEach(rec => {
            const itemDiv = document.createElement('div');
            // Add animation class if desired
            itemDiv.className = 'lastfm-result-item recommendation-card animate-on-scroll';
            const spotifySearchUrl = `https://open.spotify.com/search/artist%3A${encodeURIComponent(rec.name)}`;
            const avgMatch = rec.count > 0 ? Math.round((rec.matchSum / rec.count) * 100) : 0;

            itemDiv.innerHTML = `
                 <a href="${spotifySearchUrl}" target="_blank" rel="noopener noreferrer" title="Search '${rec.name}' on Spotify">${rec.name}</a>
                 <span><span data-feather="check-circle" class="icon xs"></span> Recommended ${rec.count} time${rec.count !== 1 ? 's' : ''}</span>
                 ${avgMatch > 0 ? `<span><span data-feather="percent" class="icon xs"></span> Avg Match: ${avgMatch}%</span>` : ''}
            `;
            fragment.appendChild(itemDiv);
        });
        similarArtistsListDiv.appendChild(fragment);
    } else {
        console.log("No new similar artists found after filtering.");
        similarArtistsListDiv.innerHTML = `<p class="small-text">Could not find any new recommended artists based on your top playlist artists.</p>`;
    }

    replaceFeatherIcons(); // Render icons in results
    setupIntersectionObserver(); // Observe new items for animation
    // Scroll smoothly to the results panel
    similarArtistsResultsPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}


// --- Main Analysis Flow ---

/**
 * Orchestrates the entire playlist analysis process.
 */
async function analyzePlaylist() {
    const playlistInputVal = playlistInput.value.trim();
    if (!playlistInputVal) {
        showError("Please enter a Spotify Playlist URL or ID.");
        return;
    }
    const playlistId = extractPlaylistId(playlistInputVal);
    if (!playlistId) {
        // Error is shown by extractPlaylistId if parsing fails
        return;
    }

    console.log(`Starting analysis for playlist ID: ${playlistId}`);
    showSkeletonLoader(true); // Show skeleton loader for the main content area
    clearError(); // Clear previous errors
    // Reset state variables and UI elements
    currentPlaylistData = null;
    currentGenreFilter = null;
    if (chartInstances.pie) chartInstances.pie.destroy();
    if (chartInstances.bar) chartInstances.bar.destroy();
    if (chartInstances.year) chartInstances.year.destroy();
    if (chartInstances.artists) chartInstances.artists.destroy();
    chartInstances = {};
    genreRadioResultsPanel.classList.add('hidden');
    similarArtistsResultsPanel.classList.add('hidden');
    similarArtistsContainer.classList.add('hidden'); // Hide recommendations initially
    similarArtistsListDiv.innerHTML = ''; // Clear recommendation list
    if (similarArtistsButtonsPlaceholder) similarArtistsButtonsPlaceholder.classList.add('hidden'); // Hide loading text


    try {
        // Phase 1: Fetch Core Playlist Info (using simple console logging for these quick steps)
        showLoading(true, "Fetching playlist details...");
        const playlistInfo = await fetchSpotifyAPI(`playlists/${playlistId}?fields=id,name,description,images,owner(display_name),external_urls,tracks(total)`);
        if (!playlistInfo) throw new Error("Could not fetch playlist details. Check URL/ID or login status."); // More specific error
        if (playlistInfo.tracks?.total === 0) throw new Error("This playlist appears to be empty. Cannot analyze.");

        // Phase 2: Fetch Tracks (can take longer)
        // showLoading messages happen inside getPlaylistTracks
        const tracksRaw = await getPlaylistTracks(playlistId);
        // Check if tracksRaw is null (e.g., due to auth error during paged fetch) or empty
        if (!tracksRaw) throw new Error("Failed to fetch playlist tracks. Analysis stopped.");
        if (tracksRaw.length === 0) throw new Error("Playlist tracks are empty or could not be retrieved.");

        // Phase 3: Fetch Artist Details (Spotify and Last.fm - can take longest)
        const artistIds = [...new Set(tracksRaw.flatMap(item => item?.track?.artists?.map(a => a.id)).filter(Boolean))];
        if (artistIds.length === 0) throw new Error("No valid artists found in the playlist tracks.");
        // showLoading messages happen inside getArtistDetailsAndGenres
        const artistDetails = await getArtistDetailsAndGenres(artistIds);
         // Check if artistDetails is null (possible auth failure during fetch)
        if (!artistDetails) throw new Error("Failed to fetch artist details. Analysis stopped.");

        // Phase 4: Process Data
        showLoading(true, "Processing data...");
        currentPlaylistData = processPlaylistData(playlistInfo, tracksRaw, artistDetails);
        showLoading(false); // Finished core processing

        // --- Render Initial Content (while skeleton is still shown theoretically) ---
        // These functions update the DOM elements that will be revealed when skeleton hides.
        displayPlaylistInfo(currentPlaylistData);
        const initialGenreCounts = getGenreCounts(currentPlaylistData.tracks, activeGenreSource);
        debouncedUpdateCharts(initialGenreCounts); // Renders charts & populates genre radio
        createReleaseYearChart(currentPlaylistData.tracks);
        // displayTopArtists renders chart/list AND returns the full sorted artist list
        const allSortedArtists = displayTopArtists(currentPlaylistData.tracks, currentPlaylistData.artistDetails);
        displayTrackList(currentPlaylistData.tracks, null, activeTrackGenreSource); // Display initial full track list

        // --- Swap Skeleton for Content ---
        showSkeletonLoader(false); // Hide skeleton, reveal actual content, run observers/icons

        // --- Run Aggregate Recommendations AFTER main content is displayed ---
        if (allSortedArtists && allSortedArtists.length > 0 && currentPlaylistData?.tracks) {
             // Create a set of lowercase primary artist names for efficient filtering
             const allPlaylistArtistNamesLower = new Set(
                 currentPlaylistData.tracks.map(t => t.primaryArtistName.toLowerCase().trim())
             );
             // Run async without blocking main thread further. Loading feedback is handled within the function.
             // Use the full sorted list returned by displayTopArtists
             fetchAndDisplayAggregateRecommendations(allSortedArtists, allPlaylistArtistNamesLower);
        } else {
             // Hide the similar artists section if no top artists were found or data is missing
             similarArtistsContainer.classList.add('hidden');
             console.log("Skipping aggregate recommendations (no top artists found or track data missing).");
        }

        console.log("Playlist analysis complete.");
        // Scroll to results after a short delay to allow rendering
        setTimeout(() => {
             const resultsH2 = resultsContainer.querySelector('.section-title');
             if (resultsH2) {
                 resultsH2.scrollIntoView({ behavior: 'smooth', block: 'start' });
             }
        }, 200);

    } catch (error) {
        console.error("Playlist analysis pipeline failed:", error);
        showError(`Analysis failed: ${error.message}. Please check the playlist URL/ID and try again.`);
        showSkeletonLoader(false); // Hide skeleton on error
        resultsContainer.classList.add('hidden'); // Hide the entire results container
        showLoading(false); // Ensure any intermediate loading indicators are hidden
    }
}


// --- Event Listeners ---
function setupEventListeners() {
    loginButton.addEventListener('click', redirectToSpotifyLogin);
    analyzeButton.addEventListener('click', analyzePlaylist);

    // Genre source toggle buttons
    genreSourceButtons.forEach(button => {
        button.addEventListener('click', () => {
            updateActiveGenreSource(button.dataset.source);
        });
    });

    // Track list genre display radio buttons
    trackGenreSourceRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            if (radio.checked) {
                updateActiveTrackGenreSource(radio.value);
            }
        });
    });

    // Analyze on Enter key in playlist input
    playlistInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault(); // Prevent form submission if it were in a form
            analyzeButton.click(); // Trigger the analyze button click
        }
    });

    // Clear error message when user types in the input field
    playlistInput.addEventListener('input', clearError);

    // Add listener for the dynamically created clear filter button (delegated)
    // Note: This is handled inside displayTrackList now where the button is created.
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Loaded. Initializing Playlist Visualizer ✨.");
    updateFooterYear();
    replaceFeatherIcons(); // Initial icon rendering
    handleAuthentication(); // Check login status
    setupEventListeners(); // Setup button clicks, etc.

    // Set initial state for toggles based on default variables
    document.querySelector(`.toggle-button[data-source="${activeGenreSource}"]`)?.classList.add('active');
    const initialTrackGenreRadio = document.getElementById(`genre-toggle-${activeTrackGenreSource}`);
    if (initialTrackGenreRadio) {
        initialTrackGenreRadio.checked = true;
    }
});

// --- Utility - Color Generation ---
function simpleHash(str) {
    let hash = 5381; // djb2 hash function seed
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) + hash) + char; /* hash * 33 + c */
        hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash); // Ensure positive value
}

function generateConsistentColors(labels) {
    const colors = [];
    const saturation = 70; // Adjust saturation (0-100)
    const lightness = 55;  // Adjust lightness (0-100) - avoid extremes

    labels.forEach((label) => {
        // Use a simple hash function to get a somewhat consistent hue based on the label string
        const hue = simpleHash(label) % 360; // Map hash to 0-359 degrees
        colors.push(`hsl(${hue}, ${saturation}%, ${lightness}%)`);
    });
    return colors;
}