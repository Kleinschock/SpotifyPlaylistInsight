// --- Configuration ---
const CLIENT_ID = '732dc1eab09c4120945541da8f197de8'; // Your Spotify Client ID
const REDIRECT_URI = window.location.origin + window.location.pathname;
const LASTFM_API_KEY = '0d01968c9827680d5686e7bb324fc8e8'; // Your Last.fm API Key
const LASTFM_API_BASE_URL = 'https://ws.audioscrobbler.com/2.0/';
const LASTFM_API_DELAY = 210; // Milliseconds between Last.fm calls (approx 5/sec limit)
const TOP_ARTIST_THRESHOLD = 10; // How many top artists to consider for recommendations
const RECOMMENDATION_LIMIT = 15; // Max number of recommended artists to show

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
// const loadingOverlay = document.getElementById('loading-overlay'); // No longer needed? Replaced by skeleton/inline messages
// const loadingMessage = document.getElementById('loading-message'); // No longer needed?
const resultsSkeletonLoader = document.getElementById('results-skeleton-loader');
const resultsActualContent = document.getElementById('results-actual-content');
const playlistInfoDiv = document.getElementById('playlist-info');
const trackGenresListDiv = document.getElementById('track-genres-list');
const apiErrorDiv = document.getElementById('api-error');
const genreSourceButtons = document.querySelectorAll('.toggle-button[data-source]');
const trackGenreSourceRadios = document.querySelectorAll('input[name="trackGenreSource"]');

// Specific Feature Elements
const similarArtistsContainer = document.getElementById('similar-artists-container'); // Container for the whole section
const similarArtistsButtonsPlaceholder = document.getElementById('similar-artists-buttons'); // Placeholder for loading message during aggregate fetch
const similarArtistsResultsPanel = document.getElementById('similar-artists-results'); // Panel for results
const similarArtistsListDiv = document.getElementById('similar-artists-list'); // List div for results
const similarArtistsSectionTitle = similarArtistsContainer?.querySelector('h3'); // Title element
const similarArtistsSectionDesc = similarArtistsContainer?.querySelector('p'); // Description element

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
    }
}

function setupIntersectionObserver() {
    const observerOptions = { root: null, rootMargin: '0px', threshold: 0.1 };
    const observerCallback = (entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }
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
        // Reset results/panels that might be populated
        playlistInfoDiv.innerHTML = '';
        trackGenresListDiv.innerHTML = '';
        topArtistsListContainer.innerHTML = '';
        if(similarArtistsSectionTitle) similarArtistsSectionTitle.innerHTML = `<span data-feather="users" class="icon"></span> Discover Similar Artists (Last.fm)`;
        if(similarArtistsSectionDesc) similarArtistsSectionDesc.textContent = `Find artists similar to the top ones in your playlist.`;
        similarArtistsResultsPanel?.classList.add('hidden');
        similarArtistsListDiv.innerHTML = '';
        genreRadioResultsPanel?.classList.add('hidden');
        genreRadioListDiv.innerHTML = '';
        genreRadioButtonsContainer.innerHTML = '<p class="small-text">Select a genre source above to enable.</p>';
        filterNoticeContainer.innerHTML = '';
        Object.values(chartInstances).forEach(chart => chart?.destroy());
        chartInstances = {};
        // Reset stats
        totalTracksEl.textContent = '-';
        totalDurationEl.textContent = '-';
        uniqueArtistsEl.textContent = '-';
        uniqueGenresEl.textContent = '-';

    } else {
        resultsSkeletonLoader.classList.add('hidden');
        resultsActualContent.classList.remove('hidden');
        // Defer icon replacement and observer setup until content is visible
        setTimeout(() => { replaceFeatherIcons(); setupIntersectionObserver(); }, 50);
    }
}


function updateFooterYear() {
    const yearEl = document.getElementById('current-year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();
}

// Simplified showLoading - Primarily for inline feedback now
function showInlineLoading(element, show, message = "Loading...") {
    if (!element) return;
    if (show) {
        element.innerHTML = `<p class="small-text"><span class="loader inline-loader"></span> ${message}</p>`; // Add inline loader style if needed
        // Basic inline loader style (add to CSS if preferred)
        const style = document.createElement('style');
        style.id = 'inline-loader-style';
        style.textContent = `
            .inline-loader {
                width: 1em; height: 1em; border-width: 2px;
                display: inline-block; vertical-align: middle;
                margin-right: 0.5em; margin-bottom: 0.1em;
                border: 2px solid rgba(0, 0, 0, 0.1);
                border-top-color: var(--primary-accent);
            }`;
        if (!document.getElementById('inline-loader-style')) {
             document.head.appendChild(style);
        }
    } else {
        // Clear the loading state - caller should populate content after
         element.innerHTML = '';
    }
}


function showError(message, isWarning = false) {
    if (!apiErrorDiv) return;
    apiErrorDiv.textContent = message;
    apiErrorDiv.className = isWarning ? 'error-message warning' : 'error-message error';
    apiErrorDiv.classList.remove('hidden');
}

function clearError() {
     if (apiErrorDiv) {
        apiErrorDiv.classList.add('hidden');
        apiErrorDiv.textContent = '';
     }
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

// --- Spotify Authentication --- (No changes)
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
        history.pushState("", document.title, window.location.pathname + window.location.search); // Clear hash
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
    if(initialLoadingOverlay) initialLoadingOverlay.classList.add('hidden');
}
function updateLoginState() {
     if (spotifyAccessToken) {
        loginContainer.classList.add('hidden');
        playlistContainer.classList.remove('hidden');
        instructionsSection.classList.remove('hidden');
        setTimeout(setupIntersectionObserver, 50); // Animate instructions in
    } else {
        loginContainer.classList.remove('hidden');
        playlistContainer.classList.add('hidden');
        instructionsSection.classList.remove('hidden'); // Keep instructions visible
        resultsContainer.classList.add('hidden'); // Hide results when logged out
    }
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
        sessionStorage.removeItem('spotify_auth_state');
        return { token, expires_in: parseInt(expires_in, 10) };
    }
    return null;
}
function logout() {
    spotifyAccessToken = null;
    sessionStorage.removeItem('spotify_access_token');
    sessionStorage.removeItem('spotify_token_expiry');
    updateLoginState();
    console.log("User logged out.");
}

