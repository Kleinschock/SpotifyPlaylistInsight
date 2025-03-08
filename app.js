// Ensure loading overlay is hidden on page load
document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('loading-overlay').classList.add('hidden');
});

// Your Spotify API credentials
const clientId = '732dc1eab09c4120945541da8f197de8';
const redirectUri = 'https://kleinschock.github.io/SpotifyPlaylistInsight/';

// Required Spotify API scopes
// Required Spotify API scopes
const scopes = 'playlist-read-private playlist-read-collaborative user-read-private user-top-read';

// DOM elements
const loginButton = document.getElementById('login-button');
const playlistContainer = document.getElementById('playlist-container');
const playlistInput = document.getElementById('playlist-input');
const analyzeButton = document.getElementById('analyze-button');
const resultsContainer = document.getElementById('results-container');
const playlistInfoDiv = document.getElementById('playlist-info');
const trackGenresList = document.getElementById('track-genres-list');

// Event listeners
loginButton.addEventListener('click', handleLogin);
analyzeButton.addEventListener('click', analyzePlaylist);

// Check if we're coming back from Spotify auth
window.onload = function() {
    const params = new URLSearchParams(window.location.hash.substring(1));
    const accessToken = params.get('access_token');
    
    if (accessToken) {
        // Store the token and show the playlist input
        localStorage.setItem('spotify_access_token', accessToken);
        document.getElementById('login-container').classList.add('hidden');
        playlistContainer.classList.remove('hidden');
        
        // Clear the hash to avoid issues if the page is refreshed
        window.history.replaceState(null, null, ' ');
    } else if (localStorage.getItem('spotify_access_token')) {
        // We already have a token
        document.getElementById('login-container').classList.add('hidden');
        playlistContainer.classList.remove('hidden');
    }
};

// Handle login with Spotify
function handleLogin() {
    const authUrl = `https://accounts.spotify.com/authorize?client_id=${clientId}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}`;
    window.location.href = authUrl;
}

// Analyze the playlist
async function analyzePlaylist() {
    const playlistUrl = playlistInput.value.trim();
    if (!playlistUrl) {
        alert('Please enter a Spotify playlist URL or ID');
        return;
    }
    
    // Extract playlist ID from URL or use the input as ID
    const playlistId = extractPlaylistId(playlistUrl);
    if (!playlistId) {
        alert('Invalid playlist URL or ID');
        return;
    }
    
    try {
        showLoading();
        
        // Get the playlist data
        const playlistData = await getPlaylist(playlistId);
        const tracks = playlistData.tracks.items.map(item => item.track).filter(track => track); // Filter out null tracks
        
        // Get genres for each artist
        const artistIds = [...new Set(tracks.flatMap(track => track.artists.map(artist => artist.id)))];
        const artistGenres = await getArtistGenres(artistIds);
        
        // Assign genres to tracks
        const tracksWithGenres = assignGenresToTracks(tracks, artistGenres);
        
        // Generate genre statistics
        const genreStats = generateGenreStats(tracksWithGenres);
        
        // Display the results
        displayResults(playlistData, tracksWithGenres, genreStats);
    } catch (error) {
        console.error('Error analyzing playlist:', error);
        alert('Error analyzing playlist. Please check the URL and try again.');
    } finally {
        hideLoading();
    }
}

// Show loading indicator
function showLoading() {
    document.getElementById('loading-overlay').classList.remove('hidden');
}

// Hide loading indicator
function hideLoading() {
    document.getElementById('loading-overlay').classList.add('hidden');
}

// Extract playlist ID from URL or use as is
function extractPlaylistId(input) {
    // Check if it's a full URL
    if (input.includes('spotify.com/playlist/')) {
        const match = input.match(/playlist\/([a-zA-Z0-9]+)/);
        return match ? match[1] : null;
    }
    // Check if it's just the ID
    if (/^[a-zA-Z0-9]{22}$/.test(input)) {
        return input;
    }
    return null;
}

