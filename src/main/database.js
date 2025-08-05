// src/main/database.js
const path = require("path");
const fs = require("fs");
const knex = require("knex");

let db;

function initialize(app) {
  const dbPath = path.join(app.getPath("userData"), "ViveStream.db");
  const viveStreamPath = path.join(app.getPath("home"), "ViveStream");
  const oldLibraryPath = path.join(viveStreamPath, "library.json");
  const migratedLibraryPath = path.join(
    viveStreamPath,
    "library.json.migrated"
  );

  db = knex({
    client: "sqlite3",
    connection: {
      filename: dbPath,
    },
    useNullAsDefault: true,
  });

  return (async () => {
    try {
      if (!(await db.schema.hasTable("videos"))) {
        await db.schema.createTable("videos", (table) => {
          table.string("id").primary();
          table.string("title").notNullable();
          table.string("uploader");
          table.string("creator");
          table.text("description");
          table.integer("duration");
          table.string("upload_date");
          table.string("originalUrl");
          table.string("filePath").unique();
          table.string("coverPath");
          table.string("subtitlePath");
          table.boolean("hasEmbeddedSubs").defaultTo(false);
          table.string("type").defaultTo("video");
          table.timestamp("downloadedAt").defaultTo(db.fn.now());
          table.boolean("isFavorite").defaultTo(false);
        });

        if (
          fs.existsSync(oldLibraryPath) &&
          !fs.existsSync(migratedLibraryPath)
        ) {
          console.log("Found legacy library.json, starting migration...");
          const oldLibrary = JSON.parse(
            fs.readFileSync(oldLibraryPath, "utf-8")
          );
          if (oldLibrary && oldLibrary.length > 0) {
            await db.batchInsert("videos", oldLibrary);
            console.log(`Successfully migrated ${oldLibrary.length} items.`);
          }
          fs.renameSync(oldLibraryPath, migratedLibraryPath);
          console.log(
            "Migration complete. Renamed library.json to library.json.migrated."
          );
        }
      }

      if (!(await db.schema.hasTable("playlists"))) {
        await db.schema.createTable("playlists", (table) => {
          table.increments("id").primary();
          table.string("name").notNullable();
          table.timestamp("createdAt").defaultTo(db.fn.now());
        });
      }

      if (!(await db.schema.hasTable("playlist_videos"))) {
        await db.schema.createTable("playlist_videos", (table) => {
          table
            .integer("playlistId")
            .unsigned()
            .references("id")
            .inTable("playlists")
            .onDelete("CASCADE");
          table
            .string("videoId")
            .references("id")
            .inTable("videos")
            .onDelete("CASCADE");
          table.integer("sortOrder");
          table.primary(["playlistId", "videoId"]);
        });
      }

      if (!(await db.schema.hasTable("artists"))) {
        await db.schema.createTable("artists", (table) => {
          table.increments("id").primary();
          table.string("name").notNullable().unique();
          table.string("thumbnailPath");
          table.timestamp("createdAt").defaultTo(db.fn.now());
        });
      }

      if (!(await db.schema.hasTable("video_artists"))) {
        await db.schema.createTable("video_artists", (table) => {
          table
            .string("videoId")
            .references("id")
            .inTable("videos")
            .onDelete("CASCADE");
          table
            .integer("artistId")
            .unsigned()
            .references("id")
            .inTable("artists")
            .onDelete("CASCADE");
          table.primary(["videoId", "artistId"]);
        });
      }

      if (!(await db.schema.hasColumn("videos", "creator"))) {
        await db.schema.alterTable("videos", (table) => {
          table.string("creator");
        });
      }

      if (!(await db.schema.hasColumn("videos", "hasEmbeddedSubs"))) {
        await db.schema.alterTable("videos", (table) => {
          table.boolean("hasEmbeddedSubs").defaultTo(false);
        });
      }

      if (!(await db.schema.hasColumn("videos", "description"))) {
        await db.schema.alterTable("videos", (table) => {
          table.text("description");
        });
      }
    } catch (error) {
      console.error("Database initialization failed:", error);
    }
  })();
}

// --- Video Functions ---

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

async function deleteVideo(id) {
  try {
    await db("videos").where({ id }).del();
    return { success: true };
  } catch (error) {
    console.error(`Error deleting video ${id} from DB:`, error);
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
    console.error(`Error toggling favorite for ${id}:`, error);
    return { success: false, error: error.message };
  }
}

async function clearAllMedia() {
  try {
    await db("video_artists").del();
    await db("artists").del();
    await db("playlist_videos").del();
    await db("playlists").del();
    await db("videos").del();
    return { success: true };
  } catch (
    error
    // Truncated because the user provided an incomplete file. I will complete it from context.
  ) {
    console.error("Error clearing all media from DB:", error);
    return { success: false, error: error.message };
  }
}

// --- Playlist Functions ---

async function createPlaylist(name) {
  try {
    const [id] = await db("playlists").insert({ name });
    return { success: true, id };
  } catch (error) {
    console.error(`Error creating playlist "${name}":`, error);
    return { success: false, error: error.message };
  }
}