// --- API Fetching --- (No changes)
async function fetchSpotifyAPI(endpoint, method = 'GET', body = null) {
    if (!spotifyAccessToken) {
        console.error('Spotify Access Token is missing.');
        showError("Authentication required. Please login again.");
        logout(); // Force logout
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
            console.error('Spotify API returned 401 (Unauthorized).');
            showError("Your Spotify session has expired. Please login again.");
            logout(); // Force logout
            return null;
        }

        if (response.status === 429) {
             console.warn('Spotify API rate limit hit (429). Retrying after delay.');
             const retryAfter = response.headers.get('Retry-After');
             const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : 5000; // Use header or default to 5s
             showError(`Spotify is busy, retrying in ${delay / 1000}s...`, true);
             await new Promise(resolve => setTimeout(resolve, delay));
             clearError(); // Clear temporary warning
             return fetchSpotifyAPI(endpoint, method, body); // Retry the request
        }

        // For non-JSON responses or empty body (e.g., 204 No Content)
        if (response.status === 204) {
            return {}; // Return empty object for consistency, maybe null?
        }
         // Check content type before parsing JSON
        const contentType = response.headers.get("content-type");
        let responseData = null;
        if (contentType && contentType.indexOf("application/json") !== -1) {
             responseData = await response.json();
        } else {
             // Handle non-JSON responses if necessary, maybe just log
             console.log("Received non-JSON response from Spotify:", response.status, response.statusText);
        }

        if (!response.ok) {
            console.error(`Spotify API Error ${response.status}:`, responseData || response.statusText);
            const errorMessage = responseData?.error?.message || response.statusText || `HTTP ${response.status}`;
            showError(`Spotify Error: ${errorMessage}`);
            // Consider specific handling for 403 (Forbidden) etc. if needed
             if (response.status === 403 && errorMessage.includes("rate limit")) {
                 // Sometimes rate limits manifest as 403
                 showError("Spotify rate limit likely exceeded. Please wait.", true);
             }
            return null;
        }

        return responseData;

    } catch (error) {
        console.error('Network error fetching from Spotify API:', error);
        showError("Network error connecting to Spotify. Please check your connection.");
        return null;
    }
}
async function lastFmRateLimiter() {
    const now = Date.now();
    const timeSinceLastCall = now - lastFmApiCallTimestamp;
    if (timeSinceLastCall < LASTFM_API_DELAY) {
        await new Promise(resolve => setTimeout(resolve, LASTFM_API_DELAY - timeSinceLastCall));
    }
    lastFmApiCallTimestamp = Date.now(); // Update timestamp *after* potential delay
}
async function fetchLastFmAPI(params) {
    params.api_key = LASTFM_API_KEY;
    params.format = 'json';
    const queryString = new URLSearchParams(params).toString();
    const url = `${LASTFM_API_BASE_URL}?${queryString}`;

    await lastFmRateLimiter(); // Wait if necessary before making the call

    try {
        const response = await fetch(url);
        const data = await response.json();

        // Check for Last.fm specific error structure
        if (data.error) {
            const errorCode = data.error;
            const errorMsg = data.message || 'Unknown Last.fm error';
            console.error(`Last.fm API Error ${errorCode}: ${errorMsg}`, `Params: ${JSON.stringify(params)}`);
            // Don't show generic "not found" errors to the user unless helpful
            if (errorCode !== 6) { // 6 is "Parameters required" or "Artist not found" etc.
                showError(`Last.fm Error: ${errorMsg} (Code: ${errorCode})`, true);
            }
            return null; // Return null on error
        }

        // Also check HTTP status code for other potential issues
        if (!response.ok) {
            console.error(`Last.fm HTTP Error ${response.status}: ${response.statusText}`, `URL: ${url}`);
             showError(`Last.fm network error: ${response.statusText}`, true);
            return null;
        }

        return data;
    } catch (error) {
        console.error('Network error fetching from Last.fm API:', error);
        showError("Network error connecting to Last.fm. Please check your connection.", true);
        return null;
    }
}