// Fetch playlist data from Spotify API (including all tracks)
async function getPlaylist(playlistId) {
    const accessToken = localStorage.getItem('spotify_access_token');
    if (!accessToken) {
        throw new Error('No access token found. Please login again.');
    }
    
    // Get playlist details
    const response = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}`, {
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });
    
    if (!response.ok) {
        if (response.status === 401) {
            // Token expired, clear it and redirect to login
            localStorage.removeItem('spotify_access_token');
            alert('Session expired. Please login again.');
            window.location.href = window.location.pathname;
            throw new Error('Session expired');
        }
        throw new Error(`Failed to get playlist: ${response.statusText}`);
    }
    
    const playlistData = await response.json();
    
    // If there are more tracks than returned in the first request
    if (playlistData.tracks.total > playlistData.tracks.items.length) {
        // Fetch all remaining tracks
        const allTracks = [...playlistData.tracks.items];
        let nextUrl = playlistData.tracks.next;
        
        while (nextUrl) {
            const tracksResponse = await fetch(nextUrl, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });
            
            if (!tracksResponse.ok) {
                throw new Error(`Failed to get tracks: ${tracksResponse.statusText}`);
            }
            
            const tracksData = await tracksResponse.json();
            allTracks.push(...tracksData.items);
            nextUrl = tracksData.next;
        }
        
        // Replace the tracks in the playlist data
        playlistData.tracks.items = allTracks;
    }
    
    return playlistData;
}

// Get genres for artists
async function getArtistGenres(artistIds) {
    const accessToken = localStorage.getItem('spotify_access_token');
    const result = {};
    
    // Spotify API allows a maximum of 50 IDs per request
    for (let i = 0; i < artistIds.length; i += 50) {
        const batch = artistIds.slice(i, i + 50);
        const response = await fetch(`https://api.spotify.com/v1/artists?ids=${batch.join(',')}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to get artist data: ${response.statusText}`);
        }
        
        const data = await response.json();
        data.artists.forEach(artist => {
            result[artist.id] = artist.genres;
        });
    }
    
    return result;
}

// Assign genres to tracks based on artist genres
function assignGenresToTracks(tracks, artistGenres) {
    return tracks.map(track => {
        // Collect all genres from all artists of the track
        const genres = [...new Set(track.artists.flatMap(artist => 
            artistGenres[artist.id] || []))];
        
        return {
            ...track,
            genres: genres.length ? genres : ['Unknown']
        };
    });
}

// Generate statistics about genres
function generateGenreStats(tracksWithGenres) {
    const genreCounts = {};
    
    tracksWithGenres.forEach(track => {
        track.genres.forEach(genre => {
            genreCounts[genre] = (genreCounts[genre] || 0) + 1;
        });
    });
    
    // Sort genres by count (descending)
    const sortedGenres = Object.entries(genreCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([genre, count]) => ({
            genre,
            count,
            percentage: (count / tracksWithGenres.length * 100).toFixed(1)
        }));
    
    return {
        allGenres: sortedGenres,
        topGenres: sortedGenres.slice(0, 10) // Top 10 genres
    };
}
// Display the results with proper error handling
function displayResults(playlistData, tracksWithGenres, genreStats) {
    console.log("Starting displayResults function");
    resultsContainer.classList.remove('hidden');
    
    // Display playlist info
    playlistInfoDiv.innerHTML = `
        <img src="${playlistData.images[0]?.url || 'placeholder.png'}" alt="${playlistData.name}">
        <h2>${playlistData.name}</h2>
        <p>by ${playlistData.owner.display_name}</p>
        <p>${tracksWithGenres.length} tracks</p>
    `;
    
    // Create pie chart for top genres
    createGenrePieChart(genreStats.topGenres);
    
    // Create bar chart for top genres
    createGenreBarChart(genreStats.topGenres);
    
    // Display track list with genres
    displayTrackGenres(tracksWithGenres);
    
    // Create the Genre Network Visualization (doesn't need API)
    createGenreNetworkChart(tracksWithGenres);
    
    // Setup Genre Radio buttons (doesn't need API)
    setupGenreRadioButtons(genreStats.topGenres);
    
    // Create Release Year Analysis (doesn't need API)
    createReleaseYearChart(tracksWithGenres);
    
    // Display Genre Similarity Expansion (doesn't need API)
    displayGenreSimilarityExpansion(genreStats.topGenres.map(g => g.genre));
    
    // Get track IDs for audio features - limit to just 5 tracks to avoid rate limits
    const trackIds = tracksWithGenres.map(track => track.id).slice(0, 5);
    console.log(`Processing ${trackIds.length} tracks for audio features`);
    // Show missing genres with error handling
    const missingGenresContainer = document.getElementById('missing-genres-container');
    findMissingGenres(genreStats.allGenres.map(g => g.genre))
        .then(missingGenres => {
            displayMissingGenres(missingGenres);
        })
        .catch(error => {
            console.error('Error finding missing genres:', error);
            missingGenresContainer.innerHTML = `
                <h3>Discover Missing Genres</h3>
                <p class="error-message">Unable to load genre recommendations: ${error.message}</p>
            `;
        });
    
    // Get audio features with error handling - limit to 50 tracks
    const audioFeaturesContainer = document.getElementById('audio-features-container');
    const moodContainer = document.getElementById('mood-trajectory-container');
    
    getAudioFeatures(trackIds)
        .then(audioFeatures => {
            // Combine tracks with their audio features
            const tracksWithAudioFeatures = tracksWithGenres
                .filter(track => audioFeatures[track.id]) // Only include tracks with audio features
                .map(track => ({
                    ...track,
                    audioFeatures: audioFeatures[track.id]
                }));
            
            if (tracksWithAudioFeatures.length === 0) {
                throw new Error('No audio features data available');
            }
            
            // Create audio feature charts
            createAudioFeatureCharts(tracksWithAudioFeatures);
            
            // Create mood trajectory visualization
            createMoodJourneyChart(tracksWithAudioFeatures);
        })
        .catch(error => {
            console.error('Error creating audio feature charts:', error);
            audioFeaturesContainer.innerHTML = `
                <h3>Audio Features Analysis</h3>
                <p class="error-message">Unable to load audio features: ${error.message}</p>
                <p>Note: Spotify has deprecated some audio features endpoints.</p>
            `;
            
            moodContainer.innerHTML = `
                <h3>Mood Trajectory</h3>
                <p class="error-message">Unable to load mood trajectory: ${error.message}</p>
            `;
        });
    
    // Scroll to results
    resultsContainer.scrollIntoView({ behavior: 'smooth' });
}

