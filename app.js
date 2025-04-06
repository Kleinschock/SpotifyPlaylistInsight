// --- Configuration ---
const CLIENT_ID = '732dc1eab09c4120945541da8f197de8'; // Replace with your Spotify Client ID
const REDIRECT_URI = window.location.origin + window.location.pathname; // Or your specific redirect URI
const LASTFM_API_KEY = '0d01968c9827680d5686e7bb324fc8e8'; // Your Last.fm API Key
const LASTFM_API_BASE_URL = 'https://ws.audioscrobbler.com/2.0/';

// --- State Variables ---
let spotifyAccessToken = null;
let currentPlaylistData = null; // Store combined Spotify/Last.fm data
let activeGenreSource = 'spotify'; // 'spotify' or 'lastfm'
let activeTrackGenreSource = 'spotify'; // 'spotify', 'lastfm', or 'both'
let currentGenreFilter = null; // Store the genre currently being filtered by

// Chart instances (assuming they are initialized elsewhere or globally)
let genrePieChart, genreBarChart, releaseYearChart, topArtistsChart;

// --- DOM Elements ---
const loginButton = document.getElementById('login-button');
const analyzeButton = document.getElementById('analyze-button');
const playlistInput = document.getElementById('playlist-input');
const loginContainer = document.getElementById('login-container');
const playlistContainer = document.getElementById('playlist-container');
const resultsContainer = document.getElementById('results-container');
const loadingOverlay = document.getElementById('loading-overlay');
const playlistInfoDiv = document.getElementById('playlist-info');
const trackGenresListDiv = document.getElementById('track-genres-list');
const apiErrorDiv = document.getElementById('api-error');
// ... (add references for all new/modified elements: toggles, result panels, etc.)
const genreSourceButtons = document.querySelectorAll('.genre-source-button');
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
const genreConnectionsTitle = document.getElementById('genre-connections-title');


// --- Spotify Authentication --- (Keep your existing functions)
function handleAuthentication() {
    // ... your existing code to check URL hash for token or redirect ...
    spotifyAccessToken = getAccessTokenFromUrl(); // Assuming you have this function
    if (spotifyAccessToken) {
        loginContainer.classList.add('hidden');
        playlistContainer.classList.remove('hidden');
        // Optionally fetch user profile to confirm login
        // fetchSpotifyAPI('v1/me').then(profile => console.log('Logged in as:', profile.display_name));
    } else {
        loginContainer.classList.remove('hidden');
        playlistContainer.classList.add('hidden');
    }
}

function redirectToSpotifyLogin() {
    const scope = 'playlist-read-private playlist-read-collaborative'; // Minimum scopes needed
    const authUrl = `https://accounts.spotify.com/authorize?client_id=${CLIENT_ID}&response_type=token&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(scope)}`;
    window.location.href = authUrl;
}

function getAccessTokenFromUrl() {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const token = params.get('access_token');
    if (token) {
        // Clear the hash from the URL
        window.location.hash = '';
        // Store token (e.g., in memory, sessionStorage - consider security)
        console.log("Spotify Access Token Obtained");
        return token;
    }
    return null; // Or check sessionStorage/localStorage if you store it there
}


// --- API Fetching ---

async function fetchSpotifyAPI(endpoint, method = 'GET', body = null) {
    if (!spotifyAccessToken) {
        console.error('Spotify Access Token missing!');
        showError("Spotify authentication required or token expired. Please re-login.");
        // Potentially redirect to login here
        return null;
    }
    const url = `https://api.spotify.com/${endpoint}`;
    try {
        const response = await fetch(url, {
            method: method,
            headers: {
                'Authorization': `Bearer ${spotifyAccessToken}`
            },
            body: body ? JSON.stringify(body) : null
        });
        if (response.status === 401) { // Token expired or invalid
             console.error('Spotify API Error 401: Unauthorized. Token might be expired.');
             spotifyAccessToken = null; // Clear invalid token
             handleAuthentication(); // Re-trigger auth flow check
             showError("Spotify session expired. Please login again.");
             return null;
        }
        if (!response.ok) {
            const errorData = await response.json();
            console.error(`Spotify API Error ${response.status}:`, errorData);
            showError(`Spotify API Error: ${errorData.error?.message || response.statusText}`);
            return null;
        }
        return await response.json();
    } catch (error) {
        console.error('Network error fetching Spotify API:', error);
        showError("Network error connecting to Spotify. Please check your connection.");
        return null;
    }
}

