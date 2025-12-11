const path = require("path");
const fs = require("fs");
const knex = require("knex");
const { parseArtistNames } = require("./utils");

let db;

/**
 * * Initialize the Database
 * Sets up SQLite connection, enables WAL mode, and runs migrations.
 * @param {Electron.App} app - Electron App instance
 */
function initialize(app) {
  const dbPath = path.join(app.getPath("userData"), "ViveStream.db");

  db = knex({
    client: "sqlite3",
    connection: {
      filename: dbPath,
    },
    useNullAsDefault: true,
    pool: { min: 1, max: 1 } // ! SQLite handles concurrency via file locks, large pools are wasteful here.
  });

  return (async () => {
    try {
      // * ----------------------------
      // * TABLE CREATION & MIGRATIONS
      // * ----------------------------

      if (!(await db.schema.hasTable("videos"))) {
        await db.schema.createTable("videos", (table) => {
          table.string("id").primary(); // YouTube ID
          table.string("title").notNullable();
          table.string("uploader"); // Channel Name
          table.string("creator"); // Parsed Artist Name
          table.text("description");
          table.integer("duration"); // Seconds
          table.string("upload_date");
          table.string("originalUrl");
          table.string("filePath").unique();
          table.string("coverPath");
          table.string("subtitlePath");
          table.boolean("hasEmbeddedSubs").defaultTo(false);
          table.string("type").defaultTo("video"); // 'video' | 'audio'
          table.timestamp("downloadedAt").defaultTo(db.fn.now());
          table.boolean("isFavorite").defaultTo(false);
          table.string("source").defaultTo("youtube");

          // ! Indices for performance
          table.index('type');
          table.index('isFavorite');
          table.index('downloadedAt');
        });
      } else {
        // ? Migration for existing users: Ensure indices exist
        try { await db.schema.alterTable('videos', t => t.index('type')); } catch (e) { }
        try { await db.schema.alterTable('videos', t => t.index('isFavorite')); } catch (e) { }
        try { await db.schema.alterTable('videos', t => t.index('downloadedAt')); } catch (e) { }
      }

      if (!(await db.schema.hasTable("playlists"))) {
        await db.schema.createTable("playlists", (table) => {
          table.increments("id").primary();
          table.string("name").notNullable();
          table.string("coverPath");
          table.timestamp("createdAt").defaultTo(db.fn.now());
        });
      }

      if (!(await db.schema.hasTable("playlist_videos"))) {
        await db.schema.createTable("playlist_videos", (table) => {
          table.integer("playlistId").unsigned().references("id").inTable("playlists").onDelete("CASCADE");
          table.string("videoId").references("id").inTable("videos").onDelete("CASCADE");
          table.integer("sortOrder");
          table.primary(["playlistId", "videoId"]);
          table.index("playlistId");
        });
      } else {
        try { await db.schema.alterTable('playlist_videos', t => t.index('playlistId')); } catch (e) { }
      }

      if (!(await db.schema.hasTable("artists"))) {
        await db.schema.createTable("artists", (table) => {
          table.increments("id").primary();
          table.string("name").notNullable().unique();
          table.string("thumbnailPath");
          table.timestamp("createdAt").defaultTo(db.fn.now());
          table.index("name");
        });
      }

      if (!(await db.schema.hasTable("video_artists"))) {
        await db.schema.createTable("video_artists", (table) => {
          table.string("videoId").references("id").inTable("videos").onDelete("CASCADE");
          table.integer("artistId").unsigned().references("id").inTable("artists").onDelete("CASCADE");
          table.primary(["videoId", "artistId"]);
          table.index("artistId");
        });
      } else {
        try { await db.schema.alterTable('video_artists', t => t.index('artistId')); } catch (e) { }
      }

      if (!(await db.schema.hasTable("download_history"))) {
        await db.schema.createTable("download_history", (table) => {
          table.increments("id").primary();
          table.string("url").notNullable();
          table.string("title");
          table.string("type");
          table.string("thumbnail");
          table.string("status").defaultTo("success");
          table.timestamp("createdAt").defaultTo(db.fn.now());
        });
      }

      // * ----------------
      // * COLUMN MIGRATIONS
      // * ----------------
      if (!(await db.schema.hasColumn("playlists", "coverPath"))) {
        await db.schema.alterTable("playlists", (table) => { table.string("coverPath"); });
      }
      if (!(await db.schema.hasColumn("videos", "subtitlePath"))) {
        await db.schema.alterTable("videos", (table) => {
          table.string("subtitlePath");
          table.boolean("hasEmbeddedSubs").defaultTo(false);
        });
      }
      if (!(await db.schema.hasColumn("download_history", "thumbnail"))) {
        await db.schema.alterTable("download_history", (table) => { table.string("thumbnail"); });
      }
      if (!(await db.schema.hasColumn("download_history", "status"))) {
        await db.schema.alterTable("download_history", (table) => { table.string("status").defaultTo("success"); });
      }

      // * ----------------
      // * PRAGMA TUNING
      // * ----------------
      await db.raw('PRAGMA journal_mode = WAL;'); // ! Faster concurrency
      await db.raw('PRAGMA synchronous = NORMAL;'); // ! Less aggressive fsync
      await db.raw('PRAGMA cache_size = -64000;'); // ! 64MB Cache

    } catch (error) {
      console.error("Database initialization failed:", error);
      const { dialog } = require("electron");
      dialog.showErrorBox("Database Error", "Critical DB error: " + error.message);
      app.quit();
    }
  })();
}