// --- Data Processing --- (Mostly unchanged, added loading messages)
function extractPlaylistId(input) {
    try {
        if (input.includes('open.spotify.com/playlist/')) {
            const url = new URL(input);
            const pathParts = url.pathname.split('/');
            const idIndex = pathParts.indexOf('playlist');
            if (idIndex !== -1 && pathParts.length > idIndex + 1) {
                return pathParts[idIndex + 1].split('?')[0]; // Handle query params
            }
        } else if (input.startsWith('spotify:playlist:')) {
            return input.split(':')[2];
        }
        // Basic check for 22 character alpha-numeric string
        else if (/^[a-zA-Z0-9]{22}$/.test(input)) {
            return input;
        }
    } catch (e) {
        // URL parsing might fail for invalid inputs
        console.error("Error parsing playlist input:", e);
    }
    return null;
}
async function getPlaylistTracks(playlistId) {
    let tracks = [];
    let url = `playlists/${playlistId}/tracks?fields=items(track(id,name,duration_ms,explicit,external_urls(spotify),artists(id,name),album(id,name,release_date,release_date_precision,images))),next,total&limit=50`;
    let trackCount = 0;
    let totalTracksExpected = null;
    const maxTracks = 1000; // Limit to avoid excessive calls/data

    // Initial call to get total
    const initialData = await fetchSpotifyAPI(url);
    if (!initialData) {
        showError("Failed to fetch initial track data.");
        return null;
    }
    totalTracksExpected = initialData.total;
    if (totalTracksExpected === 0) return []; // Empty playlist

    showInlineLoading(resultsActualContent, true, `Fetching tracks (0/${totalTracksExpected})...`); // Show loading in main area

    let currentData = initialData;
    while (currentData && trackCount < maxTracks) {
        const validItems = currentData.items?.filter(item => item?.track?.id) || [];
        tracks = tracks.concat(validItems);
        trackCount = tracks.length;

        showInlineLoading(resultsActualContent, true, `Fetching tracks (${trackCount}/${totalTracksExpected})...`);

        const nextUrl = currentData.next;
        if (nextUrl) {
            url = nextUrl.replace('https://api.spotify.com/v1/', '');
            await new Promise(resolve => setTimeout(resolve, 50)); // Small delay between pages
            currentData = await fetchSpotifyAPI(url);
        } else {
            currentData = null; // End of pages
        }
    }
    showInlineLoading(resultsActualContent, false); // Clear loading message

    if (trackCount >= maxTracks && totalTracksExpected > maxTracks) {
        console.warn(`Reached ${maxTracks} track limit for analysis.`);
        showError(`Analyzed the first ${maxTracks} tracks out of ${totalTracksExpected}. Some results may be incomplete.`, true);
    } else if (trackCount < totalTracksExpected) {
         console.warn(`Fetched ${trackCount} tracks, but expected ${totalTracksExpected}. Some tracks might be unavailable.`);
         showError(`Could only fetch ${trackCount} out of ${totalTracksExpected} tracks. Some might be unavailable or restricted.`, true);
    }

    console.log(`Fetched ${trackCount} valid tracks.`);
    return tracks;
}
async function getArtistDetailsAndGenres(artistIds) {
    const uniqueArtistIds = [...new Set(artistIds)];
    const artistDetails = {}; // { spotifyId: { name, spotifyGenres, imageUrl, lastFmTags, spotifyUrl } }
    const batchSize = 50;
    const totalArtists = uniqueArtistIds.length;
    let spotifyFetchedCount = 0;
    let lastfmFetchedCount = 0;

    // --- Fetch Spotify Details ---
    showInlineLoading(resultsActualContent, true, `Fetching Spotify artist details (0/${totalArtists})...`);
    for (let i = 0; i < totalArtists; i += batchSize) {
        const batchIds = uniqueArtistIds.slice(i, i + batchSize);
        const endpoint = `artists?ids=${batchIds.join(',')}`;
        const data = await fetchSpotifyAPI(endpoint);

        if (data?.artists) {
            data.artists.forEach(artist => {
                if (artist) {
                    artistDetails[artist.id] = {
                        name: artist.name,
                        spotifyGenres: artist.genres || [],
                        imageUrl: artist.images?.length ? artist.images[1]?.url || artist.images[0]?.url : null, // Prefer smaller image
                        lastFmTags: [], // Initialize empty
                        spotifyUrl: artist.external_urls?.spotify
                    };
                }
            });
        } else {
            // Handle potential partial failure within a batch if needed
             console.warn(`Failed to fetch details for some artists in batch starting at index ${i}`);
        }
        spotifyFetchedCount = Math.min(i + batchSize, totalArtists);
        showInlineLoading(resultsActualContent, true, `Fetching Spotify artist details (${spotifyFetchedCount}/${totalArtists})...`);

        if (i + batchSize < totalArtists) {
            await new Promise(resolve => setTimeout(resolve, 50)); // Small delay between batches
        }
    }

    // --- Fetch Last.fm Tags ---
    showInlineLoading(resultsActualContent, true, `Fetching Last.fm tags (0/${totalArtists})...`);
    for (const artistId of uniqueArtistIds) {
        const details = artistDetails[artistId];
        if (!details) { // Skip if Spotify fetch failed for this ID
             lastfmFetchedCount++;
            continue;
        }
        const artistName = details.name;
        const params = { method: 'artist.gettoptags', artist: artistName, autocorrect: 1 };
        const lastfmData = await fetchLastFmAPI(params); // lastFmRateLimiter is inside fetchLastFmAPI

        if (lastfmData?.toptags?.tag) {
             // Ensure 'tag' is always an array, even if only one tag is returned
             const tags = Array.isArray(lastfmData.toptags.tag) ? lastfmData.toptags.tag : [lastfmData.toptags.tag];
             details.lastFmTags = tags
                 .slice(0, 10) // Limit to top 10 tags
                 .map(tag => tag.name.toLowerCase().trim())
                 .filter(Boolean); // Remove empty strings
        }
        lastfmFetchedCount++;
        if (lastfmFetchedCount % 10 === 0 || lastfmFetchedCount === totalArtists) {
           showInlineLoading(resultsActualContent, true, `Fetching Last.fm tags (${lastfmFetchedCount}/${totalArtists})...`);
        }
    }

    showInlineLoading(resultsActualContent, false); // Clear loading message
    console.log("Finished fetching artist details from Spotify and Last.fm.");
    return artistDetails;
}
function processPlaylistData(playlistInfo, tracks, artistDetails) {
     showInlineLoading(resultsActualContent, true, "Processing playlist data...");

    const processedTracks = tracks.map(item => {
        const track = item.track;
        if (!track || !track.artists?.length) return null; // Skip items without track or artists

        let trackSpotifyGenres = new Set();
        let trackLastFmTags = new Set();

        track.artists.forEach(artist => {
            const details = artistDetails[artist.id];
            if (details) {
                details.spotifyGenres.forEach(g => trackSpotifyGenres.add(g.toLowerCase().trim()));
                details.lastFmTags.forEach(t => trackLastFmTags.add(t.toLowerCase().trim()));
            }
        });

        const primaryArtistDetails = artistDetails[track.artists[0].id];
        const releaseYear = track.album.release_date ? parseInt(track.album.release_date.substring(0, 4), 10) : null;

        return {
            id: track.id,
            title: track.name,
            artist: track.artists.map(a => a.name).join(', '),
            primaryArtistName: primaryArtistDetails?.name || track.artists[0].name, // Fallback if primary artist details missing
            album: track.album.name,
            imageUrl: track.album.images?.length ? track.album.images[1]?.url || track.album.images[0]?.url : null, // Prefer smaller image
            spotifyUrl: track.external_urls?.spotify,
            releaseYear: !isNaN(releaseYear) ? releaseYear : null, // Ensure it's a valid number
            durationMs: track.duration_ms,
            explicit: track.explicit,
            spotifyGenres: [...trackSpotifyGenres].filter(Boolean).sort(),
            lastFmTags: [...trackLastFmTags].filter(Boolean).sort()
        };
    }).filter(Boolean); // Remove null entries

    const totalDurationMs = processedTracks.reduce((sum, track) => sum + (track.durationMs || 0), 0);
    const totalMinutes = Math.floor(totalDurationMs / 60000);
    const totalSeconds = Math.floor((totalDurationMs % 60000) / 1000).toString().padStart(2, '0');

    // Calculate unique primary artists after processing all tracks
     const uniqueArtistNames = new Set(processedTracks.map(t => t.primaryArtistName));


    const processedData = {
        id: playlistInfo.id,
        name: playlistInfo.name,
        description: playlistInfo.description?.replace(/<[^>]*>?/gm, ''), // Basic HTML tag stripping
        imageUrl: playlistInfo.images?.length ? playlistInfo.images[0].url : null, // Use largest image for header
        owner: playlistInfo.owner.display_name,
        spotifyUrl: playlistInfo.external_urls.spotify,
        tracks: processedTracks,
        stats: {
            totalTracks: processedTracks.length,
            totalDurationFormatted: `${totalMinutes}m ${totalSeconds}s`,
            uniqueArtists: uniqueArtistNames.size
        },
        artistDetails: artistDetails // Keep the full details fetched
    };
     showInlineLoading(resultsActualContent, false); // Clear loading
     return processedData;
}