async function fetchLastFmAPI(params) {
    params.api_key = LASTFM_API_KEY;
    params.format = 'json';
    const queryString = new URLSearchParams(params).toString();
    const url = `${LASTFM_API_BASE_URL}?${queryString}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            // Last.fm errors might not always be JSON, check content-type if needed
            let errorMsg = `Last.fm API Error: ${response.statusText}`;
            try { // Try parsing as JSON, it might contain an error message
                 const errorData = await response.json();
                 errorMsg = `Last.fm API Error: ${errorData.message || response.statusText}`;
                 console.error(`Last.fm API Error ${response.status}:`, errorData);
            } catch (e) {
                console.error(`Last.fm API Error ${response.status}: ${response.statusText}`);
            }
            showError(errorMsg);
            return null;
        }
        const data = await response.json();
        if (data.error) { // Last.fm specific error structure
            console.error(`Last.fm API Logic Error ${data.error}: ${data.message}`);
            showError(`Last.fm API Error: ${data.message}`);
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

function extractPlaylistId(input) {
    try {
        if (input.includes('open.spotify.com/playlist/')) {
            const url = new URL(input);
            const pathParts = url.pathname.split('/');
            return pathParts[pathParts.length - 1];
        } else if (input.length === 22 && /^[a-zA-Z0-9]+$/.test(input)) {
             // Basic check for a likely Spotify ID format
            return input;
        }
    } catch (e) {
        // Invalid URL or format
        console.error("Invalid playlist input format:", e);
    }
    return null; // Indicate invalid input
}


async function getPlaylistTracks(playlistId) {
    let tracks = [];
    let url = `v1/playlists/${playlistId}/tracks?fields=items(track(id,name,artists(id,name),album(id,name,release_date,release_date_precision,images))),next`;
    let trackCount = 0;
    const limit = 50; // Max allowed by Spotify API per page

    showLoading(true, "Fetching playlist tracks...");

    while (url && trackCount < 1000) { // Add a sanity limit
        const data = await fetchSpotifyAPI(url);
        if (!data || !data.items) {
             showError("Failed to fetch playlist tracks from Spotify.");
             showLoading(false);
             return null; // Stop fetching if an error occurred
        }

        tracks = tracks.concat(data.items.filter(item => item.track)); // Filter out null tracks
        trackCount += data.items.length;
        url = data.next ? data.next.replace('https://api.spotify.com/', '') : null; // Get relative URL for next page
        showLoading(true, `Fetched ${tracks.length} tracks...`);

        // Optional: Add a small delay to avoid hitting rate limits aggressively
        // await new Promise(resolve => setTimeout(resolve, 100));
    }
    showLoading(false);
    console.log(`Fetched a total of ${tracks.length} tracks.`);
    return tracks;
}

async function getArtistDetailsAndGenres(artistIds) {
    const artistDetails = {};
    const batchSize = 50; // Max artists per request for Spotify
    showLoading(true, "Fetching artist details (genres)...");
    let fetchedCount = 0;

    for (let i = 0; i < artistIds.length; i += batchSize) {
        const batchIds = artistIds.slice(i, i + batchSize);
        const endpoint = `v1/artists?ids=${batchIds.join(',')}`;
        const data = await fetchSpotifyAPI(endpoint);
        if (data && data.artists) {
            data.artists.forEach(artist => {
                if (artist) { // Ensure artist data is not null
                    artistDetails[artist.id] = {
                        name: artist.name,
                        spotifyGenres: artist.genres || [],
                        lastFmTags: [] // Initialize Last.fm tags array
                    };
                }
            });
            fetchedCount += data.artists.length;
            showLoading(true, `Fetched details for ${fetchedCount}/${artistIds.length} artists...`);
        } else {
             console.warn(`Failed to fetch details for artist batch starting at index ${i}`);
             // Continue fetching other batches if possible
        }
         // Optional delay
         // await new Promise(resolve => setTimeout(resolve, 100));
    }

    // --- Fetch Last.fm Tags for Artists ---
    showLoading(true, "Fetching artist tags from Last.fm...");
    let lastfmFetchedCount = 0;
    const artistNames = Object.values(artistDetails).map(a => a.name);

    for (const artistId in artistDetails) {
        const artistName = artistDetails[artistId].name;
         // Rate limit Last.fm calls slightly
         await new Promise(resolve => setTimeout(resolve, 50)); // 50ms delay between Last.fm calls

        const params = { method: 'artist.gettoptags', artist: artistName, autocorrect: 1 };
        const lastfmData = await fetchLastFmAPI(params);

        if (lastfmData && lastfmData.toptags && lastfmData.toptags.tag) {
             // Ensure tag is an array even if only one tag is returned
             const tags = Array.isArray(lastfmData.toptags.tag) ? lastfmData.toptags.tag : [lastfmData.toptags.tag];
             // Filter tags - potentially remove very low count tags or generic ones if needed
             artistDetails[artistId].lastFmTags = tags.map(tag => tag.name.toLowerCase()).slice(0, 10); // Limit to top 10 tags per artist
        } else {
            console.log(`No Last.fm tags found for artist: ${artistName}`);
            // Keep artistDetails[artistId].lastFmTags as empty array []
        }
        lastfmFetchedCount++;
         if (lastfmFetchedCount % 10 === 0) { // Update progress less frequently for Last.fm
            showLoading(true, `Fetched Last.fm tags for ${lastfmFetchedCount}/${Object.keys(artistDetails).length} artists...`);
         }
    }

    showLoading(false);
    console.log("Finished fetching artist details and Last.fm tags.");
    return artistDetails;
}

function processPlaylistData(playlistInfo, tracks, artistDetails) {
    const processedTracks = tracks.map(item => {
        const track = item.track;
        if (!track || !track.artists || track.artists.length === 0) return null; // Skip if track or artist info is missing

        const mainArtist = track.artists[0]; // Use primary artist for genre association
        const details = artistDetails[mainArtist.id];

        // Combine genres/tags from all artists on the track if needed (more complex)
        // let trackSpotifyGenres = new Set();
        // let trackLastFmTags = new Set();
        // track.artists.forEach(a => {
        //     const artistDetail = artistDetails[a.id];
        //     if (artistDetail) {
        //         artistDetail.spotifyGenres.forEach(g => trackSpotifyGenres.add(g));
        //         artistDetail.lastFmTags.forEach(t => trackLastFmTags.add(t));
        //     }
        // });

        return {
            id: track.id,
            title: track.name,
            artist: track.artists.map(a => a.name).join(', '), // Keep all artist names
            album: track.album.name,
            imageUrl: track.album.images?.length ? track.album.images[1]?.url || track.album.images[0]?.url : 'placeholder.png', // Use medium or small image
            spotifyUrl: track.external_urls?.spotify,
            releaseYear: track.album.release_date ? parseInt(track.album.release_date.substring(0, 4)) : null,
            durationMs: track.duration_ms,
            // Use genres/tags from primary artist for simplicity here
            spotifyGenres: details ? details.spotifyGenres : [],
            lastFmTags: details ? details.lastFmTags : []
        };
    }).filter(track => track !== null); // Remove any null tracks from processing errors

    // Calculate stats
    const totalDurationMs = processedTracks.reduce((sum, track) => sum + (track.durationMs || 0), 0);
    const totalMinutes = Math.floor(totalDurationMs / 60000);
    const totalSeconds = Math.floor((totalDurationMs % 60000) / 1000);

    return {
        id: playlistInfo.id,
        name: playlistInfo.name,
        description: playlistInfo.description,
        imageUrl: playlistInfo.images?.length ? playlistInfo.images[0].url : 'placeholder.png',
        owner: playlistInfo.owner.display_name,
        spotifyUrl: playlistInfo.external_urls.spotify,
        tracks: processedTracks,
        stats: {
            totalTracks: processedTracks.length,
            totalDurationFormatted: `${totalMinutes}m ${totalSeconds}s`
        },
        artistDetails: artistDetails // Pass this along if needed elsewhere
    };
}


// --- UI Display ---

function showLoading(show, message = "") {
    if (show) {
        loadingOverlay.classList.remove('hidden');
        // Optional: Update a message inside the overlay if you add an element for it
        // const loadingMessage = document.getElementById('loading-message');
        // if (loadingMessage) loadingMessage.textContent = message;
        console.log("Loading:", message); // Log progress
    } else {
        loadingOverlay.classList.add('hidden');
    }
}

function showError(message) {
    apiErrorDiv.textContent = message;
    apiErrorDiv.classList.remove('hidden');
    // Hide the error after some time
    setTimeout(() => {
         apiErrorDiv.classList.add('hidden');
         apiErrorDiv.textContent = '';
    }, 7000); // Hide after 7 seconds
}

function displayPlaylistInfo(playlistData) {
    playlistInfoDiv.innerHTML = `
        <img src="${playlistData.imageUrl}" alt="${playlistData.name} cover art">
        <h3>${playlistData.name}</h3>
        <p>By ${playlistData.owner}</p>
        ${playlistData.description ? `<p>${playlistData.description}</p>` : ''}
        <p><a href="${playlistData.spotifyUrl}" target="_blank" rel="noopener noreferrer">View on Spotify</a></p>
    `;
    // Display stats
    document.getElementById('total-tracks').textContent = playlistData.stats.totalTracks;
    document.getElementById('total-duration').textContent = playlistData.stats.totalDurationFormatted;
}

function getGenreCounts(tracks, source = 'spotify') {
    const genreCounts = {};
    const key = source === 'lastfm' ? 'lastFmTags' : 'spotifyGenres';

    tracks.forEach(track => {
        if (track && track[key]) {
            track[key].forEach(genre => {
                if (genre) { // Ensure genre is not null/empty
                     genreCounts[genre] = (genreCounts[genre] || 0) + 1;
                }
            });
        }
    });
    // Convert to array and sort
    return Object.entries(genreCounts)
        .map(([genre, count]) => ({ genre, count }))
        .sort((a, b) => b.count - a.count);
}


function updateCharts(genreData) {
    const topGenres = genreData.slice(0, 15); // Limit to top 15 for charts
    const labels = topGenres.map(g => g.genre);
    const data = topGenres.map(g => g.count);
    const backgroundColors = generateConsistentColors(labels); // Use helper for colors

    // --- Pie Chart ---
    if (genrePieChart) genrePieChart.destroy(); // Destroy previous instance
    const pieCtx = document.getElementById('genre-pie-chart').getContext('2d');
    genrePieChart = new Chart(pieCtx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: backgroundColors,
                borderColor: '#ffffff', // Add border for separation
                 borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels:{ boxWidth: 15, padding: 10 } },
                tooltip: { callbacks: { label: (context) => `${context.label}: ${context.raw}` } }
            },
             onClick: (event, elements) => {
                 if (elements.length > 0) {
                     const chartElement = elements[0];
                     const genre = labels[chartElement.index];
                     filterTracksByGenre(genre);
                 }
             }
        }
    });

    // --- Bar Chart ---
    if (genreBarChart) genreBarChart.destroy(); // Destroy previous instance
    const barCtx = document.getElementById('genre-bar-chart').getContext('2d');
    genreBarChart = new Chart(barCtx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Track Count',
                data: data,
                backgroundColor: backgroundColors, // Use same colors or a different palette
                borderColor: backgroundColors.map(c => shadeColor(c, -20)), // Slightly darker border
                 borderWidth: 1
            }]
        },
        options: {
            indexAxis: 'y', // Horizontal bars are often easier to read for lists
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }, // Usually not needed for single dataset bar
                tooltip: { callbacks: { label: (context) => `${context.raw} tracks` } }
            },
            scales: { x: { beginAtZero: true } },
             onClick: (event, elements) => {
                 if (elements.length > 0) {
                     const chartElement = elements[0];
                     const genre = labels[chartElement.index];
                     filterTracksByGenre(genre);
                 }
             }
        }
    });

    // --- Update Chart Titles ---
     const sourceName = activeGenreSource === 'lastfm' ? 'Last.fm Tags' : 'Spotify Genres';
     pieChartTitle.textContent = `Genre Distribution (${sourceName} - Pie Chart)`;
     barChartTitle.textContent = `Top Genres (${sourceName} - Bar Chart)`;
     genreConnectionsTitle.textContent = `Genre Connections (${sourceName})`; // Update connections title too
     // Optionally regenerate Genre Connections Visualization here
     // displayGenreConnections(genreData);
     populateGenreRadioButtons(genreData.slice(0, 10)); // Update radio buttons based on top genres of current source
}

function displayTrackList(tracks, filterGenre = null, genreSourceToShow = 'spotify') {
    trackGenresListDiv.innerHTML = ''; // Clear previous list

    // --- Filter Notice ---
    const existingNotice = document.getElementById('filter-notice');
    if (existingNotice) existingNotice.remove(); // Remove old notice

    if (filterGenre) {
        const noticeDiv = document.createElement('div');
        noticeDiv.className = 'filter-notice';
        noticeDiv.id = 'filter-notice';
        noticeDiv.innerHTML = `
            <span>Showing tracks filtered by genre: <strong>${filterGenre}</strong></span>
            <button id="clear-filter-btn" class="clear-filter-button">Clear Filter</button>
        `;
        // Insert notice before the track list
        trackGenresListDiv.parentNode.insertBefore(noticeDiv, trackGenresListDiv);
        document.getElementById('clear-filter-btn').addEventListener('click', () => {
            filterTracksByGenre(null); // Clear filter
        });
    }

    // --- Filter Tracks ---
    const filteredTracks = filterGenre
        ? tracks.filter(track => {
            const genresToCheck = new Set([
                ...(track.spotifyGenres || []),
                ...(track.lastFmTags || []) // Check both sources for filtering
            ]);
             return genresToCheck.has(filterGenre);
          })
        : tracks;

    if (filteredTracks.length === 0) {
        trackGenresListDiv.innerHTML = `<p>No tracks found${filterGenre ? ` matching the genre "${filterGenre}"` : ''}.</p>`;
        return;
    }

    // --- Render Tracks ---
    filteredTracks.forEach(track => {
        const trackCard = document.createElement('div');
        trackCard.className = 'track-card';

        let genresHtml = '';
        const genresToShow = [];

        if (genreSourceToShow === 'spotify' || genreSourceToShow === 'both') {
            track.spotifyGenres.forEach(g => genresToShow.push({ genre: g, source: 'spotify' }));
        }
        if (genreSourceToShow === 'lastfm' || genreSourceToShow === 'both') {
             // Avoid duplicates if showing both and genre exists in both
             track.lastFmTags.forEach(g => {
                 if (genreSourceToShow !== 'both' || !track.spotifyGenres.includes(g)) {
                     genresToShow.push({ genre: g, source: 'lastfm' });
                 }
             });
        }

        // Sort genres alphabetically for consistent display
         genresToShow.sort((a, b) => a.genre.localeCompare(b.genre));

        genresToShow.forEach(item => {
            genresHtml += `<span class="track-genre genre-${item.source}" data-genre="${item.genre}">${item.genre}</span>`;
        });

        trackCard.innerHTML = `
            <img src="${track.imageUrl || 'placeholder.png'}" alt="${track.album}" loading="lazy">
            <div class="track-info">
                <div class="track-title" title="${track.title}">${track.title}</div>
                <div class="track-artist">${track.artist}</div>
                <div class="track-album">${track.album} (${track.releaseYear || 'N/A'})</div>
                 ${track.spotifyUrl ? `<a href="${track.spotifyUrl}" target="_blank" rel="noopener noreferrer" class="spotify-link-icon" title="Listen on Spotify">🎵</a>` : ''}
                <div class="track-genres">${genresHtml || 'No genres available'}</div>
            </div>
        `;

        // Add click listener to genre tags within the card
        trackCard.querySelectorAll('.track-genre').forEach(tag => {
            tag.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent card click if needed
                filterTracksByGenre(tag.dataset.genre);
            });
        });

        trackGenresListDiv.appendChild(trackCard);
    });
}


function filterTracksByGenre(genre) {
    currentGenreFilter = genre; // Update global filter state
    // Re-render the track list with the filter applied
    displayTrackList(currentPlaylistData.tracks, currentGenreFilter, activeTrackGenreSource);
}

function updateActiveGenreSource(newSource) {
     if (activeGenreSource === newSource) return; // No change
     activeGenreSource = newSource;

     // Update button styles
     genreSourceButtons.forEach(btn => {
         btn.classList.toggle('active', btn.dataset.source === newSource);
     });

     // Regenerate charts and potentially other source-dependent views
     if (currentPlaylistData) {
        const genreCounts = getGenreCounts(currentPlaylistData.tracks, activeGenreSource);
        updateCharts(genreCounts);
        // Genre connections might also need updating if they depend on the source
        // displayGenreConnections(genreCounts);
     } else {
         console.warn("Cannot update genre source, no playlist data loaded.");
     }
}

function updateActiveTrackGenreSource(newSource) {
    if (activeTrackGenreSource === newSource) return; // No change
    activeTrackGenreSource = newSource;
    // Re-render track list with new source setting (filter remains if active)
    if (currentPlaylistData) {
        displayTrackList(currentPlaylistData.tracks, currentGenreFilter, activeTrackGenreSource);
    }
}

// --- Feature Implementations ---

// 1) Genre Switching - Implemented via updateActiveGenreSource and button listeners

// 2) Explore Similar Tracks by Genre (Last.fm)
function populateGenreRadioButtons(topGenres) {
    genreRadioButtonsContainer.innerHTML = ''; // Clear previous
    genreRadioResultsPanel.classList.add('hidden'); // Hide results initially
    genreRadioListDiv.innerHTML = '';

    if (!topGenres || topGenres.length === 0) {
         genreRadioButtonsContainer.innerHTML = '<p>No top genres identified from the selected source.</p>';
         return;
    }

    topGenres.forEach(({ genre }) => {
        const button = document.createElement('button');
        button.className = 'genre-radio-button'; // Use specific class if needed
        button.textContent = genre;
        button.dataset.genre = genre;
        button.addEventListener('click', () => fetchAndDisplayTopTracksForGenre(genre));
        genreRadioButtonsContainer.appendChild(button);
    });
}

async function fetchAndDisplayTopTracksForGenre(genre) {
    showLoading(true, `Fetching top tracks for '${genre}' from Last.fm...`);
    genreRadioListDiv.innerHTML = ''; // Clear previous results
    selectedGenreRadioSpan.textContent = genre; // Update title

    const params = { method: 'tag.gettoptracks', tag: genre, limit: 12 }; // Get top 12 tracks
    const data = await fetchLastFmAPI(params);

    showLoading(false);
    genreRadioResultsPanel.classList.remove('hidden'); // Show panel

    if (data && data.tracks && data.tracks.track && data.tracks.track.length > 0) {
        data.tracks.track.forEach(track => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'lastfm-result-item';
            // Link to Spotify search for the track
             const spotifySearchUrl = `https://open.spotify.com/search/${encodeURIComponent(track.name)}%20artist%3A${encodeURIComponent(track.artist.name)}`;
            itemDiv.innerHTML = `
                <a href="${spotifySearchUrl}" target="_blank" rel="noopener noreferrer" title="Search on Spotify">${track.name}</a>
                <span>by ${track.artist.name}</span>
                ${track.listeners ? `<span>(${parseInt(track.listeners).toLocaleString()} listeners)</span>` : ''}
            `;
             // You could add an image if Last.fm provides one, or search Spotify for the image
            genreRadioListDiv.appendChild(itemDiv);
        });
    } else {
        genreRadioListDiv.innerHTML = `<p>Could not find popular tracks for "${genre}" on Last.fm.</p>`;
    }
     // **Future Idea: Overlap Logic**
     // To implement overlap:
     // 1. Identify top N genres (e.g., top 3 from `genreData`).
     // 2. Call `fetchLastFmAPI` for `tag.gettoptracks` for EACH of these N genres.
     // 3. Collect all tracks into a map: `trackMap[trackId] = { count: N, trackData: {...} }` where trackId is e.g., `track.name + '||' + track.artist.name`. Increment count each time a track appears.
     // 4. Filter map for tracks with `count > 1`.
     // 5. Sort by count descending.
     // 6. Display these tracks in a separate `genre-overlap-results` div.
}