// Create a pie chart for genres
function createGenrePieChart(topGenres) {
    const ctx = document.getElementById('genre-pie-chart').getContext('2d');
    
    // Generate colors for each genre
    const colors = generateColors(topGenres.length);
    
    // Prepare data for Chart.js
    const data = {
        labels: topGenres.map(g => g.genre),
        datasets: [{
            data: topGenres.map(g => g.count),
            backgroundColor: colors,
            borderColor: 'white',
            borderWidth: 1
        }]
    };
    
    // Destroy previous chart if it exists
    if (window.genreChart) {
        window.genreChart.destroy();
    }
    
    // Create new chart
    window.genreChart = new Chart(ctx, {
        type: 'pie',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        padding: 20,
                        boxWidth: 12
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const genre = topGenres[context.dataIndex];
                            return `${genre.genre}: ${genre.count} tracks (${genre.percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

// Create a bar chart for genres
function createGenreBarChart(topGenres) {
    const ctx = document.getElementById('genre-bar-chart').getContext('2d');
    
    // Generate colors for each genre
    const colors = generateColors(topGenres.length);
    
    // Prepare data for Chart.js
    const data = {
        labels: topGenres.map(g => g.genre),
        datasets: [{
            label: 'Number of Tracks',
            data: topGenres.map(g => g.count),
            backgroundColor: colors,
            borderColor: colors,
            borderWidth: 1
        }]
    };
    
    // Destroy previous chart if it exists
    if (window.genreBarChart) {
        window.genreBarChart.destroy();
    }
    
    // Create new chart
    window.genreBarChart = new Chart(ctx, {
        type: 'bar',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',  // horizontal bar chart
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const genre = topGenres[context.dataIndex];
                            return `${genre.count} tracks (${genre.percentage}%)`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Number of Tracks'
                    }
                }
            }
        }
    });
}

// Generate colors for chart
function generateColors(count) {
    const colors = [];
    for (let i = 0; i < count; i++) {
        const hue = (i * (360 / count)) % 360;
        colors.push(`hsl(${hue}, 70%, 60%)`);
    }
    return colors;
}

// Display track list with genres
function displayTrackGenres(tracks) {
    trackGenresList.innerHTML = '';
    
    tracks.forEach(track => {
        const trackCard = document.createElement('div');
        trackCard.className = 'track-card';
        
        trackCard.innerHTML = `
            <img src="${track.album.images[2]?.url || 'placeholder.png'}" alt="${track.name}">
            <div class="track-title">${track.name}</div>
            <div class="track-artist">${track.artists.map(a => a.name).join(', ')}</div>
            <div class="track-genres">
                ${track.genres.map(genre => `
                    <span class="track-genre">${genre}</span>
                `).join(' ')}
            </div>
        `;
        
        trackGenresList.appendChild(trackCard);
    });
}
// Get audio features for just 5 tracks to avoid rate limits
async function getAudioFeatures(trackIds) {
    if (!trackIds || trackIds.length === 0) {
        throw new Error('No track IDs provided for audio features');
    }
    
    const accessToken = localStorage.getItem('spotify_access_token');
    if (!accessToken) {
        throw new Error('No access token available');
    }
    
    const audioFeatures = {};
    // Only process the first 5 tracks to dramatically reduce API calls
    const tracksToProcess = Math.min(trackIds.length, 5);
    
    for (let i = 0; i < tracksToProcess; i++) {
        try {
            const trackId = trackIds[i];
            console.log(`Fetching audio features for track ${i+1}/${tracksToProcess}: ${trackId}`);
            
            const response = await fetch(`https://api.spotify.com/v1/audio-features/${trackId}`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            
            if (!response.ok) {
                console.error(`API response not OK: ${response.status} ${response.statusText}`);
                if (response.status === 401) {
                    localStorage.removeItem('spotify_access_token');
                    throw new Error('Authentication failed. Please log in again.');
                }
                throw new Error(`API error: ${response.status} ${response.statusText}`);
            }
            
            const feature = await response.json();
            if (feature && feature.id) {
                audioFeatures[feature.id] = feature;
            }
            
            // Add a significant delay between requests (500ms)
            if (i < tracksToProcess - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        } catch (error) {
            console.error(`Error with track: ${error.message}`);
            // If we fail with one track, try the next one
        }
    }
    
    if (Object.keys(audioFeatures).length === 0) {
        throw new Error('Could not retrieve audio features for any tracks');
    }
    
    return audioFeatures;
}
function createAudioFeatureCharts(tracksWithFeatures) {
    // Energy vs Danceability scatter plot
    createEnergyDanceabilityChart(tracksWithFeatures);
    
    // Tempo histogram
    createTempoChart(tracksWithFeatures);
    
    // Acousticness vs Instrumentalness
    createAcousticInstrumentalChart(tracksWithFeatures);
    
    // Radar chart of average features
    createFeaturesRadarChart(tracksWithFeatures);
}

function createEnergyDanceabilityChart(tracks) {
    const ctx = document.getElementById('energy-dance-chart').getContext('2d');
    
    // Extract data points
    const data = tracks.map(track => ({
        x: track.audioFeatures.danceability,
        y: track.audioFeatures.energy,
        r: 8,
        trackName: track.name,
        artist: track.artists[0].name
    }));
    
    if (window.energyDanceChart) {
        window.energyDanceChart.destroy();
    }
    
    window.energyDanceChart = new Chart(ctx, {
        type: 'bubble',
        data: {
            datasets: [{
                label: 'Tracks',
                data: data,
                backgroundColor: 'rgba(29, 185, 84, 0.6)',
                borderColor: 'rgba(29, 185, 84, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Danceability'
                    },
                    min: 0,
                    max: 1
                },
                y: {
                    title: {
                        display: true,
                        text: 'Energy'
                    },
                    min: 0,
                    max: 1
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const point = context.raw;
                            return [
                                `${point.trackName} - ${point.artist}`,
                                `Danceability: ${point.x.toFixed(2)}`,
                                `Energy: ${point.y.toFixed(2)}`
                            ];
                        }
                    }
                }
            }
        }
    });
}