// --- UI Display --- (displayPlaylistInfo, getGenreCounts unchanged)
function displayPlaylistInfo(playlistData) {
    if (!playlistInfoDiv) return;
    playlistInfoDiv.innerHTML = `
        <img src="${playlistData.imageUrl || 'placeholder.png'}" alt="${playlistData.name} cover art" loading="lazy">
        <div class="playlist-details">
            <h3>${playlistData.name}</h3>
            <p>By ${playlistData.owner || 'Unknown Owner'}</p>
            ${playlistData.description ? `<p class="description">${playlistData.description}</p>` : ''}
            <p><a href="${playlistData.spotifyUrl}" target="_blank" rel="noopener noreferrer" class="button-primary small">
                <span data-feather="external-link" class="icon button-icon"></span>View on Spotify
            </a></p>
        </div>
    `;
    totalTracksEl.textContent = playlistData.stats.totalTracks;
    totalDurationEl.textContent = playlistData.stats.totalDurationFormatted;
    uniqueArtistsEl.textContent = playlistData.stats.uniqueArtists;
    // Feather icons replaced globally later or when needed
}
function getGenreCounts(tracks, source = 'spotify') {
    const genreCounts = {};
    const key = source === 'lastfm' ? 'lastFmTags' : 'spotifyGenres';
    tracks.forEach(track => {
        track[key]?.forEach(genre => {
            if (genre) { // Ensure genre is not empty/null
                genreCounts[genre] = (genreCounts[genre] || 0) + 1;
            }
        });
    });
    const sortedGenres = Object.entries(genreCounts)
        .map(([genre, count]) => ({ genre, count }))
        .sort((a, b) => b.count - a.count); // Sort descending by count

    uniqueGenresEl.textContent = sortedGenres.length; // Update stat display
    return sortedGenres;
}

// --- Chart Rendering --- (createOrUpdateChart, handleChartClick, createReleaseYearChart unchanged)
function createOrUpdateChart(chartId, chartType, data, options, instanceKey) {
    const ctx = document.getElementById(chartId)?.getContext('2d');
    if (!ctx) { console.error(`Canvas context not found for ID: ${chartId}`); return; }

    // Destroy previous instance if it exists
    if (chartInstances[instanceKey]) {
        try { chartInstances[instanceKey].destroy(); } catch(e) { console.error("Error destroying chart:", instanceKey, e); }
        delete chartInstances[instanceKey];
    }

    // Create new chart instance
    try {
        chartInstances[instanceKey] = new Chart(ctx, { type: chartType, data, options });
    } catch (e) {
        console.error(`Error creating chart '${instanceKey}' (ID: ${chartId}):`, e);
        showError(`Could not render the ${instanceKey} chart.`);
        // Optionally clear the canvas or show a placeholder error
        // ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        // ctx.fillText("Chart Error", 10, 50);
    }
}
function handleChartClick(event, elements, labels) {
     if (elements.length > 0 && labels) {
         try {
             const elementIndex = elements[0].index;
             if (elementIndex >= 0 && elementIndex < labels.length) {
                const genre = labels[elementIndex];
                if (genre) {
                    filterTracksByGenre(genre); // Existing function to filter the track list
                }
             }
         } catch (e) {
             console.error("Error handling chart click:", e);
         }
     }
}
function createReleaseYearChart(tracks) {
     if (!tracks || tracks.length === 0) return;

     const yearCounts = {};
     let minYear = Infinity, maxYear = -Infinity;
     const currentYear = new Date().getFullYear();

     tracks.forEach(track => {
         // Validate release year: must exist, be numeric, > 1900, <= current year + 1 (buffer for upcoming releases)
         if (track.releaseYear && typeof track.releaseYear === 'number' && track.releaseYear > 1900 && track.releaseYear <= currentYear + 1) {
             yearCounts[track.releaseYear] = (yearCounts[track.releaseYear] || 0) + 1;
             minYear = Math.min(minYear, track.releaseYear);
             maxYear = Math.max(maxYear, track.releaseYear);
         }
     });

     if (Object.keys(yearCounts).length === 0) {
         console.log("No valid release year data found for chart.");
         // Optionally hide the chart container or show a message
         document.getElementById('release-year-container')?.classList.add('hidden');
         return;
     } else {
         document.getElementById('release-year-container')?.classList.remove('hidden');
     }


     const labels = [];
     const data = [];
     // Ensure we have a continuous range of years from min to max
     for (let year = minYear; year <= maxYear; year++) {
         labels.push(year.toString());
         data.push(yearCounts[year] || 0); // Push 0 for years with no tracks
     }

     const chartData = {
         labels,
         datasets: [{
             label: 'Tracks Released',
             data,
             borderColor: 'rgba(79, 70, 229, 0.8)', // Use CSS var? --secondary-accent
             backgroundColor: 'rgba(79, 70, 229, 0.1)',
             fill: true,
             tension: 0.3, // Smoother curve
             pointRadius: data.length > 50 ? 1 : 2, // Smaller points for many years
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
                 grid: { color: 'rgba(0, 0, 0, 0.05)' } // Lighter grid lines
             }
         },
         plugins: {
             legend: { display: false },
             tooltip: {
                 mode: 'index', // Show tooltip for all points at that index (year)
                 intersect: false,
                 callbacks: {
                     title: (tooltipItems) => `Year: ${tooltipItems[0].label}`, // Add year to title
                     label: (context) => `${context.dataset.label}: ${context.parsed.y}`
                 }
             }
         },
         animation: {
             duration: 800 // Add subtle animation
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
    const pieContainer = document.getElementById('genre-chart-container');
    const barContainer = document.getElementById('genre-bar-chart-container');

    if (!genreData || genreData.length === 0) {
        if (chartInstances.pie) { chartInstances.pie.destroy(); delete chartInstances.pie; }
        if (chartInstances.bar) { chartInstances.bar.destroy(); delete chartInstances.bar; }
        if (pieContainer) pieContainer.classList.add('hidden'); // Hide container
        if (barContainer) barContainer.classList.add('hidden'); // Hide container
        pieChartTitle.textContent = `Genre Distribution (${sourceName} - No Data)`;
        barChartTitle.textContent = `Top Genres (${sourceName} - No Data)`;
        populateGenreRadioButtons([]); // Clear radio buttons
        return;
    } else {
         if (pieContainer) pieContainer.classList.remove('hidden'); // Show container
         if (barContainer) barContainer.classList.remove('hidden'); // Show container
    }

    const topN = 15; // How many genres to show in charts
    const topGenres = genreData.slice(0, topN);
    const labels = topGenres.map(g => g.genre);
    const counts = topGenres.map(g => g.count);
    const backgroundColors = generateConsistentColors(labels); // Use consistent coloring

    // Pie Chart
    const pieData = {
        labels,
        datasets: [{
            data: counts,
            backgroundColor: backgroundColors,
            borderColor: '#ffffff',
            borderWidth: 1
        }]
    };
    const pieOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'right', // Better for potentially long labels
                labels: {
                    boxWidth: 12,
                    padding: 10,
                    font: { size: 11 }
                }
            },
            tooltip: { callbacks: { label: (c) => `${c.label}: ${c.raw}` } }
        },
        onClick: (e, el) => handleChartClick(e, el, labels)
    };
    createOrUpdateChart('genre-pie-chart', 'pie', pieData, pieOptions, 'pie');
    pieChartTitle.textContent = `Genre Distribution (${sourceName})`;

    // Bar Chart
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
            legend: { display: false },
            tooltip: { callbacks: { label: (c) => `${c.raw} tracks` } }
        },
        scales: {
            x: { beginAtZero: true, grid: { display: false } },
            y: { grid: { display: false } }
        },
        onClick: (e, el) => handleChartClick(e, el, labels)
    };
    createOrUpdateChart('genre-bar-chart', 'bar', barData, barOptions, 'bar');
    barChartTitle.textContent = `Top Genres (${sourceName})`;

    // Populate Radio Buttons (use a different slice if needed, e.g., top 12)
    populateGenreRadioButtons(genreData.slice(0, 12));

}, 250); // Debounce time