// 3) Top Artists (Already exists, just ensure data flows correctly)
function displayTopArtists(tracks) {
    const artistCounts = {};
    tracks.forEach(track => {
         // Consider primary artist or all artists based on preference
         const artistNames = track.artist.split(', '); // Assumes comma separation
         const primaryArtistName = artistNames[0];
         if (primaryArtistName) {
             artistCounts[primaryArtistName] = (artistCounts[primaryArtistName] || 0) + 1;
         }
         // Or count all artists:
         // artistNames.forEach(name => { artistCounts[name] = (artistCounts[name] || 0) + 1; });
    });

    const sortedArtists = Object.entries(artistCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

    const topArtists = sortedArtists.slice(0, 10); // Top 10 for chart/list

    // --- Update Top Artists Chart (Example: Doughnut) ---
    const chartLabels = topArtists.map(a => a.name);
    const chartData = topArtists.map(a => a.count);
    const chartColors = generateConsistentColors(chartLabels); // Use helper

    if (topArtistsChart) topArtistsChart.destroy();
    const ctx = document.getElementById('top-artists-chart').getContext('2d');
    topArtistsChart = new Chart(ctx, {
         type: 'doughnut', // Or 'bar'
         data: {
             labels: chartLabels,
             datasets: [{
                 label: 'Appearances',
                 data: chartData,
                 backgroundColor: chartColors,
                 borderColor: '#ffffff',
                 borderWidth: 1
             }]
         },
         options: {
             responsive: true,
             maintainAspectRatio: false, // Adjust as needed
             plugins: { legend: { display: false } } // Keep it clean
         }
    });

    // --- Update Top Artists List ---
    const listContainer = document.getElementById('top-artists-list');
    listContainer.innerHTML = ''; // Clear previous
    topArtists.forEach(artist => {
        const card = document.createElement('div');
        card.className = 'artist-card'; // Use existing style
         // Fetching artist image from Spotify would require another API call per artist
         // Or use Last.fm `artist.getinfo` if preferred
        card.innerHTML = `
            <div class="artist-placeholder"></div> <!-- Placeholder -->
            <div class="artist-info">
                <h4>${artist.name}</h4>
                <p>${artist.count} track${artist.count > 1 ? 's' : ''}</p>
            </div>
             <!-- Add 'Find Similar' button maybe? -->
        `;
        listContainer.appendChild(card);
    });

    // --- Populate Similar Artists Buttons --- (Requirement 4)
     populateSimilarArtistButtons(topArtists);
}


// 4) Discover Similar Artists (Last.fm)
function populateSimilarArtistButtons(topArtists) {
    similarArtistsButtonsContainer.innerHTML = ''; // Clear previous
    similarArtistsResultsPanel.classList.add('hidden'); // Hide results
    similarArtistsListDiv.innerHTML = '';

    if (!topArtists || topArtists.length === 0) {
         similarArtistsButtonsContainer.innerHTML = '<p>No top artists identified.</p>';
         return;
    }

    topArtists.slice(0, 8).forEach(({ name }) => { // Show buttons for top ~8 artists
        const button = document.createElement('button');
        button.className = 'similar-artist-button'; // Use specific class
        button.textContent = name;
        button.dataset.artist = name;
        button.addEventListener('click', () => fetchAndDisplaySimilarArtists(name));
        similarArtistsButtonsContainer.appendChild(button);
    });
}

async function fetchAndDisplaySimilarArtists(artistName) {
    showLoading(true, `Fetching artists similar to '${artistName}' from Last.fm...`);
    similarArtistsListDiv.innerHTML = ''; // Clear previous results
    selectedArtistSpan.textContent = artistName; // Update title

    const params = { method: 'artist.getsimilar', artist: artistName, autocorrect: 1, limit: 8 };
    const data = await fetchLastFmAPI(params);

    showLoading(false);
    similarArtistsResultsPanel.classList.remove('hidden'); // Show panel

    if (data && data.similarartists && data.similarartists.artist && data.similarartists.artist.length > 0) {
        data.similarartists.artist.forEach(artist => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'lastfm-result-item'; // Can reuse style or make specific one
             // Link to Spotify search for the ARTIST
            const spotifySearchUrl = `https://open.spotify.com/search/${encodeURIComponent(artist.name)}`;
            itemDiv.innerHTML = `
                 <a href="${spotifySearchUrl}" target="_blank" rel="noopener noreferrer" title="Search '${artist.name}' on Spotify">${artist.name}</a>
                <span>(Match: ${Math.round(artist.match * 100)}%)</span>
            `;
             // Could add artist image via Last.fm API (`artist.getInfo`) or Spotify search if desired
            similarArtistsListDiv.appendChild(itemDiv);
        });
    } else {
        similarArtistsListDiv.innerHTML = `<p>Could not find similar artists for "${artistName}" on Last.fm.</p>`;
    }
}

