// Ensure loading overlay is hidden on page load
document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('loading-overlay').classList.add('hidden');
});

// Your Spotify API credentials
const clientId = '732dc1eab09c4120945541da8f197de8';
const redirectUri = 'https://kleinschock.github.io/SpotifyPlaylistInsight/';

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
// Top Artists Showcase
function displayTopArtistsShowcase(tracks) {
    const container = document.getElementById('top-artists-container');
    const chartCanvas = document.getElementById('top-artists-chart');
    
    // Count artist appearances
    const artistCounts = {};
    tracks.forEach(track => {
        track.artists.forEach(artist => {
            artistCounts[artist.id] = artistCounts[artist.id] || {
                id: artist.id,
                name: artist.name,
                count: 0
            };
            artistCounts[artist.id].count++;
        });
    });
    
    // Convert to array and sort by count
    const artistsArray = Object.values(artistCounts)
        .sort((a, b) => b.count - a.count)
        .slice(0, 10); // Take top 10 artists
    
    // Calculate percentages
    const totalTracks = tracks.length;
    artistsArray.forEach(artist => {
        artist.percentage = (artist.count / totalTracks * 100).toFixed(1);
    });
    
    // Create chart data
    const labels = artistsArray.map(a => a.name);
    const data = artistsArray.map(a => a.count);
    const colors = generateColors(artistsArray.length);
    
    // Create bar chart
    if (window.topArtistsChart) {
        window.topArtistsChart.destroy();
    }
    
    window.topArtistsChart = new Chart(chartCanvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Number of Tracks',
                data: data,
                backgroundColor: colors,
                borderColor: colors.map(c => c.replace('0.6', '1')),
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const artist = artistsArray[context.dataIndex];
                            return `${artist.count} tracks (${artist.percentage}%)`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Number of Tracks'
                    }
                }
            }
        }
    });
    
    // Display artist list with images
    const artistList = document.getElementById('top-artists-list');
    artistList.innerHTML = '';
    
    artistsArray.forEach(artist => {
        const artistElement = document.createElement('div');
        artistElement.className = 'artist-card';
        
        // Try to fetch the artist info to get images
        fetchArtistInfo(artist.id)
            .then(artistInfo => {
                const imageUrl = artistInfo && artistInfo.images && artistInfo.images.length > 0 
                    ? artistInfo.images[artistInfo.images.length > 1 ? 1 : 0].url 
                    : 'placeholder.png';
                
                artistElement.innerHTML = `
                    <img src="${imageUrl}" alt="${artist.name}">
                    <div class="artist-info">
                        <h4>${artist.name}</h4>
                        <p>${artist.count} tracks (${artist.percentage}%)</p>
                        <button class="artist-more-button" onclick="window.open('https://open.spotify.com/artist/${artist.id}', '_blank')">
                            View on Spotify
                        </button>
                    </div>
                `;
            })
            .catch(error => {
                // Fallback if we can't get the image
                artistElement.innerHTML = `
                    <div class="artist-placeholder"></div>
                    <div class="artist-info">
                        <h4>${artist.name}</h4>
                        <p>${artist.count} tracks (${artist.percentage}%)</p>
                        <button class="artist-more-button" onclick="window.open('https://open.spotify.com/artist/${artist.id}', '_blank')">
                            View on Spotify
                        </button>
                    </div>
                `;
            });
        
        artistList.appendChild(artistElement);
    });
}

// Helper function to fetch artist information
async function fetchArtistInfo(artistId) {
    const accessToken = localStorage.getItem('spotify_access_token');
    if (!accessToken) {
        throw new Error('No access token found');
    }
    
    const response = await fetch(`https://api.spotify.com/v1/artists/${artistId}`, {
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });
    
    if (!response.ok) {
        throw new Error(`Failed to fetch artist info: ${response.statusText}`);
    }
    
    return await response.json();
}