/**
 * Displays the top artists chart and list.
 * @param {Array} tracks - Array of processed track objects.
 * @param {object} artistDetails - Object containing details for all artists.
 * @returns {Array} List of top artist objects { name, count, details }, limited by TOP_ARTIST_THRESHOLD.
 */
function displayTopArtists(tracks, artistDetails) {
    const container = document.getElementById('top-artists-container');
    if (!tracks || tracks.length === 0 || !artistDetails) {
        topArtistsListContainer.innerHTML = '<p class="small-text">No artist data available.</p>';
         if (container) container.classList.add('hidden');
        return []; // Return empty array
    } else {
        if (container) container.classList.remove('hidden');
    }

    const artistCounts = {};
    // Count occurrences of the primary artist for each track
    tracks.forEach(track => {
        if (track.primaryArtistName) {
            artistCounts[track.primaryArtistName] = (artistCounts[track.primaryArtistName] || 0) + 1;
        }
    });

    // Create sorted list of artists with their details
    const sortedArtists = Object.entries(artistCounts)
        .map(([name, count]) => ({
            name,
            count,
            // Find the corresponding details (case-insensitive find might be safer?)
            details: Object.values(artistDetails).find(d => d.name.toLowerCase() === name.toLowerCase())
        }))
        .sort((a, b) => b.count - a.count); // Sort by count descending

    // Determine the actual top N based on the threshold
    const topArtists = sortedArtists.slice(0, TOP_ARTIST_THRESHOLD);
    if (topArtistCountEl) topArtistCountEl.textContent = topArtists.length;

    // --- Render Chart ---
    const chartLabels = topArtists.map(a => a.name);
    const chartData = topArtists.map(a => a.count);
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
        cutout: '60%', // Makes it a doughnut chart
        plugins: {
            legend: { display: false }, // Legend often redundant with list
            tooltip: {
                callbacks: {
                    label: (context) => `${context.label}: ${context.raw} track${context.raw !== 1 ? 's' : ''}`
                }
            }
        }
        // No onClick handler needed for this chart by default
    };
    createOrUpdateChart('top-artists-chart', 'doughnut', doughnutData, doughnutOptions, 'artists');

    // --- Render List ---
    topArtistsListContainer.innerHTML = ''; // Clear previous list
    if (topArtists.length === 0) {
        topArtistsListContainer.innerHTML = '<p class="small-text">No top artists found.</p>';
    } else {
        const fragment = document.createDocumentFragment();
        topArtists.forEach(artist => {
            const card = document.createElement('div');
            card.className = 'artist-card animate-on-scroll'; // Add animation class

            const imageUrl = artist.details?.imageUrl;
            const spotifyUrl = artist.details?.spotifyUrl;

            card.innerHTML = `
                <img src="${imageUrl || 'placeholder.png'}" alt="${artist.name}" loading="lazy" class="${imageUrl ? '' : 'artist-placeholder'}">
                <div class="artist-info">
                    <h4>${spotifyUrl ? `<a href="${spotifyUrl}" target="_blank" rel="noopener noreferrer" title="View ${artist.name} on Spotify">${artist.name}</a>` : artist.name}</h4>
                    <p>${artist.count} track${artist.count !== 1 ? 's' : ''}</p>
                </div>
            `;
            fragment.appendChild(card);
        });
        topArtistsListContainer.appendChild(fragment);
        // Intersection observer will be set up globally later
    }

    // Return the calculated top artists for use in other features (like recommendations)
    return topArtists;
}


// --- Track List Rendering --- (displayTrackList, filterTracksByGenre unchanged)
function displayTrackList(tracks, filterGenre = null, genreSourceToShow = 'spotify') {
    if (!trackGenresListDiv || !filterNoticeContainer) return;

    trackGenresListDiv.innerHTML = ''; // Clear previous list
    filterNoticeContainer.innerHTML = ''; // Clear previous filter notice

    // Display filter notice if active
    if (filterGenre) {
        const noticeDiv = document.createElement('div');
        noticeDiv.className = 'filter-notice';
        noticeDiv.innerHTML = `
            <span>
                <span data-feather="filter" class="icon"></span> Filtered by: <strong>${filterGenre}</strong>
            </span>
            <button id="clear-filter-btn" class="clear-filter-button">Clear Filter</button>
        `;
        filterNoticeContainer.appendChild(noticeDiv);
        replaceFeatherIcons(); // Replace icon in notice

        // Add event listener to the new button
        document.getElementById('clear-filter-btn').addEventListener('click', () => {
            filterTracksByGenre(null); // Call the filter function with null to clear
        });
    }

    // Filter tracks if a genre filter is applied
    const filteredTracks = filterGenre
        ? tracks.filter(track => {
            // Check both Spotify and Last.fm genres regardless of display setting
            const allGenres = new Set([...(track.spotifyGenres || []), ...(track.lastFmTags || [])]);
            return allGenres.has(filterGenre);
          })
        : tracks; // If no filter, use all tracks

    if (filteredTracks.length === 0) {
        trackGenresListDiv.innerHTML = `<p class="small-text centered-section">No tracks found${filterGenre ? ` matching the genre "${filterGenre}"` : ''}.</p>`;
        return;
    }

    // Build track cards efficiently using a DocumentFragment
    const fragment = document.createDocumentFragment();
    filteredTracks.forEach(track => {
        const trackCard = document.createElement('div');
        trackCard.className = 'track-card animate-on-scroll'; // Add animation class

        // Determine which genres to display based on the toggle
        const genresToShow = new Set();
        if (genreSourceToShow === 'spotify' || genreSourceToShow === 'both') {
            track.spotifyGenres?.forEach(g => genresToShow.add({ genre: g, source: 'spotify' }));
        }
        if (genreSourceToShow === 'lastfm' || genreSourceToShow === 'both') {
            track.lastFmTags?.forEach(g => genresToShow.add({ genre: g, source: 'lastfm' }));
        }

        // Sort genres alphabetically for consistent display
        const sortedGenres = [...genresToShow].sort((a, b) => a.genre.localeCompare(b.genre));

        // Create HTML for genre tags
        const genresHtml = sortedGenres
            .map(item => `<span class="track-genre genre-${item.source}" data-genre="${item.genre}" title="Filter by ${item.genre}">${item.genre}</span>`)
            .join('');

        trackCard.innerHTML = `
            <img src="${track.imageUrl || 'placeholder.png'}" alt="${track.album || 'Album art'}" loading="lazy">
            <div class="track-info">
                <div class="track-title" title="${track.title}${track.explicit ? ' (Explicit)' : ''}">
                    ${track.title}
                    ${track.explicit ? ' <span class="explicit-tag" title="Explicit">E</span>' : ''}
                </div>
                <div class="track-artist">${track.artist}</div>
                <div class="track-album">${track.album} (${track.releaseYear || '?'})</div>
                ${track.spotifyUrl ? `<a href="${track.spotifyUrl}" target="_blank" rel="noopener noreferrer" class="spotify-link" title="Listen on Spotify"><span data-feather="play-circle" class="icon button-icon"></span>Listen</a>` : ''}
                <div class="track-genres">
                    ${genresHtml || '<span class="no-genres">No selected tags available</span>'}
                </div>
            </div>`;

        // Add click listeners to genre tags *after* setting innerHTML
        trackCard.querySelectorAll('.track-genre').forEach(tag => {
            tag.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent card click if any
                filterTracksByGenre(tag.dataset.genre);
            });
        });

        fragment.appendChild(trackCard);
    });

    trackGenresListDiv.appendChild(fragment);
    // Feather icons and observer setup are handled globally after content swap
}
function filterTracksByGenre(genre) {
    currentGenreFilter = genre; // Update global filter state
    if (currentPlaylistData) {
        // Re-render the track list with the new filter and current source toggle
        displayTrackList(currentPlaylistData.tracks, currentGenreFilter, activeTrackGenreSource);

        // Scroll smoothly to the track list section
        const trackListSection = document.getElementById('track-genres-container');
        if (trackListSection) {
             trackListSection.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
        }
    } else {
        console.warn("Cannot filter tracks: currentPlaylistData is not available.");
    }
}