// * ----------------------
// * VIDEO OPERATIONS
// * ----------------------

async function getLibrary() {
  try {
    return await db("videos").select("*").orderBy("downloadedAt", "desc");
  } catch (error) {
    console.error("Error getting library from DB:", error);
    return [];
  }
}

async function addOrUpdateVideo(videoData) {
  try {
    const { artist, ...videoInfo } = videoData;
    // ! SQLite 'ON CONFLICT' equivalent
    await db("videos").insert(videoInfo).onConflict("id").merge();
  } catch (error) {
    console.error("Error saving video to DB:", error);
  }
}

async function getVideoById(id) {
  try {
    return await db("videos").where({ id }).first();
  } catch (error) {
    console.error(`Error getting video by ID ${id}:`, error);
    return null;
  }
}

async function updateVideoMetadata(videoId, metadata) {
  try {
    await db("videos").where({ id: videoId }).update(metadata);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function deleteVideo(id) {
  try {
    const artistLinks = await db("video_artists").where({ videoId: id }).select("artistId");
    const artistIds = artistLinks.map((link) => link.artistId);

    // * Cascade delete will handle relationships, but we handle file cleanup manually if needed
    await db("videos").where({ id }).del();

    // * Cleanup artists that no longer have any videos
    if (artistIds.length > 0) {
      for (const artistId of artistIds) {
        const remaining = await db("video_artists").where({ artistId }).first(db.raw("count(*) as count"));
        if (remaining && remaining.count === 0) {
          const artist = await db("artists").where({ id: artistId }).first();
          if (artist && artist.thumbnailPath) {
            try {
              const p = path.normalize(decodeURIComponent(artist.thumbnailPath.replace("file://", "")));
              if (fs.existsSync(p)) fs.unlinkSync(p);
            } catch (err) { }
          }
          await db("artists").where({ id: artistId }).del();
        }
      }
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function toggleFavorite(id) {
  try {
    const video = await db("videos").where({ id }).first("isFavorite");
    if (video) {
      const isFavorite = !video.isFavorite;
      await db("videos").where({ id }).update({ isFavorite });
      return { success: true, isFavorite };
    }
    return { success: false, message: "Video not found." };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function clearAllMedia() {
  try {
    // ! DANGER: Nukes everything
    await db("video_artists").del();
    await db("artists").del();
    await db("playlist_videos").del();
    await db("playlists").del();
    await db("videos").del();
    await db("download_history").del();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// * ----------------------
// * PLAYLIST OPERATIONS
// * ----------------------

async function createPlaylist(name) {
  try {
    const [id] = await db("playlists").insert({ name });
    return { success: true, id };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function findOrCreatePlaylistByName(name) {
  try {
    let playlist = await db("playlists").where({ name }).first();
    if (playlist) return playlist;
    const [id] = await db("playlists").insert({ name });
    return { id, name };
  } catch (error) {
    // ? Handle race condition
    if (error.message.includes("UNIQUE constraint failed")) return db("playlists").where({ name }).first();
    return null;
  }
}

async function getAllPlaylistsWithStats() {
  try {
    // ! Complex query: Gets playlist + cover of first video + count of videos
    const playlists = await db.raw(`
      SELECT
        p.*,
        (SELECT v.coverPath FROM playlist_videos pv JOIN videos v ON v.id = pv.videoId WHERE pv.playlistId = p.id ORDER BY pv.sortOrder ASC LIMIT 1) as thumbnail,
        (SELECT COUNT(*) FROM playlist_videos pv WHERE pv.playlistId = p.id) as videoCount
      FROM playlists p
      ORDER BY p.createdAt DESC
    `);
    return playlists;
  } catch (error) {
    return [];
  }
}

async function getPlaylistDetails(playlistId) {
  try {
    const playlist = await db("playlists").where({ id: playlistId }).first();
    if (!playlist) return null;

    playlist.videos = await db("playlist_videos")
      .join("videos", "videos.id", "=", "playlist_videos.videoId")
      .where("playlist_videos.playlistId", playlistId)
      .select("videos.*")
      .orderBy("playlist_videos.sortOrder", "asc");

    return playlist;
  } catch (error) {
    return null;
  }
}

async function renamePlaylist(playlistId, newName) {
  try {
    await db("playlists").where({ id: playlistId }).update({ name: newName });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function deletePlaylist(playlistId) {
  try {
    const playlist = await db("playlists").where({ id: playlistId }).first();
    if (playlist && playlist.coverPath) {
      try {
        const p = path.normalize(decodeURIComponent(playlist.coverPath.replace("file://", "")));
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch (err) { }
    }
    await db("playlists").where({ id: playlistId }).del();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function updatePlaylistCover(playlistId, coverPath) {
  try {
    await db("playlists").where({ id: playlistId }).update({ coverPath });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function addVideoToPlaylist(playlistId, videoId) {
  try {
    const max = await db("playlist_videos").where({ playlistId }).max("sortOrder as max").first();
    const sortOrder = (max.max || 0) + 1;
    await db("playlist_videos").insert({ playlistId, videoId, sortOrder });
    return { success: true };
  } catch (error) {
    if (error.message.includes("UNIQUE constraint failed")) return { success: true };
    return { success: false, error: error.message };
  }
}

async function removeVideoFromPlaylist(playlistId, videoId) {
  try {
    await db("playlist_videos").where({ playlistId, videoId }).del();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function updateVideoOrderInPlaylist(playlistId, videoIds) {
  try {
    await db.transaction(async (trx) => {
      for (let i = 0; i < videoIds.length; i++) {
        await trx("playlist_videos").where({ playlistId, videoId: videoIds[i] }).update({ sortOrder: i });
      }
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function getPlaylistsForVideo(videoId) {
  try {
    return await db("playlist_videos").where({ videoId }).select("playlistId");
  } catch (error) {
    return [];
  }
}

// * ----------------------
// * ARTIST OPERATIONS
// * ----------------------

async function findOrCreateArtist(name, thumbnailPath) {
  try {
    let artist = await db("artists").where({ name }).first();
    if (artist) {
      if (!artist.thumbnailPath && thumbnailPath) {
        await db("artists").where({ id: artist.id }).update({ thumbnailPath });
        artist.thumbnailPath = thumbnailPath;
      }
      return artist;
    }
    const [id] = await db("artists").insert({ name, thumbnailPath });
    return { id, name, thumbnailPath };
  } catch (error) {
    if (error.message.includes("UNIQUE constraint failed")) return db("artists").where({ name }).first();
    return null;
  }
}

async function linkVideoToArtist(videoId, artistId) {
  try {
    await db("video_artists").insert({ videoId, artistId });
    return { success: true };
  } catch (error) {
    if (error.message.includes("UNIQUE constraint failed")) return { success: true };
    return { success: false, error: error.message };
  }
}

async function getAllArtistsWithStats() {
  try {
    const artists = await db("artists")
      .leftJoin("video_artists", "artists.id", "video_artists.artistId")
      .select("artists.id", "artists.name", "artists.thumbnailPath", "artists.createdAt")
      .count("video_artists.videoId as videoCount")
      .groupBy("artists.id")
      .orderBy("artists.name", "asc");
    return artists;
  } catch (error) {
    return [];
  }
}

async function getArtistDetails(artistId) {
  try {
    const artist = await db("artists").where({ id: artistId }).first();
    if (!artist) return null;
    artist.videos = await db("video_artists")
      .join("videos", "videos.id", "=", "video_artists.videoId")
      .where("video_artists.artistId", artistId)
      .select("videos.*")
      .orderBy("videos.downloadedAt", "desc");
    return artist;
  } catch (error) {
    return null;
  }
}

async function updateArtistThumbnail(artistId, thumbnailPath) {
  try {
    await db("artists").where({ id: artistId }).update({ thumbnailPath });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function updateArtistName(artistId, name) {
  try {
    await db("artists").where({ id: artistId }).update({ name });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function deleteArtist(artistId) {
  try {
    const artist = await db("artists").where({ id: artistId }).first();
    if (artist && artist.thumbnailPath) {
      try {
        const p = path.normalize(decodeURIComponent(artist.thumbnailPath.replace("file://", "")));
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch (err) { }
    }
    await db("video_artists").where({ artistId }).del();
    await db("artists").where({ id: artistId }).del();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function cleanupOrphanArtists() {
  try {
    const orphanArtists = await db("artists")
      .leftJoin("video_artists", "artists.id", "video_artists.artistId")
      .whereNull("video_artists.videoId")
      .select("artists.id");
    const idsToDelete = orphanArtists.map((a) => a.id);
    if (idsToDelete.length > 0) await db("artists").whereIn("id", idsToDelete).del();
    return { success: true, count: idsToDelete.length };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function regenerateArtists() {
  try {
    // ! Heavy operation: Iterates ALL videos
    const videos = await db("videos").select("id", "creator", "coverPath");
    let count = 0;
    for (const video of videos) {
      if (!video.creator) continue;
      const existingLink = await db("video_artists").where({ videoId: video.id }).first();
      if (existingLink) continue;
      const artistNames = parseArtistNames(video.creator);
      for (const name of artistNames) {
        const artist = await findOrCreateArtist(name, video.coverPath);
        if (artist) {
          const linked = await linkVideoToArtist(video.id, artist.id);
          if (linked.success) count++;
        }
      }
    }
    return { success: true, count };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// * ----------------------
// * HISTORY OPERATIONS
// * ----------------------

async function addToHistory(item) {
  try {
    await db("download_history").where({ url: item.url }).del();
    await db("download_history").insert({
      url: item.url,
      title: item.title || item.url,
      type: item.type || "unknown",
      thumbnail: item.thumbnail,
      status: item.status || "success"
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function getHistory() {
  try {
    return await db("download_history").select("*").orderBy("createdAt", "desc").limit(50);
  } catch (error) {
    return [];
  }
}

async function clearHistory() {
  try {
    await db("download_history").del();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function shutdown() {
  if (db) await db.destroy();
}

module.exports = {
  initialize,
  shutdown,
  db,
  getLibrary,
  addOrUpdateVideo,
  getVideoById,
  updateVideoMetadata,
  deleteVideo,
  toggleFavorite,
  clearAllMedia,
  createPlaylist,
  findOrCreatePlaylistByName,
  getAllPlaylistsWithStats,
  getPlaylistDetails,
  renamePlaylist,
  deletePlaylist,
  updatePlaylistCover,
  addVideoToPlaylist,
  removeVideoFromPlaylist,
  updateVideoOrderInPlaylist,
  getPlaylistsForVideo,
  findOrCreateArtist,
  linkVideoToArtist,
  getAllArtistsWithStats,
  getArtistDetails,
  updateArtistThumbnail,
  updateArtistName,
  deleteArtist,
  cleanupOrphanArtists,
  regenerateArtists,
  addToHistory,
  getHistory,
  clearHistory
};