function createTempoChart(tracks) {
    const ctx = document.getElementById('tempo-chart').getContext('2d');
    
    // Group tempos into ranges
    const tempoBins = {};
    const binSize = 10; // Group by 10 BPM intervals
    
    tracks.forEach(track => {
        const tempo = track.audioFeatures.tempo;
        const bin = Math.floor(tempo / binSize) * binSize;
        tempoBins[bin] = (tempoBins[bin] || 0) + 1;
    });
    
    // Convert to sorted arrays for chart
    const bins = Object.keys(tempoBins).sort((a, b) => a - b);
    const counts = bins.map(bin => tempoBins[bin]);
    
    if (window.tempoChart) {
        window.tempoChart.destroy();
    }
    
    window.tempoChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: bins.map(bin => `${bin}-${parseInt(bin) + binSize} BPM`),
            datasets: [{
                label: 'Number of Tracks',
                data: counts,
                backgroundColor: 'rgba(29, 185, 84, 0.6)',
                borderColor: 'rgba(29, 185, 84, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Number of Tracks'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Tempo (BPM)'
                    }
                }
            }
        }
    });
}

function createAcousticInstrumentalChart(tracks) {
    const ctx = document.getElementById('acoustic-instrument-chart').getContext('2d');
    
    // Extract data points
    const data = tracks.map(track => ({
        x: track.audioFeatures.acousticness,
        y: track.audioFeatures.instrumentalness,
        r: 8,
        trackName: track.name,
        artist: track.artists[0].name
    }));
    
    if (window.acousticChart) {
        window.acousticChart.destroy();
    }
    
    window.acousticChart = new Chart(ctx, {
        type: 'bubble',
        data: {
            datasets: [{
                label: 'Tracks',
                data: data,
                backgroundColor: 'rgba(29, 185, 84, 0.6)',
                borderColor: 'rgba(29, 185, 84, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Acousticness'
                    },
                    min: 0,
                    max: 1
                },
                y: {
                    title: {
                        display: true,
                        text: 'Instrumentalness'
                    },
                    min: 0,
                    max: 1
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const point = context.raw;
                            return [
                                `${point.trackName} - ${point.artist}`,
                                `Acousticness: ${point.x.toFixed(2)}`,
                                `Instrumentalness: ${point.y.toFixed(2)}`
                            ];
                        }
                    }
                }
            }
        }
    });
}