// --- Source Toggling Logic --- (updateActiveGenreSource, updateActiveTrackGenreSource unchanged)
function updateActiveGenreSource(newSource) {
     if (!currentPlaylistData || activeGenreSource === newSource) return; // No change or no data

     activeGenreSource = newSource; // Update global state

     // Update button styles
     genreSourceButtons.forEach(btn => {
         btn.classList.toggle('active', btn.dataset.source === newSource);
     });

     // Recalculate genre counts and update charts/radio buttons
     const genreCounts = getGenreCounts(currentPlaylistData.tracks, activeGenreSource);
     debouncedUpdateCharts(genreCounts); // Debounced to handle rapid clicks

     console.log(`Switched main genre data source to: ${newSource}`);
}
function updateActiveTrackGenreSource(newSource) {
    if (!currentPlaylistData || activeTrackGenreSource === newSource) return; // No change or no data

    activeTrackGenreSource = newSource; // Update global state

    // Re-render the track list with the current filter and the new source setting
    displayTrackList(currentPlaylistData.tracks, currentGenreFilter, activeTrackGenreSource);

    console.log(`Switched track list genre display source to: ${newSource}`);
}


// --- Last.fm Feature Implementations --- (populateGenreRadioButtons, fetchAndDisplayTopTracksForGenre unchanged)
function populateGenreRadioButtons(topGenres) {
    if (!genreRadioButtonsContainer || !genreRadioResultsPanel) return;

    genreRadioButtonsContainer.innerHTML = ''; // Clear previous buttons
    genreRadioResultsPanel.classList.add('hidden'); // Hide results panel initially
    genreRadioListDiv.innerHTML = ''; // Clear previous results

    if (!topGenres || topGenres.length === 0) {
        genreRadioButtonsContainer.innerHTML = '<p class="small-text">No top genres identified to generate radio.</p>';
        return;
    }

    const fragment = document.createDocumentFragment();
    topGenres.forEach(({ genre }) => {
        const button = document.createElement('button');
        button.className = 'action-button genre-radio-btn';
        button.textContent = genre;
        button.dataset.genre = genre; // Store genre in data attribute
        button.addEventListener('click', () => fetchAndDisplayTopTracksForGenre(genre));
        fragment.appendChild(button);
    });
    genreRadioButtonsContainer.appendChild(fragment);
}
async function fetchAndDisplayTopTracksForGenre(genre) {
    if (!genreRadioListDiv || !selectedGenreRadioSpan || !genreRadioResultsPanel) return;

     showInlineLoading(genreRadioListDiv, true, `Fetching top tracks for '${genre}'...`);
    selectedGenreRadioSpan.textContent = genre;
    genreRadioResultsPanel.classList.remove('hidden'); // Show the results panel

    const params = { method: 'tag.gettoptracks', tag: genre, limit: 12 }; // Get ~12 tracks
    const data = await fetchLastFmAPI(params); // Already includes rate limiting

     showInlineLoading(genreRadioListDiv, false); // Clear loading message

    if (data?.tracks?.track && data.tracks.track.length > 0) {
        const fragment = document.createDocumentFragment();
        data.tracks.track.forEach(track => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'lastfm-result-item animate-on-scroll'; // Add animation class

            // Construct Spotify search URL
            const spotifySearchQuery = `${encodeURIComponent(track.name)} artist:${encodeURIComponent(track.artist.name)}`;
            const spotifySearchUrl = `https://open.spotify.com/search/${spotifySearchQuery}`;

            itemDiv.innerHTML = `
                <a href="${spotifySearchUrl}" target="_blank" rel="noopener noreferrer" title="Search '${track.name}' by ${track.artist.name} on Spotify">${track.name}</a>
                <span>by ${track.artist.name}</span>
                ${track.listeners ? `<span><span data-feather="headphones" class="icon xs"></span> ${parseInt(track.listeners).toLocaleString()} listeners</span>` : ''}
            `;
            fragment.appendChild(itemDiv);
        });
        genreRadioListDiv.appendChild(fragment);
        replaceFeatherIcons(); // Add icons for headphones
        setupIntersectionObserver(); // Trigger animations for newly added items
    } else {
        genreRadioListDiv.innerHTML = `<p class="small-text">No popular tracks found for "${genre}" on Last.fm.</p>`;
        // Log details if debugging needed
        console.log("No Last.fm tracks found for genre:", genre, "Response:", data);
    }

    // Scroll the results panel into view smoothly
     genreRadioResultsPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}


// --- NEW: Aggregate Similar Artist Recommendation ---