// Similar Artists Discovery
function setupSimilarArtistsDiscovery(tracks) {
    const container = document.getElementById('similar-artists-container');
    
    // Count artist appearances
    const artistCounts = {};
    tracks.forEach(track => {
        track.artists.forEach(artist => {
            artistCounts[artist.id] = artistCounts[artist.id] || {
                id: artist.id,
                name: artist.name,
                count: 0
            };
            artistCounts[artist.id].count++;
        });
    });
    
    // Convert to array and sort by count
    const topArtists = Object.values(artistCounts)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5); // Take top 5 artists
    
    // Create buttons for each top artist
    const buttonsContainer = document.getElementById('similar-artists-buttons');
    buttonsContainer.innerHTML = '';
    
    topArtists.forEach(artist => {
        const button = document.createElement('button');
        button.className = 'similar-artist-button';
        button.textContent = `Artists like ${artist.name}`;
        button.dataset.artistId = artist.id;
        button.dataset.artistName = artist.name;
        button.addEventListener('click', handleSimilarArtistClick);
        
        buttonsContainer.appendChild(button);
    });
}

// Handle similar artist button click
async function handleSimilarArtistClick(event) {
    const artistId = event.target.dataset.artistId;
    const artistName = event.target.dataset.artistName;
    const resultsContainer = document.getElementById('similar-artists-results');
    
    // Show loading
    resultsContainer.innerHTML = '<div class="loader"></div>';
    
    try {
        // Fetch similar artists
        const similarArtists = await fetchSimilarArtists(artistId);
        
        if (!similarArtists.length) {
            resultsContainer.innerHTML = `<p>No similar artists found for ${artistName}.</p>`;
            return;
        }
        
        // Display similar artists
        resultsContainer.innerHTML = `
            <h4>Artists similar to ${artistName}</h4>
            <div id="similar-artists-list" class="similar-artists-list"></div>
        `;
        
        const artistsList = document.getElementById('similar-artists-list');
        
        // Create artist cards
        similarArtists.forEach(artist => {
            const card = document.createElement('div');
            card.className = 'similar-artist-card';
            
            const imageUrl = artist.images && artist.images.length > 0 
                ? artist.images[artist.images.length > 1 ? 1 : 0].url 
                : 'placeholder.png';
            
            card.innerHTML = `
                <img src="${imageUrl}" alt="${artist.name}">
                <div class="similar-artist-info">
                    <h5>${artist.name}</h5>
                    <p>${artist.genres.slice(0, 2).join(', ')}</p>
                    <div class="popularity-meter">
                        <div class="popularity-fill" style="width: ${artist.popularity}%;"></div>
                    </div>
                    <span class="popularity-label">${artist.popularity}% popular</span>
                    <button onclick="window.open('https://open.spotify.com/artist/${artist.id}', '_blank')">
                        Open in Spotify
                    </button>
                </div>
            `;
            
            artistsList.appendChild(card);
        });
    } catch (error) {
        console.error('Error fetching similar artists:', error);
        resultsContainer.innerHTML = `<p class="error-message">Error loading similar artists: ${error.message}</p>`;
    }
}