function createFeaturesRadarChart(tracks) {
    const ctx = document.getElementById('features-radar-chart').getContext('2d');
    
    // Calculate averages for each feature
    const features = [
        'danceability', 'energy', 'acousticness', 
        'instrumentalness', 'liveness', 'valence'
    ];
    
    const averages = {};
    features.forEach(feature => {
        const sum = tracks.reduce((total, track) => 
            total + track.audioFeatures[feature], 0);
        averages[feature] = sum / tracks.length;
    });
    
    if (window.featuresRadarChart) {
        window.featuresRadarChart.destroy();
    }
    
    window.featuresRadarChart = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: [
                'Danceability', 'Energy', 'Acousticness', 
                'Instrumentalness', 'Liveness', 'Positivity'
            ],
            datasets: [{
                label: 'Playlist Average',
                data: [
                    averages.danceability, 
                    averages.energy, 
                    averages.acousticness, 
                    averages.instrumentalness, 
                    averages.liveness, 
                    averages.valence
                ],
                backgroundColor: 'rgba(29, 185, 84, 0.2)',
                borderColor: 'rgba(29, 185, 84, 1)',
                borderWidth: 2,
                pointBackgroundColor: 'rgba(29, 185, 84, 1)'
            }]
        },
        options: {
            responsive: true,
            scale: {
                ticks: {
                    beginAtZero: true,
                    max: 1
                }
            }
        }
    });
}