/**
 * Fetches similar artists for multiple source artists, aggregates recommendations,
 * filters out existing playlist artists, ranks them, and displays the results.
 * @param {Array} topPlaylistArtists - Array of { name, count, details } for top artists in the playlist.
 * @param {Set<string>} allPlaylistArtistNamesLower - Set of all unique primary artist names in the playlist (lowercase).
 */
async function fetchAndDisplayAggregateRecommendations(topPlaylistArtists, allPlaylistArtistNamesLower) {
    if (!similarArtistsContainer || !similarArtistsListDiv || !similarArtistsResultsPanel || !similarArtistsButtonsPlaceholder) {
        console.error("Missing required elements for similar artists feature.");
        return;
    }

    // Ensure the section is visible if there are artists to process
    if (!topPlaylistArtists || topPlaylistArtists.length === 0) {
        similarArtistsContainer.classList.add('hidden');
        console.log("No top artists found, skipping aggregate recommendations.");
        return;
    }
    similarArtistsContainer.classList.remove('hidden');

    // --- UI Setup for Aggregate View ---
    if (similarArtistsSectionTitle) {
        similarArtistsSectionTitle.innerHTML = `<span data-feather="thumbs-up" class="icon"></span> Top Recommended Artists`;
    }
    if (similarArtistsSectionDesc) {
        similarArtistsSectionDesc.textContent = `Artists similar to your playlist's top ${topPlaylistArtists.length} artists, ranked by recommendation frequency.`;
    }
    replaceFeatherIcons(); // Update title icon

    // Use the placeholder area for loading feedback during the aggregate fetch
    similarArtistsButtonsPlaceholder.innerHTML = ''; // Clear any previous content
    similarArtistsButtonsPlaceholder.classList.remove('hidden'); // Show placeholder area
    showInlineLoading(similarArtistsButtonsPlaceholder, true, `Analyzing recommendations (0/${topPlaylistArtists.length})...`);

    similarArtistsResultsPanel.classList.remove('hidden'); // Show panel early for loading state
    similarArtistsListDiv.innerHTML = '<p class="small-text">Fetching similar artists from Last.fm...</p>'; // Initial loading in results list

    const recommendations = {}; // { artistNameLower: { name: properName, count: N, matchSum: M } }
    let fetchedCount = 0;
    const totalToFetch = topPlaylistArtists.length;

    // --- Fetch Similar Artists for Each Top Artist ---
    for (const sourceArtist of topPlaylistArtists) {
        const params = {
            method: 'artist.getsimilar',
            artist: sourceArtist.name,
            autocorrect: 1,
            limit: 15 // Fetch a few more per artist initially (e.g., 15)
        };
        const data = await fetchLastFmAPI(params); // Rate limiting handled within
        fetchedCount++;

         // Update loading message
         showInlineLoading(similarArtistsButtonsPlaceholder, true, `Analyzing recommendations (${fetchedCount}/${totalToFetch})...`);

        if (data?.similarartists?.artist?.length > 0) {
            data.similarartists.artist.forEach(similar => {
                const nameLower = similar.name.toLowerCase().trim();

                // **Filter:** Skip empty names or artists already in the playlist
                if (!nameLower || allPlaylistArtistNamesLower.has(nameLower)) {
                    return;
                }

                // **Aggregate:**
                if (!recommendations[nameLower]) {
                    recommendations[nameLower] = {
                        name: similar.name, // Store the proper-cased name
                        count: 0,
                        matchSum: 0
                    };
                }
                recommendations[nameLower].count++;
                // Ensure match is treated as a number, default to 0 if missing/invalid
                 recommendations[nameLower].matchSum += parseFloat(similar.match || 0);
            });
        } else {
             console.log(`No similar artists found on Last.fm for: ${sourceArtist.name}`);
        }
    }

     // --- Processing and Displaying Results ---
     showInlineLoading(similarArtistsButtonsPlaceholder, false); // Clear loading from placeholder
     similarArtistsButtonsPlaceholder.classList.add('hidden'); // Hide the placeholder area

    // Rank the collected recommendations
    const rankedRecommendations = Object.values(recommendations)
        .sort((a, b) => {
            // 1. Sort by recommendation count (descending)
            if (b.count !== a.count) {
                return b.count - a.count;
            }
            // 2. Tie-breaker: Sort by average match score (descending)
            const avgMatchA = a.count > 0 ? a.matchSum / a.count : 0;
            const avgMatchB = b.count > 0 ? b.matchSum / b.count : 0;
            return avgMatchB - avgMatchA;
        })
        .slice(0, RECOMMENDATION_LIMIT); // Limit the number of recommendations shown

    // Display the ranked list
    similarArtistsListDiv.innerHTML = ''; // Clear loading/previous results

    if (rankedRecommendations.length > 0) {
        const fragment = document.createDocumentFragment();
        rankedRecommendations.forEach(rec => {
            const itemDiv = document.createElement('div');
            // Add animation class if desired
            itemDiv.className = 'lastfm-result-item recommendation-card animate-on-scroll';

            // Construct Spotify search URL for the recommended artist
            const spotifySearchQuery = `artist:${encodeURIComponent(rec.name)}`;
            const spotifySearchUrl = `https://open.spotify.com/search/${spotifySearchQuery}`;

            // Calculate average match percentage for display
            const avgMatchPercent = rec.count > 0 ? Math.round((rec.matchSum / rec.count) * 100) : 0;

            itemDiv.innerHTML = `
                 <a href="${spotifySearchUrl}" target="_blank" rel="noopener noreferrer" title="Search '${rec.name}' on Spotify">${rec.name}</a>
                 <span><span data-feather="check-circle" class="icon xs"></span> Recommended ${rec.count} time${rec.count !== 1 ? 's' : ''}</span>
                 ${avgMatchPercent > 0 ? `<span><span data-feather="percent" class="icon xs"></span> Avg Match: ${avgMatchPercent}%</span>` : ''}
            `;
            fragment.appendChild(itemDiv);
        });
        similarArtistsListDiv.appendChild(fragment);
        replaceFeatherIcons(); // Add icons
        setupIntersectionObserver(); // Set up animations for new items
    } else {
        similarArtistsListDiv.innerHTML = `<p class="small-text">Could not find any new similar artists based on your top playlist artists.</p>`;
    }

     // Optional: Scroll the results into view
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
    if (!playlistId) { showError("Invalid Spotify Playlist URL or ID format. Please use the full URL or the ID itself."); return; }

    // --- Start Loading State ---
    clearError();
    showSkeletonLoader(true); // Show skeleton loader for the results area
    currentPlaylistData = null; // Reset state
    currentGenreFilter = null; // Reset filter

    try {
        // --- Fetch Core Playlist Info ---
        const playlistInfo = await fetchSpotifyAPI(`playlists/${playlistId}?fields=id,name,description,images,owner(display_name),external_urls,tracks(total)`);
        if (!playlistInfo) throw new Error("Could not fetch playlist details from Spotify."); // Error shown by fetchSpotifyAPI
        if (playlistInfo.tracks?.total === 0) {
            showError("This playlist appears to be empty. Nothing to analyze.", true); // Use warning type
            showSkeletonLoader(false); // Hide skeleton, show message
            resultsContainer.classList.add('hidden'); // Ensure results are hidden
            return;
        }

        // --- Fetch Tracks (with inline progress) ---
        const tracksRaw = await getPlaylistTracks(playlistId);
        if (!tracksRaw) throw new Error("Failed to fetch playlist tracks."); // Error shown by getPlaylistTracks
        if (tracksRaw.length === 0) {
            showError("No valid tracks could be retrieved from this playlist.", true);
             showSkeletonLoader(false); // Hide skeleton, show message
             resultsContainer.classList.add('hidden'); // Ensure results are hidden
            return;
        }

        // --- Fetch Artist Details (with inline progress) ---
        const artistIds = [...new Set(tracksRaw.flatMap(item => item?.track?.artists?.map(a => a.id)).filter(Boolean))];
        if (artistIds.length === 0) throw new Error("No valid artists found in the playlist tracks.");

        const artistDetails = await getArtistDetailsAndGenres(artistIds);
        if (!artistDetails || Object.keys(artistDetails).length === 0) throw new Error("Failed to fetch artist details."); // Error shown by getArtistDetailsAndGenres

        // --- Process Data ---
        currentPlaylistData = processPlaylistData(playlistInfo, tracksRaw, artistDetails);
        if (!currentPlaylistData) throw new Error("Failed to process playlist data.");

        // --- Prepare Data for Charts & Display Non-Chart UI ---
        initialGenreCounts = getGenreCounts(currentPlaylistData.tracks, activeGenreSource);
        // Calculate top artists data, but don't render chart/list yet if separated
        // For simplicity, we'll call displayTopArtists later, which does both
        displayPlaylistInfo(currentPlaylistData); // Render non-chart info
        displayTrackList(currentPlaylistData.tracks, null, activeTrackGenreSource); // Render non-chart info

        // --- Content Ready: Swap Skeleton for Actual Content ---
        showSkeletonLoader(false); // <-- Reveal content DIV

        // --- RENDER CHARTS AND CHART-RELATED LISTS NOW ---
        // It's okay if these take a moment, the main layout is visible.
        debouncedUpdateCharts(initialGenreCounts); // <-- Call chart function AFTER reveal
        createReleaseYearChart(currentPlaylistData.tracks); // <-- Call chart function AFTER reveal
        topArtists = displayTopArtists(currentPlaylistData.tracks, currentPlaylistData.artistDetails); // <-- Call function that includes chart AFTER reveal

        // --- Run Aggregate Recommendations (Asynchronously) ---
        // This should still run after the main UI/Charts are initiated
        if (topArtists && topArtists.length > 0 && currentPlaylistData?.tracks) {
             const allArtistNamesLower = new Set(
                 currentPlaylistData.tracks.map(t => t.primaryArtistName.toLowerCase().trim())
             );
             fetchAndDisplayAggregateRecommendations(topArtists, allArtistNamesLower);
        } else {
             if (similarArtistsContainer) similarArtistsContainer.classList.add('hidden');
             console.log("Skipping aggregate recommendations (no top artists or track data).");
        }

        console.log("Playlist analysis complete.");
        // Scroll to results after a short delay to allow rendering
         setTimeout(() => {
              if(resultsContainer) resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
         }, 250); // Increased delay slightly

    } catch (error) {
        console.error("Playlist analysis pipeline failed:", error);
        showError(`Analysis failed: ${error.message}. Please check the playlist and try again.`);
        showSkeletonLoader(false); // Hide skeleton on error
        resultsContainer.classList.add('hidden'); // Hide potentially broken results
        showInlineLoading(resultsActualContent, false);
        showInlineLoading(similarArtistsButtonsPlaceholder, false);
    }
}