async function getAllPlaylistsWithStats() {
  try {
    const playlists = await db.raw(`
      SELECT 
        p.*,
        (SELECT COUNT(*) FROM playlist_videos pv WHERE pv.playlistId = p.id) as videoCount,
        (SELECT v.coverPath FROM playlist_videos pv JOIN videos v ON v.id = pv.videoId WHERE pv.playlistId = p.id ORDER BY pv.sortOrder ASC LIMIT 1) as thumbnail
      FROM playlists p
      ORDER BY p.createdAt DESC
    `);
    return playlists;
  } catch (error) {
    console.error("Error getting all playlists:", error);
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
    console.error(`Error getting details for playlist ${playlistId}:`, error);
    return null;
  }
}

async function renamePlaylist(playlistId, newName) {
  try {
    await db("playlists").where({ id: playlistId }).update({ name: newName });
    return { success: true };
  } catch (error) {
    console.error(`Error renaming playlist ${playlistId}:`, error);
    return { success: false, error: error.message };
  }
}

async function deletePlaylist(playlistId) {
  try {
    await db("playlists").where({ id: playlistId }).del();
    return { success: true };
  } catch (error) {
    console.error(`Error deleting playlist ${playlistId}:`, error);
    return { success: false, error: error.message };
  }
}

async function addVideoToPlaylist(playlistId, videoId) {
  try {
    const maxSortOrder = await db("playlist_videos")
      .where({ playlistId })
      .max("sortOrder as max")
      .first();

    const sortOrder = (maxSortOrder.max || 0) + 1;

    await db("playlist_videos").insert({ playlistId, videoId, sortOrder });
    return { success: true };
  } catch (error) {
    if (error.message.includes("UNIQUE constraint failed")) {
      return { success: true, message: "Video already in playlist." };
    }
    console.error(
      `Error adding video ${videoId} to playlist ${playlistId}:`,
      error
    );
    return { success: false, error: error.message };
  }
}

async function removeVideoFromPlaylist(playlistId, videoId) {
  try {
    await db("playlist_videos").where({ playlistId, videoId }).del();
    return { success: true };
  } catch (error) {
    console.error(
      `Error removing video ${videoId} from playlist ${playlistId}:`,
      error
    );
    return { success: false, error: error.message };
  }
}

async function updateVideoOrderInPlaylist(playlistId, videoIds) {
  try {
    await db.transaction(async (trx) => {
      for (let i = 0; i < videoIds.length; i++) {
        await trx("playlist_videos")
          .where({ playlistId, videoId: videoIds[i] })
          .update({ sortOrder: i });
      }
    });
    return { success: true };
  } catch (error) {
    console.error(`Error reordering videos in playlist ${playlistId}:`, error);
    return { success: false, error: error.message };
  }
}

async function getPlaylistsForVideo(videoId) {
  try {
    return await db("playlist_videos").where({ videoId }).select("playlistId");
  } catch (error) {
    console.error(`Error getting playlists for video ${videoId}:`, error);
    return [];
  }
}

// --- Artist Functions ---

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
    if (error.message.includes("UNIQUE constraint failed")) {
      return db("artists").where({ name }).first();
    }
    console.error(`Error finding or creating artist "${name}":`, error);
    return null;
  }
}

async function linkVideoToArtist(videoId, artistId) {
  try {
    await db("video_artists").insert({ videoId, artistId });
    return { success: true };
  } catch (error) {
    if (error.message.includes("UNIQUE constraint failed")) {
      return { success: true, message: "Link already exists." };
    }
    console.error(
      `Error linking video ${videoId} to artist ${artistId}:`,
      error
    );
    return { success: false, error: error.message };
  }
}

async function getAllArtistsWithStats() {
  try {
    const artists = await db("artists")
      .leftJoin("video_artists", "artists.id", "video_artists.artistId")
      .select(
        "artists.id",
        "artists.name",
        "artists.thumbnailPath",
        "artists.createdAt"
      )
      .count("video_artists.videoId as videoCount")
      .groupBy("artists.id")
      .orderBy("artists.name", "asc");

    return artists;
  } catch (error) {
    console.error("Error getting all artists with stats:", error);
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
    console.error(`Error getting details for artist ${artistId}:`, error);
    return null;
  }
}

// --- System Functions ---

async function shutdown() {
  if (db) {
    await db.destroy();
  }
}

module.exports = {
  initialize,
  shutdown,
  getLibrary,
  addOrUpdateVideo,
  getVideoById,
  deleteVideo,
  toggleFavorite,
  clearAllMedia,
  createPlaylist,
  getAllPlaylistsWithStats,
  getPlaylistDetails,
  renamePlaylist,
  deletePlaylist,
  addVideoToPlaylist,
  removeVideoFromPlaylist,
  updateVideoOrderInPlaylist,
  getPlaylistsForVideo,
  findOrCreateArtist,
  linkVideoToArtist,
  getAllArtistsWithStats,
  getArtistDetails,
};