// 3. Genre Network Visualization
function createGenreNetworkChart(tracksWithGenres) {
    const container = document.getElementById('genre-network');
    container.innerHTML = ''; // Clear previous visualization
    
    // Get all unique genres
    const allGenres = [...new Set(tracksWithGenres.flatMap(track => track.genres))];
    
    // Create nodes for each genre
    const nodes = allGenres.map(genre => ({ 
        id: genre, 
        label: genre, 
        value: tracksWithGenres.filter(t => t.genres.includes(genre)).length
    }));
    
    // Create edges between genres that appear in the same track
    const edgesMap = new Map(); // To keep track of edges we've already counted
    
    tracksWithGenres.forEach(track => {
        for (let i = 0; i < track.genres.length; i++) {
            for (let j = i + 1; j < track.genres.length; j++) {
                // Create a unique key for this edge
                const genreA = track.genres[i];
                const genreB = track.genres[j];
                const edgeKey = [genreA, genreB].sort().join('--');
                
                if (edgesMap.has(edgeKey)) {
                    const currentValue = edgesMap.get(edgeKey);
                    edgesMap.set(edgeKey, currentValue + 1);
                } else {
                    edgesMap.set(edgeKey, 1);
                }
            }
        }
    });
    
    // Convert our map to the edges array format
    const edges = Array.from(edgesMap.entries()).map(([key, value]) => {
        const [from, to] = key.split('--');
        return { from, to, value };
    });
    
    // Create a simple visualization (for a proper network graph, we'd need a library like vis.js)
    container.innerHTML = `
        <div style="padding: 20px; text-align: center; background: #f8f8f8; height: 100%; display: flex; align-items: center; justify-content: center;">
            <div>
                <h4>Genre Connections</h4>
                <p>This visualization shows how ${nodes.length} genres are connected in your playlist.</p>
                <p>The most common genres: ${nodes.sort((a,b) => b.value - a.value).slice(0,5).map(n => n.label).join(', ')}</p>
                <p>The strongest connections: ${edges.sort((a,b) => b.value - a.value).slice(0,3).map(e => `${e.from} ↔ ${e.to}`).join(', ')}</p>
            </div>
        </div>
    `;
}
// Use a curated list of genres since the API endpoint is deprecated
function getSpotifyGenres() {
    // This is a comprehensive list of common Spotify genres
    return [
        "acoustic", "afrobeat", "alt-rock", "alternative", "ambient", "anime", 
        "black-metal", "bluegrass", "blues", "bossanova", "brazil", "breakbeat", 
        "british", "cantopop", "chicago-house", "children", "chill", "classical", 
        "club", "comedy", "country", "dance", "dancehall", "death-metal", "deep-house", 
        "detroit-techno", "disco", "disney", "drum-and-bass", "dub", "dubstep", 
        "edm", "electro", "electronic", "emo", "folk", "forro", "french", "funk", 
        "garage", "german", "gospel", "goth", "grindcore", "groove", "grunge", 
        "guitar", "happy", "hard-rock", "hardcore", "hardstyle", "heavy-metal", 
        "hip-hop", "house", "idm", "indian", "indie", "indie-pop", "industrial", 
        "iranian", "j-dance", "j-idol", "j-pop", "j-rock", "jazz", "k-pop", 
        "kids", "latin", "latino", "malay", "mandopop", "metal", "metal-misc", 
        "metalcore", "minimal-techno", "mpb", "new-age", "new-release", "opera", 
        "pagode", "party", "piano", "pop", "pop-film", "post-dubstep", "power-pop", 
        "progressive-house", "psych-rock", "punk", "punk-rock", "r-n-b", "rainy-day", 
        "reggae", "reggaeton", "road-trip", "rock", "rock-n-roll", "rockabilly", 
        "romance", "sad", "salsa", "samba", "sertanejo", "show-tunes", "singer-songwriter", 
        "ska", "sleep", "songwriter", "soul", "soundtracks", "spanish", "study", 
        "summer", "swedish", "synth-pop", "tango", "techno", "trance", "trip-hop", 
        "turkish", "work-out", "world-music"
    ];
}

async function findMissingGenres(existingGenres) {
    try {
        const allGenres = getSpotifyGenres();
        
        // Normalize existing genres (lowercase for comparison)
        const normalizedExistingGenres = existingGenres.map(g => g.toLowerCase());
        
        // Find genres that aren't in the playlist
        const missingGenres = allGenres.filter(genre => 
            !normalizedExistingGenres.some(existing => 
                existing.includes(genre) || genre.includes(existing)
            )
        );
        
        // Get a random selection of missing genres to recommend
        return missingGenres
            .sort(() => 0.5 - Math.random())
            .slice(0, 15);
    } catch (error) {
        console.error('Error finding missing genres:', error);
        throw error;
    }
}

function displayMissingGenres(missingGenres) {
    const container = document.getElementById('missing-genres-list');
    container.innerHTML = '';
    
    if (missingGenres.length === 0) {
        container.innerHTML = '<p>No additional genre recommendations found.</p>';
        return;
    }
    
    missingGenres.forEach(genre => {
        const genreTag = document.createElement('span');
        genreTag.className = 'genre-tag';
        genreTag.textContent = genre;
        genreTag.addEventListener('click', () => {
            window.open(`https://open.spotify.com/search/${encodeURIComponent(genre)}`, '_blank');
        });
        
        container.appendChild(genreTag);
    });
}