// 5) Tracks by Genre Toggle - Implemented via displayTrackList and radio button listeners


// --- Main Analysis Flow ---

async function analyzePlaylist() {
    const playlistInputVal = playlistInput.value.trim();
    const playlistId = extractPlaylistId(playlistInputVal);

    if (!playlistId) {
        showError("Invalid Spotify Playlist URL or ID. Please use the format 'https://open.spotify.com/playlist/...' or just the ID.");
        return;
    }

    showLoading(true, "Starting analysis...");
    resultsContainer.classList.add('hidden'); // Hide previous results
    apiErrorDiv.classList.add('hidden'); // Clear old errors
    currentPlaylistData = null; // Reset data
    currentGenreFilter = null; // Reset filter

    try {
        // 1. Fetch Playlist Info
        showLoading(true, "Fetching playlist details...");
        const playlistInfo = await fetchSpotifyAPI(`v1/playlists/${playlistId}?fields=id,name,description,images,owner(display_name),external_urls`);
        if (!playlistInfo) throw new Error("Failed to fetch playlist details.");

        // 2. Fetch Tracks
        const tracksRaw = await getPlaylistTracks(playlistId);
        if (!tracksRaw || tracksRaw.length === 0) throw new Error("Playlist is empty or tracks could not be fetched.");

        // 3. Get Unique Artist IDs
        const artistIds = [...new Set(tracksRaw.flatMap(item => item.track?.artists?.map(a => a.id) || []).filter(id => id))];
         if (artistIds.length === 0) throw new Error("No artists found in the playlist tracks.");

        // 4. Fetch Artist Details (Spotify Genres + Last.fm Tags)
        const artistDetails = await getArtistDetailsAndGenres(artistIds);
         if (!artistDetails || Object.keys(artistDetails).length === 0) throw new Error("Failed to fetch artist details.");


        // 5. Process Data
        showLoading(true, "Processing data...");
        currentPlaylistData = processPlaylistData(playlistInfo, tracksRaw, artistDetails);

        // 6. Display Results
        showLoading(true, "Rendering results...");
        displayPlaylistInfo(currentPlaylistData);

        // -- Initial Display using default active sources --
        const initialGenreCounts = getGenreCounts(currentPlaylistData.tracks, activeGenreSource);
        updateCharts(initialGenreCounts);
        displayTopArtists(currentPlaylistData.tracks); // Will also populate similar artist buttons
        displayTrackList(currentPlaylistData.tracks, null, activeTrackGenreSource); // Initial track list display
         // displayReleaseYearChart(currentPlaylistData.tracks); // If you have this function
         // displayGenreConnections(initialGenreCounts); // If you have this function

        resultsContainer.classList.remove('hidden'); // Show results section

    } catch (error) {
        console.error("Analysis failed:", error);
        showError(`Analysis failed: ${error.message}`);
        resultsContainer.classList.add('hidden'); // Ensure results are hidden on error
    } finally {
        showLoading(false); // Ensure loading is hidden
    }
}