// --- Event Listeners --- (Setup remains largely the same)
function setupEventListeners() {
    if (loginButton) loginButton.addEventListener('click', redirectToSpotifyLogin);
    if (analyzeButton) analyzeButton.addEventListener('click', analyzePlaylist);

    genreSourceButtons.forEach(button => {
        button.addEventListener('click', () => updateActiveGenreSource(button.dataset.source));
    });

    trackGenreSourceRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            if (radio.checked) { updateActiveTrackGenreSource(radio.value); }
        });
    });

    // Analyze on Enter key press in input field
    if (playlistInput) {
        playlistInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault(); // Prevent potential form submission
                analyzeButton.click(); // Trigger analysis
            }
        });
        // Clear error when user types in the input
        playlistInput.addEventListener('input', clearError);
    }

    // Note: Event listeners for genre radio buttons, track genre tags, and clear filter
    // are added dynamically when those elements are created.
}

// --- Initialization --- (Setup remains the same)
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Loaded. Initializing Playlist Visualizer v2.");
    updateFooterYear();
    replaceFeatherIcons(); // Initial icon replacement
    handleAuthentication(); // Check login status
    setupEventListeners(); // Setup static event listeners

    // Set initial state for toggles based on default variables
    document.querySelector(`.toggle-button[data-source="${activeGenreSource}"]`)?.classList.add('active');
    document.getElementById(`genre-toggle-${activeTrackGenreSource}`)?.setAttribute('checked', 'true');

     // Ensure skeleton is hidden initially if not logged in etc.
     if (!spotifyAccessToken) {
          resultsContainer?.classList.add('hidden');
          resultsSkeletonLoader?.classList.add('hidden');
          resultsActualContent?.classList.add('hidden');
     }

});

// --- Utility - Color Generation --- (Unchanged)
function simpleHash(str) {
     let hash = 5381;
     for (let i = 0; i < str.length; i++) {
         hash = ((hash << 5) + hash) + str.charCodeAt(i); /* hash * 33 + c */
         hash |= 0; // Convert to 32bit integer
     }
     return Math.abs(hash);
}
function generateConsistentColors(labels) {
    const colors = [];
    const saturation = 70; // Good saturation for visibility
    const lightness = 55; // Avoid too light or too dark
    const goldenRatioConjugate = 0.618033988749895; // Helps distribute hues
    let currentHue = Math.random(); // Start at a random hue

    labels.forEach((label, index) => {
        // Use label hash for base hue, but add index variation for closer labels
        const baseHue = simpleHash(label || `label-${index}`) % 360; // Ensure label exists
        currentHue = (baseHue + goldenRatioConjugate * index * 360) % 360; // Add variation
        colors.push(`hsl(${Math.round(currentHue)}, ${saturation}%, ${lightness}%)`);
    });
    return colors;
}