// 5. Mood Trajectory Visualization
function createMoodJourneyChart(tracks) {
    const ctx = document.getElementById('mood-journey-chart').getContext('2d');
    
    // Sort tracks by position in playlist (assuming they're already in order)
    const labels = tracks.map((t, i) => `Track ${i+1}`);
    const energy = tracks.map(t => t.audioFeatures.energy);
    const valence = tracks.map(t => t.audioFeatures.valence);
    
    if (window.moodJourneyChart) {
        window.moodJourneyChart.destroy();
    }
    
    window.moodJourneyChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Energy',
                    data: energy,
                    borderColor: '#ff6384',
                    backgroundColor: 'rgba(255, 99, 132, 0.1)',
                    fill: true,
                    tension: 0.4
                },
                {
                    label: 'Positivity (Valence)',
                    data: valence,
                    borderColor: '#36a2eb',
                    backgroundColor: 'rgba(54, 162, 235, 0.1)',
                    fill: true,
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: 'Emotional Journey of Your Playlist'
                },
                tooltip: {
                    callbacks: {
                        afterLabel: function(context) {
                            const trackIndex = context.dataIndex;
                            const track = tracks[trackIndex];
                            return `${track.name} - ${track.artists[0].name}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    min: 0,
                    max: 1,
                    title: {
                        display: true,
                        text: 'Intensity'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Playlist Progression'
                    }
                }
            }
        }
    });
}

// 6. One-Click Genre Radio Generator
function setupGenreRadioButtons(genres) {
    const container = document.getElementById('genre-radio-buttons');
    container.innerHTML = '';
    
    // Use only the top 5 genres
    const topGenres = genres.slice(0, 5);
    
    topGenres.forEach(genre => {
        const button = document.createElement('button');
        button.className = 'genre-radio-button';
        button.textContent = `${genre.genre} Radio`;
        button.addEventListener('click', () => createGenreRadio(genre.genre));
        container.appendChild(button);
    });
}

async function createGenreRadio(genre) {
    // Open Spotify's genre radio in a new tab
    window.open(`https://open.spotify.com/search/${encodeURIComponent(genre)}/playlists`, '_blank');
}

// 7. Release Year Analysis
function createReleaseYearChart(tracks) {
    const yearCounts = {};
    
    tracks.forEach(track => {
        if (track.album && track.album.release_date) {
            // Extract the year from the release date
            const year = track.album.release_date.substring(0, 4);
            yearCounts[year] = (yearCounts[year] || 0) + 1;
        }
    });
    
    // Convert to arrays for Chart.js
    const years = Object.keys(yearCounts).sort();
    const counts = years.map(year => yearCounts[year]);
    
    const ctx = document.getElementById('release-year-chart').getContext('2d');
    
    if (window.releaseYearChart) {
        window.releaseYearChart.destroy();
    }
    
    window.releaseYearChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: years,
            datasets: [{
                label: 'Tracks per Year',
                data: counts,
                backgroundColor: 'rgba(29, 185, 84, 0.6)',
                borderColor: 'rgba(29, 185, 84, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Number of Tracks'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Release Year'
                    }
                }
            }
        }
    });
}