// Fetch similar artists from Spotify API
async function fetchSimilarArtists(artistId) {
    const accessToken = localStorage.getItem('spotify_access_token');
    if (!accessToken) {
        throw new Error('No access token found');
    }
    
    const response = await fetch(`https://api.spotify.com/v1/artists/${artistId}/related-artists`, {
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });
    
    if (!response.ok) {
        throw new Error(`Failed to fetch similar artists: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.artists.slice(0, 8); // Return top 8 similar artists
}

// Playlist Statistics Dashboard
function displayPlaylistStatistics(tracks, playlistData) {
    // Calculate statistics
    const stats = {
        totalDuration: calculateTotalDuration(tracks),
        uniqueArtistsCount: countUniqueArtists(tracks),
        totalTracks: tracks.length,
        decadeDistribution: getDecadeDistribution(tracks),
        popularitySpectrum: getPopularitySpectrum(tracks),
        averageTrackLength: calculateAverageTrackLength(tracks)
    };
    
    // Format statistics for display
    const formattedStats = {
        totalDuration: formatDuration(stats.totalDuration),
        artistDiversity: ((stats.uniqueArtistsCount / stats.totalTracks) * 100).toFixed(0) + '%',
        dominantDecade: getKeyWithHighestValue(stats.decadeDistribution),
        averagePopularity: stats.popularitySpectrum.averagePopularity.toFixed(0) + '%',
        averageTrackLength: formatDuration(stats.averageTrackLength)
    };
    
    // Update the dashboard
    document.getElementById('total-duration').textContent = formattedStats.totalDuration;
    document.getElementById('artist-diversity').textContent = formattedStats.artistDiversity;
    document.getElementById('dominant-decade').textContent = formattedStats.dominantDecade;
    document.getElementById('average-popularity').textContent = formattedStats.averagePopularity;
    document.getElementById('average-track-length').textContent = formattedStats.averageTrackLength;
    
    // Create decade distribution chart
    createDecadeChart(stats.decadeDistribution);
    
    // Create popularity spectrum chart
    createPopularitySpectrumChart(stats.popularitySpectrum.distribution);
}

// Calculate total duration of all tracks
function calculateTotalDuration(tracks) {
    return tracks.reduce((total, track) => total + (track.duration_ms || 0), 0);
}

// Count number of unique artists
function countUniqueArtists(tracks) {
    const uniqueArtistIds = new Set();
    tracks.forEach(track => {
        track.artists.forEach(artist => {
            uniqueArtistIds.add(artist.id);
        });
    });
    return uniqueArtistIds.size;
}

// Get decade distribution
function getDecadeDistribution(tracks) {
    const decades = {};
    
    tracks.forEach(track => {
        if (track.album && track.album.release_date) {
            const year = parseInt(track.album.release_date.substring(0, 4));
            const decade = Math.floor(year / 10) * 10;
            decades[decade] = (decades[decade] || 0) + 1;
        }
    });
    
    return decades;
}

// Get popularity spectrum
function getPopularitySpectrum(tracks) {
    // Group tracks by popularity range
    const popularityRanges = {
        'Very Obscure (0-20%)': 0,
        'Obscure (21-40%)': 0,
        'Moderate (41-60%)': 0,
        'Popular (61-80%)': 0,
        'Very Popular (81-100%)': 0
    };
    
    let totalPopularity = 0;
    let tracksWithPopularity = 0;
    
    tracks.forEach(track => {
        if (track.popularity !== undefined) {
            totalPopularity += track.popularity;
            tracksWithPopularity++;
            
            if (track.popularity <= 20) {
                popularityRanges['Very Obscure (0-20%)']++;
            } else if (track.popularity <= 40) {
                popularityRanges['Obscure (21-40%)']++;
            } else if (track.popularity <= 60) {
                popularityRanges['Moderate (41-60%)']++;
            } else if (track.popularity <= 80) {
                popularityRanges['Popular (61-80%)']++;
            } else {
                popularityRanges['Very Popular (81-100%)']++;
            }
        }
    });
    
    const averagePopularity = tracksWithPopularity > 0 
        ? totalPopularity / tracksWithPopularity 
        : 0;
    
    return {
        distribution: popularityRanges,
        averagePopularity: averagePopularity
    };
}

// Calculate average track length
function calculateAverageTrackLength(tracks) {
    if (tracks.length === 0) return 0;
    
    const totalDuration = calculateTotalDuration(tracks);
    return totalDuration / tracks.length;
}

// Format milliseconds as "HH:MM" or "MM:SS"
function formatDuration(milliseconds) {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else {
        return `${minutes}m ${seconds}s`;
    }
}

// Find the key with the highest value in an object
function getKeyWithHighestValue(obj) {
    let highestKey = '';
    let highestValue = 0;
    
    for (const key in obj) {
        if (obj[key] > highestValue) {
            highestValue = obj[key];
            highestKey = key;
        }
    }
    
    return `${highestKey}s`;
}

// Create decade distribution chart
function createDecadeChart(decadeData) {
    const ctx = document.getElementById('decade-chart').getContext('2d');
    
    // Sort decades
    const decades = Object.keys(decadeData).sort((a, b) => a - b);
    const counts = decades.map(d => decadeData[d]);
    
    if (window.decadeChart) {
        window.decadeChart.destroy();
    }
    
    window.decadeChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: decades.map(d => `${d}s`),
            datasets: [{
                label: 'Tracks per Decade',
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
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}

// Create popularity spectrum chart
function createPopularitySpectrumChart(popularityData) {
    const ctx = document.getElementById('popularity-chart').getContext('2d');
    
    const labels = Object.keys(popularityData);
    const data = labels.map(l => popularityData[l]);
    
    if (window.popularityChart) {
        window.popularityChart.destroy();
    }
    
    window.popularityChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: [
                    'rgba(245, 113, 132, 0.7)',
                    'rgba(245, 162, 113, 0.7)',
                    'rgba(245, 226, 113, 0.7)',
                    'rgba(113, 245, 157, 0.7)',
                    'rgba(113, 193, 245, 0.7)'
                ],
                borderColor: 'white',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        boxWidth: 12,
                        padding: 10
                    }
                }
            }
        }
    });
}

// Artist Collaboration Network
function createArtistCollaborationNetwork(tracks) {
    const container = document.getElementById('collaboration-network');
    container.innerHTML = ''; // Clear previous visualization
    
    // Find collaborations
    const collaborations = new Map();
    const artistAppearances = new Map();
    
    tracks.forEach(track => {
        // Count artist appearances
        track.artists.forEach(artist => {
            artistAppearances.set(artist.id, {
                id: artist.id,
                name: artist.name,
                count: (artistAppearances.get(artist.id)?.count || 0) + 1
            });
        });
        
        // If there are multiple artists on a track, it's a collaboration
        if (track.artists.length > 1) {
            for (let i = 0; i < track.artists.length; i++) {
                for (let j = i + 1; j < track.artists.length; j++) {
                    const artistA = track.artists[i];
                    const artistB = track.artists[j];
                    const collaborationKey = [artistA.id, artistB.id].sort().join('--');
                    
                    if (collaborations.has(collaborationKey)) {
                        collaborations.set(collaborationKey, {
                            ...collaborations.get(collaborationKey),
                            count: collaborations.get(collaborationKey).count + 1,
                            tracks: [...collaborations.get(collaborationKey).tracks, track.name]
                        });
                    } else {
                        collaborations.set(collaborationKey, {
                            artists: [artistA.name, artistB.name],
                            count: 1,
                            tracks: [track.name]
                        });
                    }
                }
            }
        }
    });
    
    // Filter to only include artists with multiple appearances or collaborations
    const topArtists = Array.from(artistAppearances.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 15);
    
    const topArtistIds = new Set(topArtists.map(a => a.id));
    
    const relevantCollaborations = Array.from(collaborations.values())
        .filter(collab => {
            const [artistA, artistB] = collab.artists;
            return topArtistIds.has(artistA) || topArtistIds.has(artistB);
        })
        .sort((a, b) => b.count - a.count);
    
    // Create a simple visualization
    if (relevantCollaborations.length === 0) {
        container.innerHTML = `
            <div class="empty-collaboration">
                <p>No significant collaborations found between artists in this playlist.</p>
            </div>
        `;
        return;
    }
    
    // Create collaboration cards
    const collaborationsList = document.createElement('div');
    collaborationsList.className = 'collaborations-list';
    
    relevantCollaborations.slice(0, 10).forEach(collab => {
        const collabCard = document.createElement('div');
        collabCard.className = 'collaboration-card';
        
        collabCard.innerHTML = `
            <h4>${collab.artists.join(' & ')}</h4>
            <p>${collab.count} collaboration${collab.count > 1 ? 's' : ''}</p>
            <div class="collab-tracks">
                <strong>Tracks:</strong>
                <ul>
                    ${collab.tracks.map(track => `<li>${track}</li>`).join('')}
                </ul>
            </div>
        `;
        
        collaborationsList.appendChild(collabCard);
    });
    
    container.appendChild(collaborationsList);
}

// Update displayResults function to include the new visualizations
function displayResults(playlistData, tracksWithGenres, genreStats) {
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
    
    // Create the Genre Network Visualization
    createGenreNetworkChart(tracksWithGenres);
    
    // Setup Genre Radio buttons
    setupGenreRadioButtons(genreStats.topGenres);
    
    // Create Release Year Analysis
    createReleaseYearChart(tracksWithGenres);
    
    // Display Genre Similarity Expansion
    displayGenreSimilarityExpansion(genreStats.topGenres.map(g => g.genre));
    
    // NEW FEATURES
    // Display Top Artists Showcase
    displayTopArtistsShowcase(tracksWithGenres);
    
    // Setup Similar Artists Discovery
    setupSimilarArtistsDiscovery(tracksWithGenres);
    
    // Display Playlist Statistics Dashboard
    displayPlaylistStatistics(tracksWithGenres, playlistData);
    
    // Create Artist Collaboration Network
    createArtistCollaborationNetwork(tracksWithGenres);
    
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

