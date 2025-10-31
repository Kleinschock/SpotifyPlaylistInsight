# Spotify Playlist Insight

**NOTE: I HAVE TO REGISTER YOU IN MY SPOTIFY API AS I JUST HAVE SMALL DEVELOPER ACCESS. WITHOUT ME REGISTERING YOU TO THE SYSTEM THIS WON'T WORK :)**

A web application that analyzes Spotify playlists and provides detailed genre distribution and statistics. This was a small side project developed for my own interest.

![Analysis Results Overview](SpotifyInsight_%20(2).png)

## Features

Our tool provides a deep dive into your playlists with a variety of analytical features:

#### **Genre Distribution Visualization**
Instantly see the makeup of your playlist with interactive pie and bar charts. Click on any slice or bar to filter the tracks by that specific genre.

![Genre Distribution Charts](SpotifyInsight_%20(6).png)

#### **Interactive Track Listing & Filtering**
Browse every track in your playlist. You can view genres from Spotify, Last.fm, or both. Clicking a genre tag or a section of the chart filters the list instantly.

*   **Full Playlist View**
    ![Full Playlist View](SpotifyInsight_%20(4).png)

*   **Filtered by Genre ("britpop")**
    ![Filtered Playlist View](SpotifyInsight_%20(3).png)

#### **Recommended Artists**
Discover new music based on your taste. The tool analyzes your top artists and recommends similar ones, ranked by how frequently they are suggested.

![Recommended Artists](SpotifyInsight_%20(7).png)

**Also includes:**
- Release year analysis
- Top artists showcase
- Genre connections visualization
- One-click genre radio generation

## Usage

1.  Visit [Spotify Playlist Insight](https://kleinschock.github.io/SpotifyPlaylistInsight/)
2.  Login with your Spotify account
3.  Enter a Spotify playlist URL or ID
4.  View the comprehensive analysis of your playlist

## Technical Details

-   Built with vanilla JavaScript
-   Uses Spotify Web API for data retrieval
-   Visualizations created with Chart.js
-   No server-side components (client-side only)

## Limitations

Some features may be limited due to Spotify API restrictions, but core genre analysis works for all playlists.