// 10. Genre Similarity Expansion
function displayGenreSimilarityExpansion(mainGenres) {
    const container = document.getElementById('similar-genres-list');
    container.innerHTML = '';
    
    // Generic genre similarity mapping
    const genreSimilarity = {
        'pop': ['dance pop', 'electropop', 'pop rock', 'indie pop', 'synth pop'],
        'rock': ['alternative rock', 'classic rock', 'indie rock', 'hard rock', 'punk rock'],
        'hip hop': ['rap', 'trap', 'conscious hip hop', 'southern hip hop', 'alternative hip hop'],
        'r&b': ['soul', 'contemporary r&b', 'neo soul', 'urban contemporary', 'funk'],
        'electronic': ['edm', 'house', 'techno', 'trance', 'dubstep'],
        'dance': ['dance pop', 'electro house', 'disco', 'dance rock', 'eurodance'],
        'indie': ['indie pop', 'indie rock', 'indie folk', 'indietronica', 'chamber pop'],
        'alternative': ['alternative rock', 'indie rock', 'post-punk', 'new wave', 'grunge'],
        'metal': ['heavy metal', 'death metal', 'thrash metal', 'black metal', 'power metal'],
        'folk': ['folk rock', 'indie folk', 'contemporary folk', 'americana', 'singer-songwriter'],
        'jazz': ['smooth jazz', 'bebop', 'fusion', 'cool jazz', 'swing'],
        'classical': ['contemporary classical', 'baroque', 'romantic', 'opera', 'symphony'],
        'reggae': ['dancehall', 'reggae fusion', 'dub', 'roots reggae', 'ska'],
        'country': ['contemporary country', 'country rock', 'country pop', 'outlaw country', 'americana'],
        'blues': ['electric blues', 'chicago blues', 'soul blues', 'delta blues', 'jazz blues'],
        'latin': ['reggaeton', 'latin pop', 'salsa', 'bachata', 'latin rock'],
        'funk': ['funk rock', 'p-funk', 'disco', 'soul funk', 'electro funk'],
        'soul': ['neo soul', 'southern soul', 'northern soul', 'motown', 'psychedelic soul'],
        'disco': ['nu-disco', 'eurodisco', 'italo-disco', 'funk', 'dance'],
        'house': ['deep house', 'tech house', 'progressive house', 'electro house', 'acid house'],
        'techno': ['tech house', 'minimal techno', 'detroit techno', 'acid techno', 'hard techno'],
        'trance': ['progressive trance', 'uplifting trance', 'vocal trance', 'psychedelic trance', 'tech trance'],
        'ambient': ['chillout', 'downtempo', 'drone', 'dark ambient', 'ambient electronic'],
        'drum and bass': ['liquid drum and bass', 'jungle', 'darkstep', 'neurofunk', 'breakbeat'],
        'dubstep': ['brostep', 'chillstep', 'future garage', 'post-dubstep', 'riddim'],
        'punk': ['hardcore punk', 'post-punk', 'pop punk', 'skate punk', 'punk rock']
    };
    
    // Get the top 5 genres for similarity expansion
    const topGenres = mainGenres.slice(0, 5);
    let hasRecommendations = false;
    
    topGenres.forEach(genreObj => {
        const genre = genreObj.toLowerCase();
        let similarGenres = [];
        
        // First look for exact matches
        if (genreSimilarity[genre]) {
            similarGenres = genreSimilarity[genre];
        } else {
            // If no exact match, look for partial matches
            for (const key of Object.keys(genreSimilarity)) {
                if (genre.includes(key) || key.includes(genre)) {
                    similarGenres = genreSimilarity[key];
                    break;
                }
            }
        }
        
        if (similarGenres.length > 0) {
            hasRecommendations = true;
            
            const card = document.createElement('div');
            card.className = 'similar-genre-card';
            
            card.innerHTML = `
                <h4>${genreObj}</h4>
                <ul>
                    ${similarGenres.map(similar => `
                        <li><a href="https://open.spotify.com/search/${encodeURIComponent(similar)}" 
                            target="_blank" rel="noopener">${similar}</a></li>
                    `).join('')}
                </ul>
            `;
            
            container.appendChild(card);
        }
    });
    
    if (!hasRecommendations) {
        container.innerHTML = '<p>No similar genre recommendations found for your top genres.</p>';
    }
}
// Debug function to check token
function debugToken() {
    const token = localStorage.getItem('spotify_access_token');
    if (!token) {
        alert('No token found! Please login again.');
        return;
    }
    
    const tokenParts = token.split('.');
    if (tokenParts.length < 2) {
        alert(`Token looks unusual: ${token.substring(0, 10)}...`);
        return;
    }
    
    // Check token expiration
    try {
        const payload = JSON.parse(atob(tokenParts[1]));
        const expiry = payload.exp * 1000; // convert to milliseconds
        const now = Date.now();
        const timeLeft = expiry - now;
        
        if (timeLeft < 0) {
            alert('Token has expired! Please login again.');
        } else {
            alert(`Token is valid for ${Math.round(timeLeft/60000)} more minutes.`);
        }
    } catch (e) {
        // For Spotify tokens which might not be decodable JWT tokens
        alert('Token exists but could not determine expiration. Try logging in again if you have issues.');
    }
    
    // Try a simple API call to check token validity
    fetch('https://api.spotify.com/v1/me', {
        headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(response => {
        if (response.ok) {
            return response.json();
        }
        throw new Error(`API responded with status: ${response.status}`);
    })
    .then(data => {
        alert(`API check successful! Logged in as: ${data.display_name}`);
    })
    .catch(error => {
        alert(`API check failed: ${error.message}`);
    });
}