// --- Utility Functions ---

// Simple hash function for string to get a number (for color generation)
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

// Generate consistent colors based on labels
function generateConsistentColors(labels) {
    const colors = [];
    const hueStep = 360 / (labels.length || 1); // Distribute hues
    labels.forEach((label, index) => {
        const hashBasedHue = (simpleHash(label) % 360); // Use hash for consistency across runs
        // const indexBasedHue = (index * hueStep) % 360; // Alternative: Use index for distribution within this set
        // Use hash-based hue for more stability if labels might reappear with different neighbors
        const hue = hashBasedHue;
        // Use fixed saturation and lightness for vibrancy, vary hue
        colors.push(`hsl(${hue}, 70%, 60%)`);
    });
    return colors;
}

// Utility to slightly darken a color (for borders etc.)
function shadeColor(color, percent) {
    // Note: This is a simplified version for HSL colors from generateConsistentColors
    if (color.startsWith('hsl')) {
        try {
            let [h, s, l] = color.match(/\d+/g).map(Number);
            l += percent;
            l = Math.max(0, Math.min(100, l)); // Clamp lightness between 0 and 100
            return `hsl(${h}, ${s}%, ${l}%)`;
        } catch (e) {
             console.warn("Could not parse HSL color:", color);
             return color; // Return original on error
        }
    }
     // Basic fallback for non-HSL (less accurate) - consider a proper color library for hex/rgb
     return color;
}

// --- Event Listeners ---
loginButton.addEventListener('click', redirectToSpotifyLogin);
analyzeButton.addEventListener('click', analyzePlaylist);

// Genre Source Toggle Buttons
genreSourceButtons.forEach(button => {
    button.addEventListener('click', () => {
        updateActiveGenreSource(button.dataset.source);
    });
});

// Track Genre Source Radio Buttons
trackGenreSourceRadios.forEach(radio => {
    radio.addEventListener('click', () => {
        if (radio.checked) {
            updateActiveTrackGenreSource(radio.value);
        }
    });
});

// --- Initial Setup ---
document.addEventListener('DOMContentLoaded', () => {
    handleAuthentication();
    // Set initial state for toggles based on default variables
    document.querySelector(`.genre-source-button[data-source="${activeGenreSource}"]`).classList.add('active');
    document.getElementById(`genre-toggle-${activeTrackGenreSource}`).checked = true;

     // Initialize charts with empty data initially? Or hide them until data loads.
     // Hiding might be better. Ensure chart containers are hidden or show a placeholder.
});